import { findUnescapedIndex } from "./conversation-markdown-scan";
import type {
  MarkdownBasicHtmlTag,
  MarkdownBlock,
} from "./conversation-markdown-types";

/*
 * Basic HTML support for the conversation markdown engine: the <details>
 * block and the small inline allowlist (<br>, <b>, <em>, ... spans).
 * Unclosed <details> returns null (termination-pinned, see the engine
 * tests). Extracted verbatim from ./conversation-markdown-engine.
 */

export function parseMarkdownDetailsBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
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

export function findBasicInlineHtmlStart(text: string, index: number): number {
  let cursor = findUnescapedIndex(text, "<", index);
  while (cursor >= 0) {
    if (parseBasicInlineHtml(text, cursor)) return cursor;
    cursor = findUnescapedIndex(text, "<", cursor + 1);
  }
  return -1;
}

export function parseBasicInlineHtml(
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
