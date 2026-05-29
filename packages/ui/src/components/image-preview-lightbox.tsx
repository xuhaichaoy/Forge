import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, X } from "lucide-react";
import {
  type CSSProperties,
  type HTMLAttributeReferrerPolicy,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";

/*
 * Codex Desktop image-preview lightbox (local-conversation-thread-*.js). Two
 * operating modes:
 *
 *   1) **Self-triggered**: render an `<img>` thumbnail inside `frameClassName`
 *      and pop the modal when the user clicks the thumbnail. Used by inline
 *      previews (artifact / file panels) where the lightbox is the same DOM
 *      node that hosts the thumbnail. This is HiCodex's legacy entry point.
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
        if (isControlled) onClose?.();
        else setOpenInternal(false);
      } else if (event.key === "ArrowLeft" && onPreviousImage) {
        // codex: image-preview-shortcuts-*.js — ← steps to previous image.
        event.preventDefault();
        onPreviousImage();
      } else if (event.key === "ArrowRight" && onNextImage) {
        // codex: image-preview-shortcuts-*.js — → steps to next image.
        event.preventDefault();
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
  const modal = open ? renderModalLayer({
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
  const previewLabel = title || alt || "Image preview";
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
            aria-label="Download image"
            className="hc-preview-lightbox-toolbar-button"
            download={downloadName}
            href={downloadSrc}
            title="Download image"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => handleImageDownloadClick(event, downloadSrc, downloadName)}
          >
            <Download aria-hidden size={16} />
          </a>
          <button
            aria-label="Close image preview"
            className="hc-preview-lightbox-toolbar-button"
            title="Close image preview"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden size={17} />
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
              aria-label="Previous image"
              onClick={onPreviousImage}
            >
              <ChevronLeft aria-hidden size={20} />
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
              aria-label="Next image"
              onClick={onNextImage}
            >
              <ChevronRight aria-hidden size={20} />
            </button>
          )}
        </div>
        {showZoomControls && (
          <div className="hc-preview-lightbox-zoom-controls">
            <button
              aria-label="Zoom out image"
              disabled={zoomPercent <= minZoom}
              type="button"
              onClick={onZoomOut}
            >
              <Minus aria-hidden size={16} />
            </button>
            <span>{formatZoomPercent(zoomPercent)}</span>
            <button
              aria-label="Zoom in image"
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

interface ImagePreviewSize {
  width: number;
  height: number;
}

interface ImagePreviewPoint {
  clientX: number;
  clientY: number;
}

interface ImagePreviewZoomPoint extends ImagePreviewPoint {
  zoomPercent: number;
}

interface ImagePreviewTouchPan extends ImagePreviewPoint {
  pointerId: number;
  scrollLeft: number;
  scrollTop: number;
}

interface ImagePreviewPinch extends ImagePreviewPoint {
  distance: number;
}

interface ImagePreviewPinchStart {
  distance: number;
  zoomPercent: number;
}

export type ImagePreviewZoomCommand =
  | { type: "step-zoom"; delta: 1 | -1 }
  | { type: "reset-zoom" };

export const IMAGE_PREVIEW_ZOOM_LEVELS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const IMAGE_PREVIEW_WHEEL_ZOOM_FACTOR = 200;

export function imagePreviewFitZoomPercent(
  naturalSize: ImagePreviewSize | null,
  viewportSize: ImagePreviewSize | null,
): number | null {
  if (naturalSize == null || viewportSize == null) return null;
  const widthScale = viewportSize.width / naturalSize.width;
  const heightScale = viewportSize.height / naturalSize.height;
  const fitScale = Math.min(1, widthScale, heightScale);
  if (!Number.isFinite(fitScale) || fitScale <= 0) return null;
  return fitScale * 100;
}

export function imagePreviewZoomRamp(fitZoomPercent: number | null): number[] {
  const ramp = [...IMAGE_PREVIEW_ZOOM_LEVELS];
  if (fitZoomPercent != null && !ramp.includes(fitZoomPercent)) {
    ramp.push(fitZoomPercent);
    ramp.sort((left, right) => left - right);
  }
  return ramp;
}

function stepZoomPercent(current: number, direction: "in" | "out", zoomLevels: number[]): number {
  if (direction === "in") {
    for (const level of zoomLevels) {
      if (level > current) return level;
    }
    return zoomLevels.at(-1) ?? current;
  }
  for (let index = zoomLevels.length - 1; index >= 0; index -= 1) {
    const level = zoomLevels[index];
    if (level != null && level < current) return level;
  }
  return zoomLevels[0] ?? current;
}

export function imagePreviewKeyboardZoomCommand(input: {
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
}): ImagePreviewZoomCommand | null {
  if (input.ctrlKey !== true && input.metaKey !== true) return null;
  if (input.key === "+" || input.key === "=") return { type: "step-zoom", delta: 1 };
  if (input.key === "-" || input.key === "_") return { type: "step-zoom", delta: -1 };
  if (input.key === "0") return { type: "reset-zoom" };
  return null;
}

export function imagePreviewWheelZoomPercent({
  currentZoomPercent,
  deltaMode,
  deltaY,
  maximumZoomPercent,
  minimumZoomPercent,
}: {
  currentZoomPercent: number;
  deltaMode: number;
  deltaY: number;
  maximumZoomPercent: number;
  minimumZoomPercent: number;
}): number | null {
  return imagePreviewClampZoomPercent({
    maximumZoomPercent,
    minimumZoomPercent,
    zoomPercent: currentZoomPercent * Math.exp(-imagePreviewWheelDeltaY(deltaY, deltaMode) / IMAGE_PREVIEW_WHEEL_ZOOM_FACTOR),
  });
}

export function imagePreviewClampZoomPercent({
  maximumZoomPercent,
  minimumZoomPercent,
  zoomPercent,
}: {
  maximumZoomPercent: number | null;
  minimumZoomPercent: number | null;
  zoomPercent: number;
}): number | null {
  if (minimumZoomPercent == null || maximumZoomPercent == null || !Number.isFinite(zoomPercent)) return null;
  return Math.min(maximumZoomPercent, Math.max(minimumZoomPercent, zoomPercent));
}

function imagePreviewWheelDeltaY(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * 800;
  return deltaY;
}

function handleViewportPointerDown(
  event: ReactPointerEvent<HTMLDivElement>,
  state: {
    fallbackPointRef: { current: ImagePreviewPoint | null };
    pinchRef: { current: ImagePreviewPinchStart | null };
    touchPanRef: { current: ImagePreviewTouchPan | null };
    touchPointersRef: { current: Map<number, ImagePreviewPoint> };
    viewportNodeRef: { current: HTMLDivElement | null };
    zoomPercent: number;
  },
): void {
  state.fallbackPointRef.current = { clientX: event.clientX, clientY: event.clientY };
  if (event.pointerType !== "touch") return;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const touchPointers = state.touchPointersRef.current;
  touchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  const viewportNode = state.viewportNodeRef.current;
  if (touchPointers.size === 1 && viewportNode != null) {
    state.touchPanRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: viewportNode.scrollLeft,
      scrollTop: viewportNode.scrollTop,
    };
    state.pinchRef.current = null;
    return;
  }
  state.touchPanRef.current = null;
  const pinch = readImagePreviewPinch(touchPointers);
  state.pinchRef.current = pinch == null ? null : { distance: pinch.distance, zoomPercent: state.zoomPercent };
}

function handleViewportPointerMove(
  event: ReactPointerEvent<HTMLDivElement>,
  state: {
    fallbackPointRef: { current: ImagePreviewPoint | null };
    maximumZoomPercent: number;
    minimumZoomPercent: number;
    pinchRef: { current: ImagePreviewPinchStart | null };
    setZoomAtPoint: (input: ImagePreviewZoomPoint) => void;
    touchPanRef: { current: ImagePreviewTouchPan | null };
    touchPointersRef: { current: Map<number, ImagePreviewPoint> };
    viewportNodeRef: { current: HTMLDivElement | null };
    zoomPercent: number;
  },
): void {
  state.fallbackPointRef.current = { clientX: event.clientX, clientY: event.clientY };
  if (event.pointerType !== "touch" || !state.touchPointersRef.current.has(event.pointerId)) return;
  const touchPointers = state.touchPointersRef.current;
  touchPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  if (touchPointers.size > 1) {
    event.preventDefault();
    event.stopPropagation();
    state.touchPanRef.current = null;
    const pinchStart = state.pinchRef.current;
    const pinch = readImagePreviewPinch(touchPointers);
    if (pinchStart == null || pinch == null) return;
    const nextZoomPercent = imagePreviewClampZoomPercent({
      maximumZoomPercent: state.maximumZoomPercent,
      minimumZoomPercent: state.minimumZoomPercent,
      zoomPercent: pinchStart.zoomPercent * (pinch.distance / pinchStart.distance),
    });
    if (nextZoomPercent == null || nextZoomPercent === state.zoomPercent) return;
    state.setZoomAtPoint({
      clientX: pinch.clientX,
      clientY: pinch.clientY,
      zoomPercent: nextZoomPercent,
    });
    return;
  }

  const viewportNode = state.viewportNodeRef.current;
  const touchPan = state.touchPanRef.current;
  if (viewportNode == null || touchPan == null || touchPan.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  viewportNode.scrollLeft = touchPan.scrollLeft - (event.clientX - touchPan.clientX);
  viewportNode.scrollTop = touchPan.scrollTop - (event.clientY - touchPan.clientY);
}

function handleViewportPointerEnd(
  event: ReactPointerEvent<HTMLDivElement>,
  state: {
    pinchRef: { current: ImagePreviewPinchStart | null };
    touchPanRef: { current: ImagePreviewTouchPan | null };
    touchPointersRef: { current: Map<number, ImagePreviewPoint> };
    viewportNodeRef: { current: HTMLDivElement | null };
    zoomPercent: number;
  },
): void {
  if (event.pointerType !== "touch") return;
  const touchPointers = state.touchPointersRef.current;
  touchPointers.delete(event.pointerId);
  if (
    typeof event.currentTarget.hasPointerCapture === "function"
    && event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (touchPointers.size === 0) {
    state.touchPanRef.current = null;
    state.pinchRef.current = null;
    return;
  }

  if (touchPointers.size === 1) {
    const nextTouch = touchPointers.entries().next().value as [number, ImagePreviewPoint] | undefined;
    if (nextTouch == null) return;
    const [pointerId, point] = nextTouch;
    const viewportNode = state.viewportNodeRef.current;
    state.touchPanRef.current = viewportNode == null
      ? null
      : {
          pointerId,
          clientX: point.clientX,
          clientY: point.clientY,
          scrollLeft: viewportNode.scrollLeft,
          scrollTop: viewportNode.scrollTop,
        };
    state.pinchRef.current = null;
    return;
  }

  const pinch = readImagePreviewPinch(touchPointers);
  state.touchPanRef.current = null;
  state.pinchRef.current = pinch == null ? null : { distance: pinch.distance, zoomPercent: state.zoomPercent };
}

function readImagePreviewPinch(touchPointers: Map<number, ImagePreviewPoint>): ImagePreviewPinch | null {
  const iterator = touchPointers.values();
  const first = iterator.next().value as ImagePreviewPoint | undefined;
  const second = iterator.next().value as ImagePreviewPoint | undefined;
  if (first == null || second == null) return null;
  const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  if (distance <= 0) return null;
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2,
    distance,
  };
}

function resolveImagePreviewZoomPoint({
  event,
  fallbackPoint,
  previewViewportNode,
}: {
  event: WheelEvent;
  fallbackPoint: ImagePreviewPoint | null;
  previewViewportNode: HTMLElement | null;
}): ImagePreviewPoint {
  const eventPoint = { clientX: event.clientX, clientY: event.clientY };
  if (previewViewportNode == null) return eventPoint;
  const viewportRect = previewViewportNode.getBoundingClientRect();
  if ((eventPoint.clientX !== 0 || eventPoint.clientY !== 0) && isImagePreviewPointInsideRect(eventPoint, viewportRect)) {
    return eventPoint;
  }
  if (fallbackPoint != null && isImagePreviewPointInsideRect(fallbackPoint, viewportRect)) {
    return fallbackPoint;
  }
  return {
    clientX: viewportRect.left + viewportRect.width / 2,
    clientY: viewportRect.top + viewportRect.height / 2,
  };
}

function isImagePreviewPointInsideRect(point: ImagePreviewPoint, rect: DOMRect): boolean {
  return point.clientX >= rect.left
    && point.clientX <= rect.right
    && point.clientY >= rect.top
    && point.clientY <= rect.bottom;
}

function clampImagePreviewUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function imagePreviewNaturalSize(image: HTMLImageElement): ImagePreviewSize | null {
  const { naturalWidth, naturalHeight } = image;
  if (naturalWidth === 0 || naturalHeight === 0) return null;
  return { width: naturalWidth, height: naturalHeight };
}

function imagePreviewZoomStyle(naturalSize: ImagePreviewSize | null, zoomPercent: number): CSSProperties | undefined {
  if (naturalSize == null) return undefined;
  const scale = zoomPercent / 100;
  return {
    width: `${naturalSize.width * scale}px`,
    height: `${naturalSize.height * scale}px`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

function formatZoomPercent(zoomPercent: number): string {
  return `${Math.round(zoomPercent)}%`;
}

function handleImageDownloadClick(event: MouseEvent<HTMLAnchorElement>, src: string, downloadName: string): void {
  event.stopPropagation();
  if (!src.startsWith("data:")) return;
  event.preventDefault();
  const blob = imagePreviewDataUrlToBlob(src);
  if (blob == null || typeof document === "undefined") return;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = downloadName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function imageDownloadName(label: string | undefined, src: string): string {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) return trimmedLabel;
  if (src.startsWith("data:")) return "image";
  const pathname = src.split(/[?#]/u, 1)[0] ?? "";
  const filename = pathname.split(/[\\/]/u).at(-1);
  if (!filename) return "image";
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

export function imagePreviewDataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith("data:")) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return null;
  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const mimeType = metadata.match(/^[^;]+/u)?.[0] || "application/octet-stream";
  try {
    if (/;base64/iu.test(metadata)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new Blob([bytes], { type: mimeType });
    }
    return new Blob([decodeURIComponent(payload)], { type: mimeType });
  } catch {
    return null;
  }
}
