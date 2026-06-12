/** Codex `WC = 4` - max images per visible carousel row. */
export const GALLERY_MAX_VISIBLE = 4;
/** Gap between thumbnails in pixels - matches Codex inner `flex gap-2` (Tailwind). */
export const GALLERY_GAP_PX = 8;
/** Codex pending placeholder size - `flex h-24 w-24` (Tailwind h-24 = 6rem = 96px). */
export const GALLERY_PENDING_SIZE_PX = 96;

export interface GalleryLayout {
  heightPx: number;
  aspectRatio: "natural" | "square";
  visibleCount: number;
  maxStartIndex: number;
  overflowCount: number;
}

/**
 * Codex `GC`. Computes whether the natural-aspect row of images can fit in the
 * measured container width. If not, switch to a square 4-up carousel.
 */
export function computeGalleryLayout(
  containerWidthPx: number | null,
  imageAspectRatios: number[],
): GalleryLayout {
  const n = imageAspectRatios.length;
  const perCellWidth = containerWidthPx == null
    ? 0
    : Math.max((containerWidthPx - (GALLERY_MAX_VISIBLE - 1) * GALLERY_GAP_PX) / GALLERY_MAX_VISIBLE, 0);
  const naturalTotalWidth = imageAspectRatios.reduce((sum, ar) => sum + ar * perCellWidth, 0)
    + Math.max(n - 1, 0) * GALLERY_GAP_PX;
  if (containerWidthPx == null || naturalTotalWidth <= containerWidthPx) {
    return {
      heightPx: perCellWidth,
      aspectRatio: "natural",
      visibleCount: n,
      maxStartIndex: 0,
      overflowCount: 0,
    };
  }
  const visibleCount = Math.min(n, GALLERY_MAX_VISIBLE);
  const overflowCount = Math.max(n - visibleCount, 0);
  return {
    heightPx: perCellWidth,
    aspectRatio: "square",
    visibleCount,
    maxStartIndex: overflowCount,
    overflowCount,
  };
}
