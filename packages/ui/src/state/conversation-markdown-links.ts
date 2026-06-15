import {
  normalizeMarkdownHref,
  safeMarkdownHref,
  safeMarkdownImageSrc,
} from "./conversation-markdown-safety";
import {
  findUnescapedIndex,
  findUnescapedIndexInsensitive,
  isEscapedMarkdownIndex,
  markdownUnescapeText,
  minPositiveIndex,
} from "./conversation-markdown-scan";
import type { MarkdownImageBlock } from "./conversation-markdown-types";

/*
 * Link-like target parsing for the conversation markdown engine: inline
 * links and images, reference definitions/targets, autolinks, bare URLs and
 * emails, and file-citation markers. Extracted verbatim from
 * ./conversation-markdown-engine.
 */

export interface MarkdownReferenceDefinition {
  href: string;
  title: string | null;
}

export type MarkdownReferenceDefinitions = Map<string, MarkdownReferenceDefinition>;

export function parseMarkdownImageLine(
  line: string,
  references?: MarkdownReferenceDefinitions,
): MarkdownImageBlock | null {
  const trimmed = line.trim();
  const image = parseMarkdownImageInline(trimmed, 0, references);
  if (!image || image.endIndex !== trimmed.length) return null;
  return {
    kind: "image",
    alt: image.alt,
    src: image.src,
    title: image.title,
  };
}

export function parseMarkdownImageInline(
  text: string,
  startIndex: number,
  references?: MarkdownReferenceDefinitions,
): { alt: string; src: string; title: string | null; endIndex: number } | null {
  if (!text.startsWith("![", startIndex)) return null;
  const closeLabel = findMarkdownLabelEnd(text, startIndex + 1);
  const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
  if (closeLabel < 0) return null;
  const label = markdownUnescapeText(text.slice(startIndex + 2, closeLabel));
  if (openHref !== closeLabel + 1) {
    const reference = parseMarkdownReferenceTarget(text, closeLabel + 1, label, references);
    if (!reference) return null;
    const src = safeMarkdownImageSrc(reference.href);
    if (!src) return null;
    return {
      alt: label,
      src,
      title: reference.title,
      endIndex: reference.endIndex,
    };
  }
  const destination = parseMarkdownImageDestination(text, openHref);
  if (!destination) return null;
  const src = safeMarkdownImageSrc(destination.href);
  if (!src) return null;
  return {
    alt: label,
    src,
    title: destination.title,
    endIndex: destination.endIndex,
  };
}

function parseMarkdownImageDestination(
  text: string,
  openParenIndex: number,
): { endIndex: number; href: string; title: string | null } | null {
  if (text[openParenIndex] !== "(") return null;
  let cursor = openParenIndex + 1;
  let bracketDepth = 0;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === "(") bracketDepth += 1;
    if (char === ")") {
      if (bracketDepth === 0) break;
      bracketDepth -= 1;
    }
    cursor += 1;
  }
  if (cursor >= text.length) return null;
  const rawTarget = text.slice(openParenIndex + 1, cursor).trim();
  const titleMatch = parseMarkdownDestinationTitle(rawTarget);
  return {
    endIndex: cursor + 1,
    href: markdownUnescapeText(titleMatch?.href ?? rawTarget),
    title: titleMatch?.title ?? null,
  };
}

export function parseMarkdownLinkInline(
  text: string,
  startIndex: number,
  references?: MarkdownReferenceDefinitions,
): { endIndex: number; href: string; label: string; title: string | null } | null {
  if (text[startIndex] !== "[") return null;
  const closeLabel = findMarkdownLabelEnd(text, startIndex);
  const openHref = closeLabel >= 0 ? text.indexOf("(", closeLabel + 1) : -1;
  if (closeLabel < 0) return null;
  const label = markdownUnescapeText(text.slice(startIndex + 1, closeLabel));
  if (openHref !== closeLabel + 1) {
    const reference = parseMarkdownReferenceTarget(text, closeLabel + 1, label, references);
    return reference
      ? { endIndex: reference.endIndex, href: normalizeMarkdownHref(reference.href), label, title: reference.title }
      : null;
  }
  const destination = parseMarkdownLinkDestination(text, openHref);
  if (!destination) return null;
  return {
    endIndex: destination.endIndex,
    href: normalizeMarkdownHref(destination.href),
    label,
    title: destination.title,
  };
}

