import { useCallback, useMemo, useRef, useState } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import type { OpenThreadOptions } from "../components/open-thread";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import type {
  CodexUiAction,
  ThreadContextDefaults,
  ThreadRuntimeSlice,
} from "../state/codex-reducer";
import {
  isThreadStatusInProgress,
  projectConversation,
  type ThreadItem,
} from "../state/render-groups";
import {
  readThread,
  readThreadForDisplay,
  isThreadNotFound,
  startSideConversation as startSideConversationWorkflow,
  threadStatusLabel,
  threadTitle,
} from "../state/thread-workflow";
import {
  normalizedAgentRole,
  normalizedOption,
  shortThreadId,
} from "../state/app-shell-helpers";

const EMPTY_THREAD_ITEMS: ThreadItem[] = [];

export interface BackgroundAgentPanelState {
  threadId: string;
  displayName: string | null;
  kind: "backgroundAgent" | "sideChat";
  model: string | null;
  role: string | null;
  loading: boolean;
  error: string | null;
}

export function useBackgroundAgentPanel({
  client,
  dispatch,
  ensureConnected,
  hostDefaultCwd,
  threadContextDefaults,
  threads,
  threadsRuntime,
  workspace,
}: {
  client: CodexJsonRpcClient;
  dispatch: (action: CodexUiAction) => void;
  ensureConnected: () => Promise<boolean>;
  hostDefaultCwd?: string | null;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  workspace: string;
}) {
  const [backgroundAgentPanel, setBackgroundAgentPanel] = useState<BackgroundAgentPanelState | null>(null);
  const backgroundAgentRequestId = useRef(0);
  const backgroundAgentThread = backgroundAgentPanel
    ? threads.find((thread) => thread.id === backgroundAgentPanel.threadId) ?? null
    : null;
  const backgroundAgentRuntime = backgroundAgentPanel
    ? threadsRuntime[backgroundAgentPanel.threadId] ?? null
    : null;
  const backgroundAgentItems = backgroundAgentRuntime?.items ?? EMPTY_THREAD_ITEMS;
  const backgroundAgentRunning = Boolean(backgroundAgentRuntime?.activeTurnId)
    || isThreadStatusInProgress(backgroundAgentThread?.status);
  const backgroundAgentConversation = useMemo(
    () => projectConversation(backgroundAgentItems, {
      isThreadRunning: backgroundAgentRunning,
      progressPlan: backgroundAgentRuntime?.turnPlan ?? null,
    }),
    [backgroundAgentItems, backgroundAgentRuntime?.turnPlan, backgroundAgentRunning],
  );
  const backgroundAgentTitle = backgroundAgentThread
    ? backgroundAgentPanel?.displayName
      || threadTitle(backgroundAgentThread, backgroundAgentItems)
    : backgroundAgentPanel?.displayName || (backgroundAgentPanel?.kind === "sideChat" ? "Side chat" : "Background agent");
  const backgroundAgentStatus = backgroundAgentPanel?.loading
    ? "loading"
    : backgroundAgentPanel?.error
      ? "error"
      : threadStatusLabel(backgroundAgentThread?.status);
  const backgroundAgentSubtitle = backgroundAgentPanel
    ? [
        shortThreadId(backgroundAgentPanel.threadId),
        backgroundAgentPanel.role,
        backgroundAgentPanel.model ? `Uses ${backgroundAgentPanel.model}` : null,
        backgroundAgentStatus,
      ].filter(Boolean).join(" · ")
    : "";

  const closeBackgroundAgentPanel = useCallback(() => {
    backgroundAgentRequestId.current += 1;
    setBackgroundAgentPanel(null);
  }, []);

  const openBackgroundAgentThread = useCallback(async (threadId: string, options: OpenThreadOptions = {}) => {
    const id = threadId.trim();
    if (!id) return;
    const requestId = backgroundAgentRequestId.current + 1;
    backgroundAgentRequestId.current = requestId;
    const displayName = normalizedOption(options.displayName);
    const kind = options.panelKind ?? "backgroundAgent";
    const model = normalizedOption(options.model);
    const role = normalizedAgentRole(options.role);
    const nextPanel = {
      threadId: id,
      displayName,
      kind,
      model,
      role,
      loading: true,
      error: null,
    };
    setBackgroundAgentPanel((current) => ({
      ...nextPanel,
      displayName: displayName ?? (current?.threadId === id ? current.displayName : null),
      model: model ?? (current?.threadId === id ? current.model : null),
      role: role ?? (current?.threadId === id ? current.role : null),
    }));
    try {
      if (!(await ensureConnected())) {
        if (backgroundAgentRequestId.current !== requestId) return;
        setBackgroundAgentPanel((current) => current?.threadId === id
          ? { ...current, loading: false, error: "Unable to connect to app-server." }
          : current);
        return;
      }
      const metadata = await readThread(client, id, false);
      if (backgroundAgentRequestId.current !== requestId) return;
      const thread = metadata.thread;
      if (!thread) {
        dispatch({ type: "log", text: `thread not found: ${id}`, level: "error" });
        setBackgroundAgentPanel((current) => current?.threadId === id
          ? { ...current, loading: false, error: `Thread not found: ${id}` }
          : current);
        return;
      }
      const displayThread = await readThreadForDisplay(client, thread, dispatch);
      if (backgroundAgentRequestId.current !== requestId) return;
      dispatch({ type: "upsertThread", thread: displayThread ?? thread, select: false });
      setBackgroundAgentPanel((current) => current?.threadId === id
        ? { ...current, loading: false, error: null }
        : current);
    } catch (error) {
      if (backgroundAgentRequestId.current !== requestId) return;
      const message = isThreadNotFound(error) ? `Thread not found: ${id}` : formatError(error);
      setBackgroundAgentPanel((current) => current?.threadId === id
        ? { ...current, loading: false, error: message }
        : current);
      dispatch({ type: "log", text: message, level: isThreadNotFound(error) ? "warn" : "error" });
    }
  }, [client, dispatch, ensureConnected]);

  const openSideConversationPanel = useCallback((thread: Thread) => {
    dispatch({ type: "upsertThread", thread, select: false });
    void openBackgroundAgentThread(thread.id, {
      displayName: "Side chat",
      panelKind: "sideChat",
      model: threadContextDefaults?.model ?? null,
    });
  }, [dispatch, openBackgroundAgentThread, threadContextDefaults?.model]);

  const openSideChatFromThread = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const cwd = thread.cwd || workspace.trim() || hostDefaultCwd || "";
      const result = await startSideConversationWorkflow(
        client,
        thread.id,
        cwd,
        threadContextDefaults,
      );
      dispatch({ type: "upsertThread", thread: result.thread, select: false });
      openSideConversationPanel(result.thread);
    } catch (error) {
      dispatch({ type: "log", text: `Failed to open side chat: ${formatError(error)}`, level: "error" });
    }
  }, [
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd,
    openSideConversationPanel,
    threadContextDefaults,
    workspace,
  ]);

  return {
    backgroundAgentConversation,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    openBackgroundAgentThread,
    openSideChatFromThread,
    openSideConversationPanel,
  };
}
