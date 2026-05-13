import { ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ReactNode } from "react";
import { CodeSnippet } from "./code-snippet";
import {
  ARTIFACT_PREVIEW_MAX_BYTES,
  clipArtifactPreviewText,
  formatArtifactFileSize,
  isArtifactPreviewTooLarge,
  projectArtifactPreview,
} from "../state/artifact-preview";
import {
  fileReferenceDisplayPath,
  fileReferenceLineLabel,
  resolveFileReferencePathCandidates,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import {
  convertLocalFileSrc,
  readDocumentPreview,
  readFileMetadata,
  readTextFile,
  type DocumentPreview,
  type LocalFileMetadata,
} from "../lib/tauri-host";

const FILE_PREVIEW_READ_MAX_BYTES = 240_000;

/*
 * HiCodex's equivalent of Codex Desktop's AppShell RightPanel (`vn` at
 * `app-shell.formatted.js:518`) while hosting FilePreviewPage. The summary
 * rail stays fixed-size; this panel is the large resizable file preview.
 */
export interface FilePreviewPanelResizeAffordance {
  widthPx: number;
  fullWidth: boolean;
  isResizing: boolean;
  onResizeStart: (
    event: { clientX: number; pointerId?: number },
    asideElement: HTMLElement | null,
  ) => void;
  onResetWidth: () => void;
  onToggleFullWidth: () => void;
}

export interface FilePreviewPanelProps {
  artifactPreview: RailEntry | null;
  artifactPreviewNonce?: number;
  fileReference: FileReferenceSelection | null;
  workspaceRoot?: string | null;
  cwd?: string | null;
  resize: FilePreviewPanelResizeAffordance;
  onCloseArtifactPreview: () => void;
  onCloseFileReference: () => void;
  onOpenArtifactFileExternal?: (reference: RailEntryReference) => void;
  onOpenFileReferenceExternal: (reference: FileReferenceSelection) => void;
  onOpenUrl?: (url: string) => void;
}

interface FilePreviewSource {
  key: string;
  title: string;
  path: string;
  displayPath: string;
  lineLabel?: string;
  kind: "artifact" | "reference";
  reference?: RailEntryReference | FileReferenceSelection;
  imageUrl?: string;
  url?: string;
}

type FilePreviewLoadState =
  | { status: "loading" }
  | { status: "ready"; path: string; text: string; language: string; truncatedLineCount: number; truncatedCharCount: number; metadata: LocalFileMetadata }
  | { status: "document"; path: string; preview: DocumentPreview; metadata: LocalFileMetadata }
  | { status: "image"; path: string; src: string; metadata: LocalFileMetadata | null }
  | { status: "binary"; message: string; metadata: LocalFileMetadata | null }
  | { status: "error"; message: string };

export function FilePreviewPanel({
  artifactPreview,
  artifactPreviewNonce = 0,
  fileReference,
  workspaceRoot,
  cwd,
  resize,
  onCloseArtifactPreview,
  onCloseFileReference,
  onOpenArtifactFileExternal,
  onOpenFileReferenceExternal,
  onOpenUrl,
}: FilePreviewPanelProps): ReactNode {
  const asideRef = useRef<HTMLElement | null>(null);
  const previewSource = usePreviewSource({
    artifactPreview,
    artifactPreviewNonce,
    fileReference,
  });

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture on synthetic events; resizing still works.
    }
    resize.onResizeStart(event, asideRef.current);
  }, [resize]);

  const handleResizeClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.detail === 2) {
      event.preventDefault();
      resize.onResetWidth();
    }
  }, [resize]);

  if (!previewSource) return null;

  const inlineStyle: CSSProperties = {
    width: resize.fullWidth ? "100%" : `${resize.widthPx}px`,
  };
  const onClose = previewSource.kind === "artifact" ? onCloseArtifactPreview : onCloseFileReference;
  const canOpenExternal = previewSource.url
    ? Boolean(onOpenUrl)
    : previewSource.kind === "artifact"
      ? Boolean(previewSource.reference && onOpenArtifactFileExternal)
      : Boolean(previewSource.reference);
  const openExternal = () => {
    if (previewSource.url) {
      onOpenUrl?.(previewSource.url);
      return;
    }
    if (!previewSource.reference) return;
    if (previewSource.kind === "artifact") {
      onOpenArtifactFileExternal?.(previewSource.reference as RailEntryReference);
      return;
    }
    onOpenFileReferenceExternal(previewSource.reference as FileReferenceSelection);
  };

  return (
    <aside
      ref={asideRef}
      className="hc-file-preview-panel"
      data-full-width={resize.fullWidth ? "true" : undefined}
      data-resizing={resize.isResizing ? "true" : undefined}
      style={inlineStyle}
    >
      {!resize.fullWidth && (
        <div
          aria-hidden
          className="hc-file-preview-panel-resize-handle"
          data-resizing={resize.isResizing ? "true" : undefined}
          onClick={handleResizeClick}
          onPointerDown={handleResizePointerDown}
        >
          <div className="hc-file-preview-panel-resize-handle-line" aria-hidden />
        </div>
      )}
      <div className="hc-file-preview-panel-chrome">
        <div className="hc-file-preview-panel-title">
          <span title={previewSource.title}>{previewSource.title}</span>
          <small title={previewSource.path}>{previewSource.displayPath}</small>
        </div>
        <div className="hc-file-preview-panel-actions">
          {canOpenExternal && (
            <button
              aria-label="Open external"
              className="hc-file-preview-panel-icon-button"
              onClick={openExternal}
              title="Open external"
              type="button"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            aria-label={resize.fullWidth ? "Restore panel width" : "Expand panel"}
            aria-pressed={resize.fullWidth}
            className="hc-file-preview-panel-icon-button"
            onClick={resize.onToggleFullWidth}
            title={resize.fullWidth ? "Restore panel width" : "Expand panel"}
            type="button"
          >
            {resize.fullWidth ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            aria-label="Close preview"
            className="hc-file-preview-panel-icon-button"
            onClick={onClose}
            title="Close preview"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <FilePreviewPanelBody
        key={previewSource.key}
        cwd={cwd}
        source={previewSource}
        workspaceRoot={workspaceRoot}
      />
    </aside>
  );
}

function usePreviewSource({
  artifactPreview,
  artifactPreviewNonce,
  fileReference,
}: {
  artifactPreview: RailEntry | null;
  artifactPreviewNonce: number;
  fileReference: FileReferenceSelection | null;
}): FilePreviewSource | null {
  return useMemo(() => {
    if (artifactPreview) {
      const preview = projectArtifactPreview(artifactPreview);
      const fileImagePath = preview.imageSource?.kind === "file" ? preview.imageSource.src : "";
      const path = preview.reference?.path ?? preview.textPath ?? preview.pdfPath ?? fileImagePath;
      const imageUrl = preview.imageSource?.kind === "url" ? preview.imageSource.src : undefined;
      const url = !path && preview.url ? preview.url : undefined;
      if (!path && !imageUrl && !url) return null;
      return {
        key: `artifact:${artifactPreview.id}:${artifactPreviewNonce}:${path || imageUrl || url}`,
        title: preview.title,
        path: path || imageUrl || url || preview.title,
        displayPath: path ? fileReferenceDisplayPath(path) : preview.artifactTypeLabel,
        kind: "artifact",
        ...(preview.reference ? { reference: preview.reference } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(url ? { url } : {}),
      };
    }

    if (!fileReference) return null;
    return {
      key: `reference:${fileReference.path}:${fileReference.lineStart}:${fileReference.lineEnd}`,
      title: basename(fileReference.path),
      path: fileReference.path,
      displayPath: fileReferenceDisplayPath(fileReference.path),
      lineLabel: fileReferenceLineLabel(fileReference),
      kind: "reference",
      reference: fileReference,
    };
  }, [artifactPreview, artifactPreviewNonce, fileReference]);
}

function FilePreviewPanelBody({
  cwd,
  source,
  workspaceRoot,
}: {
  cwd?: string | null;
  source: FilePreviewSource;
  workspaceRoot?: string | null;
}) {
  const [state, setState] = useState<FilePreviewLoadState>({ status: "loading" });

  useEffect(() => {
    if (source.imageUrl) {
      setState({ status: "image", path: source.imageUrl, src: source.imageUrl, metadata: null });
      return;
    }
    if (source.url && /^https?:\/\//i.test(source.url)) {
      setState({ status: "binary", message: "Preview opens externally", metadata: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const candidates = resolveFileReferencePathCandidates(source.path, { workspaceRoot, cwd });
    readFirstAvailableMetadata(candidates)
      .then(async ({ path, metadata }) => {
        if (cancelled) return;
        if (!metadata.isFile) {
          setState({ status: "error", message: "Couldn't load this preview" });
          return;
        }
        if (isArtifactPreviewTooLarge(metadata)) {
          setState({
            status: "binary",
            message: `This file is too large to preview in the side panel (${formatArtifactFileSize(ARTIFACT_PREVIEW_MAX_BYTES)} limit)`,
            metadata,
          });
          return;
        }
        if (isImagePath(path, metadata)) {
          setState({ status: "image", path, src: localFileSrc(path), metadata });
          return;
        }
        if (isPdfPath(path, metadata)) {
          setState({ status: "binary", message: "Binary file not shown", metadata });
          return;
        }
        if (isDocumentPath(path, metadata)) {
          try {
            const preview = await readDocumentPreview(path, 160, 1_000);
            if (!cancelled) setState({ status: "document", path, preview, metadata });
          } catch {
            if (!cancelled) {
              setState({ status: "binary", message: "Binary file not shown", metadata });
            }
          }
          return;
        }
        if (isKnownBinaryDocumentPath(path, metadata)) {
          setState({ status: "binary", message: "Binary file not shown", metadata });
          return;
        }
        try {
          const text = await readTextFile(path, FILE_PREVIEW_READ_MAX_BYTES);
          if (cancelled) return;
          const clipped = clipArtifactPreviewText(text, 500, FILE_PREVIEW_READ_MAX_BYTES);
          setState({
            status: "ready",
            path,
            text: clipped.text.replace(/\r\n/g, "\n"),
            language: languageFromPath(path),
            truncatedLineCount: clipped.truncatedLineCount,
            truncatedCharCount: clipped.truncatedCharCount,
            metadata,
          });
        } catch {
          if (!cancelled) {
            setState({ status: "binary", message: "Binary file not shown", metadata });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Couldn't load this preview" });
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, source.imageUrl, source.path, source.url, workspaceRoot]);

  return (
    <div className="hc-file-preview-panel-body">
      {source.lineLabel && <div className="hc-file-preview-line-label">{source.lineLabel}</div>}
      <FilePreviewStateView state={state} />
    </div>
  );
}

function FilePreviewStateView({ state }: { state: FilePreviewLoadState }) {
  if (state.status === "loading") {
    return <div className="hc-file-preview-empty">Preparing preview...</div>;
  }
  if (state.status === "error" || state.status === "binary") {
    return <div className="hc-file-preview-empty">{state.message}</div>;
  }
  if (state.status === "image") {
    return (
      <div className="hc-file-preview-image-view">
        <img alt="" src={state.src} />
      </div>
    );
  }
  if (state.status === "document") {
    return <DocumentPreviewView preview={state.preview} />;
  }
  return (
    <div className="hc-file-preview-code-view">
      <CodeSnippet
        codeClassName="hc-file-preview-code"
        codeContainerClassName="hc-file-preview-code-container"
        language={state.language}
        showActionBar={false}
        text={state.text}
        wrapperClassName="hc-file-preview-code-snippet"
        wrapMode="always"
      />
      {(state.truncatedLineCount > 0 || state.truncatedCharCount > 0) && (
        <div className="hc-file-preview-truncation">Preview truncated</div>
      )}
    </div>
  );
}

function DocumentPreviewView({ preview }: { preview: DocumentPreview }) {
  if (preview.paragraphs.length === 0) {
    return <div className="hc-file-preview-empty">Couldn't load this preview</div>;
  }
  return (
    <div className="hc-file-preview-document-view">
      {preview.paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
      {preview.truncated && <div className="hc-file-preview-truncation">Preview truncated</div>}
    </div>
  );
}

async function readFirstAvailableMetadata(
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

function localFileSrc(path: string): string {
  try {
    return convertLocalFileSrc(path);
  } catch {
    return `file://${encodeURI(path)}`;
  }
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function pathExtension(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const name = basename(pathname);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function languageFromPath(path: string): string {
  const extension = pathExtension(path);
  if (extension === "md" || extension === "markdown" || extension === "mdx") return "markdown";
  if (extension === "mjs" || extension === "cjs" || extension === "jsx") return "js";
  if (extension === "tsx") return "tsx";
  if (extension === "ts") return "ts";
  if (extension === "yml") return "yaml";
  return extension || "text";
}

function isPdfPath(path: string, metadata: LocalFileMetadata): boolean {
  return pathExtension(path) === "pdf" || metadata.mimeType === "application/pdf";
}

function isDocumentPath(path: string, metadata: LocalFileMetadata): boolean {
  const extension = pathExtension(path);
  return extension === "docx"
    || extension === "doc"
    || metadata.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || metadata.mimeType === "application/msword";
}

function isKnownBinaryDocumentPath(path: string, metadata: LocalFileMetadata): boolean {
  const extension = pathExtension(path);
  if (["ppt", "pptx", "xls", "xlsx"].includes(extension)) return true;
  return metadata.mimeType === "application/vnd.ms-excel"
    || metadata.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || metadata.mimeType === "application/vnd.ms-powerpoint"
    || metadata.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

function isImagePath(path: string, metadata: LocalFileMetadata): boolean {
  if (metadata.mimeType?.startsWith("image/")) return true;
  return new Set(["avif", "bmp", "gif", "heic", "heif", "jpg", "jpeg", "png", "svg", "tif", "tiff", "webp"])
    .has(pathExtension(path));
}
