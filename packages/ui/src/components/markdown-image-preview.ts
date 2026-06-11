export const MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE = "data-markdown-image-preview-trigger";
export const MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS = "hc-markdown-image-preview-dialog";

export interface MarkdownImagePreviewItem {
  alt: string;
  src: string;
  title: string | null;
}

export interface MarkdownImagePreviewState {
  index: number;
  items: MarkdownImagePreviewItem[];
}

export function markdownImagePreviewAdjacentIndexes(
  state: MarkdownImagePreviewState | null,
): { next: number | null; previous: number | null } {
  if (!state) return { next: null, previous: null };
  return {
    previous: state.index > 0 ? state.index - 1 : null,
    next: state.index + 1 < state.items.length ? state.index + 1 : null,
  };
}

export function markdownImagePreviewStateFromTrigger({
  fallbackItem,
  root,
  trigger,
}: {
  fallbackItem: MarkdownImagePreviewItem;
  root: ParentNode | null;
  trigger: Element;
}): MarkdownImagePreviewState {
  const triggers = root
    ? Array.from(root.querySelectorAll(`[${MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE}="true"]`))
    : [];
  const items: MarkdownImagePreviewItem[] = [];
  let index: number | null = null;
  for (const candidate of triggers) {
    const image = candidate.querySelector("img");
    const candidateSrc = image?.currentSrc || image?.getAttribute("src") || "";
    if (!candidateSrc) continue;
    if (candidate === trigger) index = items.length;
    items.push({
      alt: image?.getAttribute("alt") ?? "",
      src: candidateSrc,
      title: image?.getAttribute("title") || null,
    });
  }
  return index === null ? { items: [fallbackItem], index: 0 } : { items, index };
}
