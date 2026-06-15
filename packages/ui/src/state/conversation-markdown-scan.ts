/*
 * Escape-aware string scanning primitives shared by the conversation
 * markdown engine modules (inline/block/links/math/html). Pure string ->
 * value helpers with no imports; leaf of the engine module DAG.
 * Extracted verbatim from ./conversation-markdown-engine.
 */

export function findUnescapedIndex(text: string, search: string, fromIndex: number): number {
  let cursor = text.indexOf(search, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = text.indexOf(search, cursor + 1);
  }
  return -1;
}

export function findUnescapedIndexInsensitive(text: string, search: string, fromIndex: number): number {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  let cursor = lowerText.indexOf(lowerSearch, fromIndex);
  while (cursor >= 0) {
    if (!isEscapedMarkdownIndex(text, cursor)) return cursor;
    cursor = lowerText.indexOf(lowerSearch, cursor + 1);
  }
  return -1;
}

export function isEscapedMarkdownIndex(text: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && text[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }
  return slashCount % 2 === 1;
}

export function minPositiveIndex(left: number, right: number): number {
  if (left < 0) return right;
  if (right < 0) return left;
  return Math.min(left, right);
}

export function markdownUnescapeText(text: string): string {
  return text.replace(/\\([\\`*{}[\]()#+\-.!_>~|])/g, "$1");
}
