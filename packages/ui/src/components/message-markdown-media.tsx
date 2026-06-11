import { ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import type { MarkdownImageBlock } from "../state/conversation-markdown-engine";
import { resolveAssistantMarkdownMediaSource } from "./assistant-message-artifacts";
import { useHiCodexIntl } from "./i18n-provider";
import {
  MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS,
  markdownImagePreviewAdjacentIndexes,
  markdownImagePreviewStateFromTrigger,
  type MarkdownImagePreviewState,
} from "./markdown-image-preview";

export function MarkdownImageView({ allowWide = false, image }: { allowWide?: boolean; image: MarkdownImageBlock }) {
  const { formatMessage } = useHiCodexIntl();
  const [previewState, setPreviewState] = useState<MarkdownImagePreviewState | null>(null);
  const src = resolveMarkdownMediaSrc(image.src);
  const mediaKind = markdownMediaKind(src);
  const previewItem = previewState?.items[previewState.index] ?? null;
  const previewIndexes = markdownImagePreviewAdjacentIndexes(previewState);
  useEffect(() => {
    if (!previewState) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewState(null);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      setPreviewState((current) => {
        const indexes = markdownImagePreviewAdjacentIndexes(current);
        const nextIndex = event.key === "ArrowLeft" ? indexes.previous : indexes.next;
        if (nextIndex === null) return current;
        event.preventDefault();
        event.stopPropagation();
        return current ? { ...current, index: nextIndex } : current;
      });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewState]);

  const openPreview = (event: MouseEvent<HTMLButtonElement>) => {
    setPreviewState(markdownImagePreviewStateFromTrigger({
      fallbackItem: { alt: image.alt, src, title: image.title },
      root: event.currentTarget.closest(".hc-markdown"),
      trigger: event.currentTarget,
    }));
  };

  const navigatePreview = (index: number) => {
    setPreviewState((current) => current ? { ...current, index } : current);
  };

  if (mediaKind === "video") {
    return (
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <video aria-label={image.alt || formatMessage({ id: "markdown.videoPlayer", defaultMessage: "Video" })} controls preload="metadata" src={src} title={image.title ?? undefined} />
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
    );
  }
  const previewDialog = previewItem && typeof document !== "undefined"
    ? createPortal(
        <div className={MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS} role="dialog" data-state="open" aria-modal="true" aria-label={previewItem.alt || formatMessage({ id: "imagePreviewDialog.label", defaultMessage: "Image preview" })}>
          <button className="hc-markdown-image-preview-backdrop" type="button" aria-label={formatMessage({ id: "imagePreviewDialog.close", defaultMessage: "Close image preview" })} onClick={() => setPreviewState(null)} />
          {previewIndexes.previous !== null && (
            <button
              aria-label={formatMessage({ id: "imagePreviewDialog.previousImage", defaultMessage: "Previous image" })}
              className="hc-markdown-image-preview-nav previous"
              type="button"
              onClick={() => navigatePreview(previewIndexes.previous ?? 0)}
            >
              <ChevronRight aria-hidden className="is-previous" size={22} />
            </button>
          )}
          {previewIndexes.next !== null && (
            <button
              aria-label={formatMessage({ id: "imagePreviewDialog.nextImage", defaultMessage: "Next image" })}
              className="hc-markdown-image-preview-nav next"
              type="button"
              onClick={() => navigatePreview(previewIndexes.next ?? 0)}
            >
              <ChevronRight aria-hidden size={22} />
            </button>
          )}
          <div className="hc-markdown-image-preview-content">
            <button className="hc-markdown-image-preview-close" type="button" aria-label={formatMessage({ id: "imagePreviewDialog.close", defaultMessage: "Close image preview" })} onClick={() => setPreviewState(null)}>
              <X size={16} />
            </button>
            <img alt={previewItem.alt} src={previewItem.src} title={previewItem.title ?? undefined} />
            {previewItem.alt.trim().length > 0 && <div className="hc-markdown-image-preview-caption">{previewItem.alt}</div>}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <figure className={`hc-markdown-image ${allowWide ? "is-grid-item" : ""}`}>
        <button
          aria-label={image.alt || formatMessage({ id: "markdown.imagePreviewButton", defaultMessage: "Open image preview" })}
          className="hc-markdown-image-trigger"
          data-markdown-image-preview-trigger="true"
          type="button"
          onClick={openPreview}
        >
          <img alt={image.alt} loading="lazy" src={src} title={image.title ?? undefined} />
        </button>
        {image.alt.trim().length > 0 && <figcaption>{image.alt}</figcaption>}
      </figure>
      {previewDialog}
    </>
  );
}

export function resolvedMarkdownImage(
  image: MarkdownImageBlock,
  mediaSources?: Map<string, string>,
): MarkdownImageBlock {
  const resolvedSrc = resolveAssistantMarkdownMediaSource(image.src, mediaSources);
  return resolvedSrc ? { ...image, src: resolvedSrc } : image;
}

export function resolveMarkdownMediaSrc(src: string): string {
  const path = markdownFilePath(src);
  if (path && isTauriRuntime()) return convertLocalFileSrc(path);
  return src;
}

function markdownFilePath(src: string): string {
  if (/^file:/i.test(src)) {
    try {
      return decodeURIComponent(new URL(src).pathname);
    } catch {
      return "";
    }
  }
  return src.startsWith("/") ? src : "";
}

function markdownMediaKind(src: string): "image" | "video" {
  if (/^data:video\//i.test(src)) return "video";
  if (/\.(?:mp4|mov|m4v|webm|ogv)(?:[?#].*)?$/i.test(src)) return "video";
  return "image";
}
