import {
  findBasicInlineHtmlStart,
  parseBasicInlineHtml,
} from "./conversation-markdown-html";
import {
  findMarkdownAutolinkStart,
  findMarkdownBareLinkStart,
  parseFileCitationMarker,
  parseMarkdownAutolink,
  parseMarkdownBareLink,
  parseMarkdownImageInline,
  parseMarkdownLinkInline,
} from "./conversation-markdown-links";
import type { MarkdownReferenceDefinitions } from "./conversation-markdown-links";
import {
  findMarkdownInlineMathStart,
  parseMarkdownInlineMath,
} from "./conversation-markdown-math";
import {
  markdownPromptLinkFromHref,
  parseMarkdownPromptLink,
} from "./conversation-markdown-prompt-links";
import {
  markdownLinkSegment,
  priorityBadgeLabelFromSrc,
  safeMarkdownHref,
} from "./conversation-markdown-safety";
import {
  findUnescapedIndex,
  markdownUnescapeText,
  minPositiveIndex,
} from "./conversation-markdown-scan";
import type { MarkdownInlineSegment } from "./conversation-markdown-types";

/*
 * Inline (span-level) parsing for the conversation markdown engine: the
 * `parseMarkdownInline` scanning loop plus its token dispatch helpers.
 *
 * TERMINATION: the main `while (index < text.length)` loop in
 * `parseMarkdownInline` only ever advances `index` — every failed token
 * parse falls back to consuming exactly one character. The loop and all of
 * its advancement guards live in this one function; keep them together in
 * this file. Extracted verbatim from ./conversation-markdown-engine.
 */

export interface MarkdownInlineParseOptions {
  inLink?: boolean;
  references?: MarkdownReferenceDefinitions;
}

export function parseMarkdownInline(
  text: string,
  options: MarkdownInlineParseOptions = {},
): MarkdownInlineSegment[] {
  const segments: MarkdownInlineSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const token = nextInlineToken(text, index, options);
    if (!token) {
      pushTextSegment(segments, text.slice(index));
      break;
    }
    pushTextSegment(segments, text.slice(index, token.index));
    if (token.kind === "code") {
      const code = parseMarkdownCodeSpan(text, token.index);
      if (!code) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "code", text: code.text });
      index = code.endIndex;
      continue;
    }

    if (token.kind === "fileCitation") {
      const marker = parseFileCitationMarker(text, token.index);
      if (!marker) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({
        kind: "fileCitation",
        path: marker.path,
        lineStart: marker.lineStart,
        lineEnd: marker.lineEnd,
      });
      index = marker.endIndex;
      continue;
    }

    if (token.kind === "autolink") {
      const autolink = parseMarkdownAutolink(text, token.index);
      if (!autolink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "link", text: autolink.text, href: autolink.href });
      index = autolink.endIndex;
      continue;
    }

    if (token.kind === "bareLink") {
      const bareLink = parseMarkdownBareLink(text, token.index);
      if (!bareLink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "link", text: bareLink.text, href: bareLink.href });
      index = bareLink.endIndex;
      continue;
    }

    if (token.kind === "math") {
      const math = parseMarkdownInlineMath(text, token.index);
      if (!math) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "math", text: math.text });
      index = math.endIndex;
      continue;
    }

    if (token.kind === "promptLink") {
      const promptLink = parseMarkdownPromptLink(text, token.index);
      if (!promptLink) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({
        kind: "promptLink",
        href: promptLink.href,
        label: promptLink.label,
        promptKind: promptLink.promptKind,
      });
      index = promptLink.endIndex;
      continue;
    }

    if (token.kind === "html") {
      const html = parseBasicInlineHtml(text, token.index);
      if (!html) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      if (html.kind === "break") segments.push({ kind: "htmlBreak" });
      else segments.push({ kind: "htmlSpan", tag: html.tag, text: html.text });
      index = html.endIndex;
      continue;
    }

    if (token.kind === "image") {
      const image = parseMarkdownImageInline(text, token.index, options.references);
      if (!image) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      segments.push({ kind: "image", alt: image.alt, src: image.src, title: image.title });
      index = image.endIndex;
      continue;
    }

    if (token.kind === "link") {
      const link = parseMarkdownLinkInline(text, token.index, options.references);
      if (!link) {
        pushTextSegment(segments, text.slice(token.index, token.index + 1));
        index = token.index + 1;
        continue;
      }
      if (!link.label || !link.href) {
        pushTextSegment(segments, text.slice(token.index, link.endIndex));
      } else {
        const promptLink = markdownPromptLinkFromHref(link.label, link.href);
        const safeHref = promptLink ? link.href : safeMarkdownHref(link.href);
        if (promptLink) {
          segments.push(promptLink);
        } else if (safeHref) {
          segments.push(markdownLinkSegment(link.label, safeHref, link.title));
        } else {
          pushTextSegment(segments, text.slice(token.index, link.endIndex));
        }
      }
      index = link.endIndex;
      continue;
    }

    const marker = token.marker;
    const end = findInlineMarkerEnd(text, token.index + marker.length, marker, token.kind);
    if (end < 0) {
      pushTextSegment(segments, text.slice(token.index, token.index + marker.length));
      index = token.index + marker.length;
      continue;
    }
    const value = text.slice(token.index + marker.length, end);
    if (!value) {
      pushTextSegment(segments, text.slice(token.index, end + marker.length));
    } else if (token.kind === "strong") {
      segments.push({ kind: "strong", text: value });
    } else if (token.kind === "del") {
      segments.push({ kind: "del", text: value });
    } else {
      segments.push({ kind: "em", text: value });
    }
    index = end + marker.length;
  }

  return segments;
}

