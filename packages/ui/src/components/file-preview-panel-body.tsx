import { useCallback, useEffect, useMemo, useState } from "react";
import { CodeSnippet } from "./code-snippet";
import { ArtifactPdfPreviewFrame } from "./artifact-preview-views";
import { DocumentPreviewContent } from "./document-preview-content";
import {
  FILE_PREVIEW_READ_MAX_BYTES,
  SOURCE_FILE_PREVIEW_MAX_BYTES,
  basename,
  decodeBase64ToArrayBuffer,
  getSpreadsheetImportKind,
  isDocumentPath,
  isImagePath,
  isKnownBinaryDocumentPath,
  isPdfPath,
  isSourceFilePreviewTooLarge,
  languageFromPath,
  localFileSrc,
  readFirstAvailableMetadata,
  unsupportedFilePreviewType,
  type UnsupportedFilePreviewType,
} from "./file-preview-helpers";
import type { FileReference } from "./file-reference-types";
import { ImagePreviewLightbox } from "./image-preview-lightbox";
import { useForgeIntl } from "./i18n-provider";
import { fileReferenceFromLocalHref } from "./message-markdown-links";
import { Markdownish } from "./message-markdown-renderer";
import { SpreadsheetPreview, type SpreadsheetPreviewKind } from "./spreadsheet-preview";
import {
  clipArtifactPreviewText,
} from "../state/artifact-preview";
import {
  parseMarkdownDocument,
  parseMarkdownInline,
  type MarkdownBlock,
  type MarkdownInlineSegment,
  type MarkdownListItemValue,
  type MarkdownReferenceDefinitions,
} from "../state/conversation-markdown-engine";
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
  | { status: "pdf"; path: string; src: string; metadata: LocalFileMetadata }
  // CODEX-REF: open-workspace-file-*.js - xlsx/xlsm/csv/tsv state for the
  // SheetJS-backed simplified preview (no formula recalc, no charts).
  | { status: "spreadsheet"; path: string; data: ArrayBuffer; importKind: SpreadsheetPreviewKind; metadata: LocalFileMetadata }
  | { status: "binary"; message: string; metadata: LocalFileMetadata | null }
  | { status: "tooLarge"; metadata: LocalFileMetadata }
  | { status: "unsupported"; type: UnsupportedFilePreviewType; metadata: LocalFileMetadata | null }
  | { status: "error"; message: string };

export function FilePreviewPanelBody({
  cwd,
  onOpenFileReference,
  source,
  richPreview = true,
  wordWrap = true,
  workspaceRoot,
}: {
  cwd?: string | null;
  onOpenFileReference?: (reference: FileReference) => void;
  richPreview?: boolean;
  source: FilePreviewSource;
  wordWrap?: boolean;
  workspaceRoot?: string | null;
}) {
  const { formatMessage } = useForgeIntl();
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
            message: formatMessage({ id: "review.fileSource.error", defaultMessage: "Unable to load file" }),
          });
          return;
        }
        if (isSourceFilePreviewTooLarge(metadata)) {
          setState({
            status: "tooLarge",
            metadata,
          });
          return;
        }
        if (isImagePath(path, metadata)) {
          setState({ status: "image", path, src: localFileSrc(path), metadata });
          return;
        }
        if (isPdfPath(path, metadata)) {
          setState({ status: "pdf", path, src: localFileSrc(path), metadata });
          return;
        }
        if (isDocumentPath(path, metadata)) {
          try {
            const preview = await readDocumentPreview(path, 160, 1_000);
            if (!cancelled) setState({ status: "document", path, preview, metadata });
          } catch {
            if (!cancelled) {
              setState({ status: "binary", message: formatMessage({ id: "review.fileSource.error", defaultMessage: "Unable to load file" }), metadata });
            }
          }
          return;
        }
        // CODEX-REF: open-workspace-file-*.js - xlsx/xlsm/csv/tsv route.
        // Codex Desktop renders these in the Popcorn Workbook component; the
        // Forge simplified version pulls bytes via host_read_file_bytes_base64
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
              setState({ status: "binary", message: formatMessage({ id: "review.fileSource.error", defaultMessage: "Unable to load file" }), metadata });
            }
          }
          return;
        }
        const unsupportedType = unsupportedFilePreviewType(path, metadata);
        if (unsupportedType) {
          setState({ status: "unsupported", type: unsupportedType, metadata });
          return;
        }
        if (isKnownBinaryDocumentPath(path, metadata)) {
          setState({ status: "unsupported", type: "binary", metadata });
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
            setState({ status: "unsupported", type: "binary", metadata });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            message: formatMessage({ id: "review.fileSource.error", defaultMessage: "Unable to load file" }),
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
      <FilePreviewStateView
        cwd={cwd}
        onOpenFileReference={onOpenFileReference}
        richPreview={richPreview}
        state={state}
        wordWrap={wordWrap}
        workspaceRoot={workspaceRoot}
      />
    </div>
  );
}

