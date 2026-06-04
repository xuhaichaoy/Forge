import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import type { ThreadActionDialogState } from "../components/thread-action-dialog";
import { useServices } from "../components/services-context";
import { formatError } from "../lib/format";
import { createPendingWorktree, findRolloutForThread, getHostStatus, isTauriRuntime } from "../lib/tauri-host";
import type { ThreadContextDefaults } from "../state/codex-reducer";
import type { ComposerAttachment } from "../state/composer-workflow";
import {
  archiveThread,
  editLastUserTurn as editLastUserTurnWorkflow,
  forkThread as forkThreadWorkflow,
  forkThreadFromTurn as forkThreadFromTurnWorkflow,
  forkThreadIntoWorktree as forkThreadIntoWorktreeWorkflow,
  isThreadNotFound,
  isThreadNotMaterialized,
  readThreadForDisplay,
  renameThread as renameThreadWorkflow,
  resumeThreadWithMetadataRead,
} from "../state/thread-workflow";

export function useThreadActions({
  activeThread,
  ensureConnected,
  setComposerAttachments,
  setInput,
  threadContextDefaults,
  threads,
  workspace,
}: {
  activeThread: Thread | null;
  ensureConnected: () => Promise<boolean>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  workspace: string;
}) {
  const { client, dispatch } = useServices();
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | null>(null);
  const threadSelectionRequestId = useRef(0);

  // codex: local-conversation-thread-Kn0WAsVa#J (L25912-25927) — Codex Desktop
  // routes any `turnId !== latestTurnId` edit through `zi(u, Wd, {...})` (the
  // ForkFromOlderTurnDialog modal). The dialog's `onForkIntoLocal` callback is
  // what actually invokes the edit. We mirror that by deferring the edit until
  // the user confirms the dialog: `editLastUserTurn` parks a Promise resolver
  // here, and the dialog's confirm button resolves it.
  const [forkConfirmOpen, setForkConfirmOpen] = useState(false);
  const [forkConfirmSubmitting, setForkConfirmSubmitting] = useState(false);
  const forkConfirmResolverRef = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

  const createThread = useCallback(async () => {
    threadSelectionRequestId.current += 1;
    setInput("");
    setComposerAttachments([]);
    dispatch({ type: "setActiveThread", threadId: null });
  }, [dispatch, setComposerAttachments, setInput]);

  const selectThread = useCallback(async (thread: Thread) => {
    const requestId = threadSelectionRequestId.current + 1;
    threadSelectionRequestId.current = requestId;
    dispatch({ type: "setActiveThread", threadId: thread.id });
    try {
      const displayThread = await readThreadForDisplay(client, thread, dispatch);
      if (threadSelectionRequestId.current !== requestId) return;
      if (displayThread) {
        dispatch({ type: "upsertThread", thread: displayThread, select: true });
      }
    } catch (error) {
      if (threadSelectionRequestId.current !== requestId) return;
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: thread.id });
      } else {
        dispatch({ type: "log", text: formatError(error), level: "error" });
      }
    }
  }, [client, dispatch]);

  const resumeSelectedThread = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const result = await resumeThreadWithMetadataRead(client, thread.id, workspace, threadContextDefaults);
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: thread.id });
      } else {
        dispatch({ type: "log", text: formatError(error), level: "error" });
      }
    }
  }, [client, dispatch, ensureConnected, threadContextDefaults, workspace]);

  const forkSelectedThread = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const result = await forkThreadWorkflow(client, thread.id, thread.cwd || workspace, threadContextDefaults);
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, dispatch, ensureConnected, threadContextDefaults, workspace]);

  // codex sidebar-thread-section `fork-into-worktree` — fork into a fresh git
  // worktree (host createPendingWorktree → fork with the worktree path as cwd).
  const forkSelectedThreadIntoWorktree = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const cwd = (thread.cwd || workspace).trim();
      if (!cwd) {
        dispatch({ type: "log", text: "Working directory is unavailable", level: "warn" });
        return;
      }
      const result = await forkThreadIntoWorktreeWorkflow(
        client,
        thread.id,
        cwd,
        createPendingWorktree,
        threadContextDefaults,
      );
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, dispatch, ensureConnected, threadContextDefaults, workspace]);

  const forkActiveThreadFromTurn = useCallback(async (turnId: string) => {
    if (!activeThread) return;
    try {
      if (!(await ensureConnected())) return;
      const result = await forkThreadFromTurnWorkflow(
        client,
        activeThread.id,
        turnId,
        workspace,
        threadContextDefaults,
      );
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeThread, client, dispatch, ensureConnected, threadContextDefaults, workspace]);

  const editLastUserTurn = useCallback(async (turnId: string, message: string) => {
    if (!activeThread) return;
    if (!(await ensureConnected())) return;

    // codex: local-conversation-thread-Kn0WAsVa#J (L25912-25927) — Codex
    // Desktop diverts edits whose `turnId !== latestTurnId` into the
    // ForkFromOlderTurnDialog (`zi(u, Wd, {...})`). Mirror that here: park a
    // resolver, open the dialog, and only proceed once the user confirms. The
    // workflow itself (`editLastUserTurn` in `thread-workflow.ts`) handles the
    // actual fork; the dialog is purely a confirmation gate.
    const latestTurn = activeThread.turns.at(-1) ?? null;
    const needsForkConfirm = latestTurn != null && latestTurn.id !== turnId;
    if (needsForkConfirm) {
      try {
        await new Promise<void>((resolve, reject) => {
          forkConfirmResolverRef.current = { resolve, reject };
          setForkConfirmSubmitting(false);
          setForkConfirmOpen(true);
        });
      } catch {
        // User cancelled — silently abort, leaving the composer state as is.
        forkConfirmResolverRef.current = null;
        setForkConfirmOpen(false);
        setForkConfirmSubmitting(false);
        return;
      }
      // Confirmed: keep dialog open with submitting indicator until the
      // underlying fork+edit settles.
      setForkConfirmSubmitting(true);
    }
    /*
     * The workflow auto-recovers `thread not found` by calling
     * `thread/resume {path}` (path-based bypass of the stale session_index).
     * For that we need the rollout JSONL path. `activeThread.path` is
     * populated by `thread/list` / `thread/start` responses, but the local
     * UI may have cached a `Thread` without `path` (e.g. an older snapshot
     * loaded from sqlite). When that happens, scan the on-disk sessions
     * directory via Tauri (`host_find_rollout_for_thread`) so we still have
     * something to hand the workflow.
     *
     * If `host_find_rollout_for_thread` is missing (older Tauri build that
     * hasn't been restarted after we added the command), surface a clear
     * message so the user knows to restart instead of seeing the same opaque
     * "thread not found" again.
     */
    let rolloutPath: string | null = activeThread.path?.trim() ? activeThread.path : null;
    let tauriCommandMissing = false;
    if (!rolloutPath && isTauriRuntime()) {
      try {
        const status = await getHostStatus();
        rolloutPath = await findRolloutForThread(activeThread.id, status?.codexHome ?? null);
      } catch (lookupError) {
        // Best-effort — don't break edit if the lookup itself fails.
        const message = formatError(lookupError);
        if (/command\s+host_find_rollout_for_thread\s+not\s+found/i.test(message)
          || /unknown\s+command/i.test(message)) {
          tauriCommandMissing = true;
        }
        dispatch({ type: "log", text: `rollout lookup failed: ${message}`, level: "warn" });
      }
    }
    try {
      await editLastUserTurnWorkflow(
        client,
        activeThread.id,
        turnId,
        message,
        workspace,
        threadContextDefaults,
        (thread) => {
          dispatch({ type: "upsertThread", thread, select: true });
        },
        rolloutPath,
      );
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
      if (isThreadNotFound(error) && tauriCommandMissing) {
        throw new Error(
          `${formatError(error)}. The recovery helper for this app build is not yet loaded — please restart HiCodex (close the desktop window and run \`npm run tauri:dev\` again) and try Send once more.`,
        );
      }
      if (isThreadNotFound(error) && !rolloutPath) {
        throw new Error(
          `${formatError(error)}. This conversation’s rollout file could not be located on disk. Start a new chat to continue with your edited message.`,
        );
      }
      throw error;
    } finally {
      if (needsForkConfirm) {
        forkConfirmResolverRef.current = null;
        setForkConfirmOpen(false);
        setForkConfirmSubmitting(false);
      }
    }
  }, [activeThread, client, dispatch, ensureConnected, threadContextDefaults, workspace]);

  // codex: local-conversation-thread-Kn0WAsVa#Wd (L6379-6453) — `onForkIntoLocal`
  // resolves the parked Promise so `editLastUserTurn` can run the fork+edit;
  // `onClose` rejects it so the caller bails out early.
  const confirmForkFromOlderTurn = useCallback(() => {
    const resolver = forkConfirmResolverRef.current;
    if (!resolver) return;
    resolver.resolve();
  }, []);

  const dismissForkFromOlderTurn = useCallback(() => {
    const resolver = forkConfirmResolverRef.current;
    if (!resolver) {
      setForkConfirmOpen(false);
      setForkConfirmSubmitting(false);
      return;
    }
    resolver.reject(new Error("fork-cancelled"));
  }, []);

  const openRenameThreadDialog = useCallback((thread: Thread) => {
    setThreadActionDialog({ kind: "rename", thread });
  }, []);

  const openArchiveThreadDialog = useCallback((thread: Thread) => {
    setThreadActionDialog({ kind: "archive", thread });
  }, []);

  const closeThreadActionDialog = useCallback(() => {
    setThreadActionDialog(null);
  }, []);

  const renameSelectedThread = useCallback(async (thread: Thread, name: string) => {
    if (!name.trim()) return;
    try {
      if (!(await ensureConnected())) return;
      await renameThreadWorkflow(client, thread.id, name);
      dispatch({
        type: "setThreads",
        threads: threads.map((item) => item.id === thread.id ? { ...item, name: name.trim() } : item),
      });
      setThreadActionDialog(null);
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, dispatch, ensureConnected, threads]);

  const archiveSelectedThread = useCallback(async (thread: Thread) => {
    setThreadActionDialog(null);
    dispatch({ type: "removeThread", threadId: thread.id });
    try {
      if (!(await ensureConnected())) return;
      await archiveThread(client, thread.id);
    } catch (error) {
      if (isThreadNotFound(error) || isThreadNotMaterialized(error)) {
        return;
      }
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, dispatch, ensureConnected]);

  return {
    archiveSelectedThread,
    closeThreadActionDialog,
    confirmForkFromOlderTurn,
    createThread,
    dismissForkFromOlderTurn,
    editLastUserTurn,
    forkActiveThreadFromTurn,
    forkConfirmOpen,
    forkConfirmSubmitting,
    forkSelectedThread,
    forkSelectedThreadIntoWorktree,
    openArchiveThreadDialog,
    openRenameThreadDialog,
    renameSelectedThread,
    resumeSelectedThread,
    selectThread,
    threadActionDialog,
  };
}
