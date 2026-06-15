import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderableLocalImageSrc } from "../lib/local-image-src";
import type { ThreadItem } from "../state/render-groups";
import {
  computeGalleryLayout,
  GALLERY_GAP_PX,
  type GalleryLayout,
} from "./generated-image-gallery-layout";
import {
  GalleryOverflowControls,
  GalleryPendingPlaceholder,
  GalleryThumbnail,
} from "./generated-image-gallery-thumbnails";
import { ImagePreviewLightbox } from "./image-preview-lightbox";
import { useForgeIntl } from "./i18n-provider";

/*
 * Codex Desktop `JC` gallery (local-conversation-thread-*.js) — horizontal
 * carousel of generated-image thumbnails. Forge's
 * single-card-per-image markdown rendering produced a stack of full-width
 * blue-sky cards (screenshot 2026-05-21 #6) that diverged sharply from
 * Codex's compact 4-up thumbnail row (screenshot #7). This component
 * mirrors `JC` + supporting `GC`/`YC`/`XC` so a turn's image outputs
 * collapse into a single carousel.
 *
 * Architectural mapping:
 *   Codex `Ut` ↔ Forge `images` prop (passed visible-completed list)
 *   Codex `$e` ↔ Forge `hasPending` (pending 24×24 spinner placeholder)
 *   Codex `GC()` ↔ `computeGalleryLayout()` in generated-image-gallery-layout
 *   Codex `YC` ↔ `GalleryThumbnail` sub-component
 *   Codex `XC` ↔ `GalleryOverflowControls` sub-component
 *   Codex `$C` ↔ `<ImagePreviewLightbox>` (now with prev/next nav)
 */

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
  return renderableLocalImageSrc(value);
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
  const { formatMessage } = useForgeIntl();

  /*
   * Codex `T = cc(callback)` uses ResizeObserver on the
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
              const measuredAspectRatio = aspectRatios[id];
              const aspectRatio = measuredAspectRatio ?? 1;
              const isHidden = layout.aspectRatio === "square"
                && (index < clampedStartIndex || index >= clampedStartIndex + layout.visibleCount);
              return (
                <GalleryThumbnail
                  key={id}
                  src={imageItemSrc(image)}
                  imageNumber={index + 1}
                  heightPx={layout.heightPx}
                  aspectRatio={aspectRatio}
                  aspectRatioKnown={measuredAspectRatio != null}
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
        <GalleryPendingPlaceholder />
      )}
      {selectedImage != null && selectedSrc.length > 0 && (
        <ImagePreviewLightbox
          src={selectedSrc}
          alt={formatMessage({ id: "codex.localConversation.generatedImage", defaultMessage: "Generated image {imageNumber}" }, { imageNumber: selectedIndex + 1 })}
          imageReferrerPolicy="no-referrer"
          title={formatMessage({ id: "codex.localConversation.generatedImage", defaultMessage: "Generated image {imageNumber}" }, { imageNumber: selectedIndex + 1 })}
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
 * Prevent unused-import error when this module is only consumed through
 * the named export.
 */
export type { GalleryLayout };
