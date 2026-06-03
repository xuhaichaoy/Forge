import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pause, Pencil, Play, Target, X } from "lucide-react";
import type { ThreadGoal } from "@hicodex/codex-protocol";
import type { ThreadGoalStatus } from "@hicodex/codex-protocol/generated/v2/ThreadGoalStatus";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";
import { useHiCodexIntl } from "./i18n-provider";

export type ThreadGoalBannerAction = "edit" | "status" | "clear";

export interface ThreadGoalBannerProps {
  goal: ThreadGoal | null;
  pendingAction?: ThreadGoalBannerAction | null;
  onEditGoal?: (objective: string) => void | Promise<void>;
  onSetGoalStatus?: (status: ThreadGoalStatus) => void | Promise<void>;
  onClearGoal?: () => void | Promise<void>;
}

export interface ThreadGoalBannerSummary {
  statusLabel: string;
  objective: string;
  detail: string;
  nextStatus: ThreadGoalStatus | null;
}

const STATUS_LABELS: Record<ThreadGoalStatus, string> = {
  active: "Pursuing goal",
  paused: "Paused goal",
  blocked: "Goal blocked",
  usageLimited: "Goal usage limited",
  budgetLimited: "Goal limited",
  complete: "Goal achieved",
};

export function threadGoalBannerSummary(goal: ThreadGoal, nowMs = Date.now()): ThreadGoalBannerSummary {
  const objective = goal.objective.trim() || "Untitled goal";
  const nextStatus = nextThreadGoalStatus(goal.status);
  const detail = shouldShowGoalTokenProgress(goal)
    ? `${formatThreadGoalTokenCount(goal.tokensUsed)} / ${formatThreadGoalTokenCount(goal.tokenBudget ?? 0)}`
    : formatThreadGoalDuration(threadGoalElapsedMs(goal, nowMs));
  return {
    statusLabel: STATUS_LABELS[goal.status] ?? "Goal",
    objective,
    detail,
    nextStatus,
  };
}

export function formatThreadGoalDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0s";
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatThreadGoalTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.floor(value);
  if (rounded >= 1_000_000) return formatCompactUnit(rounded, 1_000_000, "M");
  if (rounded >= 1_000) return formatCompactUnit(rounded, 1_000, "K");
  return String(rounded);
}

function formatCompactUnit(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  const shown = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  return `${String(shown).replace(/\.0$/, "")}${suffix}`;
}

function shouldShowGoalTokenProgress(goal: ThreadGoal): boolean {
  return (goal.status === "active" || goal.status === "budgetLimited")
    && goal.tokenBudget != null
    && Number.isFinite(goal.tokenBudget)
    && goal.tokenBudget >= 0;
}

function threadGoalElapsedMs(goal: ThreadGoal, nowMs: number): number {
  const baseMs = Math.max(0, goal.timeUsedSeconds) * 1000;
  if (goal.status !== "active") return baseMs;
  const updatedAt = Number.isFinite(goal.updatedAt) ? goal.updatedAt : nowMs;
  return baseMs + Math.max(0, nowMs - updatedAt);
}

function nextThreadGoalStatus(status: ThreadGoalStatus): ThreadGoalStatus | null {
  if (status === "complete") return null;
  if (status === "active") return "paused";
  return "active";
}

