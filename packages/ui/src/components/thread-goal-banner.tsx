import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pause, Pencil, Play, Target, X } from "lucide-react";
import type { ThreadGoal } from "@hicodex/codex-protocol";
import type { ThreadGoalStatus } from "@hicodex/codex-protocol/generated/v2/ThreadGoalStatus";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";
import { useHiCodexIntl } from "./i18n-provider";
import { HICODEX_DEFAULT_LOCALE, type HiCodexLocale } from "../state/i18n";

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

// codex: composer.threadGoal.summary.<status> — the summary stays locale-free
// (English statusLabel, keeps the pure projection + tests stable); the renderer
// maps it back to the Codex key so zh-CN shows 进行中的目标 / 已达成目标 etc.
const STATUS_LABEL_INTL_KEY: Record<string, string> = {
  "Pursuing goal": "active",
  "Paused goal": "paused",
  "Goal blocked": "blocked",
  "Goal usage limited": "usageLimited",
  "Goal limited": "budgetLimited",
  "Goal achieved": "complete",
};
function localizeGoalStatusLabel(
  statusLabel: string,
  formatMessage: ReturnType<typeof useHiCodexIntl>["formatMessage"],
): string {
  const key = STATUS_LABEL_INTL_KEY[statusLabel];
  return key ? formatMessage({ id: `composer.threadGoal.summary.${key}`, defaultMessage: statusLabel }) : statusLabel;
}

export function threadGoalBannerSummary(goal: ThreadGoal, nowMs = Date.now(), locale: HiCodexLocale = HICODEX_DEFAULT_LOCALE): ThreadGoalBannerSummary {
  const objective = goal.objective.trim() || "Untitled goal";
  const nextStatus = nextThreadGoalStatus(goal.status);
  const detail = shouldShowGoalTokenProgress(goal)
    ? `${formatThreadGoalTokenCount(goal.tokensUsed, locale)} / ${formatThreadGoalTokenCount(goal.tokenBudget ?? 0, locale)}`
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

// codex composer-*.js renders goal token progress via
// formatNumber(n, {notation:"compact", maximumFractionDigits:1}) — locale-aware
// (en-US "12.3K", zh-CN "1.2万"), NOT a custom K/M tuple that rounds to integers.
export function formatThreadGoalTokenCount(value: number, locale: HiCodexLocale = HICODEX_DEFAULT_LOCALE): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(Math.floor(value));
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

// codex composer-B7sGHJVq.js: `if(a.length>4e3) <danger toast
// composer.threadGoal.objectiveTooLong>` — a goal objective must be 4000
// characters or fewer.
const THREAD_GOAL_OBJECTIVE_MAX_CHARS = 4000;

// codex composer.threadGoal.replaceConfirmation.* — shown before replacing an
// already-saved goal with a new objective typed in goal mode.
export function ThreadGoalReplaceConfirm({
  objective,
  pending = false,
  onConfirm,
  onCancel,
}: {
  objective: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="hc-thread-dialog-panel hc-thread-goal-edit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hc-thread-goal-replace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div id="hc-thread-goal-replace-title">{formatMessage({ id: "composer.threadGoal.replaceConfirmation.title", defaultMessage: "Replace current goal?" })}</div>
          <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onCancel}>
            <X size={16} />
          </button>
        </header>
        <div className="hc-thread-dialog-body">
          <p>{formatMessage({ id: "composer.threadGoal.replaceConfirmation.subtitle", defaultMessage: "This will keep the thread but replace the saved goal with your current composer text" })}</p>
        </div>
        <footer>
          <button type="button" className="hc-mini-button ghost" onClick={onCancel}>
            {formatMessage({ id: "composer.threadGoal.replaceConfirmation.cancel", defaultMessage: "Cancel" })}
          </button>
          <button type="button" className="hc-mini-button accept" disabled={pending} onClick={onConfirm}>
            {formatMessage({ id: "composer.threadGoal.replaceConfirmation.confirm", defaultMessage: "Replace goal" })}
          </button>
        </footer>
      </section>
    </div>
  );
}

