import { ChevronDown, ExternalLink, FileText, FolderOpen, ImageIcon, LinkIcon, MoreHorizontal, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ArtifactDocumentPreviewView,
  ArtifactPdfPreviewFrame,
  ArtifactPreviewStateView,
  ArtifactSpreadsheetPreviewView,
  ArtifactTextPreviewView,
  type DocumentPreviewState,
  type SpreadsheetPreviewState,
  type TextPreviewState,
} from "./artifact-preview-views";
import {
  artifactPreviewState,
  isWordDocumentPath,
  resolveArtifactLocalPath,
  type MetadataPreviewState,
} from "./artifact-preview-panel-model";
import { ImagePreviewLightbox } from "./image-preview-lightbox";
import { ContextMenu, type ContextMenuItem } from "./context-menu";
import { useForgeIntl } from "./i18n-provider";
import {
  localFileSrc,
  readFirstAvailableMetadata,
} from "./file-preview-helpers";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import {
  clipArtifactPreviewText,
  formatArtifactFileSize,
  isArtifactPreviewTooLarge,
  projectArtifactPreview,
} from "../state/artifact-preview";
import {
  readDocumentPreview,
  readSpreadsheetPreview,
  readTextFile,
} from "../lib/tauri-host";
import { resolveFileReferencePathCandidates } from "../state/file-references";

export interface ArtifactPreviewPanelProps {
  entry: RailEntry;
  hostId?: string | null;
  workspaceRoot?: string | null;
  cwd?: string | null;
  refreshKey?: number | null;
  sourceChanged?: boolean | null;
  onClose: () => void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenFileExternal?: (reference: RailEntryReference) => void;
  onRevealFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onRefreshSource?: () => void;
}

interface ToolbarMenuAnchor {
  x: number;
  y: number;
}

const TOOLBAR_MENU_WIDTH_PX = 180;

