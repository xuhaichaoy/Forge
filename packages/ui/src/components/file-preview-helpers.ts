import {
  convertLocalFileSrc,
  readFileMetadata,
  type LocalFileMetadata,
} from "../lib/tauri-host";
import type { SpreadsheetPreviewKind } from "./spreadsheet-preview";

export const FILE_PREVIEW_READ_MAX_BYTES = 240_000;

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
  return new Set(["avif", "bmp", "gif", "heic", "heif", "jpg", "jpeg", "png", "svg", "tif", "tiff", "webp"])
    .has(pathExtension(path));
}
