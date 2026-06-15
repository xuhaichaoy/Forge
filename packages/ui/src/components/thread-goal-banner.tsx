import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pause, Pencil, Play, Target, X } from "lucide-react";
import type { ThreadGoal } from "@forge/codex-protocol";
import type { ThreadGoalStatus } from "@forge/codex-protocol/generated/v2/ThreadGoalStatus";
import { AboveComposerPanel, PanelRow } from "./above-composer-panel";
import { useForgeIntl } from "./i18n-provider";
import { portalDialogToBody } from "./thread-goal-dialogs";
import { threadGoalBannerSummary } from "../state/thread-goal-summary";

export {
  ThreadGoalReplaceConfirm,
  ThreadGoalResumeConfirm,
} from "./thread-goal-dialogs";

export {
  formatThreadGoalDuration,
  formatThreadGoalTokenCount,
  nextThreadGoalStatus,
  shouldShowGoalTokenProgress,
  threadGoalBannerSummary,
  threadGoalElapsedMs,
  type ThreadGoalBannerSummary,
} from "../state/thread-goal-summary";

export type ThreadGoalBannerAction = "edit" | "status" | "clear";

export interface ThreadGoalBannerProps {
  goal: ThreadGoal | null;
  pendingAction?: ThreadGoalBannerAction | null;
  onEditGoal?: (objective: string) => void | Promise<void>;
  onSetGoalStatus?: (status: ThreadGoalStatus) => void | Promise<void>;
  onClearGoal?: () => void | Promise<void>;
}

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
  formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"],
): string {
  const key = STATUS_LABEL_INTL_KEY[statusLabel];
  return key ? formatMessage({ id: `composer.threadGoal.summary.${key}`, defaultMessage: statusLabel }) : statusLabel;
}

// codex composer-B7sGHJVq.js: `if(a.length>4e3) <danger toast
// composer.threadGoal.objectiveTooLong>` — a goal objective must be 4000
// characters or fewer.
const THREAD_GOAL_OBJECTIVE_MAX_CHARS = 4000;

export function ThreadGoalBanner({
  goal,
  pendingAction = null,
  onEditGoal,
  onSetGoalStatus,
  onClearGoal,
}: ThreadGoalBannerProps) {
  const { formatMessage, locale } = useForgeIntl();
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

  useEffect(() => {
    if (!editing) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing]);

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
      {editing && portalDialogToBody(
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
