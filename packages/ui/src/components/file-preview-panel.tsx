import { Copy, ExternalLink, Eye, EyeOff, FileText, Maximize2, Minimize2, MoreHorizontal, RefreshCw, WrapText, X } from "lucide-react";
import { useForgeIntl } from "./i18n-provider";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ReactNode } from "react";
import {
  basename,
  shouldShowSourceWordWrapControl,
} from "./file-preview-helpers";
import {
  projectArtifactPreview,
  type ArtifactPreviewKind,
} from "../state/artifact-preview";
import {
  FilePreviewPanelBody,
  type FilePreviewSource,
} from "./file-preview-panel-body";
import type { FileReference } from "./file-reference-types";
import {
  fileReferenceDisplayPath,
  fileReferenceLineLabel,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import { ContextMenu, type ContextMenuItem } from "./context-menu";

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
  artifactType?: ArtifactPreviewKind | null;
  artifactCitation?: FileReference["artifactCitation"] | null;
  workspaceRoot?: string | null;
  cwd?: string | null;
  refreshKey?: number | null;
  sourceChanged?: boolean | null;
  onOpenFile?: () => void;
  onCopyPath?: () => void;
  onCopyContents?: () => void;
  onOpenArtifactPreview?: () => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onRefreshSource?: () => void;
  tabState?: unknown;
  setTabState?: (next: unknown | ((prev: unknown) => unknown)) => void;
}

interface FileReferencePreviewTabState {
  richPreview?: boolean;
  wordWrap?: boolean;
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
  const [optionsMenu, setOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [wordWrap, setWordWrap] = useState(true);
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
  const optionsLabel = formatMessage({
    id: "review.fileSource.options",
    defaultMessage: "File viewer options",
    description: "Aria label for the workspace file preview options menu",
  });
  const optionsItems: ContextMenuItem[] = [];
  if (canOpenExternal) {
    optionsItems.push({
      id: "open-file",
      icon: previewSource.url ? <ExternalLink size={14} /> : <FileText size={14} />,
      label: previewSource.url
        ? formatMessage({ id: "hc.filePreview.openExternal", defaultMessage: "Open external" })
        : formatMessage({ id: "markdown.fileReference.viewFile", defaultMessage: "Open file" }),
      onSelect: openExternal,
    });
  }
  if (!previewSource.url) {
    const showWordWrapControl = shouldShowSourceWordWrapControl(previewSource.path, true);
    if (optionsItems.length > 0) optionsItems.push({ id: "open-separator", separator: true });
    optionsItems.push({
      id: "copy-path",
      icon: <Copy size={14} />,
      label: formatMessage({ id: "review.fileSource.copyPath", defaultMessage: "Copy path" }),
      onSelect: () => {
        void navigator.clipboard?.writeText(previewSource.path);
      },
    });
    if (showWordWrapControl) {
      optionsItems.push({
        id: "word-wrap",
        icon: <WrapText size={14} />,
        label: wordWrap
          ? formatMessage({
              id: "review.fileSource.wrap.disable",
              defaultMessage: "Disable word wrap",
              description: "Menu item to disable word wrap in a workspace file preview",
            })
          : formatMessage({
              id: "review.fileSource.wrap.enable",
              defaultMessage: "Enable word wrap",
              description: "Menu item to enable word wrap in a workspace file preview",
        }),
        onSelect: () => setWordWrap((value) => !value),
      });
    }
  }

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
          {optionsItems.length > 0 && (
            <button
              aria-label={optionsLabel}
              aria-haspopup="menu"
              aria-expanded={optionsMenu ? "true" : "false"}
              className="hc-file-preview-panel-icon-button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setOptionsMenu({ x: rect.right, y: rect.bottom + 4 });
              }}
              title={optionsLabel}
              type="button"
            >
              <MoreHorizontal size={14} />
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
        wordWrap={wordWrap}
        workspaceRoot={workspaceRoot}
      />
      {optionsMenu && (
        <ContextMenu
          items={optionsItems}
          x={optionsMenu.x}
          y={optionsMenu.y}
          onClose={() => setOptionsMenu(null)}
        />
      )}
    </aside>
  );
}

