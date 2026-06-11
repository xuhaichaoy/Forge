const DESKTOP_FILE_LINE_CITATION_PATTERN = /【([^†】\n]+)†L(\d+)(?:-L(\d+))?】/g;

export function desktopAssistantCopyText(content: string): string {
  return content.trim().replace(
    DESKTOP_FILE_LINE_CITATION_PATTERN,
    (fullText, rawPath: string, rawLineStart: string, rawLineEnd: string | undefined) => {
      const path = desktopCopyCitationPath(rawPath.trim());
      if (path === null) return fullText;
      const lineStart = Number.parseInt(rawLineStart, 10);
      const lineEnd = rawLineEnd === undefined ? undefined : Number.parseInt(rawLineEnd, 10);
      if (lineEnd !== undefined && lineEnd !== lineStart) return `${path}:${lineStart}-${lineEnd}`;
      return lineStart === 1 ? path : `${path}:${lineStart}`;
    },
  );
}

function desktopCopyCitationPath(rawPath: string): string | null {
  const forceFile = rawPath.startsWith("F:");
  const decodedPath = desktopDecodeCitationPath(forceFile ? rawPath.slice(2).trim() : rawPath);
  if (forceFile) return decodedPath.length > 0 ? decodedPath : null;
  return isDesktopAbsolutePath(decodedPath) ? decodedPath : null;
}

function desktopDecodeCitationPath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function isDesktopAbsolutePath(path: string): boolean {
  return (path.startsWith("/") && !path.startsWith("//"))
    || /^[A-Za-z]:[\\/]/.test(path)
    || /^\\\\[^\\]+\\[^\\]+/.test(path)
    || /^\/\/[^/]+\/[^/]+/.test(path);
}

export interface MarkdownRichCopyPayload {
  htmlText: string;
  plainText: string;
}

const KATEX_SELECTOR = ".katex";
const KATEX_MATHML_SELECTOR = ".katex-mathml";
const KATEX_HTML_SELECTOR = ".katex-mathml + .katex-html";
const KATEX_DISPLAY_ANNOTATION_SELECTOR = ".katex-display annotation";
const KATEX_TEX_ANNOTATION_SELECTOR = "annotation[encoding=\"application/x-tex\"]";

export function selectedMarkdownRichCopyPayload(
  root: HTMLElement,
  selection: Selection | null = root.ownerDocument.getSelection(),
): MarkdownRichCopyPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!rangeInsideElement(range, root)) return null;
  expandRangeToKatex(range);
  const fragment = range.cloneContents();
  const hasMath = fragment.querySelector(KATEX_MATHML_SELECTOR) !== null;
  const hasButtons = replaceCopyButtonsWithText(fragment);
  if (!hasMath && !hasButtons) return null;
  normalizeKatexCopyFragment(fragment);
  const htmlText = Array.from(fragment.childNodes).map(markdownCopyHtml).join("");
  const plainText = Array.from(fragment.childNodes).map(markdownCopyPlainText).join("").trim();
  return plainText.length > 0 ? { htmlText, plainText } : null;
}

function rangeInsideElement(range: Range, element: HTMLElement): boolean {
  return element.contains(range.startContainer) && element.contains(range.endContainer);
}

function expandRangeToKatex(range: Range): void {
  const startKatex = closestElement(range.startContainer, KATEX_SELECTOR);
  if (startKatex) range.setStartBefore(startKatex);
  const endKatex = closestElement(range.endContainer, KATEX_SELECTOR);
  if (endKatex) range.setEndAfter(endKatex);
}

function closestElement(node: Node, selector: string): Element | null {
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return element?.closest(selector) ?? null;
}

function replaceCopyButtonsWithText(fragment: DocumentFragment): boolean {
  let replaced = false;
  for (const button of Array.from(fragment.querySelectorAll("button"))) {
    const text = button.textContent ?? "";
    if (!text.trim()) continue;
    button.replaceWith(fragment.ownerDocument.createTextNode(text));
    replaced = true;
  }
  return replaced;
}

function normalizeKatexCopyFragment(fragment: DocumentFragment): void {
  for (const element of Array.from(fragment.querySelectorAll(KATEX_HTML_SELECTOR))) {
    element.remove();
  }
  for (const mathMl of Array.from(fragment.querySelectorAll(KATEX_MATHML_SELECTOR))) {
    const tex = mathMl.querySelector(KATEX_TEX_ANNOTATION_SELECTOR)?.textContent ?? "";
    if (tex) mathMl.replaceWith(fragment.ownerDocument.createTextNode(`\\(${stripInlineMathDelimiters(tex)}\\)`));
  }
  for (const annotation of Array.from(fragment.querySelectorAll(KATEX_DISPLAY_ANNOTATION_SELECTOR))) {
    const tex = stripDisplayMathDelimiters(annotation.textContent ?? "");
    annotation.textContent = `\\[\n${tex}\n\\]`;
  }
  for (const selector of [".katex-display", KATEX_SELECTOR]) {
    for (const element of Array.from(fragment.querySelectorAll(selector))) {
      if (element.querySelector(KATEX_HTML_SELECTOR)) continue;
      element.replaceWith(fragment.ownerDocument.createTextNode(element.textContent ?? ""));
    }
  }
}

function stripInlineMathDelimiters(text: string): string {
  return text.startsWith("\\(") && text.endsWith("\\)") ? text.slice(2, -2) : text;
}

function stripDisplayMathDelimiters(text: string): string {
  return text.startsWith("\\[\n") && text.endsWith("\n\\]") ? text.slice(3, -3) : text;
}

function markdownCopyHtml(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  return node instanceof Element ? node.outerHTML : "";
}

function markdownCopyPlainText(node: ChildNode): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (!(node instanceof Element)) return "";
  switch (node.tagName) {
    case "TABLE":
      return Array.from(node.querySelectorAll("tr")).map(markdownCopyTableRowText).join("\n");
    case "TR":
      return `${markdownCopyTableRowText(node)}\n`;
    case "THEAD":
    case "TBODY":
    case "TFOOT":
      return Array.from(node.children).map(markdownCopyPlainText).join("");
    case "BR":
      return "\n";
    case "P":
    case "DIV":
    case "LI":
      return `${markdownCopyChildPlainText(node)}\n`;
    default:
      return markdownCopyChildPlainText(node);
  }
}

function markdownCopyChildPlainText(element: Element): string {
  return Array.from(element.childNodes).map(markdownCopyPlainText).join("");
}

function markdownCopyTableRowText(row: Element): string {
  return Array.from(row.children).map((cell) => markdownCopyChildPlainText(cell).trim()).join("\t");
}
