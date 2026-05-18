import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface ImagePreviewLightboxProps {
  src: string;
  alt: string;
  title?: string;
  frameClassName: string;
  imageClassName?: string;
}

export function ImagePreviewLightbox({
  src,
  alt,
  title,
  frameClassName,
  imageClassName,
}: ImagePreviewLightboxProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <figure className={frameClassName}>
      <button
        aria-label="Open image preview"
        className="hc-preview-lightbox-trigger"
        title="Open image preview"
        type="button"
        onClick={() => setOpen(true)}
      >
        <img alt={alt} className={imageClassName} src={src} />
        <span className="hc-preview-lightbox-affordance" aria-hidden>
          <Maximize2 size={15} />
        </span>
      </button>
      {open && (
        <div
          className="hc-preview-lightbox-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
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
                onClick={() => setOpen(false)}
              >
                <X size={17} />
              </button>
            </header>
            <div className="hc-preview-lightbox-viewport">
              <img alt={alt} src={src} />
            </div>
          </section>
        </div>
      )}
    </figure>
  );
}