function FilePreviewStateView({
  onOpenFileReference,
  state,
  richPreview,
  wordWrap,
}: {
  cwd?: string | null;
  onOpenFileReference?: (reference: FileReference) => void;
  richPreview: boolean;
  state: FilePreviewLoadState;
  wordWrap: boolean;
  workspaceRoot?: string | null;
}) {
  const { formatMessage } = useForgeIntl();
  const sourceMarkdownPath = state.status === "ready" && richPreview && state.language === "markdown"
    ? state.path
    : null;
  const sourceMarkdownText = state.status === "ready" && sourceMarkdownPath ? state.text : "";
  const markdownMediaSources = useMemo(() => {
    if (!sourceMarkdownPath) return undefined;
    const sources = sourceMarkdownMediaSources(sourceMarkdownText, sourceMarkdownPath);
    return sources.size > 0 ? sources : undefined;
  }, [sourceMarkdownPath, sourceMarkdownText]);
  const openSourceMarkdownReference = useCallback((reference: FileReference) => {
    if (!sourceMarkdownPath || !onOpenFileReference) return;
    const resolved = sourceMarkdownFileReference(sourceMarkdownPath, reference.path);
    if (!resolved) return;
    onOpenFileReference({
      ...resolved,
      lineStart: reference.lineStart,
      lineEnd: reference.lineEnd,
    });
  }, [onOpenFileReference, sourceMarkdownPath]);
  if (state.status === "loading") {
    return (
      <div className="hc-file-preview-empty">
        {formatMessage({ id: "review.fileSource.loading", defaultMessage: "Loading file…" })}
      </div>
    );
  }
  if (state.status === "error" || state.status === "binary") {
    return (
      <div className="hc-file-preview-empty">
        <span>{state.message}</span>
      </div>
    );
  }
  if (state.status === "tooLarge") {
    return (
      <div className="hc-file-preview-empty">
        <span>{formatMessage({
          id: "review.fileSource.tooLarge",
          defaultMessage: "File is too large to preview",
        })}</span>
        <small>
          {formatMessage(
            { id: "review.fileSource.tooLargeDetail", defaultMessage: "{size} exceeds the {limit} preview limit" },
            { limit: fileSizeLabel(SOURCE_FILE_PREVIEW_MAX_BYTES), size: fileSizeLabel(state.metadata.sizeBytes ?? 0) },
          )}
        </small>
      </div>
    );
  }
  if (state.status === "unsupported") {
    return (
      <div className="hc-file-preview-empty">
        <span>{unsupportedFilePreviewMessage(formatMessage, state.type)}</span>
        <small>
          {formatMessage({
            id: "review.fileSource.unsupportedDetail",
            defaultMessage: "Open this file outside Codex to view it",
          })}
        </small>
      </div>
    );
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
  if (state.status === "pdf") {
    return <ArtifactPdfPreviewFrame src={state.src} title={basename(state.path)} />;
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
      {richPreview && state.language === "markdown"
        ? (
            <Markdownish
              mediaSources={markdownMediaSources}
              onOpenFileReference={onOpenFileReference ? openSourceMarkdownReference : undefined}
              text={state.text}
            />
          )
        : (
            <CodeSnippet
              codeClassName="hc-file-preview-code"
              codeContainerClassName="hc-file-preview-code-container"
              language={state.language}
              showActionBar={false}
              text={state.text}
              wrapperClassName="hc-file-preview-code-snippet"
              wrapMode={wordWrap ? "always" : "off"}
            />
          )}
      {(state.truncatedLineCount > 0 || state.truncatedCharCount > 0) && (
        <div className="hc-file-preview-truncation">
          {formatMessage({ id: "hc.filePreview.previewTruncated", defaultMessage: "Preview truncated" })}
        </div>
      )}
    </div>
  );
}

export function sourceMarkdownFileReference(sourcePath: string, href: string): FileReference | null {
  const reference = fileReferenceFromLocalHref(href);
  if (!reference) return null;
  return {
    ...reference,
    path: resolveSourceMarkdownPath(sourcePath, reference.path),
  };
}

export function sourceMarkdownMediaSources(text: string, sourcePath: string): Map<string, string> {
  const document = parseMarkdownDocument(text);
  const sourceHrefs = new Set<string>();
  for (const block of document.blocks) {
    collectMarkdownBlockImageSources(block, document.references, sourceHrefs);
  }
  const mediaSources = new Map<string, string>();
  for (const href of sourceHrefs) {
    const reference = sourceMarkdownFileReference(sourcePath, href);
    if (reference) mediaSources.set(href, localFileSrc(reference.path));
  }
  return mediaSources;
}

function collectMarkdownBlockImageSources(
  block: MarkdownBlock,
  references: MarkdownReferenceDefinitions,
  output: Set<string>,
): void {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      collectMarkdownInlineImageSources(block.text, references, output);
      return;
    case "blockquote":
      if (block.children) {
        for (const child of block.children) collectMarkdownBlockImageSources(child, references, output);
      } else {
        collectMarkdownInlineImageSources(block.text, references, output);
      }
      return;
    case "details": {
      collectMarkdownInlineImageSources(block.summary, references, output);
      const document = parseMarkdownDocument(block.text);
      for (const child of document.blocks) collectMarkdownBlockImageSources(child, document.references, output);
      return;
    }
    case "list":
      for (const item of block.items) collectMarkdownListItemImageSources(item, references, output);
      return;
    case "taskList":
      for (const item of block.items) collectMarkdownInlineImageSources(item.text, references, output);
      return;
    case "table":
      for (const cell of [...block.headers, ...block.rows.flat()]) {
        collectMarkdownInlineImageSources(cell, references, output);
      }
      return;
    case "image":
      output.add(block.src);
      return;
    case "imageGrid":
      for (const image of block.images) output.add(image.src);
      return;
    case "code":
    case "hr":
    case "math":
      return;
  }
}

