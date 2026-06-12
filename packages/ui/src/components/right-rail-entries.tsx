import {
  LoaderCircle,
  Square,
} from "lucide-react";
import { useState } from "react";
import type { RailEntry } from "../state/render-groups";
import {
  clipRailEntries,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";
import { useHiCodexIntl } from "./i18n-provider";
import {
  isBackgroundTerminalEntry,
  isGeneratedImageArtifact,
} from "./right-rail-entry-icons";
import {
  RailEntryCard,
  RailSummaryRow,
} from "./right-rail-entry-rows";

export { SourcesIconRow } from "./right-rail-entry-rows";

export interface RailListProps {
  entries: RailEntry[];
  sectionId: RightRailSectionViewModel["id"];
  backgroundTerminalCleanupPending?: boolean;
  canOpenEntry?: (entry: RailEntry) => boolean;
  onCleanBackgroundTerminals?: () => void;
  onOpenEntry?: (entry: RailEntry) => void;
}

export function RailList({
  entries,
  sectionId,
  backgroundTerminalCleanupPending = false,
  canOpenEntry,
  onCleanBackgroundTerminals,
  onOpenEntry,
}: RailListProps) {
  const { formatMessage } = useHiCodexIntl();
  const [expanded, setExpanded] = useState(false);
  const clipped = shouldClipRailList(sectionId)
    ? clipRailEntries(entries, expanded)
    : {
        entries,
        remainingCount: 0,
        canToggle: false,
      };
  let generatedImageCount = 0;
  /*
   * CODEX-REF: local-conversation-thread-*.js ({artifacts} listClassName):
   *   `-mx-2 flex max-h-[28rem] flex-col gap-px overflow-y-auto px-2`
   * Artifact lists use `max-height: 28rem` so a long artifact list scrolls
   * independently inside the section rather than pushing all other sections out
   * of view. `data-section-id` feeds the CSS selector.
   */
  return (
    <div className="hc-rail-list" data-section-id={sectionId}>
      {clipped.entries.map((entry) => {
        const isGeneratedImage = sectionId === "artifacts" && isGeneratedImageArtifact(entry);
        if (isGeneratedImage) generatedImageCount += 1;
        const displayTitle = isGeneratedImage
          ? formatMessage(
              { id: "codex.localConversation.artifacts.generatedImage", defaultMessage: "Generated image {imageNumber}" },
              { imageNumber: generatedImageCount },
            )
          : undefined;
        // CODEX-REF: local-conversation-thread-CEeZyOcp.js — the background-terminal
        // "Stop all" control is the row's trailing `actions` slot (cleanup button), not a
        // separate card region. Threaded into SummaryPanelRow.trailing below.
        const stopTerminalsAction = sectionId === "backgroundTasks" && isBackgroundTerminalEntry(entry) && onCleanBackgroundTerminals ? (
          <button
            aria-label={formatMessage({ id: "codex.localConversation.backgroundTerminals.stop", defaultMessage: "Stop all background terminals" })}
            className="hc-rail-section-action hc-rail-card-action"
            disabled={backgroundTerminalCleanupPending}
            onClick={(event) => {
              event.stopPropagation();
              onCleanBackgroundTerminals();
            }}
            title={formatMessage({ id: "codex.localConversation.backgroundTerminals.stopTooltip", defaultMessage: "Stop all background terminals" })}
            type="button"
          >
            {backgroundTerminalCleanupPending
              ? <LoaderCircle className="hc-rail-progress-spinner" size={12} />
              : <Square size={12} />}
          </button>
        ) : undefined;
        // CODEX-REF: local-conversation-thread-CEeZyOcp.js — every rail row EXCEPT the
        // plan/progress step list is a single-line `summary-panel-row` (wc): `h-7
        // items-center px-0 py-1`, label `text-base` (14px). Only the progress section
        // renders the multi-line `line-clamp-3` step card. Route progress → RailEntryCard
        // (card) and every other section → RailSummaryRow (single-line wc parity). This
        // collapses the prior multi-line `hc-rail-card` rendering of automation / outputs /
        // side-chats / subagents / terminals onto Codex's uniform single-line row model.
        if (sectionId === "progress") {
          return (
            <RailEntryCard
              entry={entry}
              key={entry.id}
              sectionId={sectionId}
              displayTitle={displayTitle}
              canOpen={canOpenEntry}
              onOpen={onOpenEntry}
            />
          );
        }
        return (
          <RailSummaryRow
            entry={entry}
            key={entry.id}
            sectionId={sectionId}
            displayTitle={displayTitle}
            trailingAction={stopTerminalsAction}
            canOpen={canOpenEntry}
            onOpen={onOpenEntry}
          />
        );
      })}
      {clipped.canToggle && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded
            ? formatMessage({ id: "codex.localConversation.summaryPanelExpandableList.showLess", defaultMessage: "Show less" })
            : formatMessage(
                { id: "codex.localConversation.summaryPanelExpandableList.showMore", defaultMessage: "Show {count} more" },
                { count: clipped.remainingCount },
              )}
        </button>
      )}
    </div>
  );
}

function shouldClipRailList(sectionId: RightRailSectionViewModel["id"]): boolean {
  return sectionId === "progress" || sectionId === "artifacts" || sectionId === "sources";
}
