export type { CodeHighlightSegment } from "./code-snippet-highlight-segments";
export { highlightCodeSegments } from "./code-snippet-fallback-highlighting";

export function isPlainTextLanguage(language: string): boolean {
  return !language || ["plain", "plaintext", "text", "txt"].includes(language);
}

export function codeHighlightKey(language: string, text: string): string {
  return `${language}\u0000${text}`;
}
