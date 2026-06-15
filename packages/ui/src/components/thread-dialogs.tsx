import type { Thread } from "@forge/codex-protocol";

import { ForkFromOlderTurnDialog } from "./fork-from-older-turn-dialog";
import { ThreadActionDialog, type ThreadActionDialogState } from "./thread-action-dialog";

/*
 * Thread-level overlays: the rename/archive action dialog and the
 * fork-from-older-turn confirmation dialog, extracted from ForgeApp's
 * overlay layer. All callbacks are stable useCallbacks built in the body.
 */
export function ThreadDialogs({
  threadActionDialog,
  onThreadActionClose,
  onRename,
  onArchive,
  forkConfirmOpen,
  forkConfirmSubmitting,
  onForkClose,
  onForkConfirm,
}: {
  threadActionDialog: ThreadActionDialogState | null;
  onThreadActionClose: () => void;
  onRename: (thread: Thread, name: string) => void | Promise<void>;
  onArchive: (thread: Thread) => void | Promise<void>;
  forkConfirmOpen: boolean;
  forkConfirmSubmitting: boolean;
  onForkClose: () => void;
  onForkConfirm: () => void;
}) {
  return (
    <>
      {threadActionDialog && (
        <ThreadActionDialog
          action={threadActionDialog}
          onClose={onThreadActionClose}
          onRename={onRename}
          onArchive={onArchive}
        />
      )}
      <ForkFromOlderTurnDialog
        open={forkConfirmOpen}
        isSubmitting={forkConfirmSubmitting}
        onClose={onForkClose}
        onForkIntoLocal={onForkConfirm}
      />
    </>
  );
}
