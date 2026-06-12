import { useEffect, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ThreadGoalStatus } from "@hicodex/codex-protocol/generated/v2/ThreadGoalStatus";
import { useHiCodexIntl } from "./i18n-provider";

// Window-level Escape: these dialogs are hand-rolled (not Radix), so without
// this the only dismiss affordances are pointer-based.
function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
}

/*
 * The goal dialogs mount in the composer footer subtree, which lives inside
 * `.hc-thread-scroll-content` — that wrapper always carries a `transform`, so
 * a `position: fixed` backdrop rendered inline re-anchors to the scroll
 * content box and gets clipped by the scroll container's overflow.
 */
export function portalDialogToBody(dialog: ReactElement) {
  return typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;
}

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
  useEscapeToClose(onCancel);
  return portalDialogToBody(
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
    </div>,
  );
}

// codex composer.threadGoal.resumeConfirmation.* — shown when a thread is resumed
// with a paused/blocked/usage-limited goal.
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
  useEscapeToClose(onDismiss);
  return portalDialogToBody(
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
    </div>,
  );
}
