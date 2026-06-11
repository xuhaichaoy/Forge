import type {
  AssistantEndResource,
  ItemRecord,
  ThreadItem,
} from "./render-group-types";
import { isItemInProgress, itemType } from "./thread-item-fields";

interface GeneratedImageToolOutputProjection {
  generatedImages: ThreadItem[];
  pendingGeneratedImage: boolean;
  nonImageOutputs: ThreadItem[];
}

export function projectGeneratedImageToolOutputs(
  toolOutputItems: ThreadItem[],
): GeneratedImageToolOutputProjection {
  const generatedImages: ThreadItem[] = [];
  let pendingGeneratedImage = false;
  const nonImageOutputs: ThreadItem[] = [];

  for (const item of toolOutputItems) {
    const type = itemType(item);
    if (type !== "generated-image" && type !== "imageGeneration") {
      nonImageOutputs.push(item);
      continue;
    }

    if (imageItemSrc(item)) {
      generatedImages.push(item);
      continue;
    }
    if (isGeneratedImagePending(item)) {
      pendingGeneratedImage = true;
      continue;
    }
    nonImageOutputs.push(item);
  }

  return { generatedImages, pendingGeneratedImage, nonImageOutputs };
}

export function visibleGeneratedImagesForEndResources(
  images: ThreadItem[],
  resources: AssistantEndResource[],
): ThreadItem[] {
  return endResourcesIncludePptx(resources) ? [] : images;
}

/**
 * Best-effort turn id for the gallery render-unit key. Prefers a stamped
 * `_turnId` from any segment item; falls back to the first image's id or a
 * deterministic literal so the gallery key is stable per segment.
 */
export function generatedImageGalleryTurnId(
  segment: ThreadItem[],
  images: ThreadItem[],
  fallbackItem: ThreadItem | null,
): string {
  const stamped = segment.map((item) => (item as ItemRecord)._turnId).find((id): id is string =>
    typeof id === "string" && id.length > 0
  );
  if (stamped) return stamped;
  const firstId = images[0]?.id ?? fallbackItem?.id ?? null;
  return typeof firstId === "string" && firstId.length > 0 ? firstId : "gallery";
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
  if (value.startsWith("/")) return `file://${encodeURI(value)}`;
  return value;
}

function isGeneratedImagePending(item: ThreadItem): boolean {
  if (imageItemSrc(item)) return false;
  const status = String((item as Record<string, unknown>).status ?? "").trim();
  if (itemType(item) !== "imageGeneration") {
    return status === "in_progress" || status === "inProgress" || isItemInProgress(item);
  }
  return status === "in_progress" || status === "inProgress";
}

/**
 * Codex PPTX exclusion: when any end-resource path has a `pptx` extension, the
 * generated-image gallery is suppressed because the deck embeds those images.
 */
function endResourcesIncludePptx(resources: AssistantEndResource[]): boolean {
  return resources.some((resource) => {
    const path = resource.type === "file" ? resource.path : resource.type === "website" ? resource.target : "";
    return /\.pptx(?:[#?].*)?$/i.test(path);
  });
}