// codex composer.threadGoal.resumeConfirmation.* — shown when a thread is resumed
// with a paused/blocked/usage-limited goal (codex tui
// maybe_prompt_resume_paused_goal_after_resume → show_resume_paused_goal_prompt).
// Resume sets the goal active; keep-paused / not-now just dismiss (the protocol
// has no dismiss RPC, so dismissal is client-side).
export function ThreadGoalResumeConfirm({
  objective,
  status,
  pending = false,
  onResume,
  onDismiss,
}: {
  objective: string;
  status: ThreadGoalStatus;
  pending?: boolean;
  onResume: () => void;
  onDismiss: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const title = status === "paused"
    ? formatMessage({ id: "composer.threadGoal.resumeConfirmation.title", defaultMessage: "Resume paused goal?" })
    : formatMessage({ id: "composer.threadGoal.resumeConfirmation.resumableTitle", defaultMessage: "Resume goal?" });
  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className="hc-thread-dialog-panel hc-thread-goal-edit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hc-thread-goal-resume-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div id="hc-thread-goal-resume-title">{title}</div>
          <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onDismiss}>
            <X size={16} />
          </button>
        </header>
        <div className="hc-thread-dialog-body">
          <p>{formatMessage({ id: "composer.threadGoal.resumeConfirmation.subtitle", defaultMessage: "Codex will keep working toward this goal when the thread is idle" })}</p>
          <p className="hc-thread-goal-resume-objective">{objective}</p>
        </div>
        <footer>
          <button type="button" className="hc-mini-button ghost" onClick={onDismiss}>
            {formatMessage({ id: "composer.threadGoal.resumeConfirmation.notNow", defaultMessage: "Not now" })}
          </button>
          <button type="button" className="hc-mini-button ghost" onClick={onDismiss}>
            {formatMessage({ id: "composer.threadGoal.resumeConfirmation.keepPaused", defaultMessage: "Keep paused" })}
          </button>
          <button type="button" className="hc-mini-button accept" disabled={pending} onClick={onResume}>
            {formatMessage({ id: "composer.threadGoal.resumeConfirmation.resume", defaultMessage: "Resume goal" })}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ThreadGoalBanner({
  goal,
  pendingAction = null,
  onEditGoal,
  onSetGoalStatus,
  onClearGoal,
}: ThreadGoalBannerProps) {
  const { formatMessage, locale } = useHiCodexIntl();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const summary = useMemo(() => goal ? threadGoalBannerSummary(goal, nowMs, locale) : null, [goal, nowMs, locale]);
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

  const draftTooLong = draft.trim().length > THREAD_GOAL_OBJECTIVE_MAX_CHARS;

  const submitEdit = async () => {
    const nextObjective = draft.trim();
    if (!nextObjective || nextObjective === goal.objective.trim() || draftTooLong || !onEditGoal) return;
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
              <span className="hc-thread-goal-banner-status">{localizeGoalStatusLabel(summary.statusLabel, formatMessage)}</span>
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
                {draftTooLong && (
                  <p className="hc-thread-goal-edit-error" role="alert">
                    {formatMessage(
                      { id: "composer.threadGoal.objectiveTooLong", defaultMessage: "Goal must be {maxCharacters, number} characters or fewer" },
                      { maxCharacters: THREAD_GOAL_OBJECTIVE_MAX_CHARS },
                    )}
                  </p>
                )}
              </div>
              <footer>
                <button type="button" className="hc-mini-button ghost" onClick={() => setEditing(false)}>
                  {formatMessage({ id: "composer.threadGoal.editDialog.cancel", defaultMessage: "Cancel" })}
                </button>
                <button
                  type="submit"
                  className="hc-mini-button accept"
                  disabled={!draft.trim() || draft.trim() === goal.objective.trim() || draftTooLong || pendingAction === "edit"}
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