function findMarkdownLabelEnd(text: string, openBracketIndex: number): number {
  if (text[openBracketIndex] !== "[") return -1;
  let depth = 0;
  let cursor = openBracketIndex + 1;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === "[") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (char === "]") {
      if (depth === 0) return cursor;
      depth -= 1;
    }
    cursor += 1;
  }
  return -1;
}

function parseMarkdownLinkDestination(
  text: string,
  openParenIndex: number,
): { endIndex: number; href: string; title: string | null } | null {
  if (text[openParenIndex] !== "(") return null;
  let cursor = openParenIndex + 1;
  while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  const hrefStart = cursor;
  let href = "";
  if (text[cursor] === "<") {
    const closeAngle = text.indexOf(">", cursor + 1);
    if (closeAngle < 0) return null;
    href = text.slice(hrefStart, closeAngle + 1);
    cursor = closeAngle + 1;
  } else {
    let depth = 0;
    while (cursor < text.length) {
      const char = text[cursor] ?? "";
      if (char === "\\" && cursor + 1 < text.length) {
        cursor += 2;
        continue;
      }
      if (char === "(") {
        depth += 1;
        cursor += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
        cursor += 1;
        continue;
      }
      if (depth === 0 && /[ \t\n]/u.test(char)) break;
      cursor += 1;
    }
    href = markdownUnescapeText(text.slice(hrefStart, cursor));
  }
  while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  const title = parseMarkdownLinkTitle(text, cursor);
  if (title) {
    cursor = title.endIndex;
    while (/[ \t\n]/u.test(text[cursor] ?? "")) cursor += 1;
  }
  if (text[cursor] !== ")") return null;
  return { endIndex: cursor + 1, href, title: title?.value ?? null };
}

function parseMarkdownLinkTitle(text: string, startIndex: number): { endIndex: number; value: string } | null {
  const open = text[startIndex] ?? "";
  if (open !== "\"" && open !== "'" && open !== "(") return null;
  const close = open === "(" ? ")" : open;
  let cursor = startIndex + 1;
  while (cursor < text.length) {
    const char = text[cursor] ?? "";
    if (char === "\\" && cursor + 1 < text.length) {
      cursor += 2;
      continue;
    }
    if (char === close) {
      return { endIndex: cursor + 1, value: markdownUnescapeText(text.slice(startIndex + 1, cursor)) };
    }
    cursor += 1;
  }
  return null;
}

function parseMarkdownDestinationTitle(value: string): { href: string; title: string } | null {
  const match = value.match(/^(<[^>\n]+>|[\s\S]+?)\s+(?:"([^"\n]*)"|'([^'\n]*)'|\(([^()\n]*)\))$/u);
  if (!match) return null;
  return {
    href: match[1] ?? "",
    title: markdownUnescapeText(match[2] ?? match[3] ?? match[4] ?? ""),
  };
}

function parseMarkdownReferenceTarget(
  text: string,
  afterLabelIndex: number,
  label: string,
  references: MarkdownReferenceDefinitions | undefined,
): { endIndex: number; href: string; title: string | null } | null {
  if (!references || references.size === 0) return null;
  let key = markdownReferenceKey(label);
  let endIndex = afterLabelIndex;
  if (text[afterLabelIndex] === "[") {
    const closeReference = findMarkdownLabelEnd(text, afterLabelIndex);
    if (closeReference < 0) return null;
    const referenceLabel = text.slice(afterLabelIndex + 1, closeReference);
    key = referenceLabel.length === 0 ? key : markdownReferenceKey(referenceLabel);
    endIndex = closeReference + 1;
  }
  const definition = references.get(key);
  return definition ? { ...definition, endIndex } : null;
}