function collectMarkdownInlineImageSources(
  text: string,
  references: MarkdownReferenceDefinitions,
  output: Set<string>,
): void {
  for (const segment of parseMarkdownInline(text, { references })) {
    collectMarkdownInlineSegmentImageSources(segment, references, output);
  }
}

function collectMarkdownInlineSegmentImageSources(
  segment: MarkdownInlineSegment,
  references: MarkdownReferenceDefinitions,
  output: Set<string>,
): void {
  switch (segment.kind) {
    case "image":
      output.add(segment.src);
      return;
    case "strong":
    case "em":
    case "del":
    case "htmlSpan":
      collectMarkdownInlineImageSources(segment.text, references, output);
      return;
    default:
      return;
  }
}

function collectMarkdownListItemImageSources(
  item: MarkdownListItemValue,
  references: MarkdownReferenceDefinitions,
  output: Set<string>,
): void {
  if (typeof item === "string") {
    collectMarkdownInlineImageSources(item, references, output);
    return;
  }
  collectMarkdownInlineImageSources(item.text, references, output);
  for (const child of item.children ?? []) collectMarkdownBlockImageSources(child, references, output);
}

function resolveSourceMarkdownPath(sourcePath: string, referencePath: string): string {
  const normalizedReference = referencePath.replace(/\\/g, "/");
  if (isAbsoluteSourcePath(normalizedReference)) return normalizeSourcePath(normalizedReference);
  const sourceDir = sourceDirectoryPath(sourcePath);
  if (!sourceDir) return normalizeSourcePath(normalizedReference);
  return normalizeSourcePath(`${sourceDir.replace(/\/$/, "")}/${normalizedReference}`);
}

