import { marked, type Tokens } from "marked";

import { parseMarkdownDetailsBlock } from "./conversation-markdown-html";
import {
  markdownReferenceKey,
  parseMarkdownImageLine,
  parseMarkdownReferenceDefinition,
} from "./conversation-markdown-links";
import type { MarkdownReferenceDefinitions } from "./conversation-markdown-links";
import { parseMarkdownMathBlock } from "./conversation-markdown-math";
import {
  isTableSeparatorRow,
  parseMarkdownTable,
} from "./conversation-markdown-table";
import type {
  MarkdownBlock,
  MarkdownListItemValue,
  MarkdownTaskListItem,
} from "./conversation-markdown-types";

/*
 * Block-level parsing for the conversation markdown engine: the
 * `parseMarkdownBlockLines` loop plus every block construct it dispatches
 * to (code fences, headings, lists, blockquotes, boundaries).
 *
 * TERMINATION: the paragraph fallback inside `parseMarkdownBlockLines`
 * (the `if (paragraph.length === 0)` branch) is the streaming-termination
 * guard — `isMarkdownBlockBoundary` recognises `$$` / `\[` / `<details>` /
 * table openers whose block parsers refuse to consume them until the
 * closing line streams in, and without the guard the loop re-enters on the
 * same line forever. The loop and its guard live in this one function; keep
 * them together in this file (regression-pinned by
 * test/conversation-markdown-engine.test.ts). Extracted verbatim from
 * ./conversation-markdown-engine.
 */

export interface MarkdownDocument {
  blocks: MarkdownBlock[];
  references: MarkdownReferenceDefinitions;
}

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
    // marked failure → Forge parser 仍然 work（fallback 已覆盖在 parseMarkdownBlockLines 内）
  }
  // (3) Forge parser 处理 Forge 特有 block + inline directive
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
