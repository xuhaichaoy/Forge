import { marked, type Tokens } from "marked";

import {
  markdownPromptLinkFromHref,
  parseMarkdownPromptLink,
} from "./conversation-markdown-prompt-links";
import type { MarkdownPromptLinkSegment } from "./conversation-markdown-prompt-links";
import {
  markdownLinkSegment,
  normalizeMarkdownHref,
  priorityBadgeLabelFromSrc,
  safeMarkdownHref,
  safeMarkdownImageSrc,
} from "./conversation-markdown-safety";
import {
  isTableSeparatorRow,
  parseMarkdownTable,
} from "./conversation-markdown-table";

export {
  memoryCitationEntries,
  memoryCitationFileReference,
} from "./conversation-memory-citations";
export type { MemoryCitationEntryView } from "./conversation-memory-citations";
export { safeMarkdownHref } from "./conversation-markdown-safety";
export { normalizeTableRow } from "./conversation-markdown-table";
export {
  markdownPromptLinkFromHref,
  parseMarkdownPromptLink,
} from "./conversation-markdown-prompt-links";
export type {
  MarkdownPromptLinkKind,
  MarkdownPromptLinkSegment,
} from "./conversation-markdown-prompt-links";

/*
 * Pure CommonMark/GFM-plus parsing engine for the conversation surface.
 *
 * This module is the single source of truth for turning assistant/event/plan
 * markdown text into the `MarkdownBlock` / `MarkdownInlineSegment` AST plus the
 * reference-definition map and the streaming fade segment counts. It contains
 * NO React, JSX, or DOM access — every export is a pure (text | AST) -> value
 * transform — so it can be imported by `message-unit`, `event-unit`, and
 * `plan-summary-card` (transitively via `Markdownish`) without pulling in any
 * rendering concern. The React rendering of this AST lives in `message-unit`.
 *
 * Behaviour here is byte-identical to the parser that previously lived inline
 * in `message-unit.tsx`; it was extracted verbatim, only the `export` surface
 * was widened so the renderer can import what it needs. See `message-unit.tsx`
 * for the original CODEX-REF alignment notes on the two-layer marked + HiCodex
 * directive parser.
 */

interface MarkdownWordSegment {
  isWordLike?: boolean;
  segment: string;
}

export interface MarkdownWordSegmenter {
  segment(text: string): Iterable<MarkdownWordSegment>;
}

export function createMarkdownWordSegmenter(): MarkdownWordSegmenter | null {
  const segmenterCtor = (Intl as unknown as {
    Segmenter?: new (locale?: string | string[], options?: { granularity: "word" }) => MarkdownWordSegmenter;
  }).Segmenter;
  if (!segmenterCtor) return null;
  try {
    return new segmenterCtor(undefined, { granularity: "word" });
  } catch {
    return null;
  }
}

export function markdownIndexedFadeSegmentCount(
  blocks: MarkdownBlock[],
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
  references?: MarkdownReferenceDefinitions,
): number {
  return blocks.reduce((count, block) => count + markdownBlockFadeSegmentCount(block, segmenter, references), 0);
}

function markdownBlockFadeSegmentCount(
  block: MarkdownBlock,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "blockquote":
      return block.children
        ? block.children.reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0)
        : markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "details":
      return markdownInlineFadeSegmentCount(block.summary, segmenter, { references });
    case "list":
      return block.items.reduce((count, item) => count + markdownListItemFadeSegmentCount(item, segmenter, references), 0);
    case "taskList":
      return block.items.reduce((count, item) => count + markdownInlineFadeSegmentCount(item.text, segmenter, { references }), 0);
    case "table":
      return [...block.headers, ...block.rows.flat()].reduce(
        (count, cell) => count + markdownInlineFadeSegmentCount(cell, segmenter, { references }),
        0,
      );
    case "code":
    case "hr":
    case "image":
    case "imageGrid":
    case "math":
      return 0;
  }
}

function markdownListItemFadeSegmentCount(
  item: MarkdownListItemValue,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  if (typeof item === "string") return markdownInlineFadeSegmentCount(item, segmenter, { references });
  return markdownInlineFadeSegmentCount(item.text, segmenter, { references })
    + (item.children ?? []).reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0);
}

