import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Codex Desktop `$C` lightbox (local-conversation-thread-BX7YNcUw.js byte
 * ~514040). Two operating modes:
 *
 *   1) **Self-triggered**: render an `<img>` thumbnail inside `frameClassName`
 *      and pop the modal when the user clicks the thumbnail. Used by inline
 *      previews (artifact / file panels) where the lightbox is the same DOM
 *      node that hosts the thumbnail. This is HiCodex's legacy entry point.
 *
 *   2) **Externally controlled**: the parent already shows its own thumbnail
 *      grid (Codex `JC` gallery, see `generated-image-gallery.tsx`) and just
 *      wants the modal layer. Passing `onClose` switches the component to
 *      controlled mode — the trigger button is skipped and the modal mounts
 *      immediately, with optional `onPreviousImage` / `onNextImage` arrows
 *      matching Codex `$C` props (`Previous images` / `Next images`).
 */

export interface ImagePreviewLightboxProps {
  src: string;
  alt: string;
  title?: string;
  /** Required only in self-triggered mode. */
  frameClassName?: string;
  imageClassName?: string;
  /**
   * Externally controlled mode: provide `onClose` to mount the modal
   * directly. The trigger button + thumbnail are not rendered.
   */
  onClose?: () => void;
  /** Codex `$C` `onPreviousImage` — disabled when undefined (arrow hidden). */
  onPreviousImage?: () => void;
  /** Codex `$C` `onNextImage` — disabled when undefined (arrow hidden). */
  onNextImage?: () => void;
}

export function ImagePreviewLightbox({
  src,
  alt,
  title,
  frameClassName,
  imageClassName,
  onClose,
  onPreviousImage,
  onNextImage,
}: ImagePreviewLightboxProps) {
  const isControlled = onClose != null;
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? true : openInternal;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isControlled) onClose?.();
        else setOpenInternal(false);
      } else if (event.key === "ArrowLeft" && onPreviousImage) {
        event.preventDefault();
        onPreviousImage();
      } else if (event.key === "ArrowRight" && onNextImage) {
        event.preventDefault();
        onNextImage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isControlled, onClose, onPreviousImage, onNextImage]);

  /*
   * The modal node renders into `document.body` via portal so it escapes
   * any transformed scroll ancestor (mirror of the `CopyFeedbackToast` fix —
   * see `message-action-row.tsx`). Without this, a fixed-position dialog
   * gets re-rooted under `hc-thread-scroll-body`'s transform.
   */
  const modal = open ? renderModalLayer({
    src,
    alt,
    title,
    onClose: () => {
      if (isControlled) onClose?.();
      else setOpenInternal(false);
    },
    onPreviousImage,
    onNextImage,
  }) : null;

  if (isControlled) {
    if (modal == null) return null;
    if (typeof document === "undefined") return modal;
    return createPortal(modal, document.body);
  }

  // Self-triggered mode (legacy). Keep frameClassName required-by-convention;
  // fall back to a bare `<figure>` for callers that pass undefined.
  return (
    <figure className={frameClassName ?? ""}>
      <button
        aria-label="Open image preview"
        className="hc-preview-lightbox-trigger"
        title="Open image preview"
        type="button"
        onClick={() => setOpenInternal(true)}
      >
        <img alt={alt} className={imageClassName} src={src} />
        <span className="hc-preview-lightbox-affordance" aria-hidden>
          <Maximize2 size={15} />
        </span>
      </button>
      {open && typeof document !== "undefined" && modal && createPortal(modal, document.body)}
      {open && typeof document === "undefined" && modal}
    </figure>
  );
}

function renderModalLayer({
  src,
  alt,
  title,
  onClose,
  onPreviousImage,
  onNextImage,
}: {
  src: string;
  alt: string;
  title?: string;
  onClose: () => void;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
}) {
  return (
    <div
      className="hc-preview-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={title || alt || "Image preview"}
        aria-modal="true"
        className="hc-preview-lightbox-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="hc-preview-lightbox-header">
          <span title={title || alt}>{title || alt}</span>
          <button
            aria-label="Close image preview"
            className="hc-preview-lightbox-close"
            title="Close image preview"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <div className="hc-preview-lightbox-viewport">
          {onPreviousImage && (
            <button
              type="button"
              className="hc-preview-lightbox-nav hc-preview-lightbox-nav--prev"
              aria-label="Previous images"
              onClick={onPreviousImage}
            >
              <ChevronLeft aria-hidden size={20} />
            </button>
          )}
          <img alt={alt} src={src} />
          {onNextImage && (
            <button
              type="button"
              className="hc-preview-lightbox-nav hc-preview-lightbox-nav--next"
              aria-label="Next images"
              onClick={onNextImage}
            >
              <ChevronRight aria-hidden size={20} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