export function FileReferencePreviewTab({
  path,
  lineStart = 1,
  lineEnd = lineStart,
  hostId: _hostId = null,
  artifactType: _artifactType = null,
  artifactCitation: _artifactCitation = null,
  workspaceRoot,
  cwd,
  refreshKey = 0,
  sourceChanged = false,
  onOpenFile,
  onCopyPath,
  onCopyContents,
  onOpenArtifactPreview,
  onOpenFileReference,
  onRefreshSource,
  tabState,
  setTabState,
}: FileReferencePreviewTabProps): ReactNode {
  const { formatMessage } = useForgeIntl();
  const [localWordWrap, setLocalWordWrap] = useState(true);
  const [localRichPreview, setLocalRichPreview] = useState(true);
  const [optionsMenu, setOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const previewTabState = readFileReferencePreviewTabState(tabState);
  const tabWordWrap = previewTabState.wordWrap;
  const tabRichPreview = previewTabState.richPreview;
  const wordWrap = setTabState ? tabWordWrap !== false : localWordWrap;
  const richPreview = setTabState ? tabRichPreview !== false : localRichPreview;
  const showWordWrapControl = shouldShowSourceWordWrapControl(path, richPreview);
  const setPreviewWordWrap = useCallback((next: boolean) => {
    if (setTabState) {
      setTabState((prev: unknown) => ({
        ...readFileReferencePreviewTabState(prev),
        wordWrap: next,
      }));
      return;
    }
    setLocalWordWrap(next);
  }, [setTabState]);
  const setPreviewRichPreview = useCallback((next: boolean) => {
    if (setTabState) {
      setTabState((prev: unknown) => ({
        ...readFileReferencePreviewTabState(prev),
        richPreview: next,
      }));
      return;
    }
    setLocalRichPreview(next);
  }, [setTabState]);
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
  const optionsLabel = formatMessage({
    id: "review.fileSource.options",
    defaultMessage: "File viewer options",
    description: "Aria label for the workspace file preview options menu",
  });
  const breadcrumbLabel = formatMessage({
    id: "review.fileSource.breadcrumb.ariaLabel",
    defaultMessage: "File path",
    description: "Aria label for the workspace file preview breadcrumb",
  });
  const breadcrumbParts = fileSourceBreadcrumbParts(path);
  const optionsItems: ContextMenuItem[] = [];
  if (onCopyPath) {
    optionsItems.push({
      id: "copy-path",
      icon: <Copy size={14} />,
      label: formatMessage({
        id: "review.fileSource.copyPath",
        defaultMessage: "Copy path",
        description: "Menu item to copy the path of a workspace file preview",
      }),
      onSelect: onCopyPath,
    });
  }
  if (onCopyContents) {
    optionsItems.push({
      id: "copy-contents",
      icon: <Copy size={14} />,
      label: formatMessage({
        id: "review.fileSource.copyFileContents",
        defaultMessage: "Copy file contents",
        description: "Menu item to copy the contents of a workspace file preview",
      }),
      onSelect: onCopyContents,
    });
  }
  if (onOpenArtifactPreview) {
    optionsItems.push({
      id: "artifact-rich-preview",
      icon: <Eye size={14} />,
      label: formatMessage({
        id: "review.fileSource.richPreview.enable",
        defaultMessage: "Enable rich view",
        description: "Menu item to enable rich rendering for a workspace file preview",
      }),
      onSelect: onOpenArtifactPreview,
    });
  }
  if (isMarkdownPreviewPath(path)) {
    optionsItems.push({
      id: "rich-preview",
      icon: richPreview ? <EyeOff size={14} /> : <Eye size={14} />,
      label: richPreview
        ? formatMessage({
            id: "review.fileSource.richPreview.disable",
            defaultMessage: "Disable rich view",
            description: "Menu item to disable rich rendering for a workspace file preview",
          })
        : formatMessage({
            id: "review.fileSource.richPreview.enable",
            defaultMessage: "Enable rich view",
            description: "Menu item to enable rich rendering for a workspace file preview",
          }),
      onSelect: () => setPreviewRichPreview(!richPreview),
    });
  }
  if (showWordWrapControl) {
    optionsItems.push({
      id: "word-wrap",
      icon: <WrapText size={14} />,
      label: wordWrap
        ? formatMessage({
            id: "review.fileSource.wrap.disable",
            defaultMessage: "Disable word wrap",
            description: "Menu item to disable word wrap in a workspace file preview",
          })
        : formatMessage({
            id: "review.fileSource.wrap.enable",
            defaultMessage: "Enable word wrap",
            description: "Menu item to enable word wrap in a workspace file preview",
          }),
      onSelect: () => setPreviewWordWrap(!wordWrap),
    });
  }

  return (
    <div className="hc-file-preview-tab" data-file-preview-tab-path={path}>
      <div className="hc-file-preview-tab-header" data-tab-preview-pin-exempt="true">
        <nav
          aria-label={breadcrumbLabel}
          className="hc-file-preview-tab-breadcrumb"
          title={path}
        >
          {breadcrumbParts.map((part, index) => (
            <span
              className={`hc-file-preview-tab-breadcrumb-part${index === 0 && part === "/" ? " is-root" : ""}`}
              key={`${part}:${index}`}
            >
              {part}
            </span>
          ))}
        </nav>
        <div className="hc-file-preview-tab-actions">
          {onOpenFile && (
            <button
              aria-label={formatMessage({
                id: "markdown.fileReference.viewFile",
                defaultMessage: "Open file",
                description: "Menu item to open a referenced workspace file",
              })}
              className="hc-file-preview-panel-icon-button"
              onClick={onOpenFile}
              title={formatMessage({
                id: "markdown.fileReference.viewFile",
                defaultMessage: "Open file",
                description: "Menu item to open a referenced workspace file",
              })}
              type="button"
            >
              <FileText size={14} />
            </button>
          )}
          <button
            aria-label={optionsLabel}
            aria-haspopup="menu"
            aria-expanded={optionsMenu ? "true" : "false"}
            className="hc-file-preview-panel-icon-button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setOptionsMenu({ x: rect.right, y: rect.bottom + 4 });
            }}
            title={optionsLabel}
            type="button"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
      <FilePreviewPanelBody
        key={source.key}
        cwd={cwd}
        onOpenFileReference={onOpenFileReference}
        richPreview={richPreview}
        source={source}
        wordWrap={wordWrap}
        workspaceRoot={workspaceRoot}
      />
      {sourceChanged && (
        <div className="hc-file-preview-refresh-prompt">
          <button
            aria-label={formatMessage({
              id: "artifactTab.refreshForLatest",
              defaultMessage: "Refresh for latest",
              description: "Accessible label for refreshing a file or artifact preview after the source changed",
            })}
            type="button"
            onClick={onRefreshSource}
          >
            <RefreshCw size={14} />
            <span>
              {formatMessage({
                id: "artifactTab.refreshForLatest",
                defaultMessage: "Refresh for latest",
                description: "Button label for refreshing a file or artifact preview after the source changed",
              })}
            </span>
          </button>
        </div>
      )}
      {optionsMenu && (
        <ContextMenu
          items={optionsItems}
          x={optionsMenu.x}
          y={optionsMenu.y}
          onClose={() => setOptionsMenu(null)}
        />
      )}
    </div>
  );
}

function readFileReferencePreviewTabState(value: unknown): FileReferencePreviewTabState {
  return value && typeof value === "object" ? value as FileReferencePreviewTabState : {};
}

function isMarkdownPreviewPath(path: string): boolean {
  return /\.(?:md|markdown|mdx)(?:[?#].*)?$/i.test(path);
}

export function fileSourceBreadcrumbParts(path: string): string[] {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (normalized.startsWith("/")) return parts.length > 0 ? ["/", ...parts] : ["/"];
  return parts.length > 0 ? parts : [path];
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