export function ThreadGoalBanner({
  goal,
  pendingAction = null,
  onEditGoal,
  onSetGoalStatus,
  onClearGoal,
}: ThreadGoalBannerProps) {
  const { formatMessage } = useHiCodexIntl();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const summary = useMemo(() => goal ? threadGoalBannerSummary(goal, nowMs) : null, [goal, nowMs]);
  const canToggleStatus = Boolean(summary?.nextStatus && onSetGoalStatus);
  const hasLongObjective = summary ? summary.objective.length > 96 || summary.objective.includes("\n") : false;
  const allActionsDisabled = pendingAction != null;

  useEffect(() => {
    if (!goal || goal.status !== "active") return;
    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [goal]);

  useEffect(() => {
    if (!goal) {
      setEditing(false);
      setDraft("");
      setExpanded(false);
      return;
    }
    setDraft(goal.objective.trim());
  }, [goal]);

  if (!goal || !summary) return null;

  const submitEdit = async () => {
    const nextObjective = draft.trim();
    if (!nextObjective || nextObjective === goal.objective.trim() || !onEditGoal) return;
    await onEditGoal(nextObjective);
    setEditing(false);
  };

  const nextStatus = summary.nextStatus;
  const statusActionLabel = nextStatus === "paused"
    ? formatMessage({ id: "composer.threadGoal.pause", defaultMessage: "Pause goal" })
    : formatMessage({ id: "composer.threadGoal.resume", defaultMessage: "Resume goal" });

  return (
    <>
      <AboveComposerPanel className="hc-thread-goal-banner">
        <PanelRow
          className="hc-thread-goal-banner-row"
          icon={<Target size={14} />}
          title={(
            <span className="hc-thread-goal-banner-title">
              <span className="hc-thread-goal-banner-status">{summary.statusLabel}</span>
              <span className="hc-thread-goal-banner-objective" title={summary.objective}>{summary.objective}</span>
              {summary.detail ? <span className="hc-thread-goal-banner-detail">{summary.detail}</span> : null}
            </span>
          )}
          actions={(
            <>
              {hasLongObjective && (
                <button
                  type="button"
                  className="hc-thread-goal-banner-text-action"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded
                    ? formatMessage({ id: "composer.threadGoal.collapseObjective", defaultMessage: "Hide full goal" })
                    : formatMessage({ id: "composer.threadGoal.expandObjective", defaultMessage: "Show full goal" })}
                </button>
              )}
              {onEditGoal && (
                <button
                  type="button"
                  className="hc-thread-goal-banner-action"
                  aria-label={formatMessage({ id: "composer.threadGoal.edit", defaultMessage: "Edit goal" })}
                  title={formatMessage({ id: "composer.threadGoal.editTooltip", defaultMessage: "Edit goal" })}
                  disabled={allActionsDisabled}
                  onClick={() => {
                    setDraft(goal.objective.trim());
                    setEditing(true);
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
              {canToggleStatus && nextStatus && (
                <button
                  type="button"
                  className="hc-thread-goal-banner-action"
                  aria-label={statusActionLabel}
                  title={statusActionLabel}
                  disabled={allActionsDisabled}
                  onClick={() => void onSetGoalStatus?.(nextStatus)}
                >
                  {nextStatus === "paused" ? <Pause size={14} /> : <Play size={14} />}
                </button>
              )}
              {onClearGoal && (
                <button
                  type="button"
                  className="hc-thread-goal-banner-action"
                  aria-label={formatMessage({ id: "composer.threadGoal.clear", defaultMessage: "Clear goal" })}
                  title={formatMessage({ id: "composer.threadGoal.clearTooltip", defaultMessage: "Clear goal" })}
                  disabled={allActionsDisabled}
                  onClick={() => void onClearGoal()}
                >
                  <X size={14} />
                </button>
              )}
            </>
          )}
        />
        {expanded && (
          <div className="hc-thread-goal-banner-full-objective">
            {summary.objective}
          </div>
        )}
      </AboveComposerPanel>
      {editing && (
        <div
          className="hc-settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(false);
          }}
        >
          <section
            className="hc-thread-dialog-panel hc-thread-goal-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hc-thread-goal-edit-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <form
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void submitEdit();
              }}
            >
              <header>
                <div id="hc-thread-goal-edit-title">{formatMessage({ id: "composer.threadGoal.editDialog.title", defaultMessage: "Edit goal" })}</div>
                <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={() => setEditing(false)}>
                  <X size={16} />
                </button>
              </header>
              <div className="hc-thread-dialog-body">
                <label>
                  {formatMessage({ id: "hc.threadGoal.objectiveLabel", defaultMessage: "Goal objective" })}
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                      if (event.key === "Escape") setEditing(false);
                    }}
                  />
                </label>
              </div>
              <footer>
                <button type="button" className="hc-mini-button ghost" onClick={() => setEditing(false)}>
                  {formatMessage({ id: "composer.threadGoal.editDialog.cancel", defaultMessage: "Cancel" })}
                </button>
                <button
                  type="submit"
                  className="hc-mini-button accept"
                  disabled={!draft.trim() || draft.trim() === goal.objective.trim() || pendingAction === "edit"}
                >
                  {formatMessage({ id: "composer.threadGoal.editDialog.save", defaultMessage: "Save" })}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
