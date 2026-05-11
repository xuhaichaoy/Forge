import { projectArtifactPreview } from "../state/artifact-preview";
import type { AssistantMessagePhase, RailEntry } from "../state/render-groups";

export function shouldRenderAssistantMessageChrome(assistantPhase: AssistantMessagePhase | undefined): boolean {
  return assistantPhase !== "commentary";
}

export function assistantArtifactMediaSources(entries: RailEntry[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const entry of entries) {
    const preview = projectArtifactPreview(entry);
    if (preview.kind !== "image") continue;
    const path = preview.imageSource?.src ?? preview.reference?.path ?? "";
    if (!path) continue;
    for (const key of artifactMediaLookupKeys([
      entry.title,
      preview.title,
      preview.reference?.path,
      preview.meta,
      path,
      pathBasename(path),
    ])) {
      if (!sources.has(key)) sources.set(key, path);
    }
  }
  return sources;
}

export function assistantResourceCardEntriesForMessage(input: {
  phase?: AssistantMessagePhase;
  text: string;
  artifacts: RailEntry[];
}): RailEntry[] {
  if (!shouldRenderAssistantMessageChrome(input.phase)) return [];
  if (!containsMarkdownImage(input.text)) return input.artifacts;
  return input.artifacts.filter((entry) => projectArtifactPreview(entry).kind !== "image");
}

export function resolveAssistantMarkdownMediaSource(
  src: string,
  mediaSources?: Map<string, string>,
): string | null {
  if (!mediaSources) return null;
  for (const key of artifactMediaLookupKeys([src, pathBasename(src)])) {
    const resolved = mediaSources.get(key);
    if (resolved) return resolved;
  }
  return null;
}

function containsMarkdownImage(text: string): boolean {
  return /!\[[^\]]*]\(/.test(text);
}

function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function artifactMediaLookupKeys(values: Array<string | null | undefined>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) continue;
    const decoded = decodeUriComponentSafe(trimmed);
    for (const key of [
      trimmed,
      decoded,
      pathBasename(trimmed),
      pathBasename(decoded),
      normalizedArtifactMediaKey(trimmed),
      normalizedArtifactMediaKey(decoded),
      normalizedArtifactMediaKey(pathBasename(trimmed)),
      normalizedArtifactMediaKey(pathBasename(decoded)),
    ]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function normalizedArtifactMediaKey(value: string): string {
  return pathBasename(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
