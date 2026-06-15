import { Maximize2 } from "lucide-react";
import {
  type HTMLAttributeReferrerPolicy,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { renderImagePreviewModalLayer } from "./image-preview-lightbox-modal";
import { useForgeIntl } from "./i18n-provider";
import {
  clampImagePreviewUnit,
  handleViewportPointerDown,
  handleViewportPointerEnd,
  handleViewportPointerMove,
  imagePreviewFitZoomPercent,
  imagePreviewKeyboardZoomCommand,
  imagePreviewNaturalSize,
  imagePreviewWheelZoomPercent,
  imagePreviewZoomRamp,
  resolveImagePreviewZoomPoint,
  stepZoomPercent,
  type ImagePreviewPinchStart,
  type ImagePreviewPoint,
  type ImagePreviewSize,
  type ImagePreviewTouchPan,
  type ImagePreviewZoomPoint,
} from "./image-preview-lightbox-helpers";

export {
  IMAGE_PREVIEW_ZOOM_LEVELS,
  imagePreviewClampZoomPercent,
  imagePreviewDataUrlToBlob,
  imagePreviewFitZoomPercent,
  imagePreviewKeyboardZoomCommand,
  imagePreviewWheelZoomPercent,
  imagePreviewZoomRamp,
} from "./image-preview-lightbox-helpers";
export type { ImagePreviewZoomCommand } from "./image-preview-lightbox-helpers";

/*
 * Codex Desktop image-preview lightbox (local-conversation-thread-*.js). Two
 * operating modes:
 *
 *   1) **Self-triggered**: render an `<img>` thumbnail inside `frameClassName`
 *      and pop the modal when the user clicks the thumbnail. Used by inline
 *      previews (artifact / file panels) where the lightbox is the same DOM
 *      node that hosts the thumbnail. This is Forge's legacy entry point.
 *
 *   2) **Externally controlled**: the parent already shows its own thumbnail
 *      grid (Codex generated-image gallery, see `generated-image-gallery.tsx`)
 *      and just wants the modal layer. Passing `onClose` switches the component
 *      to controlled mode — the trigger button is skipped and the modal mounts
 *      immediately, with optional `onPreviousImage` / `onNextImage` arrows
 *      matching Codex lightbox props (`Previous image` / `Next image`).
 */

export interface ImagePreviewLightboxProps {
  src: string;
  alt: string;
  title?: string;
  /** Required only in self-triggered mode. */
  frameClassName?: string;
  imageClassName?: string;
  downloadSrc?: string;
  imageReferrerPolicy?: HTMLAttributeReferrerPolicy;
  showZoomControls?: boolean;
  viewportClassName?: string;
  /**
   * Externally controlled mode: provide `onClose` to mount the modal
   * directly. The trigger button + thumbnail are not rendered.
   */
  onClose?: () => void;
  /** Codex lightbox `onPreviousImage` — disabled when undefined (arrow hidden). */
  onPreviousImage?: () => void;
  /** Codex lightbox `onNextImage` — disabled when undefined (arrow hidden). */
  onNextImage?: () => void;
}

export function ImagePreviewLightbox({
  src,
  alt,
  title,
  frameClassName,
  imageClassName,
  downloadSrc,
  imageReferrerPolicy,
  showZoomControls = true,
  viewportClassName,
  onClose,
  onPreviousImage,
  onNextImage,
}: ImagePreviewLightboxProps) {
  const { formatMessage } = useForgeIntl();
  const isControlled = onClose != null;
  const [openInternal, setOpenInternal] = useState(false);
  const [naturalSize, setNaturalSize] = useState<ImagePreviewSize | null>(null);
  const [viewportSize, setViewportSize] = useState<ImagePreviewSize | null>(null);
  const [zoomOverridePercent, setZoomOverridePercent] = useState<number | null>(null);
  const viewportNodeRef = useRef<HTMLDivElement | null>(null);
  const imageNodeRef = useRef<HTMLImageElement | null>(null);
  const touchPointersRef = useRef<Map<number, ImagePreviewPoint>>(new Map());
  const touchPanRef = useRef<ImagePreviewTouchPan | null>(null);
  const pinchRef = useRef<ImagePreviewPinchStart | null>(null);
  const fallbackPointRef = useRef<ImagePreviewPoint | null>(null);
  const open = isControlled ? true : openInternal;
  const fitZoomPercent = imagePreviewFitZoomPercent(naturalSize, viewportSize);
  const zoomLevels = imagePreviewZoomRamp(fitZoomPercent);
  const zoomPercent = zoomOverridePercent ?? fitZoomPercent ?? 100;
  const minZoomPercent = zoomLevels[0] ?? zoomPercent;
  const maxZoomPercent = zoomLevels.at(-1) ?? zoomPercent;

  const measureViewport = useCallback((node = viewportNodeRef.current) => {
    if (node == null) return;
    const { width, height } = node.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    setViewportSize((current) => {
      if (current?.width === width && current.height === height) return current;
      return { width, height };
    });
  }, []);

  const setViewportRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    viewportNodeRef.current = node;
    if (node == null) {
      setViewportSize(null);
      return;
    }
    measureViewport(node);
  }, [measureViewport]);

  const setImageRef = useCallback<RefCallback<HTMLImageElement>>((node) => {
    imageNodeRef.current = node;
  }, []);

  const setZoomAtPoint = useCallback((input: ImagePreviewZoomPoint) => {
    const viewportNode = viewportNodeRef.current;
    const imageNode = imageNodeRef.current;
    if (viewportNode == null || imageNode == null) {
      setZoomOverridePercent(input.zoomPercent);
      return;
    }
    const imageRect = imageNode.getBoundingClientRect();
    const anchorX = imageRect.width > 0 ? clampImagePreviewUnit((input.clientX - imageRect.left) / imageRect.width) : 0.5;
    const anchorY = imageRect.height > 0 ? clampImagePreviewUnit((input.clientY - imageRect.top) / imageRect.height) : 0.5;
    flushSync(() => setZoomOverridePercent(input.zoomPercent));
    if (!viewportNode.isConnected || !imageNode.isConnected) return;
    const nextImageRect = imageNode.getBoundingClientRect();
    viewportNode.scrollLeft += nextImageRect.left + nextImageRect.width * anchorX - input.clientX;
    viewportNode.scrollTop += nextImageRect.top + nextImageRect.height * anchorY - input.clientY;
  }, []);

  const setZoomAtViewportCenter = useCallback((nextZoomPercent: number) => {
    const viewportNode = viewportNodeRef.current;
    if (viewportNode == null) {
      setZoomOverridePercent(nextZoomPercent);
      return;
    }
    const viewportRect = viewportNode.getBoundingClientRect();
    setZoomAtPoint({
      clientX: viewportRect.left + viewportRect.width / 2,
      clientY: viewportRect.top + viewportRect.height / 2,
      zoomPercent: nextZoomPercent,
    });
  }, [setZoomAtPoint]);

  const resetZoom = useCallback(() => {
    setZoomOverridePercent(null);
    const viewportNode = viewportNodeRef.current;
    if (viewportNode != null) {
      viewportNode.scrollLeft = 0;
      viewportNode.scrollTop = 0;
    }
  }, []);

  const stepZoom = useCallback((delta: number) => {
    const direction = delta > 0 ? "in" : "out";
    setZoomAtViewportCenter(stepZoomPercent(zoomPercent, direction, zoomLevels));
  }, [setZoomAtViewportCenter, zoomLevels, zoomPercent]);

  useEffect(() => {
    if (!open) return;
    setNaturalSize(null);
    setZoomOverridePercent(null);
    touchPointersRef.current.clear();
    touchPanRef.current = null;
    pinchRef.current = null;
    fallbackPointRef.current = null;
  }, [open, src]);

  useEffect(() => {
    if (!open) return undefined;
    const node = viewportNodeRef.current;
    if (node == null || typeof ResizeObserver === "undefined") return undefined;
    measureViewport(node);
    const observer = new ResizeObserver(() => measureViewport(node));
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureViewport, open]);

  useEffect(() => {
    if (!open) return undefined;
    const node = viewportNodeRef.current;
    if (node == null) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const nextZoomPercent = imagePreviewWheelZoomPercent({
        currentZoomPercent: zoomPercent,
        deltaMode: event.deltaMode,
        deltaY: event.deltaY,
        maximumZoomPercent: maxZoomPercent,
        minimumZoomPercent: minZoomPercent,
      });
      if (nextZoomPercent == null || nextZoomPercent === zoomPercent) return;
      const zoomPoint = resolveImagePreviewZoomPoint({
        event,
        fallbackPoint: fallbackPointRef.current,
        previewViewportNode: node,
      });
      setZoomAtPoint({
        clientX: zoomPoint.clientX,
        clientY: zoomPoint.clientY,
        zoomPercent: nextZoomPercent,
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [maxZoomPercent, minZoomPercent, open, setZoomAtPoint, zoomPercent]);

  /*
   * codex: image-preview-shortcuts-*.js — keyboard bindings for the
   * image preview lightbox. Mirrors Codex Desktop's full key map: Esc closes,
   * ArrowLeft / ArrowRight step through the gallery, and the zoom commands
   * (Cmd/Ctrl+= / Cmd/Ctrl+- / Cmd/Ctrl+0) live in
   * `imagePreviewKeyboardZoomCommand`. Listener only attaches while `open`.
   */
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const zoomCommand = imagePreviewKeyboardZoomCommand(event);
      if (zoomCommand != null) {
        event.preventDefault();
        event.stopPropagation();
        if (zoomCommand.type === "reset-zoom") resetZoom();
        else stepZoom(zoomCommand.delta);
      } else if (event.key === "Escape") {
        // codex: image-preview-shortcuts-*.js — Esc dismisses the lightbox.
        // Codex's dialog suppresses the event (preventDefault + stopPropagation)
        // so closing the lightbox doesn't also fire a parent/global Esc handler.
        event.preventDefault();
        event.stopPropagation();
        if (isControlled) onClose?.();
        else setOpenInternal(false);
      } else if (event.key === "ArrowLeft" && onPreviousImage) {
        // codex: image-preview-shortcuts-*.js — ← steps to previous image.
        event.preventDefault();
        event.stopPropagation();
        onPreviousImage();
      } else if (event.key === "ArrowRight" && onNextImage) {
        // codex: image-preview-shortcuts-*.js — → steps to next image.
        event.preventDefault();
        event.stopPropagation();
        onNextImage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isControlled, onClose, onPreviousImage, onNextImage, resetZoom, stepZoom]);

  /*
   * The modal node renders into `document.body` via portal so it escapes
   * any transformed scroll ancestor (mirror of the `CopyFeedbackToast` fix —
   * see `message-action-row.tsx`). Without this, a fixed-position dialog
   * gets re-rooted under `hc-thread-scroll-body`'s transform.
   */
  const modal = open ? renderImagePreviewModalLayer({
    formatMessage,
    src,
    downloadSrc: downloadSrc ?? src,
    alt,
    title,
    imageReferrerPolicy,
    showZoomControls,
    viewportClassName,
    zoomPercent,
    zoomLevels,
    naturalSize,
    onImageLoad: (image) => {
      const size = imagePreviewNaturalSize(image);
      if (size != null) setNaturalSize(size);
      measureViewport();
    },
    onImageRef: setImageRef,
    onViewportRef: setViewportRef,
    onPointerCancelCapture: (event) => handleViewportPointerEnd(event, {
      pinchRef,
      touchPanRef,
      touchPointersRef,
      viewportNodeRef,
      zoomPercent,
    }),
    onPointerDownCapture: (event) => handleViewportPointerDown(event, {
      fallbackPointRef,
      pinchRef,
      touchPanRef,
      touchPointersRef,
      viewportNodeRef,
      zoomPercent,
    }),
    onPointerMoveCapture: (event) => handleViewportPointerMove(event, {
      fallbackPointRef,
      maximumZoomPercent: maxZoomPercent,
      minimumZoomPercent: minZoomPercent,
      pinchRef,
      setZoomAtPoint,
      touchPanRef,
      touchPointersRef,
      viewportNodeRef,
      zoomPercent,
    }),
    onPointerUpCapture: (event) => handleViewportPointerEnd(event, {
      pinchRef,
      touchPanRef,
      touchPointersRef,
      viewportNodeRef,
      zoomPercent,
    }),
    onZoomIn: () => stepZoom(1),
    onZoomOut: () => stepZoom(-1),
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
        aria-label={formatMessage({ id: "codex.stories.imagePreviewDialog.open", defaultMessage: "Open image preview" })}
        className="hc-preview-lightbox-trigger"
        title={formatMessage({ id: "codex.stories.imagePreviewDialog.open", defaultMessage: "Open image preview" })}
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
