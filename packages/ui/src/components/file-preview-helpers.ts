import {
  convertLocalFileSrc,
  readFileMetadata,
  type LocalFileMetadata,
} from "../lib/tauri-host";
import type { SpreadsheetPreviewKind } from "./spreadsheet-preview";

export const FILE_PREVIEW_READ_MAX_BYTES = 240_000;
export const SOURCE_FILE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpg",
  "jpeg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const SOURCE_WORD_WRAP_BLOCKED_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  "7z",
  "aac",
  "aiff",
  "avi",
  "csv",
  "doc",
  "docx",
  "flac",
  "gz",
  "key",
  "m4a",
  "m4v",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "numbers",
  "odp",
  "ods",
  "odt",
  "ogg",
  "pages",
  "pdf",
  "ppt",
  "pptx",
  "rar",
  "rtf",
  "tar",
  "tgz",
  "tsv",
  "wav",
  "webm",
  "xls",
  "xlsm",
  "xlsx",
  "zip",
]);

export type UnsupportedFilePreviewType =
  | "archive"
  | "audio"
  | "binary"
  | "excel-spreadsheet"
  | "keynote-deck"
  | "numbers-spreadsheet"
  | "opendocument-presentation"
  | "opendocument-spreadsheet"
  | "opendocument-text"
  | "pages-document"
  | "powerpoint-deck"
  | "rich-text-document"
  | "video"
  | "word-document";

export async function readFirstAvailableMetadata(
  candidates: string[],
): Promise<{ path: string; metadata: LocalFileMetadata }> {
  let lastError: unknown = new Error("No preview path candidates were available.");
  let firstReadable: { path: string; metadata: LocalFileMetadata } | null = null;
  for (const path of candidates) {
    try {
      const metadata = await readFileMetadata(path);
      if (metadata.isFile) return { path, metadata };
      firstReadable ??= { path, metadata };
    } catch (error: unknown) {
      lastError = error;
    }
  }
  if (firstReadable) return firstReadable;
  throw lastError;
}

export function localFileSrc(path: string): string {
  try {
    return convertLocalFileSrc(path);
  } catch {
    return `file://${encodeURI(path)}`;
  }
}