export function parseMarkdownReferenceDefinition(
  lines: string[],
  index: number,
): { href: string; label: string; nextIndex: number; title: string | null } | null {
  const line = lines[index] ?? "";
  const match = line.match(/^ {0,3}\[((?:\\[\s\S]|[^[\]\\])+)\]:(.*)$/u);
  if (!match) return null;
  const label = markdownUnescapeText(match[1] ?? "");
  let cursorLine = index + 1;
  let rest = match[2] ?? "";
  if (rest.trim().length === 0) {
    const nextLine = lines[cursorLine] ?? "";
    if (!/^[ \t]+\S/u.test(nextLine)) return null;
    rest = nextLine;
    cursorLine += 1;
  }
  const destination = parseMarkdownReferenceDestination(rest);
  if (!destination) return null;
  let title: string | null = null;
  const sameLineTitle = parseMarkdownReferenceDefinitionTitle(destination.rest);
  if (sameLineTitle) {
    title = sameLineTitle.value;
  } else if (destination.rest.trim().length > 0) {
    return null;
  } else {
    const nextLine = lines[cursorLine] ?? "";
    if (/^[ \t]+\S/u.test(nextLine)) {
      const nextLineTitle = parseMarkdownReferenceDefinitionTitle(nextLine);
      if (nextLineTitle) {
        title = nextLineTitle.value;
        cursorLine += 1;
      }
    }
  }
  return {
    href: normalizeMarkdownHref(markdownUnescapeText(destination.href)),
    label,
    nextIndex: cursorLine,
    title,
  };
}

function parseMarkdownReferenceDestination(value: string): { href: string; rest: string } | null {
  const text = value.trimStart();
  if (text.length === 0) return null;
  if (text.startsWith("<")) {
    const closeAngle = text.indexOf(">");
    if (closeAngle < 0) return null;
    return {
      href: text.slice(0, closeAngle + 1),
      rest: text.slice(closeAngle + 1),
    };
  }
  const match = text.match(/^(\S+)([\s\S]*)$/u);
  return match ? { href: match[1] ?? "", rest: match[2] ?? "" } : null;
}

function parseMarkdownReferenceDefinitionTitle(value: string): { value: string } | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const first = trimmed[0] ?? "";
  const last = trimmed[trimmed.length - 1] ?? "";
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'") || (first === "(" && last === ")")) {
    return { value: markdownUnescapeText(trimmed.slice(1, -1)) };
  }
  return null;
}

export function markdownReferenceKey(value: string): string {
  return markdownUnescapeText(value).trim().replace(/\s+/gu, " ").toLowerCase();
}

export function parseFileCitationMarker(
  text: string,
  startIndex: number,
): { path: string; lineStart: number; lineEnd: number; endIndex: number } | null {
  const closeIndex = text.indexOf("\u3011", startIndex + 1);
  if (closeIndex < 0) return null;
  const content = text.slice(startIndex + 1, closeIndex);
  const match = content.match(/^(.+?)\u2020L(\d+)(?:-L?(\d+))?$/);
  if (!match) return null;
  const path = normalizeFileCitationPath(match[1] ?? "");
  const lineStart = Number(match[2]);
  const lineEnd = match[3] ? Number(match[3]) : lineStart;
  if (!path || !Number.isInteger(lineStart) || lineStart <= 0 || !Number.isInteger(lineEnd) || lineEnd <= 0) {
    return null;
  }
  return { path, lineStart, lineEnd: Math.max(lineStart, lineEnd), endIndex: closeIndex + 1 };
}

function normalizeFileCitationPath(value: string): string {
  return value.trim().replace(/^F:/, "").trim();
}

