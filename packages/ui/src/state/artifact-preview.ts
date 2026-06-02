import type { RailEntry, RailEntryAction, RailEntryReference } from "./render-group-types";

export type ArtifactPreviewKind =
  | "document"
  | "file"
  | "image"
  | "markdown"
  | "notebook"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "text"
  | "url";

export interface ArtifactImageSource {
  kind: "file" | "url";
  src: string;
}

export interface ArtifactPreviewModel {
  title: string;
  meta?: string;
  status?: string;
  kind: ArtifactPreviewKind;
  artifactTypeLabel: string;
  reference?: RailEntryReference;
  url?: string;
  pdfPath?: string;
  textPath?: string;
  imageSource?: ArtifactImageSource;
  details: string[];
}

export interface ArtifactTextPreview {
  text: string;
  truncatedLineCount: number;
  truncatedCharCount: number;
}

export interface ArtifactFileMetadata {
  isFile: boolean;
  sizeBytes?: number | null;
}

export const ARTIFACT_PREVIEW_MAX_BYTES = 40 * 1024 * 1024;

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const NOTEBOOK_EXTENSIONS = new Set(["ipynb"]);
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx"]);
const PRESENTATION_EXTENSIONS = new Set(["pptx"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "tsv", "xlsx"]);
const TEXT_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "css",
  "csv",
  "diff",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "kt",
  "log",
  "mjs",
  "py",
  "rs",
  "sh",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);
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

export function projectArtifactPreview(entry: RailEntry): ArtifactPreviewModel {
  const action = artifactAction(entry);
  const reference = action?.kind === "file" ? action.reference : entry.reference;
  const url = action?.kind === "url" ? action.url : undefined;
  const imageSource = artifactImageSource(entry, action, reference, url);
  const textPath = reference && isPreviewableTextPath(reference.path) ? reference.path : undefined;
  const kind = artifactPreviewKind({ imageSource, textPath, reference, url });
  const pdfPath = kind === "pdf" && reference ? reference.path : undefined;

  return {
    title: entry.title,
    ...(entry.meta ? { meta: entry.meta } : {}),
    ...(entry.status ? { status: entry.status } : {}),
    kind,
    artifactTypeLabel: artifactTypeLabel(kind),
    ...(reference ? { reference } : {}),
    ...(url ? { url } : {}),
    ...(pdfPath ? { pdfPath } : {}),
    ...(textPath ? { textPath } : {}),
    ...(imageSource ? { imageSource } : {}),
    details: entry.details ?? [],
  };
}

export function artifactPreviewTabId(entry: RailEntry, hostId = "local"): string {
  const preview = projectArtifactPreview(entry);
  const path = preview.reference?.path
    ?? preview.textPath
    ?? preview.pdfPath
    ?? preview.imageSource?.src
    ?? preview.url
    ?? `${entry.id}:${preview.title}`;
  if (preview.url && !preview.reference) return `artifact:url:${encodeURIComponent(path)}`;
  const resolvedHostId = preview.reference?.hostId?.trim() || hostId || "local";
  // codex: open-artifact-side-panel-tab-*.js uses `artifact:${hostId}:${path}`
  // for workspace-file artifacts; URL-only artifacts keep HiCodex's URL scope.
  return `artifact:${resolvedHostId}:${path}`;
}

export function shouldOpenArtifactPreview(entry: RailEntry): boolean {
  return projectArtifactPreview(entry).kind !== "url";
}

export function clipArtifactPreviewText(
  value: string,
  maxLines = 120,
  maxChars = 120_000,
): ArtifactTextPreview {
  const normalizedMaxLines = Math.max(1, Math.floor(maxLines));
  const normalizedMaxChars = Math.max(1, Math.floor(maxChars));
  const lines = value.split(/\r?\n/);
  const visibleLines = lines.slice(0, normalizedMaxLines);
  let text = visibleLines.join("\n");
  let truncatedLineCount = Math.max(0, lines.length - visibleLines.length);
  let truncatedCharCount = 0;

  if (text.length > normalizedMaxChars) {
    truncatedCharCount = text.length - normalizedMaxChars;
    text = text.slice(0, normalizedMaxChars);
    truncatedLineCount += Math.max(0, lines.length - text.split(/\r?\n/).length);
  }

  return {
    text,
    truncatedLineCount,
    truncatedCharCount,
  };
}