function markdownInlineFadeSegmentCount(
  text: string,
  segmenter: MarkdownWordSegmenter | null,
  options: MarkdownInlineParseOptions = {},
): number {
  return parseMarkdownInline(text, options).reduce((count, segment) => {
    if (segment.kind === "text") return count + markdownFadeTextSegments(segment.text, segmenter).length;
    if (
      segment.kind === "del"
      || segment.kind === "em"
      || segment.kind === "htmlSpan"
      || segment.kind === "link"
      || segment.kind === "strong"
    ) {
      return count + markdownInlineFadeSegmentCount(
        segment.text,
        segmenter,
        segment.kind === "link" ? { ...options, inLink: true } : options,
      );
    }
    return count;
  }, 0);
}

export function markdownFadeTextSegments(
  text: string,
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
): string[] {
  if (!segmenter) {
    const fallbackSegments = Array.from(text.match(/\s*\S+(?:\s+|$)/g) ?? []);
    return fallbackSegments.length > 0 || text.length === 0 ? fallbackSegments : [text];
  }
  const segments: string[] = [];
  for (const part of segmenter.segment(text)) {
    if (/^\s*$/u.test(part.segment) || part.isWordLike !== true) {
      const previousIndex = Math.max(segments.length - 1, 0);
      segments[previousIndex] = `${segments[previousIndex] ?? ""}${part.segment}`;
      continue;
    }
    segments.push(part.segment);
  }
  return segments;
}

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { children?: MarkdownBlock[]; kind: "blockquote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "details"; open: boolean; summary: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "list"; loose?: boolean; ordered: boolean; items: MarkdownListItemValue[]; start?: number }
  | { kind: "taskList"; items: MarkdownTaskListItem[] }
  | { aligns?: MarkdownTableAlign[]; kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" }
  | MarkdownImageBlock
  | { kind: "imageGrid"; images: MarkdownImageBlock[] };

export interface MarkdownImageBlock {
  alt: string;
  kind: "image";
  src: string;
  title: string | null;
}

export interface MarkdownTaskListItem {
  checked: boolean;
  text: string;
}

export interface MarkdownNestedListItem {
  checked?: boolean;
  children?: MarkdownBlock[];
  task?: boolean;
  text: string;
}

export type MarkdownListItemValue = string | MarkdownNestedListItem;

export type MarkdownTableAlign = "center" | "left" | "right" | null;

export type MarkdownInlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "htmlBreak" }
  | { kind: "htmlSpan"; tag: MarkdownBasicHtmlTag; text: string }
  | { kind: "image"; alt: string; src: string; title: string | null }
  | { kind: "link"; text: string; href: string; title?: string | null }
  | MarkdownPromptLinkSegment
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "math"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

export interface MarkdownInlineParseOptions {
  inLink?: boolean;
  references?: MarkdownReferenceDefinitions;
}

export interface MarkdownReferenceDefinition {
  href: string;
  title: string | null;
}

export type MarkdownReferenceDefinitions = Map<string, MarkdownReferenceDefinition>;

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  references: MarkdownReferenceDefinitions;
}

type MarkdownBasicHtmlTag = "b" | "del" | "em" | "i" | "s" | "strong" | "sub" | "sup" | "u";

let __markedConfigured = false;
function configureMarkedOnce(): void {
  if (__markedConfigured) return;
  marked.use({ gfm: true, breaks: false });
  __markedConfigured = true;
}

export function parseMarkdownDocument(text: string): MarkdownDocument {
  configureMarkedOnce();
  const normalized = text.replace(/\r\n/g, "\n");
  const references: MarkdownReferenceDefinitions = new Map();
  // (1) marked.lexer 作为对齐基线 + reference 收集
  try {
    const tokens = marked.lexer(normalized);
    for (const token of tokens) {
      if ((token as { type?: string }).type === "def") {
        const def = token as Tokens.Def;
        const tag = (def.tag ?? "").toLowerCase();
        if (tag && !references.has(tag)) {
          references.set(tag, {
            href: def.href ?? "",
            title: def.title ?? null,
          });
        }
      }
    }
  } catch {
    // marked failure → HiCodex parser 仍然 work（fallback 已覆盖在 parseMarkdownBlockLines 内）
  }
  // (3) HiCodex parser 处理 HiCodex 特有 block + inline directive
  const lines = normalized.split("\n");
  const blocks = parseMarkdownBlockLines(lines, references);
  return { blocks, references };
}

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  return parseMarkdownDocument(text).blocks;
}

