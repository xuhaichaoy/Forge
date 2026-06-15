import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from "lucide-react";
import type {
  HTMLAttributeReferrerPolicy,
  PointerEvent as ReactPointerEvent,
  RefCallback,
} from "react";
import { useForgeIntl } from "./i18n-provider";
import {
  formatZoomPercent,
  handleImageDownloadClick,
  imageDownloadName,
  imagePreviewZoomStyle,
  type ImagePreviewSize,
} from "./image-preview-lightbox-helpers";

export function renderImagePreviewModalLayer({
  formatMessage,
  src,
  downloadSrc,
  alt,
  title,
  showZoomControls,
  viewportClassName,
  zoomPercent,
  zoomLevels,
  naturalSize,
  imageReferrerPolicy,
  onImageLoad,
  onImageRef,
  onViewportRef,
  onPointerCancelCapture,
  onPointerDownCapture,
  onPointerMoveCapture,
  onPointerUpCapture,
  onZoomIn,
  onZoomOut,
  onClose,
  onPreviousImage,
  onNextImage,
}: {
  formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"];
  src: string;
  downloadSrc: string;
  alt: string;
  title?: string;
  showZoomControls: boolean;
  zoomPercent: number;
  zoomLevels: number[];
  naturalSize: ImagePreviewSize | null;
  imageReferrerPolicy?: HTMLAttributeReferrerPolicy;
  onImageLoad: (image: HTMLImageElement) => void;
  onImageRef: RefCallback<HTMLImageElement>;
  onViewportRef: RefCallback<HTMLDivElement>;
  onPointerCancelCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  viewportClassName?: string;
  onClose: () => void;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
}) {
  const downloadName = imageDownloadName(alt, downloadSrc);
  const previewLabel = title || alt
    || formatMessage({ id: "imagePreviewDialog.label", defaultMessage: "Image preview" });
  const downloadLabel = formatMessage({ id: "imagePreviewDialog.download", defaultMessage: "Download image" });
  const closeLabel = formatMessage({ id: "imagePreviewDialog.close", defaultMessage: "Close image preview" });
  const previousImageLabel = formatMessage({ id: "imagePreviewDialog.previousImage", defaultMessage: "Previous image" });
  const nextImageLabel = formatMessage({ id: "imagePreviewDialog.nextImage", defaultMessage: "Next image" });
  const zoomOutLabel = formatMessage({ id: "imagePreviewDialog.zoomOut", defaultMessage: "Zoom out image" });
  const zoomInLabel = formatMessage({ id: "imagePreviewDialog.zoomIn", defaultMessage: "Zoom in image" });
  const hasImageNav = onPreviousImage != null || onNextImage != null;
  const minZoom = zoomLevels[0] ?? zoomPercent;
  const maxZoom = zoomLevels.at(-1) ?? zoomPercent;
  const imageStyle = imagePreviewZoomStyle(naturalSize, zoomPercent);
  return (
    <div
      className="hc-preview-lightbox-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={previewLabel}
        aria-modal="true"
        className={`hc-preview-lightbox-dialog${hasImageNav ? " hc-preview-lightbox-dialog--with-nav" : ""}`}
        role="dialog"
        data-state="open"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
          event.stopPropagation();
        }}
      >
        <div className="hc-preview-lightbox-toolbar">
          <a
            aria-label={downloadLabel}
            className="hc-preview-lightbox-toolbar-button"
            download={downloadName}
            href={downloadSrc}
            title={downloadLabel}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => handleImageDownloadClick(event, downloadSrc, downloadName)}
          >
            <Download aria-hidden size={16} />
          </a>
          <button
            aria-label={closeLabel}
            className="hc-preview-lightbox-toolbar-button"
            title={closeLabel}
            type="button"
            onClick={onClose}
          >
            {/* codex image-preview-dialog close = icon-sm (18px) */}
            <X aria-hidden size={18} />
          </button>
        </div>
        <div
          className={`hc-preview-lightbox-viewport${viewportClassName ? ` ${viewportClassName}` : ""}`}
          data-testid="image-preview-dismiss-area"
          ref={onViewportRef}
          onPointerCancelCapture={onPointerCancelCapture}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMoveCapture={onPointerMoveCapture}
          onPointerUpCapture={onPointerUpCapture}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <h2 className="sr-only">{previewLabel}</h2>
          {onPreviousImage && (
            <button
              type="button"
              className="hc-preview-lightbox-nav hc-preview-lightbox-nav--prev"
              aria-label={previousImageLabel}
              onClick={onPreviousImage}
            >
              {/* codex image-preview-dialog nav = icon-sm (18px) */}
              <ChevronLeft aria-hidden size={18} />
            </button>
          )}
          <img
            alt={alt}
            draggable={false}
            referrerPolicy={imageReferrerPolicy}
            ref={onImageRef}
            src={src}
            style={imageStyle}
            onLoad={(event) => onImageLoad(event.currentTarget)}
          />
          {onNextImage && (
            <button
              type="button"
              className="hc-preview-lightbox-nav hc-preview-lightbox-nav--next"
              aria-label={nextImageLabel}
              onClick={onNextImage}
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          )}
        </div>
        {showZoomControls && (
          <div className="hc-preview-lightbox-zoom-controls">
            <button
              aria-label={zoomOutLabel}
              disabled={zoomPercent <= minZoom}
              type="button"
              onClick={onZoomOut}
            >
              <Minus aria-hidden size={16} />
            </button>
            <span>{formatZoomPercent(zoomPercent)}</span>
            <button
              aria-label={zoomInLabel}
              disabled={zoomPercent >= maxZoom}
              type="button"
              onClick={onZoomIn}
            >
              <Plus aria-hidden size={16} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
