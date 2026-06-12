import { useEffect, useState } from "react";
import { CodeSnippet } from "./code-snippet";
import { DocumentPreviewContent } from "./document-preview-content";
import {
  FILE_PREVIEW_READ_MAX_BYTES,
  basename,
  decodeBase64ToArrayBuffer,
  getSpreadsheetImportKind,
  isDocumentPath,
  isImagePath,
  isKnownBinaryDocumentPath,
  isPdfPath,
  languageFromPath,
  localFileSrc,
  readFirstAvailableMetadata,
} from "./file-preview-helpers";
import { ImagePreviewLightbox } from "./image-preview-lightbox";
import { useHiCodexIntl } from "./i18n-provider";
import { SpreadsheetPreview, type SpreadsheetPreviewKind } from "./spreadsheet-preview";
import {
  clipArtifactPreviewText,
  isArtifactPreviewTooLarge,
} from "../state/artifact-preview";
import {
  resolveFileReferencePathCandidates,
  type FileReferenceSelection,
} from "../state/file-references";
import type { RailEntryReference } from "../state/render-groups";
import {
  readDocumentPreview,
  readFileBytesBase64,
  readTextFile,
  type DocumentPreview,
  type LocalFileMetadata,
} from "../lib/tauri-host";

export interface FilePreviewSource {
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
  // CODEX-REF: open-workspace-file-*.js - xlsx/xlsm/csv/tsv state for the
  // SheetJS-backed simplified preview (no formula recalc, no charts).
  | { status: "spreadsheet"; path: string; data: ArrayBuffer; importKind: SpreadsheetPreviewKind; metadata: LocalFileMetadata }
  | { status: "binary"; message: string; metadata: LocalFileMetadata | null }
  | { status: "error"; message: string };

export function FilePreviewPanelBody({
  cwd,
  source,
  workspaceRoot,
}: {
  cwd?: string | null;
  source: FilePreviewSource;
  workspaceRoot?: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [state, setState] = useState<FilePreviewLoadState>({ status: "loading" });

  useEffect(() => {
    if (source.imageUrl) {
      setState({ status: "image", path: source.imageUrl, src: source.imageUrl, metadata: null });
      return;
    }
    if (source.url && /^https?:\/\//i.test(source.url)) {
      setState({
        status: "binary",
        message: formatMessage({ id: "hc.filePreview.opensExternally", defaultMessage: "Preview opens externally" }),
        metadata: null,
      });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const candidates = resolveFileReferencePathCandidates(source.path, { workspaceRoot, cwd });
    readFirstAvailableMetadata(candidates)
      .then(async ({ path, metadata }) => {
        if (cancelled) return;
        if (!metadata.isFile) {
          setState({
            status: "error",
            message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }),
          });
          return;
        }
        if (isArtifactPreviewTooLarge(metadata)) {
          setState({
            status: "binary",
            message: formatMessage({
              id: "artifactTab.previewTooLarge",
              defaultMessage: "This file is too large to preview in the side panel",
            }),
            metadata,
          });
          return;
        }
        if (isImagePath(path, metadata)) {
          setState({ status: "image", path, src: localFileSrc(path), metadata });
          return;
        }
        if (isPdfPath(path, metadata)) {
          setState({ status: "binary", message: formatMessage({ id: "wham.diff.binaryFile", defaultMessage: "Binary file not shown" }), metadata });
          return;
        }
        if (isDocumentPath(path, metadata)) {
          try {
            const preview = await readDocumentPreview(path, 160, 1_000);
            if (!cancelled) setState({ status: "document", path, preview, metadata });
          } catch {
            if (!cancelled) {
              setState({ status: "binary", message: formatMessage({ id: "wham.diff.binaryFile", defaultMessage: "Binary file not shown" }), metadata });
            }
          }
          return;
        }
        // CODEX-REF: open-workspace-file-*.js - xlsx/xlsm/csv/tsv route.
        // Codex Desktop renders these in the Popcorn Workbook component; the
        // HiCodex simplified version pulls bytes via host_read_file_bytes_base64
        // and lets SheetJS in the renderer do the parsing. This branch sits
        // before the generic binary fallback so xlsx no longer shows the
        // "Binary file not shown" placeholder.
        const spreadsheetImportKind = getSpreadsheetImportKind(path);
        if (spreadsheetImportKind) {
          try {
            const base64 = await readFileBytesBase64(path);
            if (cancelled) return;
            const data = decodeBase64ToArrayBuffer(base64);
            setState({
              status: "spreadsheet",
              path,
              data,
              importKind: spreadsheetImportKind,
              metadata,
            });
          } catch {
            if (!cancelled) {
              setState({ status: "binary", message: formatMessage({ id: "wham.diff.binaryFile", defaultMessage: "Binary file not shown" }), metadata });
            }
          }
          return;
        }
        if (isKnownBinaryDocumentPath(path, metadata)) {
          setState({ status: "binary", message: formatMessage({ id: "wham.diff.binaryFile", defaultMessage: "Binary file not shown" }), metadata });
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
            setState({ status: "binary", message: formatMessage({ id: "wham.diff.binaryFile", defaultMessage: "Binary file not shown" }), metadata });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, formatMessage, source.imageUrl, source.path, source.url, workspaceRoot]);

  return (
    <div className="hc-file-preview-panel-body">
      {source.lineLabel && <div className="hc-file-preview-line-label">{source.lineLabel}</div>}
      <FilePreviewStateView cwd={cwd} state={state} workspaceRoot={workspaceRoot} />
    </div>
  );
}

function FilePreviewStateView({
  cwd,
  state,
  workspaceRoot,
}: {
  cwd?: string | null;
  state: FilePreviewLoadState;
  workspaceRoot?: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (state.status === "loading") {
    return (
      <div className="hc-file-preview-empty">
        {formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" })}
      </div>
    );
  }
  if (state.status === "error" || state.status === "binary") {
    return <div className="hc-file-preview-empty">{state.message}</div>;
  }
  if (state.status === "image") {
    return (
      <ImagePreviewLightbox
        alt={formatMessage({ id: "codex.diffView.imagePreviewAlt", defaultMessage: "Image preview" })}
        frameClassName="hc-file-preview-image-view"
        src={state.src}
        title={basename(state.path)}
      />
    );
  }
  if (state.status === "document") {
    return <DocumentPreviewView preview={state.preview} />;
  }
  if (state.status === "spreadsheet") {
    // CODEX-REF: open-workspace-file-*.js - simplified SheetJS render path.
    return (
      <SpreadsheetPreview
        className="hc-file-preview-spreadsheet"
        data={state.data}
        importKind={state.importKind}
      />
    );
  }
  // codex artifact-tab-content renders EVERY file (incl. .diff/.patch) through one
  // shiki highlight path - no special diff viewer. CodeSnippet supports the shiki
  // `diff` grammar, so a .diff file renders as highlighted diff text just like Codex
  // (we deliberately do NOT special-case it into a diff viewer).
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
        <div className="hc-file-preview-truncation">
          {formatMessage({ id: "hc.filePreview.previewTruncated", defaultMessage: "Preview truncated" })}
        </div>
      )}
    </div>
  );
}

function DocumentPreviewView({ preview }: { preview: DocumentPreview }) {
  return (
    <DocumentPreviewContent
      className="hc-file-preview-document-view"
      emptyClassName="hc-file-preview-empty"
      preview={preview}
      truncationClassName="hc-file-preview-truncation"
      truncatedMessageId="hc.filePreview.previewTruncated"
    />
  );
}
