import type { CSSProperties } from "react";

export interface CodeHighlightSegment {
  className?: string;
  style?: CSSProperties;
  text: string;
}

export function pushHighlightSegment(
  segments: CodeHighlightSegment[],
  text: string,
  className?: string,
  style?: CSSProperties,
): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.className === className && highlightStyleKey(previous.style) === highlightStyleKey(style)) {
    previous.text += text;
    return;
  }
  segments.push({
    text,
    ...(className ? { className } : {}),
    ...(style ? { style } : {}),
  });
}

function highlightStyleKey(style: CSSProperties | undefined): string {
  if (!style) return "";
  return `${style.color ?? ""}|${style.fontStyle ?? ""}|${style.fontWeight ?? ""}|${style.textDecoration ?? ""}`;
}
