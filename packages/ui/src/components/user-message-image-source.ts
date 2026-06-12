import { convertLocalFileSrc, isTauriRuntime } from "../lib/tauri-host";
import type { UserMessageContentPart } from "../state/render-groups";

export function userImageSrc(part: Extract<UserMessageContentPart, { kind: "image" }>): string {
  if (part.source !== "local") return part.src;
  if (/^file:/i.test(part.src)) {
    const path = fileUrlToPath(part.src);
    if (path && isTauriRuntime()) return convertLocalFileSrc(path);
    return part.src;
  }
  if (/^(?:data|blob|https?):/i.test(part.src)) return part.src;
  if (isTauriRuntime()) return convertLocalFileSrc(part.src);
  const normalizedPath = part.src.startsWith("/") ? part.src : `/${part.src}`;
  return `file://${encodeURI(normalizedPath)}`;
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}