type InlineToken =
  | { kind: "code"; index: number }
  | { kind: "fileCitation"; index: number }
  | { kind: "autolink"; index: number }
  | { kind: "bareLink"; index: number }
  | { kind: "math"; index: number }
  | { kind: "promptLink"; index: number }
  | { kind: "html"; index: number }
  | { kind: "image"; index: number }
  | { kind: "link"; index: number }
  | { kind: "del"; index: number; marker: "~~" }
  | { kind: "strong"; index: number; marker: "**" | "__" }
  | { kind: "em"; index: number; marker: "*" | "_" };

function nextInlineToken(
  text: string,
  index: number,
  options: MarkdownInlineParseOptions = {},
): InlineToken | null {
  const candidates: InlineToken[] = [];
  const codeIndex = findUnescapedIndex(text, "`", index);
  if (codeIndex >= 0) candidates.push({ kind: "code", index: codeIndex });
  const fileCitationIndex = findUnescapedIndex(text, "\u3010", index);
  if (fileCitationIndex >= 0) candidates.push({ kind: "fileCitation", index: fileCitationIndex });
  if (!options.inLink) {
    const autolinkIndex = findMarkdownAutolinkStart(text, index);
    if (autolinkIndex >= 0) candidates.push({ kind: "autolink", index: autolinkIndex });
    const bareLinkIndex = findMarkdownBareLinkStart(text, index);
    if (bareLinkIndex >= 0) candidates.push({ kind: "bareLink", index: bareLinkIndex });
  }
  const mathIndex = findMarkdownInlineMathStart(text, index);
  if (mathIndex >= 0) candidates.push({ kind: "math", index: mathIndex });
  const promptLinkIndex = findMarkdownPromptLinkStart(text, index);
  if (promptLinkIndex >= 0) candidates.push({ kind: "promptLink", index: promptLinkIndex });
  const htmlIndex = findBasicInlineHtmlStart(text, index);
  if (htmlIndex >= 0) candidates.push({ kind: "html", index: htmlIndex });
  if (!options.inLink) {
    const imageIndex = findUnescapedIndex(text, "![", index);
    if (imageIndex >= 0) candidates.push({ kind: "image", index: imageIndex });
    const linkIndex = findUnescapedIndex(text, "[", index);
    if (linkIndex >= 0) candidates.push({ kind: "link", index: linkIndex });
  }
  const delIndex = findUnescapedIndex(text, "~~", index);
  if (delIndex >= 0) candidates.push({ kind: "del", index: delIndex, marker: "~~" });
  const strongStarIndex = findUnescapedIndex(text, "**", index);
  if (strongStarIndex >= 0) candidates.push({ kind: "strong", index: strongStarIndex, marker: "**" });
  const strongUnderscoreIndex = findUnescapedIndex(text, "__", index);
  if (strongUnderscoreIndex >= 0) candidates.push({ kind: "strong", index: strongUnderscoreIndex, marker: "__" });
  const emStarIndex = findSingleMarkerStart(text, index, "*");
  if (emStarIndex >= 0) candidates.push({ kind: "em", index: emStarIndex, marker: "*" });
  const emUnderscoreIndex = findSingleMarkerStart(text, index, "_");
  if (emUnderscoreIndex >= 0) candidates.push({ kind: "em", index: emUnderscoreIndex, marker: "_" });
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => left.index - right.index || tokenPriority(left) - tokenPriority(right))[0] ?? null;
}