export function ArtifactPreviewPanel({
  entry,
  hostId: _hostId = null,
  workspaceRoot,
  cwd,
  refreshKey = 0,
  sourceChanged = false,
  onClose,
  onOpenFileReference,
  onOpenFileExternal,
  onRevealFileReference,
  onOpenUrl,
  onRefreshSource,
}: ArtifactPreviewPanelProps) {
  const { formatMessage } = useForgeIntl();
  const preview = useMemo(() => projectArtifactPreview(entry), [entry]);
  const [textPreview, setTextPreview] = useState<TextPreviewState>({ status: "idle", text: "" });
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreviewState>({ status: "idle", preview: null });
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState>({ status: "idle", preview: null });
  const [metadataPreview, setMetadataPreview] = useState<MetadataPreviewState>({ status: "idle", metadata: null });
  const [resolvedReferencePath, setResolvedReferencePath] = useState("");
  const [sourceOptionsMenu, setSourceOptionsMenu] = useState<ToolbarMenuAnchor | null>(null);
  const [openOptionsMenu, setOpenOptionsMenu] = useState<ToolbarMenuAnchor | null>(null);
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
   * panel (full layout/runs/comments). Forge renders a plain-text
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
  }, [preferredReferencePath, referencePathCandidates, refreshKey]);

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
  }, [metadataReadyForPreview, preview.kind, refreshKey, resolvedTextPath]);

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
  }, [metadataReadyForPreview, refreshKey, resolvedDocumentPath]);

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
  }, [metadataReadyForPreview, refreshKey, resolvedSpreadsheetPath]);

  const previewState = artifactPreviewState(formatMessage, metadataPreview, tooLarge, resolvedReference != null);
  const hasInlinePreview = Boolean(
    imageSrc || pdfSrc || resolvedTextPath || resolvedSpreadsheetPath || resolvedDocumentPath,
  );
  const showUnavailablePreview = !previewState && !hasInlinePreview && preview.kind !== "url";
  const sourceOptionsLabel = formatMessage({
    id: "artifactTab.sourceOptions",
    defaultMessage: "Artifact viewer options",
  });
  const openLabel = formatMessage({ id: "artifactTab.preview.open", defaultMessage: "Open" });
  const openOptionsLabel = formatMessage({ id: "artifactTab.preview.openOptions", defaultMessage: "Open options" });
  const sourceOptionsItems: ContextMenuItem[] = resolvedReference && onOpenFileReference ? [
    {
      id: "view-source",
      icon: <FileText size={14} />,
      label: formatMessage({ id: "artifactTab.sourceOptions.viewSource", defaultMessage: "View source" }),
      onSelect: () => onOpenFileReference(resolvedReference),
    },
  ] : [];
  const openOptionsItems: ContextMenuItem[] = resolvedReference && onRevealFileReference ? [
    {
      id: "open-in-folder",
      icon: <FolderOpen size={14} />,
      label: formatMessage({ id: "artifactTab.preview.openInFolder", defaultMessage: "Open in folder" }),
      onSelect: () => onRevealFileReference(resolvedReference),
    },
  ] : [];
  const showSourceOptions = sourceOptionsItems.length > 0;
  const showOpenOptions = openOptionsItems.length > 0;
  const openToolbarMenu = (
    event: MouseEvent<HTMLButtonElement>,
    setMenu: (anchor: ToolbarMenuAnchor | null) => void,
    closeOtherMenu: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    closeOtherMenu();
    setMenu(toolbarMenuAnchor(event.currentTarget));
  };

  return (
    <section className="hc-artifact-preview-panel" aria-label={formatMessage({ id: "hc.artifact.panelLabel", defaultMessage: "Artifact preview" })}>
      <div className="hc-artifact-preview-header">
        <div className="hc-artifact-preview-heading">
          {artifactIcon(preview.kind)}
          <div className="hc-artifact-preview-heading-text">
            <h2 title={preview.title}>{preview.title}</h2>
            <span>{preview.artifactTypeLabel}</span>
          </div>
        </div>
        <div className="hc-artifact-preview-header-actions">
          {showSourceOptions && (
            <button
              aria-label={sourceOptionsLabel}
              className="hc-artifact-preview-icon-button"
              title={sourceOptionsLabel}
              type="button"
              onClick={(event) => openToolbarMenu(event, setSourceOptionsMenu, () => setOpenOptionsMenu(null))}
            >
              <MoreHorizontal size={14} />
            </button>
          )}
          {resolvedReference && onOpenFileExternal && (
            <div className={showOpenOptions ? "hc-artifact-preview-open-split" : undefined}>
              <button
                aria-label={openLabel}
                className="hc-artifact-preview-open-button"
                title={openLabel}
                type="button"
                onClick={() => onOpenFileExternal(resolvedReference)}
              >
                <FolderOpen size={14} />
                <span>{openLabel}</span>
              </button>
              {showOpenOptions && (
                <button
                  aria-label={openOptionsLabel}
                  className="hc-artifact-preview-open-options-button"
                  title={openOptionsLabel}
                  type="button"
                  onClick={(event) => openToolbarMenu(event, setOpenOptionsMenu, () => setSourceOptionsMenu(null))}
                >
                  <ChevronDown size={14} />
                </button>
              )}
            </div>
          )}
          {resolvedReference && !onOpenFileExternal && showOpenOptions && (
            <button
              aria-label={openOptionsLabel}
              className="hc-artifact-preview-icon-button"
              title={openOptionsLabel}
              type="button"
              onClick={(event) => openToolbarMenu(event, setOpenOptionsMenu, () => setSourceOptionsMenu(null))}
            >
              <MoreHorizontal size={14} />
            </button>
          )}
          {preview.url && /^https?:\/\//i.test(preview.url) && onOpenUrl && (
            <button
              aria-label={formatMessage({ id: "hc.artifact.openUrl", defaultMessage: "Open URL" })}
              className="hc-artifact-preview-icon-button"
              title={formatMessage({ id: "hc.artifact.openUrl", defaultMessage: "Open URL" })}
              type="button"
              onClick={() => onOpenUrl(preview.url!)}
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            aria-label={formatMessage({ id: "hc.artifact.closeLabel", defaultMessage: "Close artifact preview" })}
            className="hc-artifact-preview-icon-button"
            title={formatMessage({ id: "hc.artifact.closeTooltip", defaultMessage: "Close preview" })}
            type="button"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {sourceOptionsMenu && (
        <ContextMenu
          items={sourceOptionsItems}
          x={sourceOptionsMenu.x}
          y={sourceOptionsMenu.y}
          onClose={() => setSourceOptionsMenu(null)}
        />
      )}
      {openOptionsMenu && (
        <ContextMenu
          items={openOptionsItems}
          x={openOptionsMenu.x}
          y={openOptionsMenu.y}
          onClose={() => setOpenOptionsMenu(null)}
        />
      )}

      <div className="hc-artifact-preview-body">
        {preview.meta && <div className="hc-artifact-preview-meta" title={preview.meta}>{preview.meta}</div>}
        {preview.status && <div className="hc-artifact-preview-status">{preview.status}</div>}
        {fileSizeText && <div className="hc-artifact-preview-meta">{fileSizeText}</div>}
      </div>

      {previewState && <ArtifactPreviewStateView state={previewState} />}

      {sourceChanged && (
        <div className="hc-artifact-preview-refresh-prompt">
          <button
            aria-label={formatMessage({
              id: "artifactTab.refreshForLatest",
              defaultMessage: "Refresh for latest",
              description: "Accessible label for refreshing an artifact preview after the source changed",
            })}
            type="button"
            onClick={onRefreshSource}
          >
            <RefreshCw size={14} />
            <span>
              {formatMessage({
                id: "artifactTab.refreshForLatest",
                defaultMessage: "Refresh for latest",
                description: "Button label for refreshing an artifact preview after the source changed",
              })}
            </span>
          </button>
        </div>
      )}

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
        <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />
      )}

      {preview.details.length > 0 && (
        <ul className="hc-artifact-preview-details">
          {preview.details.slice(0, 8).map((detail, index) => (
            <li key={`${index}:${detail}`}>{detail}</li>
          ))}
          {preview.details.length > 8 && (
            <li>{formatMessage({ id: "hc.artifact.moreDetails", defaultMessage: "{count} more detail(s)" }, { count: preview.details.length - 8 })}</li>
          )}
        </ul>
      )}
    </section>
  );
}

function artifactIcon(kind: ReturnType<typeof projectArtifactPreview>["kind"]) {
  if (kind === "image") return <ImageIcon size={15} />;
  if (kind === "url") return <LinkIcon size={15} />;
  return <FileText size={15} />;
}

function toolbarMenuAnchor(trigger: HTMLElement): ToolbarMenuAnchor {
  const rect = trigger.getBoundingClientRect();
  return {
    x: Math.max(8, rect.right - TOOLBAR_MENU_WIDTH_PX),
    y: rect.bottom + 4,
  };
}
