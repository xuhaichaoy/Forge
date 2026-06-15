import { useEffect, useState } from "react";
import { DocumentPreviewContent } from "./document-preview-content";
import { useForgeIntl } from "./i18n-provider";
import { projectSpreadsheetPreviewView } from "../state/spreadsheet-viewer";
import type {
  DocumentPreview,
  SpreadsheetPreview,
} from "../lib/tauri-host";

export type TextPreviewState =
  | { status: "idle"; text: string }
  | { status: "loading"; text: string }
  | { status: "ready"; text: string; truncatedLineCount: number; truncatedCharCount: number }
  | { status: "error"; text: string };

export type SpreadsheetPreviewState =
  | { status: "idle"; preview: null }
  | { status: "loading"; preview: null }
  | { status: "ready"; preview: SpreadsheetPreview }
  | { status: "error"; preview: null; message: string };

export type DocumentPreviewState =
  | { status: "idle"; preview: null }
  | { status: "loading"; preview: null }
  | { status: "ready"; preview: DocumentPreview }
  | { status: "error"; preview: null; message: string };

export type ArtifactPreviewStatusState =
  | { status: "error"; message: string }
  | { status: "loading"; message: string }
  | { status: "too-large"; message: string };

export function ArtifactPreviewStateView({
  state,
}: {
  state: ArtifactPreviewStatusState;
}) {
  return (
    <div className="hc-artifact-preview-state" data-status={state.status}>
      {state.message}
    </div>
  );
}

export function ArtifactPdfPreviewFrame({ src, title }: { src: string; title: string }) {
  const { formatMessage } = useForgeIntl();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  return (
    <div className="hc-artifact-preview-pdf-frame">
      {status === "loading" && (
        <ArtifactPreviewStateView state={{ status: "loading", message: formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" }) }} />
      )}
      {status === "error" && (
        <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />
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

export function ArtifactTextPreviewView({ preview }: { preview: TextPreviewState }) {
  const { formatMessage } = useForgeIntl();
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" }) }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />;
  }
  return (
    <div className="hc-artifact-preview-text-wrap">
      <pre className="hc-artifact-preview-text">{preview.text}</pre>
      {(preview.truncatedLineCount > 0 || preview.truncatedCharCount > 0) && (
        <div className="hc-artifact-preview-truncation">
          {formatMessage({ id: "hc.artifact.previewTruncated", defaultMessage: "Preview truncated" })}
          {preview.truncatedLineCount > 0 ? formatMessage({ id: "hc.artifact.truncatedByLines", defaultMessage: " by {count} line(s)" }, { count: preview.truncatedLineCount }) : ""}
          {preview.truncatedCharCount > 0 ? formatMessage({ id: "hc.artifact.truncatedAndChars", defaultMessage: " and {count} character(s)" }, { count: preview.truncatedCharCount }) : ""}
        </div>
      )}
    </div>
  );
}

export function ArtifactSpreadsheetPreviewView({ preview }: { preview: SpreadsheetPreviewState }) {
  const { formatMessage } = useForgeIntl();
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" }) }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />;
  }
  const rows = preview.preview.rows;
  if (rows.length === 0) {
    return <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />;
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
          {formatMessage({ id: "hc.artifact.previewTruncated", defaultMessage: "Preview truncated" })}
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

export function ArtifactDocumentPreviewView({ preview }: { preview: DocumentPreviewState }) {
  const { formatMessage } = useForgeIntl();
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return <ArtifactPreviewStateView state={{ status: "loading", message: formatMessage({ id: "artifactTab.previewLoading", defaultMessage: "Preparing preview…" }) }} />;
  }
  if (preview.status === "error") {
    return <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />;
  }
  if (preview.preview.paragraphs.length === 0) {
    return <ArtifactPreviewStateView state={{ status: "error", message: formatMessage({ id: "artifactTab.previewError", defaultMessage: "Couldn’t load this preview" }) }} />;
  }
  return (
    <div className="hc-artifact-preview-text-wrap">
      <DocumentPreviewContent
        className="hc-artifact-preview-document"
        paragraphClassName="hc-artifact-preview-document-paragraph"
        preview={preview.preview}
        truncationClassName="hc-artifact-preview-truncation"
        truncatedMessageId="hc.artifact.previewTruncated"
        truncationPlacement="after"
      />
    </div>
  );
}