function parseMarkdownBlockLines(
  lines: string[],
  references: MarkdownReferenceDefinitions,
): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const referenceDefinition = parseMarkdownReferenceDefinition(lines, index);
    if (referenceDefinition) {
      const key = markdownReferenceKey(referenceDefinition.label);
      if (key && !references.has(key)) {
        references.set(key, { href: referenceDefinition.href, title: referenceDefinition.title });
      }
      index = referenceDefinition.nextIndex;
      continue;
    }

    const indentedCode = parseMarkdownIndentedCodeBlock(lines, index);
    if (indentedCode) {
      blocks.push(indentedCode.block);
      index = indentedCode.nextIndex;
      continue;
    }

    const fence = parseMarkdownFenceLine(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isMarkdownClosingFence(lines[index] ?? "", fence.fenceChar, fence.fenceMarker.length)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence.language, text: codeLines.join("\n") });
      continue;
    }

    const mathBlock = parseMarkdownMathBlock(lines, index);
    if (mathBlock) {
      blocks.push(mathBlock.block);
      index = mathBlock.nextIndex;
      continue;
    }

    const detailsBlock = parseMarkdownDetailsBlock(lines, index);
    if (detailsBlock) {
      blocks.push(detailsBlock.block);
      index = detailsBlock.nextIndex;
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})(?=\s|$)(.*)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: markdownAtxHeadingText(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    const setextHeading = parseMarkdownSetextHeading(lines, index);
    if (setextHeading) {
      blocks.push(setextHeading.block);
      index = setextHeading.nextIndex;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    const image = parseMarkdownImageLine(line, references);
    if (image) {
      index += 1;
      const images = [image];
      while (index < lines.length) {
        const nextImage = parseMarkdownImageLine(lines[index] ?? "", references);
        if (!nextImage) break;
        images.push(nextImage);
        index += 1;
      }
      blocks.push(images.length > 1 ? { kind: "imageGrid", images } : image);
      continue;
    }

    const table = parseMarkdownTable(lines, index, isMarkdownBlockBoundary);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const listBlock = parseMarkdownListBlock(lines, index, 0, references);
    if (listBlock) {
      blocks.push(listBlock.block);
      index = listBlock.nextIndex;
      continue;
    }

    if (isMarkdownBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index] ?? "";
        if (isMarkdownBlockquoteLine(quoteLine)) {
          quoteLines.push(stripMarkdownBlockquoteMarker(quoteLine));
          index += 1;
          continue;
        }
        if (!isMarkdownLazyBlockquoteContinuation(quoteLine, lines[index + 1] ?? "")) break;
        quoteLines.push(quoteLine);
        index += 1;
      }
      const quoteText = quoteLines.join("\n");
      const quoteChildren = parseMarkdownBlockLines(quoteLines, references);
      blocks.push(
        shouldRenderBlockquoteChildren(quoteChildren)
          ? { kind: "blockquote", text: quoteText, children: quoteChildren }
          : { kind: "blockquote", text: quoteText },
      );
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && !isMarkdownBlockBoundary(lines[index] ?? "", lines[index + 1] ?? "")) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    if (paragraph.length === 0) {
      // The current line registers as a block boundary, yet every block parser
      // above declined to consume it — e.g. a `$$` / `\[` / `<details>` opener
      // whose closing line hasn't streamed in yet. Swallow it as plain text;
      // without this the outer loop re-enters on the same line forever.
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
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

function parseMarkdownMathBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const line = lines[index]?.trim() ?? "";
  const singleDollar = line.match(/^\$\$\s*(.+?)\s*\$\$$/);
  if (singleDollar) {
    return { block: { kind: "math", text: singleDollar[1]?.trim() ?? "" }, nextIndex: index + 1 };
  }
  const singleBracket = line.match(/^\\\[\s*(.+?)\s*\\]$/);
  if (singleBracket) {
    return { block: { kind: "math", text: singleBracket[1]?.trim() ?? "" }, nextIndex: index + 1 };
  }
  if (line !== "$$" && line !== "\\[") return null;
  const close = line === "$$" ? "$$" : "\\]";
  const mathLines: string[] = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && (lines[nextIndex]?.trim() ?? "") !== close) {
    mathLines.push(lines[nextIndex] ?? "");
    nextIndex += 1;
  }
  if (nextIndex >= lines.length) return null;
  return {
    block: { kind: "math", text: mathLines.join("\n").trim() },
    nextIndex: nextIndex + 1,
  };
}

function parseMarkdownDetailsBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const firstLine = lines[index] ?? "";
  if (!/^<details(?:\s+open)?\s*>/i.test(firstLine.trim())) return null;
  const detailsLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    detailsLines.push(line);
    nextIndex += 1;
    if (/<\/details\s*>/i.test(line)) break;
  }
  const raw = detailsLines.join("\n");
  if (!/<\/details\s*>/i.test(raw)) return null;
  const open = /^<details\s+open\s*>/i.test(firstLine.trim());
  const summaryMatch = raw.match(/<summary\s*>([\s\S]*?)<\/summary\s*>/i);
  const summary = summaryMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "Details";
  const text = raw
    .replace(/^<details(?:\s+open)?\s*>\s*/i, "")
    .replace(/<summary\s*>[\s\S]*?<\/summary\s*>\s*/i, "")
    .replace(/\s*<\/details\s*>\s*$/i, "")
    .trim();
  return {
    block: { kind: "details", open, summary, text },
    nextIndex,
  };
}

function parseMarkdownIndentedCodeBlock(
  lines: string[],
  index: number,
): { block: Extract<MarkdownBlock, { kind: "code" }>; nextIndex: number } | null {
  if (!isMarkdownIndentedCodeLine(lines[index] ?? "")) return null;
  const codeLines: string[] = [];
  let nextIndex = index;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    if (line.trim().length === 0) {
      codeLines.push("");
      nextIndex += 1;
      continue;
    }
    if (!isMarkdownIndentedCodeLine(line)) break;
    codeLines.push(line.replace(/^(?: {4}| {0,3}\t)/, ""));
    nextIndex += 1;
  }
  return {
    block: { kind: "code", language: "", text: codeLines.join("\n").replace(/\n+$/u, "") },
    nextIndex,
  };
}

function isMarkdownIndentedCodeLine(line: string): boolean {
  return /^(?: {4}| {0,3}\t)/.test(line);
}

function parseMarkdownFenceLine(
  line: string,
): { fenceChar: string; fenceMarker: string; language: string } | null {
  const match = line.match(/^ {0,3}([`~]{3,})(.*)$/);
  if (!match) return null;
  const fenceMarker = match[1] ?? "";
  const fenceChar = fenceMarker[0] ?? "";
  if (!fenceChar || !fenceMarker.split("").every((char) => char === fenceChar)) return null;
  const rawLanguage = match[2] ?? "";
  if (fenceChar === "`" && rawLanguage.includes("`")) return null;
  return {
    fenceChar,
    fenceMarker,
    language: rawLanguage.trim(),
  };
}

function markdownAtxHeadingText(rawText: string): string {
  const text = rawText.trim();
  if (!text.endsWith("#")) return text;
  const withoutClosingHashes = text.replace(/#+$/u, "");
  return withoutClosingHashes.length === 0 || /\s$/u.test(withoutClosingHashes)
    ? withoutClosingHashes.trim()
    : text;
}

function parseMarkdownSetextHeading(
  lines: string[],
  index: number,
): { block: Extract<MarkdownBlock, { kind: "heading" }>; nextIndex: number } | null {
  const text = lines[index]?.trim();
  const marker = lines[index + 1] ?? "";
  if (!text || !/^\s{0,3}(=+|-+)\s*$/.test(marker)) return null;
  if (!isMarkdownSetextHeadingText(text)) return null;
  return {
    block: {
      kind: "heading",
      level: marker.trim().startsWith("=") ? 1 : 2,
      text,
    },
    nextIndex: index + 2,
  };
}

function isMarkdownSetextHeadingText(text: string): boolean {
  if (parseMarkdownImageLine(text) || parseMarkdownTaskListItem(text)) return false;
  if (/^>\s?/.test(text)) return false;
  if (parseMarkdownListItemLine(text)) return false;
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) return false;
  return true;
}

function isMarkdownClosingFence(line: string, fenceChar: string, minimumLength: number): boolean {
  const match = line.match(/^ {0,3}([`~]+)[ \t]*$/);
  const closingMarker = match?.[1] ?? "";
  return closingMarker.length >= minimumLength && closingMarker.split("").every((char) => char === fenceChar);
}