export function isArtifactPreviewTooLarge(
  metadata: ArtifactFileMetadata | null | undefined,
  maxBytes = ARTIFACT_PREVIEW_MAX_BYTES,
): boolean {
  return Boolean(metadata?.isFile && metadata.sizeBytes != null && metadata.sizeBytes > maxBytes);
}

export function formatArtifactFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function isPreviewableImagePath(value: string): boolean {
  return IMAGE_EXTENSIONS.has(pathExtension(value));
}

export function isPreviewableTextPath(value: string): boolean {
  const extension = pathExtension(value);
  return MARKDOWN_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension);
}

function artifactPreviewKind(input: {
  imageSource?: ArtifactImageSource;
  textPath?: string;
  reference?: RailEntryReference;
  url?: string;
}): ArtifactPreviewKind {
  if (input.imageSource) return "image";
  if (input.reference) {
    const extension = pathExtension(input.reference.path);
    if (PDF_EXTENSIONS.has(extension)) return "pdf";
    if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
    if (NOTEBOOK_EXTENSIONS.has(extension)) return "notebook";
    if (DOCUMENT_EXTENSIONS.has(extension)) return "document";
    if (PRESENTATION_EXTENSIONS.has(extension)) return "presentation";
    if (SPREADSHEET_EXTENSIONS.has(extension)) return "spreadsheet";
  }
  if (input.textPath && isMarkdownPath(input.textPath)) return "markdown";
  if (input.textPath) return "text";
  if (input.reference) {
    return "file";
  }
  return input.url ? "url" : "file";
}

function artifactTypeLabel(kind: ArtifactPreviewKind): string {
  switch (kind) {
    case "document":
      return "Document";
    case "file":
      return "File";
    case "image":
      return "Image";
    case "markdown":
      return "Markdown";
    case "notebook":
      return "Notebook";
    case "pdf":
      return "PDF";
    case "presentation":
      return "Presentation";
    case "spreadsheet":
      return "Spreadsheet";
    case "text":
      return "Text";
    case "url":
      return "URL";
  }
}

function artifactImageSource(
  entry: RailEntry,
  action: RailEntryAction | undefined,
  reference: RailEntryReference | undefined,
  url: string | undefined,
): ArtifactImageSource | undefined {
  if (url && isPreviewableImageUrl(url)) return { kind: "url", src: url };
  if (reference && isPreviewableImagePath(reference.path)) return { kind: "file", src: reference.path };
  if (entry.meta && isPreviewableImageUrl(entry.meta)) return { kind: "url", src: entry.meta };
  if (entry.meta && isPreviewableImagePath(entry.meta)) return { kind: "file", src: entry.meta };
  if (action?.kind === "file" && isPreviewableImagePath(action.reference.path)) {
    return { kind: "file", src: action.reference.path };
  }
  return undefined;
}

function artifactAction(entry: RailEntry): RailEntryAction | undefined {
  return entry.action ?? (entry.reference ? { kind: "file", reference: entry.reference } : undefined);
}

function isMarkdownPath(value: string): boolean {
  return MARKDOWN_EXTENSIONS.has(pathExtension(value));
}

function isPreviewableImageUrl(value: string): boolean {
  if (/^data:image\//i.test(value)) return true;
  if (/^blob:/i.test(value)) return true;
  if (!/^(?:https?|file):/i.test(value)) return false;
  return isPreviewableImagePath(urlPathname(value));
}

function urlPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

function pathExtension(value: string): string {
  const pathname = urlPathname(value).split(/[?#]/, 1)[0] ?? "";
  const basename = pathname.split("/").filter(Boolean).pop() ?? "";
  const index = basename.lastIndexOf(".");
  return index >= 0 ? basename.slice(index + 1).toLowerCase() : "";
}
