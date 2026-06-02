import { convertLocalFileSrc } from "./tauri-host";

const PASS_THROUGH_IMAGE_SRC_RE = /^(?:data|blob|https?):/i;

export function renderableLocalImageSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (PASS_THROUGH_IMAGE_SRC_RE.test(trimmed)) return trimmed;

  const localPath = fileUrlPath(trimmed) ?? absoluteLocalPath(trimmed);
  if (!localPath) return trimmed;

  try {
    return convertLocalFileSrc(localPath);
  } catch {
    return `file://${encodeURI(localPath)}`;
  }
}

function absoluteLocalPath(value: string): string | null {
  return value.startsWith("/") ? value : null;
}

function fileUrlPath(value: string): string | null {
  if (!/^file:/i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    if (url.hostname && url.hostname !== "localhost") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}
