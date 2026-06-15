import type { MarkdownBlock } from "./conversation-markdown-types";

import { findUnescapedIndex, minPositiveIndex } from "./conversation-markdown-scan";

/*
 * Math ($$ / \[ display blocks, $ / \( inline spans) parsing for the
 * conversation markdown engine. Behaviour here is pinned by the termination
 * regression tests in test/conversation-markdown-engine.test.ts: an unclosed
 * opener must return null so the block-loop paragraph guard can swallow the
 * line. Extracted verbatim from ./conversation-markdown-engine.
 */

export function parseMarkdownMathBlock(lines: string[], index: number): { block: MarkdownBlock; nextIndex: number } | null {
  const line = lines[index]?.trim() ?? "";
  const singleDollar = line.match(/^\$\$\s*(.+?)\s*\$\$$/);
  // Only a line that is ONE whole `$$…$$` formula is a display block. A line
  // like `$$a=1$$ and $$b=2$$` (two formulas + prose) would otherwise bridge
  // the prose into a single block via the non-greedy capture — let it fall
  // through to paragraph + inline rendering instead.
  if (singleDollar && !singleDollar[1].includes("$$")) {
    return { block: { kind: "math", text: singleDollar[1]?.trim() ?? "" }, nextIndex: index + 1 };
  }
  const singleBracket = line.match(/^\\\[\s*(.+?)\s*\\]$/);
  // Same multi-formula guard as the `$$…$$` branch above: a line like
  // `\[a=1\] and \[b=2\]` must not bridge the prose into one block via the
  // non-greedy capture — fall through to paragraph + inline rendering instead.
  if (singleBracket && !singleBracket[1].includes("\\[")) {
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

export function findMarkdownInlineMathStart(text: string, index: number): number {
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

export function parseMarkdownInlineMath(text: string, startIndex: number): { text: string; endIndex: number } | null {
  if (text.startsWith("\\(", startIndex)) {
    const closeIndex = text.indexOf("\\)", startIndex + 2);
    if (closeIndex < 0) return null;
    const value = text.slice(startIndex + 2, closeIndex).trim();
    return value ? { text: value, endIndex: closeIndex + 2 } : null;
  }
  // Inline display math `$$…$$` sharing a line with prose (the block parser
  // only matches a $$…$$ that fills the whole line). Without this branch the
  // scanner skips the first `$`, starts a single-`$` span at the second `$`,
  // and swallows the closing pair's leading `$` into the formula — leaving a
  // stray `$` in the prose and feeding KaTeX a malformed `…$`.
  if (text[startIndex] === "$" && text[startIndex + 1] === "$") {
    const closeIndex = text.indexOf("$$", startIndex + 2);
    if (closeIndex < 0) return null;
    const value = text.slice(startIndex + 2, closeIndex).trim();
    return value ? { text: value, endIndex: closeIndex + 2 } : null;
  }
  if (text[startIndex] !== "$") return null;
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
