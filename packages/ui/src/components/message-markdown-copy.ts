// The range end's `L` is optional (`L12-15` and `L12-L15` both occur) to match
// the renderer's parseFileCitationMarker — otherwise a pill that renders fine
// is left as a raw 【…】 marker when the message is copied.
const DESKTOP_FILE_LINE_CITATION_PATTERN = /【([^†】\n]+)†L(\d+)(?:-L?(\d+))?】/g;

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

type ClipboardWriteItem = Record<string, Blob | string>;

const KATEX_SELECTOR = ".katex";
const KATEX_MATHML_SELECTOR = ".katex-mathml";
const KATEX_HTML_SELECTOR = ".katex-mathml + .katex-html";
const KATEX_DISPLAY_SELECTOR = ".katex-display";
const KATEX_TEX_ANNOTATION_SELECTOR = "annotation[encoding=\"application/x-tex\"]";
const MARKDOWN_COPY_EXCLUDE_SELECTOR = [
  '[data-markdown-copy="exclude"]',
  ".hc-code-actions",
  ".hc-code-snippet > figcaption",
  '[role="tooltip"]',
].join(",");

export function markdownRichCopyPayloadFromElement(
  root: HTMLElement,
  plainText: string,
): MarkdownRichCopyPayload | null {
  const trimmedPlainText = plainText.trim();
  if (trimmedPlainText.length === 0) return null;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  const fragment = range.cloneContents();
  range.detach();
  removeMarkdownCopyExclusions(fragment);
  normalizeKatexCopyFragment(fragment);
  const htmlText = Array.from(fragment.childNodes).map(markdownCopyHtml).join("").trim();
  return htmlText.length > 0 ? { htmlText, plainText: trimmedPlainText } : null;
}

export async function writeMarkdownClipboard(
  content: string | MarkdownRichCopyPayload,
  sourceTarget?: EventTarget | null,
): Promise<boolean> {
  const clipboardContext = clipboardContextForTarget(sourceTarget);
  if (!clipboardContext) return false;
  const { clipboard, ClipboardItemCtor, BlobCtor } = clipboardContext;
  if (
    typeof content !== "string"
    && ClipboardItemCtor
    && BlobCtor
    && canWriteRichClipboard(clipboard, ClipboardItemCtor)
  ) {
    const itemData: ClipboardWriteItem = {
      "text/html": content.htmlText,
      "text/plain": content.plainText,
    };
    const clipboardItem = new ClipboardItemCtor(
      Object.fromEntries(
        Object.entries(itemData).map(([type, value]) => [
          type,
          typeof value === "string" ? new BlobCtor([value], { type }) : value,
        ]),
      ) as unknown as Record<string, ClipboardItemData>,
    );
    await clipboard.write([clipboardItem]);
    return true;
  }
  const text = typeof content === "string" ? content : content.plainText;
  if (text.trim().length === 0 || typeof clipboard.writeText !== "function") return false;
  await clipboard.writeText(text);
  return true;
}

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
  removeMarkdownCopyExclusions(fragment);
  normalizeKatexCopyFragment(fragment);
  const htmlText = Array.from(fragment.childNodes).map(markdownCopyHtml).join("");
  const plainText = Array.from(fragment.childNodes).map(markdownCopyPlainText).join("").trim();
  return plainText.length > 0 ? { htmlText, plainText } : null;
}

interface ClipboardContext {
  clipboard: Clipboard;
  ClipboardItemCtor: typeof ClipboardItem | null;
  BlobCtor: typeof Blob | null;
}

function clipboardContextForTarget(sourceTarget?: EventTarget | null): ClipboardContext | null {
  const ownerWindow = typeof Element !== "undefined" && sourceTarget instanceof Element
    ? sourceTarget.ownerDocument.defaultView as (Window & typeof globalThis) | null
    : null;
  const clipboard = ownerWindow?.navigator?.clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : null);
  if (!clipboard) return null;
  const ClipboardItemCtor = ownerWindow?.ClipboardItem
    ?? (typeof ClipboardItem !== "undefined" ? ClipboardItem : null);
  const BlobCtor = ownerWindow?.Blob ?? (typeof Blob !== "undefined" ? Blob : null);
  return { clipboard, ClipboardItemCtor, BlobCtor };
}

function canWriteRichClipboard(clipboard: Clipboard, ClipboardItemCtor: typeof ClipboardItem): boolean {
  return typeof clipboard.write === "function" && "supports" in ClipboardItemCtor;
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

function removeMarkdownCopyExclusions(fragment: DocumentFragment): void {
  for (const element of Array.from(fragment.querySelectorAll(MARKDOWN_COPY_EXCLUDE_SELECTOR))) {
    element.remove();
  }
}

function normalizeKatexCopyFragment(fragment: DocumentFragment): void {
  for (const element of Array.from(fragment.querySelectorAll(KATEX_HTML_SELECTOR))) {
    element.remove();
  }
  for (const mathMl of Array.from(fragment.querySelectorAll(KATEX_MATHML_SELECTOR))) {
    const tex = stripInlineMathDelimiters(mathMl.querySelector(KATEX_TEX_ANNOTATION_SELECTOR)?.textContent ?? "");
    const replacement = mathCopyReplacementText(
      katexRenderedMathText(mathMl),
      tex,
      mathMl.closest(KATEX_DISPLAY_SELECTOR) !== null,
    );
    if (replacement) mathMl.replaceWith(fragment.ownerDocument.createTextNode(replacement));
  }
  for (const selector of [KATEX_DISPLAY_SELECTOR, KATEX_SELECTOR]) {
    for (const element of Array.from(fragment.querySelectorAll(selector))) {
      if (element.querySelector(KATEX_HTML_SELECTOR)) continue;
      element.replaceWith(fragment.ownerDocument.createTextNode(element.textContent ?? ""));
    }
  }
}

/*
 * What a copied formula pastes as. Inline math pastes as the rendered Unicode
 * the user actually saw ("3×3", not "\(3 \times 3\)") — deliberate divergence
 * from Codex, which emits TeX for both forms. Display math keeps TeX inside
 * \[ \]: complex layouts (fractions, matrices) flatten into unreadable strings
 * as plain text, while the source round-trips losslessly into a follow-up turn.
 */
export function mathCopyReplacementText(renderedText: string, tex: string, displayMode: boolean): string {
  if (displayMode) return tex ? `\\[\n${tex}\n\\]` : renderedText;
  return renderedText || (tex ? `\\(${tex}\\)` : "");
}

function katexRenderedMathText(mathMl: Element): string {
  const clone = mathMl.cloneNode(true) as Element;
  for (const annotation of Array.from(clone.querySelectorAll("annotation"))) {
    annotation.remove();
  }
  return (clone.textContent ?? "").trim();
}

function stripInlineMathDelimiters(text: string): string {
  return text.startsWith("\\(") && text.endsWith("\\)") ? text.slice(2, -2) : text;
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
