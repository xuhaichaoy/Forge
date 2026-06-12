import { ChevronDown, Loader2 } from "lucide-react";
import { GALLERY_PENDING_SIZE_PX } from "./generated-image-gallery-layout";
import { useHiCodexIntl } from "./i18n-provider";

/*
 * Codex `YC` — single thumbnail button. `naturalWidth/Height`
 * onLoad propagates back via `onAspectRatioChange` so the parent re-runs
 * `GC` with accurate ratios.
 */
export function GalleryThumbnail({
  src,
  imageNumber,
  heightPx,
  aspectRatio,
  aspectRatioKnown,
  square,
  hiddenInCarousel,
  onAspectRatioChange,
  onOpenPreview,
}: {
  src: string;
  imageNumber: number;
  heightPx: number;
  aspectRatio: number;
  aspectRatioKnown: boolean;
  square: boolean;
  hiddenInCarousel: boolean;
  onAspectRatioChange: (ratio: number) => void;
  onOpenPreview: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const alt = formatMessage({ id: "codex.localConversation.generatedImage", defaultMessage: "Generated image {imageNumber}" }, { imageNumber });
  const frameHeightPx = heightPx > 0 ? heightPx : undefined;
  const frameWidthPx = frameHeightPx == null
    ? undefined
    : square ? frameHeightPx : Math.max(frameHeightPx * aspectRatio, 1);
  // While `src` is empty (e.g. waiting for `app://` URL hook resolution in
  // Codex `ew()`), render a placeholder square — Codex `YC` does the same.
  if (!src) {
    return (
      <div
        className="hc-generated-image-gallery-thumb hc-generated-image-gallery-thumb--empty"
        style={{ width: frameHeightPx, height: frameHeightPx }}
      >
        <Loader2 aria-hidden className="hc-spin" size={16} />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="hc-generated-image-gallery-thumb"
      style={{ width: frameWidthPx, height: frameHeightPx }}
      aria-label={alt}
      aria-hidden={hiddenInCarousel}
      tabIndex={hiddenInCarousel ? -1 : undefined}
      onClick={onOpenPreview}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className={[
          "hc-generated-image-thumb-img",
          square ? "is-square" : "is-natural",
          !square && !aspectRatioKnown ? "is-measuring" : "",
        ].filter(Boolean).join(" ")}
        onLoad={(event) => {
          const target = event.currentTarget;
          if (target.naturalWidth <= 0 || target.naturalHeight <= 0) return;
          onAspectRatioChange(target.naturalWidth / target.naturalHeight);
        }}
        onError={() => {
          if (!aspectRatioKnown) onAspectRatioChange(1);
        }}
      />
    </button>
  );
}

// Codex pending placeholder (`$e` branch): 24x24 outlined box with a loading spinner.
export function GalleryPendingPlaceholder() {
  return (
    <div
      className="hc-generated-image-gallery-pending"
      style={{ width: GALLERY_PENDING_SIZE_PX, height: GALLERY_PENDING_SIZE_PX }}
    >
      <Loader2 aria-hidden className="hc-spin" size={20} />
    </div>
  );
}

/*
 * Codex `XC` — overflow indicator + prev/next paging.
 * Codex uses absolute right-2 bottom-2 with hover/focus opacity transitions.
 */
export function GalleryOverflowControls({
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
  const { formatMessage } = useHiCodexIntl();
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
      {/*
        Intentionally aria-free wrapper: Codex renders the nav as a bare
        positioned div with no role/aria-label (no "Generated image carousel"
        string exists in the Codex chunks). Only the two nav buttons carry
        aria-labels (ICU ids `generatedImageGallery.previousImages` /
        `generatedImageGallery.nextImages`).
      */}
      <div className="hc-generated-image-gallery-nav">
        <button
          type="button"
          className="hc-generated-image-gallery-nav-button"
          aria-label={formatMessage({ id: "codex.localConversation.generatedImageGallery.previousImages", defaultMessage: "Previous images" })}
          disabled={!canGoPrev}
          onClick={onPrev}
          onPointerUp={(event) => event.currentTarget.blur()}
        >
          <ChevronDown aria-hidden className="hc-generated-image-gallery-nav-icon is-prev" size={14} />
        </button>
        <button
          type="button"
          className="hc-generated-image-gallery-nav-button"
          aria-label={formatMessage({ id: "codex.localConversation.generatedImageGallery.nextImages", defaultMessage: "Next images" })}
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
