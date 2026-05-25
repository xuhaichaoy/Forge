import { useCallback, useMemo, useRef, useState } from "react";
import type { Thread } from "@hicodex/codex-protocol";
import type { OpenThreadOptions } from "../components/open-thread";
import { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { buildUserInputFromComposer } from "../state/composer-workflow";
import type {
  ThreadContextDefaults,
  ThreadRuntimeSlice,
} from "../state/codex-reducer";
import {
  isThreadStatusInProgress,
  projectConversation,
  type RailEntry,
  type ThreadItem,
} from "../state/render-groups";
import {
  readThread,
  readThreadForDisplay,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  interruptThreadTurn,
  isThreadNotFound,
  refreshThreadMetadata,
  sendPanelThreadMessage,
  startSideConversation as startSideConversationWorkflow,
  threadStatusLabel,
  threadTitle,
  type ThreadWorkflowDispatch,
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

export interface SideChatSummary {
  threadId: string;
  parentThreadId: string;
  title: string;
  model: string | null;
  createdAt: number;
}

export function useBackgroundAgentPanel({
  client,
  dispatch,
  ensureConnected,
  hostDefaultCwd,
  activeThreadId,
  threadContextDefaults,
  threads,
  threadsRuntime,
  workspace,
}: {
  client: CodexJsonRpcClient;
  dispatch: ThreadWorkflowDispatch;
  ensureConnected: () => Promise<boolean>;
  hostDefaultCwd?: string | null;
  activeThreadId?: string | null;
  threadContextDefaults: ThreadContextDefaults | null;
  threads: Thread[];
  threadsRuntime: Record<string, ThreadRuntimeSlice>;
  workspace: string;
}) {
  const [backgroundAgentPanel, setBackgroundAgentPanel] = useState<BackgroundAgentPanelState | null>(null);
  const [backgroundAgentMessageDraft, setBackgroundAgentMessageDraft] = useState("");
  const [backgroundAgentMessageError, setBackgroundAgentMessageError] = useState<string | null>(null);
  const [backgroundAgentMessageSending, setBackgroundAgentMessageSending] = useState(false);
  const [backgroundAgentInterrupting, setBackgroundAgentInterrupting] = useState(false);
  const [sideChatsByParentThread, setSideChatsByParentThread] = useState<Record<string, SideChatSummary[]>>({});
  const backgroundAgentRequestId = useRef(0);
  const backgroundAgentThread = backgroundAgentPanel
    ? threads.find((thread) => thread.id === backgroundAgentPanel.threadId) ?? null
    : null;
  const backgroundAgentRuntime = backgroundAgentPanel
    ? threadsRuntime[backgroundAgentPanel.threadId] ?? null
    : null;
  const backgroundAgentItems = backgroundAgentRuntime?.items ?? EMPTY_THREAD_ITEMS;
  const backgroundAgentActiveTurnId = backgroundAgentRuntime?.activeTurnId ?? null;
  const backgroundAgentRunning = Boolean(backgroundAgentRuntime?.activeTurnId)
    || isThreadStatusInProgress(backgroundAgentThread?.status);
  const backgroundAgentCanInterrupt = Boolean(backgroundAgentPanel && backgroundAgentActiveTurnId && !backgroundAgentPanel.loading);
  const backgroundAgentConversation = useMemo(
    () => projectConversation(backgroundAgentItems, {
      isThreadRunning: backgroundAgentRunning,
      parentThreadAttachmentSourceConversationId: backgroundAgentThread?.forkedFromId ?? null,
      progressPlan: backgroundAgentRuntime?.turnPlan ?? null,
    }),
    [backgroundAgentItems, backgroundAgentRuntime?.turnPlan, backgroundAgentRunning, backgroundAgentThread?.forkedFromId],
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
  const sideChatRailEntries = useMemo(
    () => projectSideChatRailEntries(
      activeThreadId ? sideChatsByParentThread[activeThreadId] ?? [] : [],
      threads,
      threadsRuntime,
    ),
    [activeThreadId, sideChatsByParentThread, threads, threadsRuntime],
  );

  const closeBackgroundAgentPanel = useCallback(() => {
    backgroundAgentRequestId.current += 1;
    setBackgroundAgentPanel(null);
    setBackgroundAgentMessageDraft("");
    setBackgroundAgentMessageError(null);
    setBackgroundAgentInterrupting(false);
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
    setBackgroundAgentMessageDraft("");
    setBackgroundAgentMessageError(null);
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

  const registerSideChat = useCallback((parentThreadId: string | null | undefined, thread: Thread) => {
    const parentId = parentThreadId?.trim();
    if (!parentId) return "Side chat";
    let title = nextSideChatTitle(sideChatsByParentThread[parentId] ?? [], thread.id);
    setSideChatsByParentThread((current) => {
      const existing = current[parentId] ?? [];
      title = nextSideChatTitle(existing, thread.id);
      const summary: SideChatSummary = {
        threadId: thread.id,
        parentThreadId: parentId,
        title,
        model: threadContextDefaults?.model
          ?? normalizedOption(typeof (thread as unknown as Record<string, unknown>).model === "string"
            ? (thread as unknown as Record<string, string>).model
            : null)
          ?? null,
        createdAt: Date.now(),
      };
      const next = existing.some((entry) => entry.threadId === thread.id)
        ? existing.map((entry) => entry.threadId === thread.id ? { ...entry, ...summary, title: entry.title } : entry)
        : [...existing, summary];
      return { ...current, [parentId]: next };
    });
    return title;
  }, [sideChatsByParentThread, threadContextDefaults?.model]);

  const openSideConversationPanel = useCallback((thread: Thread) => {
    const title = registerSideChat(thread.forkedFromId, thread);
    dispatch({ type: "upsertThread", thread, select: false });
    void openBackgroundAgentThread(thread.id, {
      displayName: title,
      panelKind: "sideChat",
      model: threadContextDefaults?.model ?? null,
    });
  }, [dispatch, openBackgroundAgentThread, registerSideChat, threadContextDefaults?.model]);

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
      const title = registerSideChat(thread.id, result.thread);
      dispatch({ type: "upsertThread", thread: result.thread, select: false });
      void openBackgroundAgentThread(result.thread.id, {
        displayName: title,
        panelKind: "sideChat",
        model: threadContextDefaults?.model ?? null,
      });
    } catch (error) {
      dispatch({ type: "log", text: `Failed to open side chat: ${formatError(error)}`, level: "error" });
    }
  }, [
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd,
    openBackgroundAgentThread,
    registerSideChat,
    threadContextDefaults,
    workspace,
  ]);

  const sendBackgroundAgentPanelMessage = useCallback(async () => {
    const panel = backgroundAgentPanel;
    const threadId = panel?.threadId;
    const text = backgroundAgentMessageDraft.trim();
    if (!threadId || !text || backgroundAgentMessageSending || panel.loading) return;
    const content = buildUserInputFromComposer(text);
    if (content.length === 0) return;
    const runtime = threadsRuntime[threadId] ?? null;
    const activePanelTurnId = runtime?.activeTurnId ?? null;
    const thread = threads.find((candidate) => candidate.id === threadId) ?? null;
    const cwd = thread?.cwd || workspace.trim() || hostDefaultCwd || "";
    const panelThreadRunning = Boolean(activePanelTurnId) || isThreadStatusInProgress(thread?.status);
    if (panelThreadRunning && !activePanelTurnId) {
      setBackgroundAgentMessageError("Waiting for the active turn before steering this panel thread.");
      return;
    }

    setBackgroundAgentMessageDraft("");
    setBackgroundAgentMessageError(null);
    setBackgroundAgentMessageSending(true);
    let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
    try {
      if (!(await ensureConnected())) {
        setBackgroundAgentMessageDraft(text);
        setBackgroundAgentMessageError("Unable to connect to app-server.");
        return;
      }
      optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content, activePanelTurnId);
      await sendPanelThreadMessage(
        client,
        threadId,
        content,
        cwd,
        threadContextDefaults,
        activePanelTurnId,
      );
      if (!activePanelTurnId) {
        await refreshThreadMetadata(client, threadId, dispatch);
      }
    } catch (error) {
      if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
      const message = formatError(error);
      setBackgroundAgentMessageDraft(text);
      setBackgroundAgentMessageError(message);
      dispatch({ type: "log", text: `Failed to send panel message: ${message}`, level: "error" });
    } finally {
      setBackgroundAgentMessageSending(false);
    }
  }, [
    backgroundAgentMessageDraft,
    backgroundAgentMessageSending,
    backgroundAgentPanel,
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd,
    threadContextDefaults,
    threads,
    threadsRuntime,
    workspace,
  ]);

  const interruptBackgroundAgentPanelTurn = useCallback(async () => {
    const panel = backgroundAgentPanel;
    const threadId = panel?.threadId;
    const turnId = threadId ? threadsRuntime[threadId]?.activeTurnId ?? null : null;
    if (!threadId || !turnId || backgroundAgentInterrupting) return;

    setBackgroundAgentMessageError(null);
    setBackgroundAgentInterrupting(true);
    try {
      if (!(await ensureConnected())) {
        setBackgroundAgentMessageError("Unable to connect to app-server.");
        return;
      }
      await interruptThreadTurn(client, threadId, turnId);
      await refreshThreadMetadata(client, threadId, dispatch);
    } catch (error) {
      const message = formatError(error);
      setBackgroundAgentMessageError(message);
      dispatch({ type: "log", text: `Failed to stop panel turn: ${message}`, level: "error" });
    } finally {
      setBackgroundAgentInterrupting(false);
    }
  }, [
    backgroundAgentInterrupting,
    backgroundAgentPanel,
    client,
    dispatch,
    ensureConnected,
    threadsRuntime,
  ]);

  return {
    backgroundAgentConversation,
    backgroundAgentCanInterrupt,
    backgroundAgentInterrupting,
    backgroundAgentMessageDraft,
    backgroundAgentMessageError,
    backgroundAgentMessageSending,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    openBackgroundAgentThread,
    openSideChatFromThread,
    openSideConversationPanel,
    sideChatRailEntries,
    interruptBackgroundAgentPanelTurn,
    sendBackgroundAgentPanelMessage,
    setBackgroundAgentMessageDraft,
  };
}

export function projectSideChatRailEntries(
  sideChats: ReadonlyArray<SideChatSummary>,
  threads: ReadonlyArray<Thread>,
  threadsRuntime: Record<string, ThreadRuntimeSlice>,
): RailEntry[] {
  return sideChats.map((sideChat) => {
    const thread = threads.find((candidate) => candidate.id === sideChat.threadId) ?? null;
    const runtime = threadsRuntime[sideChat.threadId] ?? null;
    const running = Boolean(runtime?.activeTurnId) || isThreadStatusInProgress(thread?.status);
    const status = running ? "active" : threadStatusLabel(thread?.status);
    const model = sideChat.model
      ?? normalizedOption(typeof (thread as unknown as Record<string, unknown> | null)?.model === "string"
        ? (thread as unknown as Record<string, string>).model
        : null)
      ?? null;
    return {
      id: `side-chat:${sideChat.threadId}`,
      title: sideChat.title,
      status,
      meta: model ? `Uses ${model}` : undefined,
      action: {
        kind: "thread",
        threadId: sideChat.threadId,
        displayName: sideChat.title,
        model,
        role: null,
      },
    };
  });
}

export function nextSideChatTitle(existing: ReadonlyArray<SideChatSummary>, threadId: string): string {
  const current = existing.find((entry) => entry.threadId === threadId);
  if (current) return current.title;
  const index = existing.length + 1;
  return index === 1 ? "Side chat" : `Side chat ${index}`;
}