function sourceDirectoryPath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return "";
  if (lastSlash === 0) return "/";
  return normalized.slice(0, lastSlash);
}

function isAbsoluteSourcePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function normalizeSourcePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const drive = normalized.match(/^[A-Za-z]:/)?.[0] ?? "";
  const rest = drive ? normalized.slice(drive.length) : normalized;
  const absolute = rest.startsWith("/");
  const parts = rest.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack.at(-1) !== "..") stack.pop();
      else if (!absolute) stack.push(part);
      continue;
    }
    stack.push(part);
  }
  const prefix = `${drive}${absolute ? "/" : ""}`;
  const suffix = stack.join("/");
  if (!suffix) return prefix || ".";
  return `${prefix}${suffix}`;
}

function unsupportedFilePreviewMessage(
  formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"],
  type: UnsupportedFilePreviewType,
): string {
  switch (type) {
    case "archive":
      return formatMessage({ id: "review.fileSource.unsupported.archive", defaultMessage: "Archive previews aren't supported yet" });
    case "audio":
      return formatMessage({ id: "review.fileSource.unsupported.audio", defaultMessage: "Audio previews aren't supported yet" });
    case "binary":
      return formatMessage({ id: "review.fileSource.unsupported.binary", defaultMessage: "Binary file previews aren't supported yet" });
    case "excel-spreadsheet":
      return formatMessage({ id: "review.fileSource.unsupported.excelSpreadsheet", defaultMessage: "Excel spreadsheet previews aren't supported yet" });
    case "keynote-deck":
      return formatMessage({ id: "review.fileSource.unsupported.keynoteDeck", defaultMessage: "Keynote deck previews aren't supported yet" });
    case "numbers-spreadsheet":
      return formatMessage({ id: "review.fileSource.unsupported.numbersSpreadsheet", defaultMessage: "Numbers spreadsheet previews aren't supported yet" });
    case "opendocument-presentation":
      return formatMessage({ id: "review.fileSource.unsupported.opendocumentPresentation", defaultMessage: "OpenDocument presentation previews aren't supported yet" });
    case "opendocument-spreadsheet":
      return formatMessage({ id: "review.fileSource.unsupported.opendocumentSpreadsheet", defaultMessage: "OpenDocument spreadsheet previews aren't supported yet" });
    case "opendocument-text":
      return formatMessage({ id: "review.fileSource.unsupported.opendocumentText", defaultMessage: "OpenDocument text previews aren't supported yet" });
    case "pages-document":
      return formatMessage({ id: "review.fileSource.unsupported.pagesDocument", defaultMessage: "Pages document previews aren't supported yet" });
    case "powerpoint-deck":
      return formatMessage({ id: "review.fileSource.unsupported.powerpointDeck", defaultMessage: "PowerPoint deck previews aren't supported yet" });
    case "rich-text-document":
      return formatMessage({ id: "review.fileSource.unsupported.richTextDocument", defaultMessage: "Rich Text document previews aren't supported yet" });
    case "video":
      return formatMessage({ id: "review.fileSource.unsupported.video", defaultMessage: "Video previews aren't supported yet" });
    case "word-document":
      return formatMessage({ id: "review.fileSource.unsupported.wordDocument", defaultMessage: "Word document previews aren't supported yet" });
  }
}

function fileSizeLabel(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
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
