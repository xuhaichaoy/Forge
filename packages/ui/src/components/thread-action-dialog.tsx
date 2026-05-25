import { Archive, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import { threadTitle } from "../state/thread-workflow";

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
        aria-label={action.kind === "rename" ? "Rename chat" : "Archive chat?"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {action.kind === "rename" ? (
          <form onSubmit={submitRename}>
            <header>
              <div><Pencil size={16} /> Rename chat</div>
              <button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
            </header>
            <div className="hc-thread-dialog-body">
              <label>
                Name
                <input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onClose();
                  }}
                />
              </label>
            </div>
            <footer>
              <button type="button" className="hc-mini-button" onClick={onClose}>Cancel</button>
              <button type="submit" className="hc-mini-button accept" disabled={!draft.trim()}>Save</button>
            </footer>
          </form>
        ) : (
          <>
            <header>
              <div><Archive size={16} /> Archive chat?</div>
              <button type="button" aria-label="Close" onClick={onClose}><X size={16} /></button>
            </header>
            <div className="hc-thread-dialog-body">
              <span>You can find it later in your archived chats.</span>
            </div>
            <footer>
              <button type="button" className="hc-mini-button" onClick={onClose}>Cancel</button>
              <button type="button" className="hc-mini-button decline" autoFocus onClick={() => void onArchive(action.thread)}>
                Archive
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