interface ParsedMarkdownListItemLine {
  contentIndent: number;
  indent: number;
  ordered: boolean;
  start: number;
  text: string;
}

function parseMarkdownListBlock(
  lines: string[],
  index: number,
  minimumIndent = 0,
  references?: MarkdownReferenceDefinitions,
): { block: Extract<MarkdownBlock, { kind: "list" }>; nextIndex: number } | null {
  const first = parseMarkdownListItemLine(lines[index] ?? "", { allowIndented: true });
  if (!first || first.indent < minimumIndent || first.indent > 3 && minimumIndent === 0) return null;
  const ordered = first.ordered;
  const start = ordered ? first.start : 1;
  const listIndent = first.indent;
  const items: MarkdownListItemValue[] = [];
  let nextIndex = index;
  let loose = false;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    const item = parseMarkdownListItemLine(line, { allowIndented: true });
    if (!item || item.indent !== listIndent || item.ordered !== ordered) break;
    const parsedItem = parseMarkdownListItem(lines, nextIndex, listIndent, ordered, references);
    if (!parsedItem) break;
    items.push(parsedItem.item);
    loose = loose || parsedItem.loose;
    nextIndex = parsedItem.nextIndex;
  }

  if (items.length === 0) return null;
  const block: Extract<MarkdownBlock, { kind: "list" }> = {
    kind: "list",
    ordered,
    items,
    ...(ordered && start > 1 ? { start } : {}),
    ...(loose ? { loose } : {}),
  };
  return { block, nextIndex };
}

function parseMarkdownListItem(
  lines: string[],
  index: number,
  listIndent: number,
  ordered: boolean,
  references: MarkdownReferenceDefinitions | undefined,
): { item: MarkdownListItemValue; loose: boolean; nextIndex: number } | null {
  const first = parseMarkdownListItemLine(lines[index] ?? "", { allowIndented: true });
  if (!first || first.indent !== listIndent || first.ordered !== ordered) return null;
  const contentLines = [first.text];
  let nextIndex = index + 1;
  let loose = false;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    const item = parseMarkdownListItemLine(line, { allowIndented: true });
    if (item && item.indent === listIndent && item.ordered === ordered) break;
    if (item && item.indent < listIndent) break;

    if (line.trim().length === 0) {
      const nextContentIndex = nextNonBlankMarkdownLine(lines, nextIndex + 1);
      if (nextContentIndex < 0) break;
      const nextContentLine = lines[nextContentIndex] ?? "";
      const nextItem = parseMarkdownListItemLine(nextContentLine, { allowIndented: true });
      if (nextItem && nextItem.indent === listIndent && nextItem.ordered === ordered) {
        loose = true;
        contentLines.push("");
        nextIndex += 1;
        break;
      }
      if (markdownLineIndentWidth(nextContentLine) >= first.contentIndent || (nextItem && nextItem.indent > listIndent)) {
        loose = true;
        contentLines.push("");
        nextIndex += 1;
        continue;
      }
      break;
    }

    if (
      markdownLineIndentWidth(line) < first.contentIndent
      && isMarkdownListBreakingBlock(line)
    ) {
      break;
    }

    contentLines.push(stripMarkdownIndent(line, first.contentIndent));
    nextIndex += 1;
  }

  trimTrailingBlankMarkdownLines(contentLines);
  return {
    item: markdownListItemFromContentLines(contentLines, references),
    loose,
    nextIndex,
  };
}

function markdownListItemFromContentLines(
  lines: string[],
  references: MarkdownReferenceDefinitions | undefined,
): MarkdownListItemValue {
  const blocks = parseMarkdownBlockLines(lines, references ?? new Map());
  const first = blocks[0];
  if (!first) return "";
  if (first.kind === "paragraph") {
    const children = blocks.slice(1);
    const task = parseMarkdownTaskListItemText(first.text);
    if (!task && children.length === 0) return first.text;
    return {
      text: task?.text ?? first.text,
      ...(children.length > 0 ? { children } : {}),
      ...(task ? { checked: task.checked, task: true } : {}),
    };
  }
  return { text: "", children: blocks };
}

