import { useEffect } from "react";
import { useHiCodexIntl } from "./i18n-provider";

/*
 * codex `zm` — the full-access confirmation modal. Reuses HiCodex's shared dialog
 * surface (hc-settings-backdrop / hc-thread-dialog-panel, cf. confirm-dialog.tsx)
 * with the Codex strings + a danger confirm button.
 */
export function FullAccessConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { formatMessage } = useHiCodexIntl();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="hc-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="hc-thread-dialog-panel hc-full-access-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={formatMessage({
          id: "composer.mode.agentMode.fullAccessConfirm.warningTitle",
          defaultMessage: "Are you sure?",
        })}
      >
        <header>
          <div>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.warningTitle",
              defaultMessage: "Are you sure?",
            })}
          </div>
        </header>
        <div className="hc-thread-dialog-body">
          <p>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.warningDescription",
              defaultMessage:
                "Full access lets Codex access the internet and edit any file on your computer without asking for your approval. This comes with risks like data loss and prompt injection.",
            })}
          </p>
        </div>
        <footer>
          <button type="button" className="hc-kb-topbar-btn" onClick={onCancel} autoFocus>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.goBack",
              defaultMessage: "Cancel",
            })}
          </button>
          <button type="button" className="hc-kb-topbar-btn hc-kb-topbar-btn--danger" onClick={onConfirm}>
            {formatMessage({
              id: "composer.mode.agentMode.fullAccessConfirm.turnOnButton",
              defaultMessage: "Turn on full access",
            })}
          </button>
        </footer>
      </div>
    </div>
  );
}