export function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function pathExtension(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const name = basename(pathname);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function languageFromPath(path: string): string {
  const extension = pathExtension(path);
  if (extension === "md" || extension === "markdown" || extension === "mdx") return "markdown";
  if (extension === "mjs" || extension === "cjs" || extension === "jsx") return "js";
  if (extension === "tsx") return "tsx";
  if (extension === "ts") return "ts";
  if (extension === "yml") return "yaml";
  return extension || "text";
}

export function isSourceFilePreviewTooLarge(metadata: Pick<LocalFileMetadata, "sizeBytes">): boolean {
  // CODEX-REF: app-initial~app-main~onboarding-page~profile-*.js `Fx =
  // 10 * 1024 * 1024`; FileSourcePage shows the source too-large state when
  // `sizeBytes > 10485760`. Artifact previews keep their separate 40MiB cap.
  return metadata.sizeBytes != null && metadata.sizeBytes > SOURCE_FILE_PREVIEW_MAX_BYTES;
}

export function shouldShowSourceWordWrapControl(path: string, richPreview: boolean): boolean {
  const extension = pathExtension(path);
  // CODEX-REF: review-file-source-tab-*.js passes `showWordWrapControl` only
  // for raw source/text rendering. Markdown rich preview, images, PDFs,
  // spreadsheets, documents, archives, audio, and video do not expose it.
  if (richPreview && (extension === "md" || extension === "markdown" || extension === "mdx")) return false;
  return !SOURCE_WORD_WRAP_BLOCKED_EXTENSIONS.has(extension);
}

export function isPdfPath(path: string, metadata: LocalFileMetadata): boolean {
  return pathExtension(path) === "pdf" || metadata.mimeType === "application/pdf";
}

export function isDocumentPath(path: string, metadata: LocalFileMetadata): boolean {
  const extension = pathExtension(path);
  return extension === "docx"
    || extension === "doc"
    || metadata.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || metadata.mimeType === "application/msword";
}

export function isKnownBinaryDocumentPath(path: string, metadata: LocalFileMetadata): boolean {
  const extension = pathExtension(path);
  // CODEX-REF: open-workspace-file-*.js — xlsx/xlsm are routed to the SheetJS
  // preview before this binary fallback. xls still falls back here because the
  // SheetJS xls path needs extra codepages we do not bundle.
  if (["ppt", "pptx", "xls"].includes(extension)) return true;
  return metadata.mimeType === "application/vnd.ms-excel"
    || metadata.mimeType === "application/vnd.ms-powerpoint"
    || metadata.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

export function unsupportedFilePreviewType(
  path: string,
  metadata: Pick<LocalFileMetadata, "mimeType"> | null | undefined = null,
): UnsupportedFilePreviewType | null {
  const extension = pathExtension(path);
  /*
   * CODEX-REF: app-initial~app-main~onboarding-page~profile-*.js
   * `hIe(...)` + `_Ie` unsupported preview map:
   * doc/docx/key/numbers/odp/ods/odt/pages/ppt/pptx/rtf/xls/xlsm/xlsx
   * plus contentKind archive/audio/binary/video. Forge intentionally handles
   * doc/docx and xlsx/xlsm/csv/tsv with simplified local renderers, so those
   * implemented formats do not return an unsupported type here.
   */
  const extensionType = unsupportedTypeFromExtension(extension);
  if (extensionType) return extensionType;

  const mimeType = metadata?.mimeType?.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/vnd.ms-powerpoint"
    || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "powerpoint-deck";
  }
  if (mimeType === "application/vnd.ms-excel") return "excel-spreadsheet";
  if (mimeType === "application/octet-stream") return "binary";
  return null;
}

function unsupportedTypeFromExtension(extension: string): UnsupportedFilePreviewType | null {
  switch (extension) {
    case "7z":
    case "gz":
    case "rar":
    case "tar":
    case "tgz":
    case "zip":
      return "archive";
    case "aac":
    case "aiff":
    case "flac":
    case "m4a":
    case "mp3":
    case "ogg":
    case "wav":
      return "audio";
    case "avi":
    case "m4v":
    case "mkv":
    case "mov":
    case "mp4":
    case "webm":
      return "video";
    case "key":
      return "keynote-deck";
    case "numbers":
      return "numbers-spreadsheet";
    case "odp":
      return "opendocument-presentation";
    case "ods":
      return "opendocument-spreadsheet";
    case "odt":
      return "opendocument-text";
    case "pages":
      return "pages-document";
    case "ppt":
    case "pptx":
      return "powerpoint-deck";
    case "rtf":
      return "rich-text-document";
    case "xls":
      return "excel-spreadsheet";
    default:
      return null;
  }
}

// CODEX-REF: open-workspace-file-*.js
//   var _=new Map([["xlsm","xlsx"],["xlsx","xlsx"],["csv","csv"],["tsv","tsv"]]);
// Maps the file suffix to the SheetJS parsing hint used by SpreadsheetPreview.
export function getSpreadsheetImportKind(path: string): SpreadsheetPreviewKind | null {
  const extension = pathExtension(path);
  if (extension === "xlsx" || extension === "xlsm") return "xlsx";
  if (extension === "csv") return "csv";
  if (extension === "tsv") return "tsv";
  return null;
}

// CODEX-REF: host_read_file_bytes_base64 returns standard base64; the renderer
// converts it back to an ArrayBuffer for SheetJS XLSX.read({type:"array"}).
export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const length = binary.length;
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff;
  }
  return buffer;
}

export function isImagePath(path: string, metadata: LocalFileMetadata): boolean {
  if (metadata.mimeType?.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(pathExtension(path));
}
