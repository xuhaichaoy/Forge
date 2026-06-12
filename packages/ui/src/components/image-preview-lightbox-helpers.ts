import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent } from "react";

export interface ImagePreviewSize {
  width: number;
  height: number;
}

export interface ImagePreviewPoint {
  clientX: number;
  clientY: number;
}

export interface ImagePreviewZoomPoint extends ImagePreviewPoint {
  zoomPercent: number;
}

export interface ImagePreviewTouchPan extends ImagePreviewPoint {
  pointerId: number;
  scrollLeft: number;
  scrollTop: number;
}

interface ImagePreviewPinch extends ImagePreviewPoint {
  distance: number;
}

export interface ImagePreviewPinchStart {
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

export function stepZoomPercent(current: number, direction: "in" | "out", zoomLevels: number[]): number {
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

export function handleViewportPointerDown(
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

export function handleViewportPointerMove(
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

export function handleViewportPointerEnd(
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

export function resolveImagePreviewZoomPoint({
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

export function clampImagePreviewUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

export function imagePreviewNaturalSize(image: HTMLImageElement): ImagePreviewSize | null {
  const { naturalWidth, naturalHeight } = image;
  if (naturalWidth === 0 || naturalHeight === 0) return null;
  return { width: naturalWidth, height: naturalHeight };
}

export function imagePreviewZoomStyle(naturalSize: ImagePreviewSize | null, zoomPercent: number): CSSProperties | undefined {
  if (naturalSize == null) return undefined;
  const scale = zoomPercent / 100;
  return {
    width: `${naturalSize.width * scale}px`,
    height: `${naturalSize.height * scale}px`,
    maxWidth: "none",
    maxHeight: "none",
  };
}

export function formatZoomPercent(zoomPercent: number): string {
  return `${Math.round(zoomPercent)}%`;
}

export function handleImageDownloadClick(event: MouseEvent<HTMLAnchorElement>, src: string, downloadName: string): void {
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

export function imageDownloadName(label: string | undefined, src: string): string {
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
