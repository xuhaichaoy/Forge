import { ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { useForgeIntl } from "./i18n-provider";
import {
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ReactNode } from "react";
import {
  basename,
} from "./file-preview-helpers";
import {
  projectArtifactPreview,
} from "../state/artifact-preview";
import {
  FilePreviewPanelBody,
  type FilePreviewSource,
} from "./file-preview-panel-body";
import {
  fileReferenceDisplayPath,
  fileReferenceLineLabel,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";

/*
 * Forge's equivalent of Codex Desktop's AppShell RightPanel
 * (`app-shell-*.js`) while hosting FilePreviewPage. The summary
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

export interface FileReferencePreviewTabProps {
  path: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  hostId?: string | null;
  workspaceRoot?: string | null;
  cwd?: string | null;
  refreshKey?: number | null;
}

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
  const { formatMessage } = useForgeIntl();
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
              aria-label={formatMessage({ id: "hc.filePreview.openExternal", defaultMessage: "Open external" })}
              className="hc-file-preview-panel-icon-button"
              onClick={openExternal}
              title={formatMessage({ id: "hc.filePreview.openExternal", defaultMessage: "Open external" })}
              type="button"
            >
              <ExternalLink size={14} />
            </button>
          )}
          <button
            aria-label={resize.fullWidth
              ? formatMessage({ id: "codex.rightPanel.restoreWidth", defaultMessage: "Restore panel width" })
              : formatMessage({ id: "codex.rightPanel.expandFullWidth", defaultMessage: "Expand panel" })}
            aria-pressed={resize.fullWidth}
            className="hc-file-preview-panel-icon-button"
            onClick={resize.onToggleFullWidth}
            title={resize.fullWidth
              ? formatMessage({ id: "codex.rightPanel.restoreWidth", defaultMessage: "Restore panel width" })
              : formatMessage({ id: "codex.rightPanel.expandFullWidth", defaultMessage: "Expand panel" })}
            type="button"
          >
            {resize.fullWidth ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            aria-label={formatMessage({ id: "hc.filePreview.closePreview", defaultMessage: "Close preview" })}
            className="hc-file-preview-panel-icon-button"
            onClick={onClose}
            title={formatMessage({ id: "hc.filePreview.closePreview", defaultMessage: "Close preview" })}
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

export function FileReferencePreviewTab({
  path,
  lineStart = 1,
  lineEnd = lineStart,
  hostId: _hostId = null,
  workspaceRoot,
  cwd,
  refreshKey = 0,
}: FileReferencePreviewTabProps): ReactNode {
  const source = useMemo<FilePreviewSource>(() => {
    const start = normalizePositiveLine(lineStart) ?? 1;
    const end = Math.max(start, normalizePositiveLine(lineEnd) ?? start);
    const reference = { path, lineStart: start, lineEnd: end };
    return {
      key: `reference:${reference.path}:${reference.lineStart}:${reference.lineEnd}:${refreshKey ?? 0}`,
      title: basename(reference.path),
      path: reference.path,
      displayPath: fileReferenceDisplayPath(reference.path),
      lineLabel: fileReferenceLineLabel(reference),
      kind: "reference",
      reference,
    };
  }, [lineEnd, lineStart, path, refreshKey]);

  return (
    <div className="hc-file-preview-tab" data-file-preview-tab-path={path}>
      <FilePreviewPanelBody
        key={source.key}
        cwd={cwd}
        source={source}
        workspaceRoot={workspaceRoot}
      />
    </div>
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

function normalizePositiveLine(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
