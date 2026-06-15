import { Archive, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Thread } from "@forge/codex-protocol";
import { threadTitle } from "../state/thread-workflow";
import { useForgeIntl } from "./i18n-provider";

export type ThreadActionDialogState =
  | { kind: "rename"; thread: Thread }
  | { kind: "archive"; thread: Thread };

export interface ThreadActionDialogProps {
  action: ThreadActionDialogState;
  onClose: () => void;
  onRename: (thread: Thread, name: string) => void | Promise<void>;
  onArchive: (thread: Thread) => void | Promise<void>;
}

export function ThreadActionDialog({
  action,
  onClose,
  onRename,
  onArchive,
}: ThreadActionDialogProps) {
  const { formatMessage } = useForgeIntl();
  const title = threadTitle(action.thread);
  const [draft, setDraft] = useState(title);

  useEffect(() => {
    setDraft(title);
  }, [action.thread.id, title]);

  function submitRename(event: FormEvent) {
    event.preventDefault();
    const nextName = draft.trim();
    if (!nextName) return;
    void onRename(action.thread, nextName);
  }

  return (
    <div className="hc-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="hc-thread-dialog-panel"
        role="dialog"
        data-state="open"
        aria-modal="true"
        aria-label={
          action.kind === "rename"
            ? formatMessage({ id: "sidebarElectron.renameThreadDialogTitle", defaultMessage: "Rename chat" })
            : formatMessage({ id: "threadHeader.archiveConfirmTitle", defaultMessage: "Archive chat?" })
        }
        onMouseDown={(event) => event.stopPropagation()}
      >
        {action.kind === "rename" ? (
          <form onSubmit={submitRename}>
            <header>
              <div><Pencil size={16} /> {formatMessage({ id: "sidebarElectron.renameThreadDialogTitle", defaultMessage: "Rename chat" })}</div>
              <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onClose}><X size={16} /></button>
            </header>
            <div className="hc-thread-dialog-body">
              {/* codex sidebarElectron.renameThreadDialogSubtitle */}
              <p className="hc-thread-dialog-subtitle">{formatMessage({ id: "sidebarElectron.renameThreadDialogSubtitle", defaultMessage: "Keep it short and recognizable" })}</p>
              <label>
                {formatMessage({ id: "hc.threadDialog.nameLabel", defaultMessage: "Name" })}
                <input
                  autoFocus
                  value={draft}
                  placeholder={formatMessage({ id: "sidebarElectron.renameThreadDialogPlaceholder", defaultMessage: "Add a title…" })}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onClose();
                  }}
                />
              </label>
            </div>
            <footer>
              <button type="button" className="hc-mini-button ghost" onClick={onClose}>{formatMessage({ id: "sidebarElectron.renameThreadDialogCancel", defaultMessage: "Cancel" })}</button>
              <button type="submit" className="hc-mini-button accept" disabled={!draft.trim()}>{formatMessage({ id: "sidebarElectron.renameThreadDialogSave", defaultMessage: "Save" })}</button>
            </footer>
          </form>
        ) : (
          <>
            <header>
              <div><Archive size={16} /> {formatMessage({ id: "threadHeader.archiveConfirmTitle", defaultMessage: "Archive chat?" })}</div>
              <button type="button" aria-label={formatMessage({ id: "common.close", defaultMessage: "Close" })} onClick={onClose}><X size={16} /></button>
            </header>
            <div className="hc-thread-dialog-body">
              <span>{formatMessage({ id: "threadHeader.archiveConfirmSubtitle", defaultMessage: "You can find it later in your archived chats." })}</span>
            </div>
            <footer>
              <button type="button" className="hc-mini-button ghost" onClick={onClose}>{formatMessage({ id: "threadHeader.archiveConfirmCancel", defaultMessage: "Cancel" })}</button>
              <button type="button" className="hc-mini-button decline" autoFocus onClick={() => void onArchive(action.thread)}>
                {formatMessage({ id: "threadHeader.archiveConfirmConfirm", defaultMessage: "Archive" })}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
