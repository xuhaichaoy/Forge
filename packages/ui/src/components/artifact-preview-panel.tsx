import { ExternalLink, FileText, FolderOpen, ImageIcon, LinkIcon, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ImagePreviewLightbox } from "./image-preview-lightbox";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import {
  ARTIFACT_PREVIEW_MAX_BYTES,
  clipArtifactPreviewText,
  formatArtifactFileSize,
  isArtifactPreviewTooLarge,
  projectArtifactPreview,
} from "../state/artifact-preview";
import { projectSpreadsheetPreviewView } from "../state/spreadsheet-viewer";
import {
  convertLocalFileSrc,
  readDocumentPreview,
  readFileMetadata,
  readSpreadsheetPreview,
  readTextFile,
  type DocumentPreview,
  type LocalFileMetadata,
  type SpreadsheetPreview,
} from "../lib/tauri-host";
import { resolveFileReferencePathCandidates } from "../state/file-references";

export interface ArtifactPreviewPanelProps {
  entry: RailEntry;
  workspaceRoot?: string | null;
  cwd?: string | null;
  onClose: () => void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenFileExternal?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
}

type TextPreviewState =
  | { status: "idle"; text: string }
  | { status: "loading"; text: string }
  | { status: "ready"; text: string; truncatedLineCount: number; truncatedCharCount: number }
  | { status: "error"; text: string };

type MetadataPreviewState =
  | { status: "idle"; metadata: null; message?: undefined }
  | { status: "loading"; metadata: null; message?: undefined }
  | { status: "ready"; metadata: LocalFileMetadata; message?: undefined }
  | { status: "error"; metadata: null; message: string };

type SpreadsheetPreviewState =
  | { status: "idle"; preview: null }
  | { status: "loading"; preview: null }
  | { status: "ready"; preview: SpreadsheetPreview }
  | { status: "error"; preview: null; message: string };

type DocumentPreviewState =
  | { status: "idle"; preview: null }
  | { status: "loading"; preview: null }
  | { status: "ready"; preview: DocumentPreview }
  | { status: "error"; preview: null; message: string };

