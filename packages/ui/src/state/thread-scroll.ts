export const DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX = 24;
export const DESKTOP_FOOTER_SCROLL_PADDING_PX = 16;

const DEFAULT_SCROLL_KEY = "__hicodex_default_thread_scroll__";

export function threadScrollDistanceFromBottom(element: HTMLElement): number {
  if (isReverseThreadScroll(element)) {
    return Math.max(0, -element.scrollTop);
  }
  return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
}

export function setThreadScrollDistanceFromBottom(element: HTMLElement, distance: number): void {
  element.scrollTop = threadScrollTopForDistanceFromBottom(element, distance);
}

export function threadScrollTopForDistanceFromBottom(element: HTMLElement, distance: number): number {
  const normalizedDistance = Math.max(0, distance);
  if (isReverseThreadScroll(element)) {
    return normalizedDistance === 0 ? 0 : -normalizedDistance;
  }
  return Math.max(0, element.scrollHeight - element.clientHeight - normalizedDistance);
}

export function nextThreadStickToBottomState(
  current: boolean,
  distanceFromBottomPx: number,
  updateStickiness: boolean,
): boolean {
  return updateStickiness
    ? distanceFromBottomPx <= DESKTOP_SCROLLED_FROM_BOTTOM_THRESHOLD_PX
    : current;
}

export function threadScrollKey(resetKey: string | null | undefined): string {
  const normalized = resetKey?.trim() ?? "";
  return normalized || DEFAULT_SCROLL_KEY;
}

export function threadScrollContentOverflows(contentHeightPx: number, viewportHeightPx: number): boolean {
  return contentHeightPx > viewportHeightPx + 2;
}

function isReverseThreadScroll(element: HTMLElement): boolean {
  return globalThis.getComputedStyle?.(element).flexDirection === "column-reverse";
}
