import { Bot, ChevronDown, ChevronRight, LoaderCircle, Square } from "lucide-react";
import { useState } from "react";
import type { RailDiffStats, RailEntry } from "../state/render-groups";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";
import { DiffStatsDisplay } from "./diff-stats-display";
import { useForgeIntl } from "./i18n-provider";
import type { ForgeIntlContextValue } from "./i18n-provider";
import type { OpenThreadHandler } from "./open-thread";

export interface BackgroundSubagentsStackProps {
  canStopAll?: boolean;
  defaultExpanded?: boolean;
  entries: RailEntry[];
  onOpenThread?: OpenThreadHandler;
  onStopAll?: () => void;
  stopAllPending?: boolean;
}

export function BackgroundSubagentsStack({
  canStopAll = false,
  defaultExpanded = false,
  entries,
  onOpenThread,
  onStopAll,
  stopAllPending = false,
}: BackgroundSubagentsStackProps) {
  const { formatMessage } = useForgeIntl();
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (entries.length === 0) return null;

  const summary = formatMessage(
    { id: "composer.backgroundSubagents.summary", defaultMessage: "{count, plural, one {# background agent} other {# background agents}}" },
    { count: entries.length },
  );
  const totalDiffStats = sumDiffStats(entries);
  const showStopAll = canStopAll && onStopAll;
  return (
    <AboveComposerPanel className="hc-background-subagents-stack">
      <PanelRow
        className="hc-background-subagents-header"
        titleClassName="hc-background-subagents-header-title"
        title={(
          <button
            type="button"
            className="hc-background-subagents-toggle"
            aria-expanded={expanded}
            aria-label={expanded
              ? formatMessage({ id: "composer.backgroundSubagents.collapse", defaultMessage: "Collapse background agent details" })
              : formatMessage({ id: "composer.backgroundSubagents.expand", defaultMessage: "Expand background agent details" })}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Bot size={13} />
            <span>{expanded ? `${summary} ${formatMessage({ id: "composer.backgroundSubagents.invokeAgents", defaultMessage: "(@ to tag agents)" })}` : summary}</span>
          </button>
        )}
        trailing={totalDiffStats || showStopAll ? (
          <div className="hc-background-subagents-header-actions">
            {totalDiffStats ? (
              <DiffStatsDisplay
                className="hc-background-subagents-diff"
                linesAdded={totalDiffStats.linesAdded}
                linesRemoved={totalDiffStats.linesRemoved}
              />
            ) : null}
            {showStopAll ? (
              <button
                type="button"
                className="hc-background-subagents-stop-all"
                aria-label={formatMessage({ id: "composer.backgroundSubagents.stopAllTooltip", defaultMessage: "Stop all subagents in this chat" })}
                disabled={stopAllPending}
                title={stopAllPending ? "Stopping all background agents" : formatMessage({ id: "composer.backgroundSubagents.stopAllTooltip", defaultMessage: "Stop all subagents in this chat" })}
                onClick={onStopAll}
              >
                {stopAllPending
                  ? <LoaderCircle className="hc-background-subagents-spinner" size={12} />
                  : <Square size={11} />}
                <span>{formatMessage({ id: "composer.backgroundSubagents.stopAll", defaultMessage: "Stop all" })}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      />
      {expanded && (
        <div className="hc-background-subagents-body">
          {entries.map((entry) => (
            <BackgroundSubagentRow
              entry={entry}
              key={entry.id}
              onOpenThread={onOpenThread}
            />
          ))}
        </div>
      )}
    </AboveComposerPanel>
  );
}

function BackgroundSubagentRow({
  entry,
  onOpenThread,
}: {
  entry: RailEntry;
  onOpenThread?: OpenThreadHandler;
}) {
  const { formatMessage } = useForgeIntl();
  const threadAction = entry.action?.kind === "thread" ? entry.action : null;
  const displayName = threadAction?.displayName || entry.title;
  const metadata = [
    threadAction?.role,
    threadAction?.model ? formatMessage({ id: "composer.backgroundSubagents.row.modelTooltip", defaultMessage: "Uses {model}" }, { model: threadAction.model }) : null,
  ]
    .filter(Boolean)
    .join("\n");
  const statusLabel = backgroundSubagentStatusLabel(entry.status, formatMessage);
  return (
    <PanelRow
      className="hc-background-subagents-row"
      titleClassName="hc-background-subagents-row-title"
      title={(
        <button
          type="button"
          className="hc-background-subagents-row-button"
          disabled={!threadAction || !onOpenThread}
          title={metadata || undefined}
          onClick={() => {
            if (!threadAction || !onOpenThread) return;
            onOpenThread(threadAction.threadId, {
              displayName: threadAction.displayName ?? displayName,
              model: threadAction.model ?? null,
              panelKind: "backgroundAgent",
              role: threadAction.role ?? null,
            });
          }}
        >
          {entry.status === "active"
            ? <LoaderCircle className="hc-background-subagents-spinner" size={12} />
            : <Bot size={12} />}
          <span className="hc-background-subagents-row-name">{displayName}</span>
          {statusLabel ? (
            <span className="hc-background-subagents-row-status" data-status={entry.status}>
              {statusLabel}
            </span>
          ) : null}
        </button>
      )}
      trailing={entry.diffStats ? (
        <DiffStatsDisplay
          className="hc-background-subagents-row-diff"
          linesAdded={entry.diffStats.linesAdded}
          linesRemoved={entry.diffStats.linesRemoved}
        />
      ) : null}
    />
  );
}

function backgroundSubagentStatusLabel(status: string | undefined, formatMessage: ForgeIntlContextValue["formatMessage"]): string {
  switch (status) {
    case "active":
      return formatMessage({ id: "composer.backgroundSubagents.row.activeLabel", defaultMessage: "is working" });
    case "waiting":
      return formatMessage({ id: "composer.backgroundSubagents.row.waitingLabel", defaultMessage: "is awaiting instruction" });
    case "done":
    case "completed":
      return formatMessage({ id: "composer.backgroundSubagents.row.doneLabel", defaultMessage: "is done" });
    case "failed":
      return "failed";
    default:
      return status ?? "";
  }
}

function sumDiffStats(entries: RailEntry[]): RailDiffStats | null {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const entry of entries) {
    linesAdded += entry.diffStats?.linesAdded ?? 0;
    linesRemoved += entry.diffStats?.linesRemoved ?? 0;
  }
  return linesAdded === 0 && linesRemoved === 0 ? null : { linesAdded, linesRemoved };
}
