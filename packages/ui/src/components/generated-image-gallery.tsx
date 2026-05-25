import { ChevronDown, Loader2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import type { ThreadItem } from "../state/render-groups";
import { ImagePreviewLightbox } from "./image-preview-lightbox";

/*
 * Codex Desktop `JC` gallery (local-conversation-thread-BX7YNcUw.js byte
 * ~506222) — horizontal carousel of generated-image thumbnails. HiCodex's
 * single-card-per-image markdown rendering produced a stack of full-width
 * blue-sky cards (screenshot 2026-05-21 #6) that diverged sharply from
 * Codex's compact 4-up thumbnail row (screenshot #7). This component
 * mirrors `JC` + supporting `GC`/`YC`/`XC` so a turn's image outputs
 * collapse into a single carousel.
 *
 * Architectural mapping:
 *   Codex `Ut` ↔ HiCodex `images` prop (passed visible-completed list)
 *   Codex `$e` ↔ HiCodex `hasPending` (pending 24×24 spinner placeholder)
 *   Codex `GC()` ↔ `computeGalleryLayout()` below (heightPx + aspectRatio mode)
 *   Codex `YC` ↔ `GalleryThumbnail` sub-component
 *   Codex `XC` ↔ `GalleryOverflowControls` sub-component
 *   Codex `$C` ↔ `<ImagePreviewLightbox>` (now with prev/next nav)
 */

/** Codex `WC = 4` — max images per visible carousel row. */
const GALLERY_MAX_VISIBLE = 4;
/** Gap between thumbnails in pixels — matches Codex inner `flex gap-2` (Tailwind). */
const GALLERY_GAP_PX = 8;
/** Codex pending placeholder size — `flex h-24 w-24` (Tailwind h-24 = 6rem = 96px). */
const GALLERY_PENDING_SIZE_PX = 96;

interface GalleryLayout {
  heightPx: number;
  aspectRatio: "natural" | "square";
  visibleCount: number;
  maxStartIndex: number;
  overflowCount: number;
}

/**
 * Codex `GC` (byte 505673, 385 chars). Computes whether the natural-aspect
 * row of images can fit in the measured container width — if so, render
 * each thumbnail at its native aspect ratio. If not, switch to a square
 * 4-up carousel with overflow paging.
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

function imageItemSrc(item: ThreadItem): string {
  const record = item as Record<string, unknown>;
  for (const key of ["src", "imageUrl", "path", "url", "savedPath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return normalizeImageSource(value.trim());
  }
  const result = typeof record.result === "string" ? record.result.trim() : "";
  if (result) return `data:image/png;base64,${result}`;
  return "";
}

function normalizeImageSource(value: string): string {
  if (/^(?:data|blob|https?|file):/i.test(value)) return value;
  if (value.startsWith("/")) {
    if (isTauriRuntime()) {
      try {
        return convertLocalFileSrc(value);
      } catch {
        return `file://${encodeURI(value)}`;
      }
    }
    return `file://${encodeURI(value)}`;
  }
  return value;
}

function imageItemId(item: ThreadItem, fallback: number): string {
  const raw = (item as Record<string, unknown>).id;
  return typeof raw === "string" && raw.length > 0 ? raw : `gallery-image-${fallback}`;
}

export function GeneratedImageGallery({
  images,
  hasPending,
}: {
  images: ThreadItem[];
  hasPending: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [containerWidthPx, setContainerWidthPx] = useState<number | null>(null);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  /*
   * Codex `T = cc(callback)` (byte 506222) uses ResizeObserver on the
   * gallery container; we mirror that with a single observer that floors
   * the contentRect width (same as Codex `Math.floor(e.contentRect.width)`).
   */
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (node == null) return;
    if (typeof ResizeObserver === "undefined") {
      setContainerWidthPx(node.getBoundingClientRect().width);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry == null) return;
      setContainerWidthPx((current) => {
        const next = Math.floor(entry.contentRect.width);
        return current === next ? current : next;
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Aspect ratios default to 1 (square) until each image reports its
  // natural dimensions via `onLoad` — Codex `d[e.id] ?? 1`.
  const ratiosArray = useMemo(
    () => images.map((image, index) => aspectRatios[imageItemId(image, index)] ?? 1),
    [images, aspectRatios],
  );
  const layout = useMemo(
    () => computeGalleryLayout(containerWidthPx, ratiosArray),
    [containerWidthPx, ratiosArray],
  );

  // Codex Desktop derives the clamped index for rendering/nav without
  // scheduling a state update during render.
  const clampedStartIndex = Math.min(startIndex, layout.maxStartIndex);

  const carouselTranslateX = layout.aspectRatio === "square"
    ? clampedStartIndex * (layout.heightPx + GALLERY_GAP_PX)
    : 0;

  const selectedIndex = useMemo(() => {
    if (selectedId == null) return -1;
    return images.findIndex((image, index) => imageItemId(image, index) === selectedId);
  }, [images, selectedId]);

  const handleAspectRatioChange = (imageId: string, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    setAspectRatios((current) => (current[imageId] === ratio ? current : { ...current, [imageId]: ratio }));
  };

  const handleOpenPreview = (imageId: string) => {
    setSelectedId(imageId);
  };

  const handleClosePreview = () => {
    setSelectedId(null);
  };

  const handlePreviousImageInLightbox = () => {
    if (selectedIndex <= 0) return;
    const prev = images[selectedIndex - 1];
    if (prev) setSelectedId(imageItemId(prev, selectedIndex - 1));
  };

  const handleNextImageInLightbox = () => {
    if (selectedIndex < 0 || selectedIndex >= images.length - 1) return;
    const next = images[selectedIndex + 1];
    if (next) setSelectedId(imageItemId(next, selectedIndex + 1));
  };

  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null;
  const selectedSrc = selectedImage ? imageItemSrc(selectedImage) : "";

  return (
    <div className="hc-generated-image-gallery">
      {images.length > 0 && (
        <div
          ref={containerRef}
          className="hc-generated-image-gallery-row group/generated-image-gallery-controls"
          style={{ height: layout.heightPx > 0 ? layout.heightPx : undefined }}
        >
          <div
            className="hc-generated-image-gallery-track"
            style={{
              height: layout.heightPx > 0 ? layout.heightPx : undefined,
              transform: layout.aspectRatio === "square"
                ? `translateX(-${carouselTranslateX}px)`
                : undefined,
            }}
          >
            {images.map((image, index) => {
              const id = imageItemId(image, index);
              const isHidden = layout.aspectRatio === "square"
                && (index < clampedStartIndex || index >= clampedStartIndex + layout.visibleCount);
              return (
                <GalleryThumbnail
                  key={id}
                  src={imageItemSrc(image)}
                  imageNumber={index + 1}
                  heightPx={layout.heightPx}
                  square={layout.aspectRatio === "square"}
                  hiddenInCarousel={isHidden}
                  onAspectRatioChange={(ratio) => handleAspectRatioChange(id, ratio)}
                  onOpenPreview={() => handleOpenPreview(id)}
                />
              );
            })}
          </div>
          {layout.aspectRatio === "square" && layout.overflowCount > 0 && (
            <GalleryOverflowControls
              overflowCount={layout.overflowCount}
              canGoPrev={clampedStartIndex > 0}
              canGoNext={clampedStartIndex < layout.maxStartIndex}
              onPrev={() => setStartIndex(Math.max(clampedStartIndex - 1, 0))}
              onNext={() => setStartIndex(Math.min(clampedStartIndex + 1, layout.maxStartIndex))}
            />
          )}
        </div>
      )}
      {hasPending && (
        // Codex pending placeholder (`$e` branch): 24×24 outlined box with a
        // loading spinner. Sits *below* the carousel of completed images.
        <div
          className="hc-generated-image-gallery-pending"
          role="status"
          aria-label="Generating image"
          style={{ width: GALLERY_PENDING_SIZE_PX, height: GALLERY_PENDING_SIZE_PX }}
        >
          <Loader2 aria-hidden className="hc-spin" size={20} />
        </div>
      )}
      {selectedImage != null && selectedSrc.length > 0 && (
        <ImagePreviewLightbox
          src={selectedSrc}
          alt={`Generated image ${selectedIndex + 1}`}
          imageReferrerPolicy="no-referrer"
          title={`Generated image ${selectedIndex + 1}`}
          viewportClassName="hc-preview-lightbox-viewport--thread-content"
          onClose={handleClosePreview}
          onPreviousImage={selectedIndex > 0 ? handlePreviousImageInLightbox : undefined}
          onNextImage={selectedIndex < images.length - 1 ? handleNextImageInLightbox : undefined}
        />
      )}
    </div>
  );
}

/*
 * Codex `YC` (byte 509404) — single thumbnail button. `naturalWidth/Height`
 * onLoad propagates back via `onAspectRatioChange` so the parent re-runs
 * `GC` with accurate ratios.
 */
function GalleryThumbnail({
  src,
  imageNumber,
  heightPx,
  square,
  hiddenInCarousel,
  onAspectRatioChange,
  onOpenPreview,
}: {
  src: string;
  imageNumber: number;
  heightPx: number;
  square: boolean;
  hiddenInCarousel: boolean;
  onAspectRatioChange: (ratio: number) => void;
  onOpenPreview: () => void;
}) {
  const alt = `Generated image ${imageNumber}`;
  // While `src` is empty (e.g. waiting for `app://` URL hook resolution in
  // Codex `ew()`), render a placeholder square — Codex `YC` does the same.
  if (!src) {
    return (
      <div
        className="hc-generated-image-gallery-thumb hc-generated-image-gallery-thumb--empty"
        style={{ width: heightPx, height: heightPx }}
      >
        <Loader2 aria-hidden className="hc-spin" size={16} />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="hc-generated-image-gallery-thumb"
      style={{ width: square ? heightPx : undefined, height: heightPx }}
      aria-label={alt}
      aria-hidden={hiddenInCarousel}
      tabIndex={hiddenInCarousel ? -1 : undefined}
      onClick={onOpenPreview}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className={square ? "hc-generated-image-thumb-img is-square" : "hc-generated-image-thumb-img is-natural"}
        onLoad={(event) => {
          const target = event.currentTarget;
          if (target.naturalWidth <= 0 || target.naturalHeight <= 0) return;
          onAspectRatioChange(target.naturalWidth / target.naturalHeight);
        }}
      />
    </button>
  );
}

/*
 * Codex `XC` (byte 511102) — overflow indicator + prev/next paging.
 * Codex uses absolute right-2 bottom-2 with hover/focus opacity transitions.
 */
function GalleryOverflowControls({
  overflowCount,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  overflowCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Hide the "+N" indicator entirely once the user has scrolled into the
  // overflowed range, matching Codex's `group-focus-within:opacity-0
  // group-hover:opacity-0` rule on the badge container.
  return (
    <>
      {overflowCount > 0 && (
        <div className="hc-generated-image-gallery-overflow-count" aria-hidden>
          <ChevronDown aria-hidden className="hc-generated-image-gallery-overflow-count-arrow" size={14} />
          <span className="hc-generated-image-gallery-overflow-count-value">{overflowCount}</span>
        </div>
      )}
      <div className="hc-generated-image-gallery-nav" role="group" aria-label="Generated image carousel">
        <button
          type="button"
          className="hc-generated-image-gallery-nav-button"
          aria-label="Previous images"
          disabled={!canGoPrev}
          onClick={onPrev}
          onPointerUp={(event) => event.currentTarget.blur()}
        >
          <ChevronDown aria-hidden className="hc-generated-image-gallery-nav-icon is-prev" size={14} />
        </button>
        <button
          type="button"
          className="hc-generated-image-gallery-nav-button"
          aria-label="Next images"
          disabled={!canGoNext}
          onClick={onNext}
          onPointerUp={(event) => event.currentTarget.blur()}
        >
          <ChevronDown aria-hidden className="hc-generated-image-gallery-nav-icon is-next" size={14} />
        </button>
      </div>
    </>
  );
}

/*
 * Prevent unused-import error when this module is only consumed through
 * the named export.
 */
export type { GalleryLayout };