function shouldRenderBlockquoteChildren(children: MarkdownBlock[]): boolean {
  return children.length > 1 || children.some((child) => child.kind !== "paragraph");
}

function parseMarkdownListItemLine(
  line: string,
  options: { allowIndented?: boolean } = {},
): ParsedMarkdownListItemLine | null {
  const match = line.match(/^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/);
  if (!match) return null;
  const indent = markdownIndentWidth(match[1] ?? "");
  if (indent > 3 && options.allowIndented !== true) return null;
  const marker = match[2] ?? "";
  const ordered = /^\d{1,9}[.)]$/.test(marker);
  const contentIndent = indent + marker.length + markdownIndentWidth(match[3] ?? "");
  return {
    contentIndent,
    indent,
    ordered,
    start: ordered ? Number.parseInt(marker.replace(/[.)]$/u, ""), 10) : 1,
    text: match[4] ?? "",
  };
}

function nextNonBlankMarkdownLine(lines: string[], index: number): number {
  let cursor = index;
  while (cursor < lines.length) {
    if ((lines[cursor] ?? "").trim().length > 0) return cursor;
    cursor += 1;
  }
  return -1;
}

function markdownLineIndentWidth(line: string): number {
  return markdownIndentWidth(line.match(/^[ \t]*/)?.[0] ?? "");
}

function stripMarkdownIndent(line: string, width: number): string {
  let cursor = 0;
  let remaining = width;
  while (cursor < line.length && remaining > 0) {
    const char = line[cursor] ?? "";
    if (char === " ") {
      remaining -= 1;
      cursor += 1;
      continue;
    }
    if (char === "\t") {
      remaining -= Math.min(remaining, 4);
      cursor += 1;
      continue;
    }
    break;
  }
  return line.slice(cursor);
}

function trimTrailingBlankMarkdownLines(lines: string[]): void {
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim().length === 0) {
    lines.pop();
  }
}

function isMarkdownListBreakingBlock(line: string): boolean {
  return parseMarkdownFenceLine(line) !== null
    || /^ {0,3}#{1,6}(?=\s|$)/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^<details(?:\s+open)?\s*>/i.test(line.trim());
}

function isMarkdownBlockquoteLine(line: string): boolean {
  return /^ {0,3}>\s?/.test(line);
}

function stripMarkdownBlockquoteMarker(line: string): string {
  return line.replace(/^ {0,3}>\s?/, "");
}

function isMarkdownLazyBlockquoteContinuation(line: string, nextLine = ""): boolean {
  return line.trim().length > 0 && !isMarkdownBlockBoundary(line, nextLine);
}

function markdownIndentWidth(indent: string): number {
  let width = 0;
  for (const char of indent) width += char === "\t" ? 4 : 1;
  return width;
}

