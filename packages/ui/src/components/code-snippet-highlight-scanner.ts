export const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//y;
export const DOUBLE_SLASH_COMMENT_RE = /\/\/[^\n]*/y;
export const DASH_COMMENT_RE = /--[^\n]*/y;
export const HASH_COMMENT_RE = /#[^\n]*/y;
export const STRING_RE = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y;
export const NUMBER_RE = /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\b/y;
export const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/y;
export const BASH_VARIABLE_RE = /\$(?:\{[A-Za-z_][\w]*\}|[A-Za-z_][\w]*|\d+)/y;

export function matchPatternAt(pattern: RegExp, text: string, index: number): string | null {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match && match.index === index ? match[0] ?? null : null;
}

export function nextNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}

export function previousNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}
