import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import type { ThreadActionDialogState } from "../components/thread-action-dialog";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { findRolloutForThread, getHostStatus, isTauriRuntime } from "../lib/tauri-host";
import type {
  CodexUiAction,
  ThreadContextDefaults,
} from "../state/codex-reducer";
import type { ComposerAttachment } from "../state/composer-workflow";
import {
  archiveThread,
  editLastUserTurn as editLastUserTurnWorkflow,
  forkThread as forkThreadWorkflow,
  forkThreadFromTurn as forkThreadFromTurnWorkflow,
  isThreadNotFound,
  isThreadNotMaterialized,
  readThreadForDisplay,
  renameThread as renameThreadWorkflow,
  resumeThreadWithMetadataRead,
} from "../state/thread-workflow";

export function useThreadActions({
  activeThread,
  client,
  dispatch,
  ensureConnected,
  setComposerAttachments,
  setInput,
  threadContextDefaults,
  threads,
  workspace,
}: {
  activeThread: Thread | null;
  client: CodexJsonRpcClient;
  dispatch: (action: CodexUiAction) => void;
  ensureConnected: () => Promise<boolean>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setInput: Dispatch<SetStateAction<string>>;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  workspace: string;
}) {
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | null>(null);
  const threadSelectionRequestId = useRef(0);

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
          `${formatError(error)}. This conversation's rollout file could not be located on disk. Start a new chat to continue with your edited message.`,
        );
      }
      throw error;
    }
  }, [activeThread, client, dispatch, ensureConnected, threadContextDefaults, workspace]);

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
    createThread,
    editLastUserTurn,
    forkActiveThreadFromTurn,
    forkSelectedThread,
    openArchiveThreadDialog,
    openRenameThreadDialog,
    renameSelectedThread,
    resumeSelectedThread,
    selectThread,
    threadActionDialog,
  };
}