export function ArtifactPreviewPanel({
  entry,
  workspaceRoot,
  cwd,
  onClose,
  onOpenFileReference,
  onOpenFileExternal,
  onOpenUrl,
}: ArtifactPreviewPanelProps) {
  const preview = useMemo(() => projectArtifactPreview(entry), [entry]);
  const [textPreview, setTextPreview] = useState<TextPreviewState>({ status: "idle", text: "" });
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreviewState>({ status: "idle", preview: null });
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState>({ status: "idle", preview: null });
  const [metadataPreview, setMetadataPreview] = useState<MetadataPreviewState>({ status: "idle", metadata: null });
  const [resolvedReferencePath, setResolvedReferencePath] = useState("");
  const referencePath = preview.reference?.path ?? "";
  const referencePathCandidates = useMemo(
    () => resolveFileReferencePathCandidates(referencePath, { workspaceRoot, cwd }),
    [cwd, referencePath, workspaceRoot],
  );
  const preferredReferencePath = referencePathCandidates[0] ?? referencePath;
  const effectiveReferencePath = resolvedReferencePath || preferredReferencePath;
  const resolvedReference = preview.reference && effectiveReferencePath
    ? { ...preview.reference, path: effectiveReferencePath }
    : preview.reference;
  const metadata = metadataPreview.status === "ready" ? metadataPreview.metadata : null;
  const tooLarge = isArtifactPreviewTooLarge(metadata);
  const resolvedTextPath = resolveArtifactLocalPath(preview.textPath, {
    referencePath,
    resolvedReferencePath: effectiveReferencePath,
    workspaceRoot,
    cwd,
  });
  const resolvedPdfPath = resolveArtifactLocalPath(preview.pdfPath, {
    referencePath,
    resolvedReferencePath: effectiveReferencePath,
    workspaceRoot,
    cwd,
  });
  const resolvedImagePath = preview.imageSource?.kind === "file"
    ? resolveArtifactLocalPath(preview.imageSource.src, {
      referencePath,
      resolvedReferencePath: effectiveReferencePath,
      workspaceRoot,
      cwd,
    })
    : "";
  const metadataReadyForPreview = !resolvedReference
    || (metadataPreview.status === "ready" && metadataPreview.metadata.isFile && !tooLarge);
  const resolvedSpreadsheetPath = preview.kind === "spreadsheet" && resolvedReference
    ? effectiveReferencePath
    : "";
  /*
   * Codex Desktop renders docx artifacts in its `docx-preview-panel-*.js`
   * panel (full layout/runs/comments). HiCodex renders a plain-text
   * paragraph preview via the new `host_read_document_preview` Tauri command
   * (apps/desktop/src-tauri/src/document_preview.rs) — same approach we use
   * for xlsx, just over `word/document.xml` instead of `xl/worksheets/*`.
   */
  const resolvedDocumentPath = preview.kind === "document" && resolvedReference
    && isWordDocumentPath(effectiveReferencePath)
    ? effectiveReferencePath
    : "";
  const imageSrc = preview.imageSource && (preview.imageSource.kind !== "file" || metadataReadyForPreview)
    ? preview.imageSource.kind === "file" ? localFileSrc(resolvedImagePath || preview.imageSource.src) : preview.imageSource.src
    : "";
  const pdfSrc = resolvedPdfPath && metadataReadyForPreview ? localFileSrc(resolvedPdfPath) : "";
  const fileSizeText = metadata?.sizeBytes != null ? formatArtifactFileSize(metadata.sizeBytes) : "";

  useEffect(() => {
    if (referencePathCandidates.length === 0) {
      setResolvedReferencePath("");
      setMetadataPreview({ status: "idle", metadata: null });
      return;
    }

    let cancelled = false;
    setResolvedReferencePath(preferredReferencePath);
    setMetadataPreview({ status: "loading", metadata: null });
    readFirstAvailableMetadata(referencePathCandidates)
      .then(({ metadata: nextMetadata, path }) => {
        if (cancelled) return;
        setResolvedReferencePath(path);
        setMetadataPreview({ status: "ready", metadata: nextMetadata });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMetadataPreview({
          status: "error",
          metadata: null,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [preferredReferencePath, referencePathCandidates]);

  useEffect(() => {
    if (!resolvedTextPath || preview.kind === "spreadsheet" || !metadataReadyForPreview) {
      setTextPreview({ status: "idle", text: "" });
      return;
    }

    let cancelled = false;
    setTextPreview({ status: "loading", text: "" });
    readTextFile(resolvedTextPath, 120_000)
      .then((text) => {
        if (cancelled) return;
        const clipped = clipArtifactPreviewText(text);
        setTextPreview({
          status: "ready",
          text: clipped.text,
          truncatedLineCount: clipped.truncatedLineCount,
          truncatedCharCount: clipped.truncatedCharCount,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTextPreview({
          status: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [metadataReadyForPreview, preview.kind, resolvedTextPath]);

  useEffect(() => {
    if (!resolvedDocumentPath || !metadataReadyForPreview) {
      setDocumentPreview({ status: "idle", preview: null });
      return;
    }

    let cancelled = false;
    setDocumentPreview({ status: "loading", preview: null });
    readDocumentPreview(resolvedDocumentPath, 80, 400)
      .then((nextPreview) => {
        if (cancelled) return;
        setDocumentPreview({ status: "ready", preview: nextPreview });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDocumentPreview({
          status: "error",
          preview: null,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [metadataReadyForPreview, resolvedDocumentPath]);

  useEffect(() => {
    if (!resolvedSpreadsheetPath || !metadataReadyForPreview) {
      setSpreadsheetPreview({ status: "idle", preview: null });
      return;
    }

    let cancelled = false;
    setSpreadsheetPreview({ status: "loading", preview: null });
    readSpreadsheetPreview(resolvedSpreadsheetPath, 80, 24)
      .then((nextPreview) => {
        if (cancelled) return;
        setSpreadsheetPreview({ status: "ready", preview: nextPreview });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSpreadsheetPreview({
          status: "error",
          preview: null,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [metadataReadyForPreview, resolvedSpreadsheetPath]);

  const previewState = artifactPreviewState(metadataPreview, tooLarge, resolvedReference != null);
  const hasInlinePreview = Boolean(
    imageSrc || pdfSrc || resolvedTextPath || resolvedSpreadsheetPath || resolvedDocumentPath,
  );
  const showUnavailablePreview = !previewState && !hasInlinePreview && preview.kind !== "url";

  return (
    <section className="hc-artifact-preview-panel" aria-label="Artifact preview">
      <div className="hc-artifact-preview-header">
        <div className="hc-artifact-preview-heading">
          {artifactIcon(preview.kind)}
          <div className="hc-artifact-preview-heading-text">
            <h2 title={preview.title}>{preview.title}</h2>
            <span>{preview.artifactTypeLabel}</span>
          </div>
        </div>
        <div className="hc-artifact-preview-header-actions">
          {resolvedReference && onOpenFileReference && (
            <button
              aria-label="View source"
              className="hc-artifact-preview-icon-button"
              title="View source"
              type="button"
              onClick={() => onOpenFileReference(resolvedReference)}
            >
              <FileText size={14} />
            </button>
          )}
          {resolvedReference && onOpenFileExternal && (
            <button
              aria-label="Open"
              className="hc-artifact-preview-open-button"
              title="Open"
              type="button"
              onClick={() => onOpenFileExternal(resolvedReference)}
            >
              <FolderOpen size={14} />
              <span>Open</span>
            </button>
          )}
          {preview.url && /^https?:\/\//i.test(preview.url) && onOpenUrl && (
            <button
              aria-label="Open URL"
              className="hc-artifact-preview-icon-button"
              title="Open URL"
              type="button"
              onClick={() => onOpenUrl(preview.url!)}
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            aria-label="Close artifact preview"
            className="hc-artifact-preview-icon-button"
            title="Close preview"
            type="button"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="hc-artifact-preview-body">
        {preview.meta && <div className="hc-artifact-preview-meta" title={preview.meta}>{preview.meta}</div>}
        {preview.status && <div className="hc-artifact-preview-status">{preview.status}</div>}
        {fileSizeText && <div className="hc-artifact-preview-meta">{fileSizeText}</div>}
      </div>

      {previewState && <ArtifactPreviewStateView state={previewState} />}

      {imageSrc && (
        <ImagePreviewLightbox
          alt={preview.title}
          frameClassName="hc-artifact-preview-image-frame"
          imageClassName="hc-artifact-preview-image"
          src={imageSrc}
          title={preview.title}
        />
      )}

      {pdfSrc && <ArtifactPdfPreviewFrame src={pdfSrc} title={preview.title} />}

      {resolvedSpreadsheetPath && <ArtifactSpreadsheetPreviewView preview={spreadsheetPreview} />}

      {resolvedDocumentPath && <ArtifactDocumentPreviewView preview={documentPreview} />}

      {resolvedTextPath && <ArtifactTextPreviewView preview={textPreview} />}

      {showUnavailablePreview && (
        <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />
      )}

      {preview.details.length > 0 && (
        <ul className="hc-artifact-preview-details">
          {preview.details.slice(0, 8).map((detail, index) => (
            <li key={`${index}:${detail}`}>{detail}</li>
          ))}
          {preview.details.length > 8 && (
            <li>{preview.details.length - 8} more detail(s)</li>
          )}
        </ul>
      )}
    </section>
  );
}

function ArtifactPreviewStateView({
  state,
}: {
  state:
    | { status: "error"; message: string }
    | { status: "loading"; message: string }
    | { status: "too-large"; message: string };
}) {
  return (
    <div className="hc-artifact-preview-state" data-status={state.status}>
      {state.message}
    </div>
  );
}

function ArtifactPdfPreviewFrame({ src, title }: { src: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  return (
    <div className="hc-artifact-preview-pdf-frame">
      {status === "loading" && (
        <ArtifactPreviewStateView state={{ status: "loading", message: "Preparing preview…" }} />
      )}
      {status === "error" && (
        <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />
      )}
      <iframe
        className="hc-artifact-preview-pdf"
        src={src}
        title={title}
        onError={() => setStatus("error")}
        onLoad={() => setStatus("ready")}
      />
    </div>
  );
}

function ArtifactTextPreviewView({ preview }: { preview: TextPreviewState }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: "Preparing preview…" }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />;
  }
  return (
    <div className="hc-artifact-preview-text-wrap">
      <pre className="hc-artifact-preview-text">{preview.text}</pre>
      {(preview.truncatedLineCount > 0 || preview.truncatedCharCount > 0) && (
        <div className="hc-artifact-preview-truncation">
          Preview truncated
          {preview.truncatedLineCount > 0 ? ` by ${preview.truncatedLineCount} line(s)` : ""}
          {preview.truncatedCharCount > 0 ? ` and ${preview.truncatedCharCount} character(s)` : ""}
        </div>
      )}
    </div>
  );
}

function ArtifactSpreadsheetPreviewView({ preview }: { preview: SpreadsheetPreviewState }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: "Preparing preview…" }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />;
  }
  const rows = preview.preview.rows;
  if (rows.length === 0) {
    return <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />;
  }
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const view = projectSpreadsheetPreviewView(preview.preview);
  return (
    <div className="hc-artifact-preview-sheet-wrap">
      <div className="hc-artifact-preview-sheet-meta">
        <strong>{view.sheetLabel}</strong>
        <span>{view.sampleLabel}</span>
      </div>
      <table className="hc-artifact-preview-sheet">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columnCount }, (_, colIndex) => (
                <td key={colIndex}>{row[colIndex] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {preview.preview.truncated && (
        <div className="hc-artifact-preview-truncation">
          Preview truncated
        </div>
      )}
      <div className="hc-artifact-preview-boundary">{view.boundary}</div>
      {view.details.length > 0 && (
        <ul className="hc-artifact-preview-sheet-details">
          {view.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArtifactDocumentPreviewView({ preview }: { preview: DocumentPreviewState }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: "Preparing preview…" }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />;
  }
  const paragraphs = preview.preview.paragraphs;
  if (paragraphs.length === 0) {
    return <ArtifactPreviewStateView state={{ status: "error", message: "Couldn't load this preview" }} />;
  }
  return (
    <div className="hc-artifact-preview-text-wrap">
      <div className="hc-artifact-preview-document">
        {paragraphs.map((paragraph, index) => (
          <p className="hc-artifact-preview-document-paragraph" key={index}>{paragraph}</p>
        ))}
      </div>
      {preview.preview.truncated && (
        <div className="hc-artifact-preview-truncation">Preview truncated</div>
      )}
    </div>
  );
}

function artifactPreviewState(
  metadataPreview: MetadataPreviewState,
  tooLarge: boolean,
  hasReference: boolean,
): { status: "error" | "loading" | "too-large"; message: string } | null {
  if (!hasReference) return null;
  if (metadataPreview.status === "idle" || metadataPreview.status === "loading") {
    return { status: "loading", message: "Preparing preview…" };
  }
  if (metadataPreview.status === "error") {
    return { status: "error", message: "Couldn't load this preview" };
  }
  if (metadataPreview.status === "ready" && !metadataPreview.metadata.isFile) {
    return { status: "error", message: "Couldn't load this preview" };
  }
  if (tooLarge) {
    return {
      status: "too-large",
      message: `This file is too large to preview in the side panel (${formatArtifactFileSize(ARTIFACT_PREVIEW_MAX_BYTES)} limit)`,
    };
  }
  return null;
}

function artifactIcon(kind: ReturnType<typeof projectArtifactPreview>["kind"]) {
  if (kind === "image") return <ImageIcon size={15} />;
  if (kind === "url") return <LinkIcon size={15} />;
  return <FileText size={15} />;
}

function localFileSrc(path: string): string {
  try {
    return convertLocalFileSrc(path);
  } catch {
    return `file://${encodeURI(path)}`;
  }
}

function resolveArtifactLocalPath(
  path: string | undefined,
  input: {
    referencePath: string;
    resolvedReferencePath: string;
    workspaceRoot?: string | null;
    cwd?: string | null;
  },
): string {
  if (!path) return "";
  if (input.resolvedReferencePath && path === input.referencePath) {
    return input.resolvedReferencePath;
  }
  return resolveFileReferencePathCandidates(path, {
    workspaceRoot: input.workspaceRoot,
    cwd: input.cwd,
  })[0] ?? path;
}

function isWordDocumentPath(path: string): boolean {
  return /\.(?:doc|docx)$/i.test(path.split(/[?#]/, 1)[0] ?? "");
}

async function readFirstAvailableMetadata(
  candidates: string[],
): Promise<{ path: string; metadata: LocalFileMetadata }> {
  let lastError: unknown = new Error("No preview path candidates were available.");
  let firstReadable: { path: string; metadata: LocalFileMetadata } | null = null;
  for (const path of candidates) {
    try {
      const metadata = await readFileMetadata(path);
      if (metadata.isFile) {
        return { path, metadata };
      }
      if (!firstReadable) {
        firstReadable = { path, metadata };
      }
    } catch (error: unknown) {
      lastError = error;
    }
  }
  if (firstReadable) {
    return firstReadable;
  }
  throw lastError;
}
