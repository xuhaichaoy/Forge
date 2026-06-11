export type CodeSnippetWrapMode = "always" | "off" | "user-controlled";

export function codeBlockTitle(language: string): string {
  return language.trim() || "text";
}

export function desktopMarkdownCodeBlockWrapMode(language: string): CodeSnippetWrapMode {
  const normalizedLanguage = language.trim().toLowerCase();
  return !normalizedLanguage || normalizedLanguage === "text" || normalizedLanguage === "md" || normalizedLanguage === "markdown"
    ? "user-controlled"
    : "off";
}

export function shouldRenderSvgCodePreview(language: string, text: string): boolean {
  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage === "svg") return true;
  if (normalizedLanguage !== "xml" && normalizedLanguage !== "html") return false;
  return text.trimStart().startsWith("<svg");
}

export function svgCodePreviewDataUrl(text: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.trim())}`;
}
