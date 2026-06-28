import { GitFork, Workflow } from "lucide-react";
import { useState } from "react";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import { IconActionButton, MessageActionRow } from "./message-action-row";
import type { MarkdownRichCopyPayload } from "./message-markdown-copy";
import { Tooltip } from "./tooltip";

type FormatMessage = ForgeIntlContextValue["formatMessage"];
const ASSISTANT_COPY_RESET_TIMEOUT_MS = 2000;
const ASSISTANT_ACTION_ICON_SIZE = 16;

export interface AssistantHookStatsSummary {
  label: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  entries: Array<{ kind: string; text: string }>;
}

export interface AssistantCompletedGoalSummary {
  label: string;
  objective: string;
  durationLabel: string;
}

export function AssistantMessageActions({
  copyRichPayload,
  copyText,
  hasArtifacts = false,
  item,
  onFork,
}: {
  copyRichPayload?: (() => MarkdownRichCopyPayload | null) | null;
  copyText: string;
  hasArtifacts?: boolean;
  item: Record<string, unknown>;
  onFork?: () => void;
}) {
  const { formatMessage } = useForgeIntl();
  const hookStatsSummary = assistantHookStatsSummary(item, formatMessage);
  const goalSummary = assistantCompletedThreadGoal(item);
  const hasActionChildren = Boolean(onFork)
    || Boolean(hookStatsSummary)
    || Boolean(goalSummary);
  return (
    <MessageActionRow
      copiedResetTimeoutMs={ASSISTANT_COPY_RESET_TIMEOUT_MS}
      copyRichPayload={copyRichPayload}
      copyText={copyText}
      hasActionChildren={hasActionChildren}
      iconSize={ASSISTANT_ACTION_ICON_SIZE}
      sentAtMs={messageSentAtMs(item)}
      showTimestampWithoutActions={hasArtifacts}
    >
      {onFork && (
        <IconActionButton ariaLabel={formatMessage({ id: "assistantMessageContent.forkAriaLabel", defaultMessage: "Fork from this point" })} title={formatMessage({ id: "assistantMessageContent.forkTooltip", defaultMessage: "Fork" })} onClick={onFork}>
          <GitFork size={ASSISTANT_ACTION_ICON_SIZE} />
        </IconActionButton>
      )}
      {hookStatsSummary && <AssistantHookStatsAction summary={hookStatsSummary} />}
      {goalSummary && <AssistantCompletedGoalAction summary={goalSummary} />}
    </MessageActionRow>
  );
}

function AssistantHookStatsAction({ summary }: { summary: AssistantHookStatsSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hc-auto-review-action">
      <Tooltip content={summary.title}>
        <button
          aria-expanded={open}
          aria-label={summary.label}
          className="hc-auto-review-trigger"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <Workflow size={ASSISTANT_ACTION_ICON_SIZE} />
        </button>
      </Tooltip>
      {open && (
        <span className="hc-auto-review-popover" role="dialog" data-state="open" aria-label={summary.title}>
          <span className="hc-auto-review-popover-title">{summary.title}</span>
          {summary.rows.length > 0 && (
            <span className="hc-auto-review-popover-rows">
              {summary.rows.map((row) => (
                <span className="hc-auto-review-popover-row" key={`${row.label}:${row.value}`}>
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </span>
              ))}
            </span>
          )}
          {summary.entries.length > 0 && (
            <span className="hc-auto-review-command-list">
              {summary.entries.map((entry, index) => (
                <code key={`${index}:${entry.kind}:${entry.text}`}>{`${entry.kind}: ${entry.text}`}</code>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function AssistantCompletedGoalAction({ summary }: { summary: AssistantCompletedGoalSummary }) {
  const { formatMessage } = useForgeIntl();
  const visibleLabel = summary.durationLabel
    ? formatMessage(
        { id: "assistantMessageContent.goalAchieved", defaultMessage: "Goal achieved in {totalTime}" },
        { totalTime: summary.durationLabel },
      )
    : formatMessage({ id: "composer.threadGoal.summary.complete", defaultMessage: "Goal achieved" });
  return (
    <span
      aria-label={summary.objective
        ? formatMessage({ id: "hc.assistantMessage.goalCompleteWithObjective", defaultMessage: "Goal achieved: {objective}" }, { objective: summary.objective })
        : formatMessage({ id: "composer.threadGoal.summary.complete", defaultMessage: "Goal achieved" })}
      className="hc-message-action-status text hc-message-goal-chip"
      title={summary.objective || visibleLabel}
    >
      {visibleLabel}
    </span>
  );
}

export function assistantHookStatsSummary(
  item: Record<string, unknown>,
  formatMessage: FormatMessage,
): AssistantHookStatsSummary | null {
  const raw = (item as { hookStats?: unknown }).hookStats;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const count = numericField(record, "count");
  const blocked = numericField(record, "blockedCount") || numericField(record, "blocked");
  const errorCount = numericField(record, "errorCount") || numericField(record, "errors");
  const entriesRaw = Array.isArray(record.entries) ? record.entries : [];
  const entries: Array<{ kind: string; text: string }> = [];
  for (const entry of entriesRaw) {
    if (!entry || typeof entry !== "object") continue;
    const er = entry as Record<string, unknown>;
    const kind = typeof er.kind === "string" ? er.kind.trim() : "";
    const text = typeof er.text === "string" ? er.text.trim() : "";
    if (!kind && !text) continue;
    entries.push({ kind: kind || "hook", text: text.length > 240 ? `${text.slice(0, 237)}...` : text });
    if (entries.length >= 6) break;
  }
  if (count === 0 && blocked === 0 && errorCount === 0 && entries.length === 0) return null;
  const label = formatMessage({
    id: "assistantMessage.hookStats.label",
    defaultMessage: "Hooks",
    description: "Accessible label for hook runs",
  });
  const rows: Array<{ label: string; value: string }> = [];
  if (count > 0) rows.push({ label: formatMessage({ id: "assistantMessage.hookStats.ranCount", defaultMessage: "Ran" }), value: String(count) });
  if (blocked > 0) rows.push({ label: formatMessage({ id: "assistantMessage.hookStats.blockedCount", defaultMessage: "Blocked" }), value: String(blocked) });
  if (errorCount > 0) rows.push({ label: formatMessage({ id: "assistantMessage.hookStats.errorCount", defaultMessage: "Errors" }), value: String(errorCount) });
  return { label, title: formatMessage({ id: "assistantMessage.hookStats.title", defaultMessage: "Hooks summary" }), rows, entries };
}

export function assistantCompletedThreadGoal(item: Record<string, unknown>): AssistantCompletedGoalSummary | null {
  const raw = (item as { completedThreadGoal?: unknown; _completedThreadGoal?: unknown }).completedThreadGoal
    ?? (item as { _completedThreadGoal?: unknown })._completedThreadGoal;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  if (status && status !== "complete" && status !== "completed") return null;
  const objective = typeof record.objective === "string" ? record.objective.trim() : "";
  const seconds = numericField(record, "timeUsedSeconds");
  const durationLabel = seconds > 0 ? formatGoalDuration(seconds * 1000) : "";
  const label = durationLabel ? `Goal achieved in ${durationLabel}` : "Goal complete";
  return { label, objective, durationLabel };
}

function formatGoalDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function messageSentAtMs(item: Record<string, unknown>): number | null {
  const value = item.sentAtMs;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function numericField(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