function parseMarkdownTaskListItem(line: string): MarkdownTaskListItem | null {
  const match = line.match(/^ {0,3}[-*+]\s+\[([ xX])]\s+(.+)$/);
  if (!match) return null;
  return {
    checked: (match[1] ?? "").toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseMarkdownTaskListItemText(text: string): MarkdownTaskListItem | null {
  const match = text.match(/^\[([ xX])\]\s+([\s\S]*)$/u);
  if (!match) return null;
  return {
    checked: (match[1] ?? "").toLowerCase() === "x",
    text: match[2] ?? "",
  };
}

function parseMarkdownImageLine(
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

function parseMarkdownImageInline(
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

function parseMarkdownLinkInline(
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

function parseMarkdownReferenceDefinition(
  lines: string[],
  index: number,
): { href: string; label: string; nextIndex: number; title: string | null } | null {
  const line = lines[index] ?? "";
  const match = line.match(/^ {0,3}\[((?:\\[\s\S]|[^\[\]\\])+)\]:(.*)$/u);
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

function markdownReferenceKey(value: string): string {
  return markdownUnescapeText(value).trim().replace(/\s+/gu, " ").toLowerCase();
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

function findUnescapedIndex(text: string, search: string, fromIndex: number): number {
  let cursor = text.indexOf(search, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = text.indexOf(search, cursor + 1);
  }
  return -1;
}

function findUnescapedIndexInsensitive(text: string, search: string, fromIndex: number): number {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let cursor = lowerText.indexOf(lowerSearch, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = lowerText.indexOf(lowerSearch, cursor + 1);
  }
  return -1;
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

function isEscapedMarkdownIndex(text: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

function parseFileCitationMarker(
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

function findMarkdownAutolinkStart(text: string, index: number): number {
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseMarkdownAutolink(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
  }
  return -1;
}

function parseMarkdownAutolink(
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

function findMarkdownBareLinkStart(text: string, index: number): number {
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

function parseMarkdownBareLink(text: string, startIndex: number): { endIndex: number; href: string; text: string } | null {
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

function findMarkdownInlineMathStart(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length) {
    const dollarIndex = findUnescapedIndex(text, "$", cursor);
    const parenIndex = findUnescapedIndex(text, "\\(", cursor);
    const next = minPositiveIndex(dollarIndex, parenIndex);
    if (next < 0) return -1;
    if (parseMarkdownInlineMath(text, next)) return next;
    cursor = next + 1;
  }
  return -1;
}

function minPositiveIndex(left: number, right: number): number {
  if (left < 0) return right;
  if (right < 0) return left;
  return Math.min(left, right);
}

export function parseMarkdownInlineMath(text: string, startIndex: number): { text: string; endIndex: number } | null {
  if (text.startsWith("\\(", startIndex)) {
    const closeIndex = text.indexOf("\\)", startIndex + 2);
    if (closeIndex < 0) return null;
    const value = text.slice(startIndex + 2, closeIndex).trim();
    return value ? { text: value, endIndex: closeIndex + 2 } : null;
  }
  if (text[startIndex] !== "$" || text[startIndex + 1] === "$") return null;
  if (/\s/.test(text[startIndex + 1] ?? "")) return null;
  let cursor = startIndex + 1;
  while (cursor < text.length) {
    const closeIndex = findUnescapedIndex(text, "$", cursor);
    if (closeIndex < 0) return null;
    if (text[closeIndex - 1] !== "\\" && text[closeIndex - 1] !== " " && text[closeIndex + 1] !== "$") {
      const value = text.slice(startIndex + 1, closeIndex).trim();
      return value ? { text: value, endIndex: closeIndex + 1 } : null;
    }
    cursor = closeIndex + 1;
  }
  return null;
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

function findBasicInlineHtmlStart(text: string, index: number): number {
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseBasicInlineHtml(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
  }
  return -1;
}

function parseBasicInlineHtml(
  text: string,
  startIndex: number,
): { endIndex: number; kind: "break" } | { endIndex: number; kind: "span"; tag: MarkdownBasicHtmlTag; text: string } | null {
  const breakMatch = text.slice(startIndex).match(/^<br\s*\/?>/i);
  if (breakMatch) return { kind: "break", endIndex: startIndex + breakMatch[0].length };
  const openMatch = text.slice(startIndex).match(/^<(b|del|em|i|s|strong|sub|sup|u)>/i);
  if (!openMatch) return null;
  const tag = openMatch[1]?.toLowerCase() as MarkdownBasicHtmlTag | undefined;
  if (!tag) return null;
  const contentStart = startIndex + openMatch[0].length;
  const closeRe = new RegExp(`</${tag}\\s*>`, "i");
  const closeMatch = closeRe.exec(text.slice(contentStart));
  if (!closeMatch) return null;
  const contentEnd = contentStart + closeMatch.index;
  return {
    endIndex: contentEnd + closeMatch[0].length,
    kind: "span",
    tag,
    text: text.slice(contentStart, contentEnd),
  };
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

function isMarkdownBlockBoundary(line: string, nextLine = ""): boolean {
  return line.trim().length === 0
    || parseMarkdownIndentedCodeBlock([line], 0) !== null
    || parseMarkdownFenceLine(line) !== null
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^<details(?:\s+open)?\s*>/i.test(line.trim())
    || /^ {0,3}#{1,6}(?=\s|$)/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || parseMarkdownImageLine(line) !== null
    || parseMarkdownTaskListItem(line) !== null
    || parseMarkdownListItemLine(line) !== null
    || isMarkdownBlockquoteLine(line)
    || (line.includes("|") && isTableSeparatorRow(nextLine));
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

function markdownUnescapeText(text: string): string {
  return text.replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, "$1");
}
