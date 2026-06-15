import { GitFork } from "lucide-react";
import { useState } from "react";
import { useForgeIntl, type ForgeIntlContextValue } from "./i18n-provider";
import { IconActionButton, MessageActionRow } from "./message-action-row";

type FormatMessage = ForgeIntlContextValue["formatMessage"];

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

export interface AssistantAutoReviewSummary {
  label: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  commands: string[];
}

export function AssistantMessageActions({
  copyText,
  item,
  onFork,
}: {
  copyText: string;
  hasArtifacts?: boolean;
  item: Record<string, unknown>;
  onFork?: () => void;
  threadId?: string | null;
  turnId?: string | null;
}) {
  const { formatMessage } = useForgeIntl();
  const autoReviewSummary = assistantAutoReviewSummary(item);
  const hookStatsSummary = assistantHookStatsSummary(item, formatMessage);
  const goalSummary = assistantCompletedThreadGoal(item);
  const hasActionChildren = Boolean(onFork)
    || Boolean(autoReviewSummary)
    || Boolean(hookStatsSummary)
    || Boolean(goalSummary);
  return (
    <MessageActionRow copyText={copyText} hasActionChildren={hasActionChildren} sentAtMs={messageSentAtMs(item)}>
      {onFork && (
        <IconActionButton ariaLabel={formatMessage({ id: "assistantMessageContent.forkAriaLabel", defaultMessage: "Fork from this point" })} title={formatMessage({ id: "assistantMessageContent.forkTooltip", defaultMessage: "Fork" })} onClick={onFork}>
          {/* Forge divergence: 12px (Codex action icon-xs = 16px), per product preference */}
          <GitFork size={12} />
        </IconActionButton>
      )}
      {autoReviewSummary && <AssistantAutoReviewAction summary={autoReviewSummary} />}
      {hookStatsSummary && <AssistantHookStatsAction summary={hookStatsSummary} />}
      {goalSummary && <AssistantCompletedGoalAction summary={goalSummary} />}
    </MessageActionRow>
  );
}

function AssistantHookStatsAction({ summary }: { summary: AssistantHookStatsSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hc-auto-review-action">
      <button
        aria-expanded={open}
        className="hc-message-action-status text hc-auto-review-trigger"
        onClick={() => setOpen((value) => !value)}
        title={summary.title}
        type="button"
      >
        {summary.label}
      </button>
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
  const total = count > 0 ? count : entries.length;
  const label = total === 1 ? "1 hook" : `${total} hooks`;
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

function AssistantAutoReviewAction({ summary }: { summary: AssistantAutoReviewSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="hc-auto-review-action">
      <button
        aria-expanded={open}
        className="hc-message-action-status text hc-auto-review-trigger"
        onClick={() => setOpen((value) => !value)}
        title={summary.title}
        type="button"
      >
        {summary.label}
      </button>
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
          {summary.commands.length > 0 && (
            <span className="hc-auto-review-command-list">
              {summary.commands.map((command, index) => (
                <code key={`${index}:${command}`}>{command}</code>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function assistantAutoReviewSummary(item: Record<string, unknown>): AssistantAutoReviewSummary | null {
  const stats = item.autoReviewStats;
  if (!stats || typeof stats !== "object") return null;
  const record = stats as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  const status = autoReviewStringField(record, "status");
  if (status) rows.push({ label: "Status", value: status });
  const risk = autoReviewStringField(record, "riskLevel") || autoReviewStringField(record, "risk");
  if (risk) rows.push({ label: "Risk", value: risk });
  const issueCount = numericField(record, "issueCount") || numericField(record, "findings") || numericField(record, "findingCount");
  if (issueCount > 0) rows.push({ label: "Findings", value: String(issueCount) });
  const accepted = numericField(record, "accepted") || numericField(record, "acceptedCount");
  if (accepted > 0) rows.push({ label: "Accepted", value: String(accepted) });
  const rejected = numericField(record, "rejected") || numericField(record, "rejectedCount");
  if (rejected > 0) rows.push({ label: "Rejected", value: String(rejected) });
  const duration = autoReviewDuration(record);
  if (duration) rows.push({ label: "Duration", value: duration });
  const rationale = autoReviewStringField(record, "rationale") || autoReviewStringField(record, "summary");
  if (rationale) rows.push({ label: "Rationale", value: truncateAutoReviewDetail(rationale) });
  const commands = autoReviewCommands(record);
  const label = autoReviewLabel(record, issueCount, status);
  return {
    label,
    title: issueCount > 0 ? "Auto-review notes" : "Auto-review",
    rows,
    commands,
  };
}

function autoReviewLabel(record: Record<string, unknown>, issueCount: number, status: string): string {
  if (issueCount > 0) return issueCount === 1 ? "1 review note" : `${issueCount} review notes`;
  const accepted = numericField(record, "accepted") || numericField(record, "acceptedCount");
  const rejected = numericField(record, "rejected") || numericField(record, "rejectedCount");
  if (accepted > 0 || rejected > 0) return `${accepted} accepted / ${rejected} rejected`;
  return status || "Review";
}

function autoReviewDuration(record: Record<string, unknown>): string {
  const durationMs = numericField(record, "durationMs") || numericField(record, "elapsedMs");
  if (durationMs <= 0) return "";
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function autoReviewCommands(record: Record<string, unknown>): string[] {
  const fields = [
    record.perCommandHistory,
    record.commands,
    record.commandHistory,
  ];
  return fields.flatMap((field) => {
    if (!Array.isArray(field)) return [];
    return field.flatMap((entry) => autoReviewCommandText(entry));
  }).slice(0, 6);
}

function autoReviewCommandText(entry: unknown): string[] {
  if (typeof entry === "string" && entry.trim()) return [entry.trim()];
  if (!entry || typeof entry !== "object") return [];
  const record = entry as Record<string, unknown>;
  const command = autoReviewStringField(record, "command")
    || autoReviewStringField(record, "cmd")
    || autoReviewStringField(record, "text");
  const decision = autoReviewStringField(record, "decision") || autoReviewStringField(record, "status");
  if (!command) return [];
  return [decision ? `${decision}: ${command}` : command];
}

function autoReviewStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function truncateAutoReviewDetail(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
}

function messageSentAtMs(item: Record<string, unknown>): number | null {
  const candidates: unknown[] = [
    item.sentAtMs,
    item.completedAtMs,
    item.startedAtMs,
    item.createdAtMs,
    item.createdAt,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function numericField(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
