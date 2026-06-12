import type { ReactNode } from "react";
import type { RailEntry } from "../state/render-groups";
import type { RightRailSection as RightRailSectionViewModel } from "../state/right-rail";
import { normalizePlanStepStatus } from "../state/thread-item-fields";
import { useHiCodexIntl } from "./i18n-provider";
import {
  isBackgroundAgentEntry,
  railEntryIcon,
  sourceEntryLogo,
} from "./right-rail-entry-icons";
import { SummaryPanelRow } from "./summary-panel-row";

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — single-line rail row (wc /
 * summary-panel-row) used by every non-progress section.
 */
export function RailSummaryRow({
  entry,
  sectionId,
  displayTitle,
  trailingAction,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
  trailingAction?: ReactNode;
  canOpen?: (entry: RailEntry) => boolean;
  onOpen?: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const title = displayTitle ?? entry.title;
  const interactive = Boolean(canOpen?.(entry) && onOpen);
  const onClick = interactive && onOpen ? () => onOpen(entry) : undefined;
  const icon = railEntryIcon(entry, sectionId);
  const tooltip = sectionId === "automation" && entry.status
    ? entry.status
    : entry.meta ?? title;

  if (sectionId === "browser") {
    const browserActive = entry.status === "active";
    const label = (
      <span
        className={browserActive
          ? "hc-rail-row-browser-label loading-shimmer-pure-text"
          : "hc-rail-row-browser-label"}
      >
        <span className="hc-rail-card-browser-title">{title}</span>
        {entry.meta && (
          <span
            className={browserActive
              ? "hc-rail-card-browser-url"
              : "hc-rail-card-browser-url hc-rail-card-browser-url-inactive"}
          >
            {entry.meta}
          </span>
        )}
      </span>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  if (sectionId === "automation") {
    const label = (
      <>
        <span className="hc-rail-row-automation-name">{title}</span>
        {entry.meta && <span className="hc-rail-row-automation-rrule">{entry.meta}</span>}
      </>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  if (sectionId === "backgroundSubagents") {
    const isAgent = isBackgroundAgentEntry(entry);
    const active = isAgent && entry.status === "active";
    const stats = isAgent ? entry.diffStats ?? null : null;
    const label = (
      <>
        <span className="hc-rail-row-subagent-name">{title}</span>
        {active && (
          <span className="hc-rail-card-working">
            {formatMessage({ id: "codex.localConversation.backgroundAgents.activeLabel", defaultMessage: "is working" })}
          </span>
        )}
      </>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        trailing={stats ? <RailDiffStats stats={stats} /> : undefined}
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  if (sectionId === "backgroundTasks") {
    const commandText = (displayTitle ?? entry.title).trim();
    const label = commandText
      || formatMessage({ id: "codex.localConversation.backgroundTerminals.defaultLabel", defaultMessage: "Background terminal" });
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-terminal-label"
        onClick={onClick}
        trailing={trailingAction}
        title={tooltip}
      />
    );
  }

  return (
    <SummaryPanelRow
      icon={icon}
      label={title}
      onClick={onClick}
      trailing={trailingAction}
      title={tooltip}
    />
  );
}

// CODEX-REF: local-conversation-thread-CEeZyOcp.js — progress-step card (the only
// multi-line rail row). Single-line sections route through RailSummaryRow instead.
export function RailEntryCard({
  entry,
  sectionId,
  displayTitle,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
  canOpen?: (entry: RailEntry) => boolean;
  onOpen?: (entry: RailEntry) => void;
}) {
  const progressStatus = sectionId === "progress" ? normalizePlanStepStatus(entry.status) : undefined;
  if (canOpen?.(entry) && onOpen) {
    return (
      <button
        className="hc-rail-card hc-rail-card-button"
        data-progress-status={progressStatus}
        type="button"
        onClick={() => onOpen(entry)}
      >
        <RailEntryContent
          entry={entry}
          sectionId={sectionId}
          displayTitle={displayTitle}
        />
      </button>
    );
  }

  return (
    <div className="hc-rail-card" data-progress-status={progressStatus}>
      <RailEntryContent
        entry={entry}
        sectionId={sectionId}
        displayTitle={displayTitle}
      />
    </div>
  );
}

function RailEntryContent({
  entry,
  sectionId,
  displayTitle,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
}) {
  const title = displayTitle ?? entry.title;
  const tooltip = entry.meta ?? title;
  return (
    <div className="hc-rail-card-main">
      <span className="hc-rail-card-icon" aria-hidden="true">
        {railEntryIcon(entry, sectionId)}
      </span>
      <div className="hc-rail-card-copy">
        <div className="hc-rail-card-title-row">
          <div className="hc-rail-card-title hc-rail-card-title-progress" title={tooltip}>{title}</div>
        </div>
      </div>
    </div>
  );
}

function RailDiffStats({ stats }: { stats: NonNullable<RailEntry["diffStats"]> }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <span
      className="hc-rail-diff-stats"
      aria-label={formatMessage(
        {
          id: "hc.rightRail.diffStats.ariaLabel",
          defaultMessage: "{linesAdded} lines added, {linesRemoved} lines removed",
        },
        { linesAdded: stats.linesAdded, linesRemoved: stats.linesRemoved },
      )}
    >
      <span className="hc-rail-diff-added">+{stats.linesAdded}</span>
      <span className="hc-rail-diff-removed">-{stats.linesRemoved}</span>
    </span>
  );
}

/*
 * codex Sources section (local-conversation-thread-*.js `Nf`): each source renders
 * as an icon-only `size-6` row with the source name in tooltip + aria-label.
 */
export function SourcesIconRow({ entries }: { entries: readonly RailEntry[] }): ReactNode {
  return (
    <div className="hc-rail-sources-icons">
      {entries.map((entry) => (
        <span
          key={entry.id}
          role="img"
          className="hc-rail-source-icon"
          aria-label={entry.title ?? undefined}
          title={entry.title ?? undefined}
        >
          {sourceEntryLogo(entry)}
        </span>
      ))}
    </div>
  );
}
