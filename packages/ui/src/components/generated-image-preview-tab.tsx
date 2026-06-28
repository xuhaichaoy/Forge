import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HTMLAttributeReferrerPolicy, KeyboardEvent, UIEvent } from "react";
import { useForgeIntl } from "./i18n-provider";

const THUMBNAIL_SIZE_PX = 46;
const THUMBNAIL_SCROLL_STEP_PX = 54;

export interface GeneratedImagePreviewItem {
  id: string;
  src: string;
  alt: string;
  title: string;
  downloadSrc?: string;
  previewSrc?: string;
}

export interface GeneratedImagePreviewTabProps {
  images: GeneratedImagePreviewItem[];
  initialImageId?: string | null;
  referrerPolicy?: HTMLAttributeReferrerPolicy;
  onActiveImageChange?: (image: GeneratedImagePreviewItem) => void;
}

export function generatedImageSidePanelTabId(uuid: string = randomUuid()): string {
  return `image:${uuid}`;
}

export function GeneratedImagePreviewTab({
  images,
  initialImageId = null,
  referrerPolicy = "no-referrer",
  onActiveImageChange,
}: GeneratedImagePreviewTabProps) {
  const { formatMessage } = useForgeIntl();
  const railRef = useRef<HTMLDivElement | null>(null);
  const previousInitialImageIdRef = useRef<string | null>(initialImageId);
  const [activeId, setActiveId] = useState(() => initialImageId ?? images[0]?.id ?? "");
  const activeImage = useMemo(
    () => images.find((image) => image.id === activeId) ?? images[0] ?? null,
    [activeId, images],
  );
  const activeIndex = activeImage ? images.findIndex((image) => image.id === activeImage.id) : -1;

  useEffect(() => {
    const initialImageIdChanged = previousInitialImageIdRef.current !== initialImageId;
    previousInitialImageIdRef.current = initialImageId;
    setActiveId((current) => {
      if (initialImageIdChanged && initialImageId && images.some((image) => image.id === initialImageId)) {
        return initialImageId;
      }
      if (images.some((image) => image.id === current)) return current;
      return images[0]?.id ?? "";
    });
  }, [images, initialImageId]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const node = railRef.current;
    if (!node) return;
    node.scrollTop = activeIndex * THUMBNAIL_SCROLL_STEP_PX;
  }, [activeIndex]);

  if (!activeImage) {
    return (
      <div className="hc-generated-image-preview-tab">
        <div className="hc-generated-image-preview-empty">
          {formatMessage({ id: "review.fileSource.error", defaultMessage: "Unable to load file" })}
        </div>
      </div>
    );
  }

  const activateImage = (
    image: GeneratedImagePreviewItem,
    index: number,
    options: { scrollRail?: boolean } = {},
  ) => {
    if (options.scrollRail !== false) {
      scrollGeneratedImageRailToIndex(railRef.current, index);
    }
    if (image.id === activeImage.id) return;
    setActiveId(image.id);
    onActiveImageChange?.(image);
  };
  const handleRailScroll = (event: UIEvent<HTMLDivElement>) => {
    const index = clampImageIndex(Math.round(event.currentTarget.scrollTop / THUMBNAIL_SCROLL_STEP_PX), images.length);
    const image = images[index];
    if (!image) return;
    activateImage(image, index, { scrollRail: false });
  };
  const handleThumbnailKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const offset = generatedImagePreviewKeyboardOffset(event.key);
    if (offset === 0) return;
    event.preventDefault();
    const nextIndex = clampImageIndex(activeIndex + offset, images.length);
    const image = images[nextIndex];
    if (image) activateImage(image, nextIndex);
  };
  const downloadSrc = activeImage.downloadSrc ?? activeImage.src;
  const downloadName = generatedImageDownloadName(activeImage);

  return (
    <div className="hc-generated-image-preview-tab">
      {images.length > 1 && (
        <div
          ref={railRef}
          className="hc-generated-image-preview-rail"
          role="list"
          aria-label={formatMessage({ id: "codex.localConversation.generatedImages", defaultMessage: "Generated images" })}
          onScroll={handleRailScroll}
        >
          <div className="hc-generated-image-preview-rail-spacer" aria-hidden />
          {images.map((image, index) => (
            <button
              aria-current={image.id === activeImage.id ? "true" : undefined}
              aria-label={image.alt}
              className="hc-generated-image-preview-thumb"
              key={image.id}
              onClick={() => activateImage(image, index)}
              onKeyDown={handleThumbnailKeyDown}
              style={{ height: THUMBNAIL_SIZE_PX, width: THUMBNAIL_SIZE_PX }}
              type="button"
            >
              <img alt="" decoding="async" loading="lazy" referrerPolicy={referrerPolicy} src={image.previewSrc ?? image.src} />
            </button>
          ))}
          <div className="hc-generated-image-preview-rail-spacer" aria-hidden />
        </div>
      )}
      <div className="hc-generated-image-preview-main">
        <div className="hc-generated-image-preview-toolbar" data-tab-preview-pin-exempt="true">
          <a
            aria-label={formatMessage({ id: "imageSidePanel.download", defaultMessage: "Download" })}
            className="hc-generated-image-preview-toolbar-button"
            download={downloadName}
            href={downloadSrc}
            title={formatMessage({ id: "imageSidePanel.download", defaultMessage: "Download" })}
          >
            <Download size={14} />
          </a>
        </div>
        <div className="hc-generated-image-preview-stage">
          <img
            alt={activeImage.alt}
            className="hc-generated-image-preview-image"
            referrerPolicy={referrerPolicy}
            src={activeImage.src}
          />
        </div>
      </div>
    </div>
  );
}

export function generatedImagePreviewKeyboardOffset(key: string): -1 | 0 | 1 {
  if (key === "ArrowUp" || key === "ArrowLeft") return -1;
  if (key === "ArrowDown" || key === "ArrowRight") return 1;
  return 0;
}

function clampImageIndex(index: number, imageCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(imageCount - 1, 0));
}

function scrollGeneratedImageRailToIndex(node: HTMLDivElement | null, index: number): void {
  if (!node) return;
  const top = index * THUMBNAIL_SCROLL_STEP_PX;
  if (typeof node.scrollTo === "function") {
    node.scrollTo({ top });
    return;
  }
  node.scrollTop = top;
}

function generatedImageDownloadName(image: GeneratedImagePreviewItem): string {
  const title = image.alt.trim() || imageFilename(image.downloadSrc ?? image.src) || "image";
  const extension = imageExtension(image.downloadSrc ?? image.src) ?? "png";
  return /\.[a-z0-9]+$/i.test(title) ? title : `${title}.${extension}`;
}

function imageFilename(value: string): string | null {
  if (/^data:/i.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  if (!name) return null;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function imageExtension(value: string): string | null {
  const match = value.match(/\.([a-z0-9]+)(?:[?#].*)?$/i) ?? value.match(/^data:image\/([a-z0-9.+-]+)[;,]/i);
  if (!match?.[1]) return null;
  const extension = match[1].toLowerCase();
  return extension === "jpeg" ? "jpg" : extension;
}

function randomUuid(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
