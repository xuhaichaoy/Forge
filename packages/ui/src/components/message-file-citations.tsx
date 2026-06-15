import { ChevronRight } from "lucide-react";
import { useContext, useState } from "react";
import type { MouseEvent } from "react";
import {
  memoryCitationEntries,
  memoryCitationFileReference,
} from "../state/conversation-markdown-engine";
import type { MemoryCitationEntryView } from "../state/conversation-markdown-engine";
import { ContextMenu } from "./context-menu";
import { DelinkFileCitationsContext, FileCitationMenuContext, fileReferenceContextMenuItems } from "./file-citation-menu";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";

type FormatMessage = ForgeIntlContextValue["formatMessage"];

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
                  <span className="hc-memory-citation-path" title={entry.path}>
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
  return path.trim();
}

function citationHref(entry: Pick<FileReference, "path" | "lineStart">): string {
  return `${entry.path}:${entry.lineStart}`;
}

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
function fileReferenceClickIsModified(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey;
}

function handleFileReferenceClick(
  event: MouseEvent<HTMLAnchorElement>,
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
  entry: { path: string; lineStart: number; lineEnd: number };
  displayPath: string;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
}) {
  const menuActions = useContext(FileCitationMenuContext);
  const delink = useContext(DelinkFileCitationsContext);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { formatMessage } = useForgeIntl();
  const items = fileReferenceContextMenuItems({ reference: entry, onOpenFileReference, menuActions, formatMessage });

  // Projectless conversation: the citation is a knowledge-base / tool source, not
  // a local file - render plain, non-clickable provenance instead of a dead link.
  if (delink) {
    return (
      <span className="hc-file-citation-plain">
        {displayCitationPath(displayPath)} {memoryCitationLineLabel(entry)}
      </span>
    );
  }

  return (
    <>
      <a
        className="hc-file-citation-marker"
        href={citationHref(entry)}
        onClick={(event) => handleFileReferenceClick(event, entry, onOpenFileReference, onOpenFileReferenceExternal)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {displayCitationPath(displayPath)} {memoryCitationLineLabel(entry)}
      </a>
      {menu != null && <ContextMenu items={items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
}
