import { ChevronRight } from "lucide-react";
import { useContext, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  memoryCitationEntries,
  memoryCitationFileReference,
} from "../state/conversation-markdown-engine";
import type { MemoryCitationEntryView } from "../state/conversation-markdown-engine";
import { ContextMenu } from "./context-menu";
import { DelinkFileCitationsContext, FileCitationMenuContext, fileReferenceContextMenuItems } from "./file-citation-menu";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import { Tooltip } from "./tooltip";

type FormatMessage = ForgeIntlContextValue["formatMessage"];
type FileCitationEntry = FileReference & { lineEnd: number };

export function MemoryCitationView({
  citation,
  memoryCitationRoot,
  onOpenFileReference,
}: {
  citation: unknown;
  memoryCitationRoot?: string | null;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useForgeIntl();
  const entries = memoryCitationEntries(citation);
  if (entries.length === 0) return null;
  return (
    <details className="hc-memory-citations">
      <summary>
        {/* codex memory-citation chevron = icon-2xs (14px), group-open:rotate-90 */}
        <ChevronRight size={14} />
        <span>{memoryCitationSummary(entries.length, formatMessage)}</span>
      </summary>
      <ol>
        {entries.map((entry, index) => {
          const lineLabel = memoryCitationLineLabel(entry, formatMessage);
          const displayPath = displayCitationPath(entry.path);
          const fileReference = memoryCitationFileReference(entry, memoryCitationRoot);
          return (
            <li key={`${entry.path}:${entry.lineStart}-${entry.lineEnd}:${index}`}>
              <button
                type="button"
                aria-label={formatMessage({
                  id: "assistantMessage.memoryCitations.openCitation",
                  defaultMessage: "Open {path}, {lineLabel}",
                  description: "Accessible label for opening one memory citation source file",
                }, { path: displayPath, lineLabel })}
                onClick={() => onOpenFileReference?.(fileReference)}
              >
                <span className="hc-memory-citation-main">
                  <span className="hc-memory-citation-path" title={displayPath}>
                    {displayPath}
                  </span>
                  <span className="hc-memory-citation-lines">{lineLabel}</span>
                </span>
                {entry.note.length > 0 && <span className="hc-memory-citation-note">{entry.note}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function memoryCitationSummary(count: number, formatMessage: FormatMessage): string {
  return formatMessage({
    id: "assistantMessage.memoryCitations.summary",
    defaultMessage: "{count, plural, one {1 memory citation} other {# memory citations}}",
    description: "Collapsed disclosure label for citations that explain which memory files informed an assistant message",
  }, { count });
}

function memoryCitationLineLabel(
  entry: Pick<MemoryCitationEntryView, "lineStart" | "lineEnd">,
  formatMessage?: FormatMessage,
): string {
  if (entry.lineStart === entry.lineEnd) {
    return formatMessage
      ? formatMessage({
          id: "assistantMessage.memoryCitations.singleLineLabel",
          defaultMessage: "line {line}",
          description: "Single line label for one memory citation source",
        }, { line: entry.lineStart })
      : `line ${entry.lineStart}`;
  }
  return formatMessage
    ? formatMessage({
        id: "assistantMessage.memoryCitations.lineRangeLabel",
        defaultMessage: "lines {lineStart}-{lineEnd}",
        description: "Line range label for one memory citation source",
      }, { lineStart: entry.lineStart, lineEnd: entry.lineEnd })
    : `lines ${entry.lineStart}-${entry.lineEnd}`;
}

function displayCitationPath(path: string): string {
  return normalizeDesktopPathDisplay(path.trim());
}

function displayFileCitationPath(path: string): string {
  const normalized = displayCitationPath(path).replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? normalized;
}

function normalizeDesktopPathDisplay(path: string): string {
  const withoutLongUncPrefix = path.replace(/^\\\\\?\\UNC\\/i, "\\\\");
  const withoutLongDrivePrefix = withoutLongUncPrefix.replace(/^\\\\\?\\([a-zA-Z]:[\\/].*)$/, "$1");
  return withoutLongDrivePrefix.replace(/\\/g, "/");
}

function fileCitationLineLabel(
  entry: Pick<FileCitationEntry, "lineStart" | "lineEnd">,
  formatMessage: FormatMessage,
  path?: string,
): string | null {
  if (entry.lineEnd !== entry.lineStart) {
    return formatMessage(
      {
        id: "markdown.fileCitation.linesLabel",
        defaultMessage: "lines {line}-{endLine}",
        description: "Line range label shown inside a file citation chip",
      },
      { line: entry.lineStart, endLine: entry.lineEnd },
    );
  }
  if (entry.lineStart === 1 && !fileCitationPathLooksCodeLike(path)) return null;
  return formatMessage(
    {
      id: "markdown.fileCitation.lineLabel",
      defaultMessage: "line {line}",
      description: "Single line label shown inside a file citation chip",
    },
    { line: entry.lineStart },
  );
}

function fileCitationDisplayLabel(
  entry: Pick<FileCitationEntry, "path" | "lineStart" | "lineEnd" | "artifactCitation">,
  formatMessage: FormatMessage,
): string {
  const fileName = displayFileCitationPath(entry.path);
  const lineLabel = fileCitationArtifactLocationLabel(entry.artifactCitation, formatMessage)
    ?? fileCitationLineLabel(entry, formatMessage, entry.path);
  if (!lineLabel) return fileName;
  const lineLabelDisplay = formatMessage(
    {
      id: "markdown.fileCitation.lineLabelDisplay",
      defaultMessage: "({lineLabel})",
      description: "Location label shown inside parentheses in a file citation chip",
    },
    { lineLabel },
  );
  return `${fileName} ${lineLabelDisplay}`;
}

function fileCitationAriaLabel(
  entry: Pick<FileCitationEntry, "path" | "lineStart" | "lineEnd" | "artifactCitation">,
  formatMessage: FormatMessage,
): string {
  const fileName = displayFileCitationPath(entry.path);
  const lineLabel = fileCitationArtifactLocationLabel(entry.artifactCitation, formatMessage)
    ?? fileCitationLineLabel(entry, formatMessage, entry.path);
  const fileTypeLabel = fileCitationFallbackTypeLabel(entry, formatMessage);
  const lineLabelDisplay = lineLabel
    ? formatMessage(
        {
          id: "markdown.fileCitation.lineLabelDisplay",
          defaultMessage: "({lineLabel})",
          description: "Location label shown inside parentheses in a file citation chip",
        },
        { lineLabel },
      )
    : null;
  if (fileTypeLabel && lineLabelDisplay) {
    return formatMessage(
      {
        id: "markdown.fileCitation.ariaLabelWithTypeAndLine",
        defaultMessage: "{fileName}, {fileTypeLabel} {lineLabel}",
        description: "Accessible label for an extensionless file citation chip with location information",
      },
      { fileName, fileTypeLabel, lineLabel: lineLabelDisplay },
    );
  }
  if (fileTypeLabel) {
    return formatMessage(
      {
        id: "markdown.fileCitation.ariaLabelWithType",
        defaultMessage: "{fileName}, {fileTypeLabel}",
        description: "Accessible label for an extensionless file citation chip",
      },
      { fileName, fileTypeLabel },
    );
  }
  if (lineLabelDisplay) {
    return formatMessage(
      {
        id: "markdown.fileCitation.ariaLabelWithLine",
        defaultMessage: "{fileName} {lineLabel}",
        description: "Accessible label for a file citation chip with location information",
      },
      { fileName, lineLabel: lineLabelDisplay },
    );
  }
  return fileName;
}

function fileCitationArtifactLocationLabel(
  citation: FileReference["artifactCitation"] | undefined,
  formatMessage: FormatMessage,
): string | null {
  const target = citation?.target;
  if (!target) return null;
  if (target.artifactKind === "document") {
    return formatMessage(
      {
        id: "markdown.fileCitation.documentPageLabel",
        defaultMessage: "page {pageNumber}",
        description: "Location label for a document file citation targeting a page",
      },
      { pageNumber: target.pageNumber },
    );
  }
  if (target.artifactKind === "presentation") {
    const slideLabel = target.slideNumber
      ? formatMessage(
          {
            id: "markdown.fileCitation.presentationSlideNumberLabel",
            defaultMessage: "slide {slideNumber}",
            description: "Location label for a presentation file citation targeting a slide number",
          },
          { slideNumber: target.slideNumber },
        )
      : null;
    const label = citation.label?.trim() || null;
    if (!target.objectId || !label) return slideLabel;
    if (!slideLabel) return label;
    return formatMessage(
      {
        id: "markdown.fileCitation.presentationObjectLabel",
        defaultMessage: "{slideLabel}, {label}",
        description: "Location label for a presentation file citation targeting a labeled object on a slide",
      },
      { label, slideLabel },
    );
  }
  if (target.artifactKind === "workbook") {
    if ("objectId" in target) {
      const label = citation.label?.trim() || null;
      if (!label) return null;
      return formatMessage(
        {
          id: "markdown.fileCitation.workbookObjectLabel",
          defaultMessage: "{sheet}, {label}",
          description: "Location label for a spreadsheet file citation targeting a labeled object on a sheet",
        },
        { label, sheet: target.sheet },
      );
    }
    return `${target.sheet}!${target.range}`;
  }
  return null;
}

function fileCitationFallbackTypeLabel(
  entry: Pick<FileCitationEntry, "path" | "artifactCitation">,
  formatMessage: FormatMessage,
): string | null {
  if (fileCitationPathHasExtension(entry.path)) return null;
  const kind = entry.artifactCitation?.target.artifactKind;
  const fallbackKind = kind === "workbook" ? "spreadsheet" : kind;
  switch (fallbackKind) {
    case "document":
      return formatMessage({
        id: "markdown.fileCitation.artifactType.document",
        defaultMessage: "Document",
        description: "Fallback file type label for a document file citation with no extension",
      });
    case "presentation":
      return formatMessage({
        id: "markdown.fileCitation.artifactType.presentation",
        defaultMessage: "Presentation",
        description: "Fallback file type label for a presentation file citation with no extension",
      });
    case "spreadsheet":
      return formatMessage({
        id: "markdown.fileCitation.artifactType.spreadsheet",
        defaultMessage: "Spreadsheet",
        description: "Fallback file type label for a spreadsheet file citation with no extension",
      });
    default:
      return null;
  }
}

function fileCitationPathHasExtension(path: string): boolean {
  const fileName = displayFileCitationPath(path);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < fileName.length - 1;
}

function fileCitationPathLooksCodeLike(path: string | undefined): boolean {
  if (!path) return false;
  const fileName = displayFileCitationPath(path).toLowerCase();
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : fileName;
  return CODE_FILE_CITATION_EXTENSIONS.has(extension);
}

const CODE_FILE_CITATION_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "m",
  "mm",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "ts",
  "tsx",
  "vue",
]);

// codex: inline-mentions-CbDcUfAO.js - the Codex file element wires
// `onClick: e => _e(fe(e))` where `fe` is `external-markdown-link`'s
// `ve(e){return e.metaKey||e.ctrlKey}` and `_e` is the click handler
// `(e,n)=>{...if(F&&!R&&!e){I({isPreview}); return} ...modifiedClick:e...}`.
// A plain click (`!e`) opens the in-app preview; a modified click
// (`metaKey||ctrlKey`) routes to the external / open-in path instead.
// Forge mirrors that: plain click -> `onOpenFileReference` (in-app
// preview), Cmd/Ctrl-click -> `onOpenFileReferenceExternal` when an
// external opener is wired. With no external opener available the click
// falls through to the in-app preview (never the no-op it was before).
function fileReferenceClickIsModified(event: Pick<MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, "metaKey" | "ctrlKey">): boolean {
  return event.metaKey || event.ctrlKey;
}

function handleFileReferenceClick(
  event: MouseEvent<HTMLElement>,
  reference: FileReference,
  onOpenFileReference: ((reference: FileReference) => void) | undefined,
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): void {
  if (fileReferenceClickIsModified(event) && onOpenFileReferenceExternal) {
    event.preventDefault();
    onOpenFileReferenceExternal(reference);
    return;
  }
  if (!onOpenFileReference) return;
  event.preventDefault();
  onOpenFileReference(reference);
}

function handleFileReferenceKeyDown(
  event: KeyboardEvent<HTMLElement>,
  reference: FileReference,
  onOpenFileReference: ((reference: FileReference) => void) | undefined,
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): void {
  if (event.key === "Enter") {
    event.preventDefault();
    handleFileReferenceClick(event as unknown as MouseEvent<HTMLElement>, reference, onOpenFileReference, onOpenFileReferenceExternal);
    return;
  }
  if (event.key === " ") event.preventDefault();
}

function handleFileReferenceKeyUp(
  event: KeyboardEvent<HTMLElement>,
  reference: FileReference,
  onOpenFileReference: ((reference: FileReference) => void) | undefined,
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): void {
  if (event.key !== " ") return;
  event.preventDefault();
  handleFileReferenceClick(event as unknown as MouseEvent<HTMLElement>, reference, onOpenFileReference, onOpenFileReferenceExternal);
}

// codex inline-mentions-*.js wraps each inline file-reference anchor with the shared
// workspace-file context menu; Forge's anchor mirrors that via the shared
// FileCitationMenuContext + items builder (see ./file-citation-menu). onClick (open)
// keeps using the existing handlers unchanged.
export function FileCitationAnchor({
  entry,
  displayPath,
  onOpenFileReference,
  onOpenFileReferenceExternal,
}: {
  // fileCitation segments carry a definite lineEnd (needed by memoryCitationLineLabel);
  // this is assignable to FileReference for the open/reveal/copy handlers below.
  entry: FileCitationEntry;
  displayPath: string;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
}) {
  const menuActions = useContext(FileCitationMenuContext);
  const delink = useContext(DelinkFileCitationsContext);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { formatMessage } = useForgeIntl();
  const items = fileReferenceContextMenuItems({ reference: entry, onOpenFileReference, menuActions, formatMessage });
  const fullPath = displayCitationPath(displayPath);
  const label = fileCitationDisplayLabel({ ...entry, path: displayPath }, formatMessage);
  const ariaLabel = fileCitationAriaLabel({ ...entry, path: displayPath }, formatMessage);

  // Projectless conversation: the citation is a knowledge-base / tool source, not
  // a local file - render plain, non-clickable provenance instead of a dead link.
  if (delink) {
    return (
      <span className="hc-file-citation-plain" title={fullPath}>
        {label}
      </span>
    );
  }

  return (
    <>
      <Tooltip content={fullPath}>
        <span
          aria-label={ariaLabel}
          className="hc-file-citation-marker"
          data-file-reference
          role="button"
          tabIndex={0}
          onClick={(event) => handleFileReferenceClick(event, entry, onOpenFileReference, onOpenFileReferenceExternal)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
          onKeyDown={(event) => handleFileReferenceKeyDown(event, entry, onOpenFileReference, onOpenFileReferenceExternal)}
          onKeyUp={(event) => handleFileReferenceKeyUp(event, entry, onOpenFileReference, onOpenFileReferenceExternal)}
        >
          <span className="hc-file-citation-marker-label">{label}</span>
        </span>
      </Tooltip>
      {menu != null && <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
}