function tokenPriority(token: InlineToken): number {
  if (token.kind === "code") return 0;
  if (token.kind === "fileCitation") return 1;
  if (token.kind === "autolink") return 2;
  if (token.kind === "bareLink") return 3;
  if (token.kind === "math") return 4;
  if (token.kind === "promptLink") return 5;
  if (token.kind === "html") return 6;
  if (token.kind === "image") return 7;
  if (token.kind === "link") return 8;
  if (token.kind === "del") return 9;
  if (token.kind === "strong") return 10;
  return 11;
}

function findSingleMarkerStart(text: string, index: number, marker: "*" | "_"): number {
  let cursor = index;
  while (cursor < text.length) {
    const next = findUnescapedIndex(text, marker, cursor);
    if (next < 0) return -1;
    if (text[next - 1] !== marker && text[next + 1] !== marker && !isWordInternalUnderscore(text, next, marker)) {
      return next;
    }
    cursor = next + 1;
  }
  return -1;
}

function findInlineMarkerEnd(text: string, index: number, marker: string, kind: InlineToken["kind"]): number {
  let cursor = index;
  while (cursor < text.length) {
    const next = findUnescapedIndex(text, marker, cursor);
    if (next < 0) return -1;
    if ((kind !== "em" || marker !== "_" || !isWordInternalUnderscore(text, next, "_")) && next > index) {
      return next;
    }
    cursor = next + marker.length;
  }
  return -1;
}

function isWordInternalUnderscore(text: string, index: number, marker: "*" | "_"): boolean {
  if (marker !== "_") return false;
  return /[A-Za-z0-9]/.test(text[index - 1] ?? "") && /[A-Za-z0-9]/.test(text[index + 1] ?? "");
}

function parseMarkdownCodeSpan(text: string, startIndex: number): { endIndex: number; text: string } | null {
  if (text[startIndex] !== "`") return null;
  const markerLength = markdownBacktickRunLength(text, startIndex);
  let cursor = startIndex + markerLength;
  while (cursor < text.length) {
    const next = text.indexOf("`", cursor);
    if (next < 0) return null;
    const runLength = markdownBacktickRunLength(text, next);
    if (runLength === markerLength) {
      const raw = text.slice(startIndex + markerLength, next).replace(/\r?\n|\r/gu, " ");
      const hasNonSpace = /\S/u.test(raw);
      const hasEdgeSpaces = /^\s/u.test(raw) && /\s$/u.test(raw);
      return {
        endIndex: next + markerLength,
        text: hasNonSpace && hasEdgeSpaces ? raw.slice(1, -1) : raw,
      };
    }
    cursor = next + runLength;
  }
  return null;
}

function markdownBacktickRunLength(text: string, index: number): number {
  let cursor = index;
  while (text[cursor] === "`") cursor += 1;
  return cursor - index;
}

function findMarkdownPromptLinkStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const skillIndex = findUnescapedIndex(text, "$", cursor);
    const routeIndex = findUnescapedIndex(text, "@", cursor);
    const next = minPositiveIndex(skillIndex, routeIndex);
    if (next < 0) return -1;
    if (parseMarkdownPromptLink(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

export function markdownInlineContainsPriorityBadgeImage(
  text: string,
  options: MarkdownInlineParseOptions = {},
): boolean {
  return parseMarkdownInline(text, options).some((segment) => {
    if (segment.kind === "image" && priorityBadgeLabelFromSrc(segment.src) != null) return true;
    if (segment.kind === "strong" || segment.kind === "em" || segment.kind === "del" || segment.kind === "htmlSpan") {
      return markdownInlineContainsPriorityBadgeImage(segment.text, options);
    }
    if (segment.kind === "link") {
      return markdownInlineContainsPriorityBadgeImage(segment.text, { ...options, inLink: true });
    }
    return false;
  });
}

function pushTextSegment(segments: MarkdownInlineSegment[], text: string): void {
  if (text.length === 0) return;
  const value = markdownUnescapeText(text);
  if (value.length === 0) return;
  const previous = segments[segments.length - 1];
  if (previous?.kind === "text") {
    previous.text += value;
    return;
  }
  segments.push({ kind: "text", text: value });
}