export function findMarkdownAutolinkStart(text: string, index: number): number {
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseMarkdownAutolink(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
  }
  return -1;
}

export function parseMarkdownAutolink(
  text: string,
  startIndex: number,
): { text: string; href: string; endIndex: number } | null {
  if (text[startIndex] !== "<") return null;
  const closeIndex = text.indexOf(">", startIndex + 1);
  if (closeIndex < 0) return null;
  const value = text.slice(startIndex + 1, closeIndex);
  if (/^[A-Za-z][A-Za-z0-9+.-]{0,31}:[^\s<>]*$/u.test(value)) {
    const href = safeMarkdownHref(value);
    return href ? { text: value, href, endIndex: closeIndex + 1 } : null;
  }
  if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(value)) {
    return { text: value, href: `mailto:${value}`, endIndex: closeIndex + 1 };
  }
  return null;
}

export function findMarkdownBareLinkStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const protocolIndex = findNextMarkdownBareUrlProtocolIndex(text, cursor);
    const wwwIndex = findUnescapedIndex(text, "www.", cursor);
    const emailIndex = findNextMarkdownBareEmailIndex(text, cursor);
    const next = minPositiveIndex(minPositiveIndex(protocolIndex, wwwIndex), emailIndex);
    if (next < 0) return -1;
    if (parseMarkdownBareLink(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

function findNextMarkdownBareUrlProtocolIndex(text: string, index: number): number {
  let best = -1;
  // ftp is intentionally excluded — it is not in Codex's href scheme allowlist.
  for (const protocol of ["http://", "https://"]) {
    const match = findUnescapedIndexInsensitive(text, protocol, index);
    if (match >= 0 && (best < 0 || match < best)) best = match;
  }
  return best;
}

function findNextMarkdownBareEmailIndex(text: string, index: number): number {
  const email = /[A-Za-z0-9._+-]+@[A-Za-z0-9-_]+(?:\.[A-Za-z0-9-_]*[A-Za-z0-9])+(?![-_])/g;
  email.lastIndex = index;
  for (let match = email.exec(text); match != null; match = email.exec(text)) {
    const start = match.index;
    const previous = text[start - 1] ?? "";
    if (isEscapedMarkdownIndex(text, start)) continue;
    if (/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]/u.test(previous)) continue;
    return start;
  }
  return -1;
}

export function parseMarkdownBareLink(text: string, startIndex: number): { endIndex: number; href: string; text: string } | null {
  const emailMatch = text.slice(startIndex).match(/^[A-Za-z0-9._+-]+@[A-Za-z0-9-_]+(?:\.[A-Za-z0-9-_]*[A-Za-z0-9])+(?![-_])/);
  if (emailMatch) {
    const email = emailMatch[0];
    return { endIndex: startIndex + email.length, href: `mailto:${email}`, text: email };
  }

  const urlMatch = text.slice(startIndex).match(/^(?:https?:\/\/|www\.)(?:[A-Za-z0-9-]+\.?)+[^\s<]*/i);
  if (!urlMatch) return null;
  const rawText = trimMarkdownBareUrl(urlMatch[0]);
  if (!rawText) return null;
  const href = safeMarkdownHref(rawText.startsWith("www.") ? `http://${rawText}` : rawText);
  return href ? { endIndex: startIndex + rawText.length, href, text: rawText } : null;
}

function trimMarkdownBareUrl(value: string): string {
  let text = value;
  while (text.length > 0) {
    const last = text[text.length - 1] ?? "";
    if (/[?!.,:;*_'"~]/u.test(last)) {
      text = text.slice(0, -1);
      continue;
    }
    if (last === ")" && markdownParenBalance(text) < 0) {
      text = text.slice(0, -1);
      continue;
    }
    break;
  }
  return text;
}

function markdownParenBalance(text: string): number {
  let balance = 0;
  for (const char of text) {
    if (char === "(") balance += 1;
    if (char === ")") balance -= 1;
  }
  return balance;
}
