import { Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ModelConfig, Thread } from "@hicodex/codex-protocol";
import { CommandPanel } from "./components/command-panel";
import { Composer } from "./components/composer";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import { ModelSettingsPanel } from "./components/model-settings-panel";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { RightRail } from "./components/right-rail";
import { Sidebar } from "./components/sidebar";
import {
  ThreadActionDialog,
  type ThreadActionDialogState,
} from "./components/thread-action-dialog";
import { CodexJsonRpcClient } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import { openFileReference } from "./lib/tauri-host";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import { EMPTY_MODEL } from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  type PendingServerRequest,
} from "./state/codex-reducer";
import { buildApprovalResult } from "./state/approval-requests";
import { projectBranchDetails } from "./state/branch-details";
import {
  normalizeFileReference,
  type FileReferenceSelection,
} from "./state/file-references";
import {
  DEFAULT_SLASH_COMMANDS,
  applySlashCommand,
  buildUserInputFromComposer,
  projectComposerSubmitState,
  type ComposerAttachment,
  type SlashCommand,
  type SlashCommandAction,
} from "./state/composer-workflow";
import {
  createCommandPanelState,
  type CommandPanelOptions,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelState,
} from "./state/command-panel";
import { buildConversationMarkdown } from "./state/conversation-markdown";
import {
  isThreadStatusInProgress,
  projectConversation,
} from "./state/render-groups";
import {
  createQueuedFollowUp,
  removeQueuedFollowUp,
  updateQueuedFollowUpStatus,
  type QueuedFollowUp,
} from "./state/queued-followups";
import {
  deriveActivePendingRequests,
  summarizePendingRequestAwaitingByThread,
} from "./state/pending-request-scope";
import { projectRightRailSections } from "./state/right-rail";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import {
  archiveThread,
  createAndSelectThreadForTurn,
  ensureThreadReadyForTurn,
  forkThread as forkThreadWorkflow,
  isThreadNotFound,
  isThreadNotMaterialized,
  isThreadNeedsResume,
  readThread,
  readThreadForDisplay,
  refreshThreads,
  refreshThreadContextDefaults,
  renameThread as renameThreadWorkflow,
  resumeSelectedThreadAndStartTurn,
  resumeThreadWithMetadataRead,
  startTurn,
  steerTurn,
  threadTitle,
} from "./state/thread-workflow";
import { SEED_TEAMS } from "./state/team-config";

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [commandPanel, setCommandPanel] = useState<CommandPanelState | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | null>(null);
  const [queuedFollowUpsByThread, setQueuedFollowUpsByThread] = useState<Record<string, QueuedFollowUp[]>>({});
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const sendingQueuedFollowUpId = useRef<string | null>(null);
  const workspaceInitialized = useRef(false);

  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => dispatch({ type: "notification", message }),
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
    });
    clientRef.current = rpc;
    return rpc;
  }, []);

  const activeItems = state.activeThreadId
    ? state.itemsByThread[state.activeThreadId] ?? []
    : [];
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
  const activeQueuedFollowUps = state.activeThreadId ? queuedFollowUpsByThread[state.activeThreadId] ?? [] : [];
  const activeTurnId = state.activeThreadId
    ? state.activeTurnIdsByThread[state.activeThreadId] ?? null
    : null;
  const activeThreadRunning = Boolean(activeTurnId) || isThreadStatusInProgress(activeThread?.status);
  const activePendingRequests = useMemo(
    () => deriveActivePendingRequests(state.pendingRequests, {
      activeThreadId: state.activeThreadId,
      activeTurnId,
      activeItemIds: activeItems.map((item) => item.id),
    }),
    [activeItems, activeTurnId, state.activeThreadId, state.pendingRequests],
  );
  const pendingRequestAwaitingByThread = useMemo(
    () => summarizePendingRequestAwaitingByThread(state.pendingRequests, { itemsByThread: state.itemsByThread }),
    [state.itemsByThread, state.pendingRequests],
  );
  const activeProgressPlan = state.activeThreadId ? state.turnPlansByThread[state.activeThreadId] ?? null : null;
  const conversation = useMemo(
    () => projectConversation(activeItems, { isThreadRunning: activeThreadRunning, progressPlan: activeProgressPlan }),
    [activeItems, activeProgressPlan, activeThreadRunning],
  );
  const activeDiff = state.activeThreadId ? state.turnDiffsByThread[state.activeThreadId] ?? "" : "";
  const branchDetails = useMemo(
    () => projectBranchDetails({
      thread: activeThread,
      diff: activeDiff ? { diff: activeDiff } : null,
    }),
    [activeDiff, activeThread],
  );
  const rightRailSections = useMemo(
    () => projectRightRailSections({
      progress: conversation.progress,
      branchDetails,
      artifacts: conversation.artifacts,
      sources: conversation.sources,
    }),
    [branchDetails, conversation],
  );
  const showRightRail = rightRailSections.length > 0 || fileReference !== null;
  const composerSubmitState = useMemo(() => projectComposerSubmitState({
    input,
    attachmentCount: composerAttachments.length,
    connecting: state.connecting,
    threadRunning: activeThreadRunning,
    activeTurnId,
    pendingRequestCount: activePendingRequests.length,
  }), [
    activeThreadRunning,
    activeTurnId,
    activePendingRequests.length,
    composerAttachments.length,
    input,
    state.connecting,
  ]);

  const autoConnectStarted = useRef(false);

  const connect = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "connecting", value: true });
    try {
      await client.connect();
      dispatch({ type: "connected", value: true });
      dispatch({ type: "setTeams", teams: SEED_TEAMS });
      await refreshThreads(client, dispatch);
      await refreshModels(client, dispatch);
      return true;
    } catch (error) {
      dispatch({ type: "connected", value: false });
      dispatch({ type: "log", text: formatError(error), level: "error" });
      return false;
    } finally {
      dispatch({ type: "connecting", value: false });
    }
  }, [client]);

  useEffect(() => {
    if (autoConnectStarted.current) return;
    autoConnectStarted.current = true;
    void connect();
  }, [connect]);

  useEffect(() => {
    if (workspaceInitialized.current || !state.hostStatus?.defaultCwd) return;
    workspaceInitialized.current = true;
    setWorkspace((current) => current.trim() || state.hostStatus?.defaultCwd || "");
  }, [state.hostStatus?.defaultCwd]);

  useEffect(() => {
    const threadCwd = activeThread?.cwd?.trim();
    if (!threadCwd) return;
    setWorkspace((current) => current === threadCwd ? current : threadCwd);
  }, [activeThread?.cwd]);

  useEffect(() => {
    if (!state.connected) return;
    void refreshThreadContextDefaults(client, dispatch, workspace);
  }, [client, state.connected, workspace]);

  const disconnect = useCallback(async () => {
    try {
      await client.disconnect();
      dispatch({ type: "connected", value: false });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client]);

  const createThread = useCallback(async () => {
    setInput("");
    setComposerAttachments([]);
    dispatch({ type: "setActiveThread", threadId: null });
  }, []);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  const openCommandPanel = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setCommandPanel(createCommandPanelState(panel, options));
  }, []);

  const openLocalSettingsPanel = useCallback((panel: "permissions" | "approvals") => {
    const entries = localSettingsEntries(panel, {
      pendingRequestCount: state.pendingRequests.length,
      approvalPolicy: state.threadContextDefaults?.approvalPolicy,
      sandbox: state.threadContextDefaults?.sandbox,
      connected: state.connected,
    });
    openCommandPanel("generic", {
      status: "ready",
      title: panel === "permissions" ? "Permissions" : "Approvals",
      entries,
      message: "",
    });
  }, [
    openCommandPanel,
    state.connected,
    state.pendingRequests.length,
    state.threadContextDefaults?.approvalPolicy,
    state.threadContextDefaults?.sandbox,
  ]);

  const selectThread = useCallback(async (thread: Thread) => {
    dispatch({ type: "setActiveThread", threadId: thread.id });
    try {
      const displayThread = await readThreadForDisplay(client, thread, dispatch);
      if (displayThread) {
        dispatch({ type: "upsertThread", thread: displayThread, select: true });
      }
    } catch (error) {
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: thread.id });
      } else {
        dispatch({ type: "log", text: formatError(error), level: "error" });
      }
    }
  }, [client]);

  const openThreadById = useCallback(async (threadId: string) => {
    const id = threadId.trim();
    if (!id) return;
    dispatch({ type: "setActiveThread", threadId: id });
    try {
      const metadata = await readThread(client, id, false);
      const thread = metadata.thread;
      if (!thread) {
        dispatch({ type: "log", text: `thread not found: ${id}`, level: "error" });
        return;
      }
      const displayThread = await readThreadForDisplay(client, thread, dispatch);
      dispatch({ type: "upsertThread", thread: displayThread ?? thread, select: true });
    } catch (error) {
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: id });
      } else {
        dispatch({ type: "log", text: formatError(error), level: "error" });
      }
    }
  }, [client]);

  const resumeSelectedThread = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const result = await resumeThreadWithMetadataRead(client, thread.id, workspace, state.threadContextDefaults);
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      if (isThreadNotFound(error)) {
        dispatch({ type: "removeThread", threadId: thread.id });
      } else {
        dispatch({ type: "log", text: formatError(error), level: "error" });
      }
    }
  }, [client, ensureConnected, state.threadContextDefaults, workspace]);

  const forkSelectedThread = useCallback(async (thread: Thread) => {
    try {
      if (!(await ensureConnected())) return;
      const result = await forkThreadWorkflow(client, thread.id, workspace, state.threadContextDefaults);
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, ensureConnected, state.threadContextDefaults, workspace]);

  const openRenameThreadDialog = useCallback((thread: Thread) => {
    setThreadActionDialog({ kind: "rename", thread });
  }, []);

  const openArchiveThreadDialog = useCallback((thread: Thread) => {
    setThreadActionDialog({ kind: "archive", thread });
  }, []);

  const renameSelectedThread = useCallback(async (thread: Thread, name: string) => {
    if (!name.trim()) return;
    try {
      if (!(await ensureConnected())) return;
      await renameThreadWorkflow(client, thread.id, name);
      dispatch({
        type: "setThreads",
        threads: state.threads.map((item) => item.id === thread.id ? { ...item, name: name.trim() } : item),
      });
      setThreadActionDialog(null);
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, ensureConnected, state.threads]);

  const archiveSelectedThread = useCallback(async (thread: Thread) => {
    setThreadActionDialog(null);
    dispatch({ type: "removeThread", threadId: thread.id });
    setQueuedFollowUpsByThread((current) => {
      const { [thread.id]: _removed, ...rest } = current;
      return rest;
    });
    try {
      if (!(await ensureConnected())) return;
      await archiveThread(client, thread.id);
    } catch (error) {
      if (isThreadNotFound(error) || isThreadNotMaterialized(error)) {
        return;
      }
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, ensureConnected]);

  const copyTextToClipboard = useCallback(async (label: string, value: string) => {
    const text = value.trim();
    if (!text) {
      dispatch({ type: "log", text: `${label} is unavailable`, level: "warn" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      dispatch({ type: "log", text: `${label} copied`, level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: `copy failed: ${formatError(error)}`, level: "error" });
    }
  }, []);

  const copyWorkingDirectory = useCallback(() => {
    void copyTextToClipboard("Working directory", activeThread?.cwd || workspace || "");
  }, [activeThread?.cwd, copyTextToClipboard, workspace]);

  const copySessionId = useCallback(() => {
    void copyTextToClipboard("Session ID", activeThread?.id ?? "");
  }, [activeThread?.id, copyTextToClipboard]);

  const copyConversationMarkdown = useCallback(() => {
    if (!activeThread) {
      dispatch({ type: "log", text: "Conversation markdown is unavailable", level: "warn" });
      return;
    }
    void copyTextToClipboard("Conversation markdown", buildConversationMarkdown({
      title: threadTitle(activeThread),
      units: conversation.units,
    }));
  }, [activeThread, conversation.units, copyTextToClipboard]);

  const previewConversationFileReference = useCallback((reference: { path: string; lineStart: number; lineEnd?: number }) => {
    const nextReference = normalizeFileReference(reference);
    if (nextReference) setFileReference(nextReference);
  }, []);

  const openFileReferenceExternal = useCallback((reference: FileReferenceSelection) => {
    void openFileReference(reference.path, reference.lineStart).catch((error) => {
      dispatch({ type: "log", text: formatError(error), level: "warn" });
    });
  }, []);

  const openRailUrl = useCallback((url: string) => {
    const normalized = url.trim();
    if (!/^https?:\/\//.test(normalized)) {
      dispatch({ type: "log", text: `Cannot open URL: ${url}`, level: "warn" });
      return;
    }
    const opened = globalThis.open?.(normalized, "_blank", "noopener,noreferrer");
    if (!opened) {
      dispatch({ type: "log", text: `URL ready to open: ${normalized}`, level: "info" });
    }
  }, []);

  const openRailSource = useCallback((itemId: string) => {
    const target = Array.from(document.querySelectorAll<HTMLElement>("[data-item-ids]"))
      .find((element) => (element.dataset.itemIds ?? "").split(" ").includes(itemId));
    if (!target) {
      dispatch({ type: "log", text: `Source item ${itemId} is not visible in this conversation.`, level: "warn" });
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("is-highlighted");
    globalThis.setTimeout(() => target.classList.remove("is-highlighted"), 1400);
  }, []);

  const openActiveDiffPanel = useCallback(() => {
    const diff = activeDiff.trim();
    openCommandPanel("diff", {
      status: diff ? "ready" : "empty",
      message: diff ? `${diff.split("\n").length} diff line(s)` : "No active thread diff is available.",
      entries: diff
        ? [
            {
              id: "diff:active-thread",
              title: "Active thread diff",
              kind: "diff",
              meta: activeThread ? threadTitle(activeThread) : undefined,
              details: diff.split("\n").slice(0, 80),
            },
          ]
        : [],
    });
  }, [activeDiff, activeThread, openCommandPanel]);

  const updateQueuedFollowUps = useCallback((
    threadId: string,
    updater: (queue: QueuedFollowUp[]) => QueuedFollowUp[],
  ) => {
    setQueuedFollowUpsByThread((current) => {
      const nextQueue = updater(current[threadId] ?? []);
      if (nextQueue.length === 0) {
        const { [threadId]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [threadId]: nextQueue };
    });
  }, []);

  const sendQueuedFollowUp = useCallback(async (threadId: string, message: QueuedFollowUp) => {
    if (sendingQueuedFollowUpId.current === message.id) return;
    sendingQueuedFollowUpId.current = message.id;
    updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "sending"));
    try {
      if (!(await ensureConnected())) {
        updateQueuedFollowUps(threadId, (queue) =>
          updateQueuedFollowUpStatus(queue, message.id, "paused", "Runtime is offline"),
        );
        return;
      }
      const content = buildUserInputFromComposer(message.text, message.attachments);
      if (content.length === 0) {
        updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
        return;
      }
      if (activeTurnId && activeThreadRunning && threadId === state.activeThreadId) {
        await steerTurn(client, threadId, content, activeTurnId);
      } else {
        try {
          await startTurn(client, threadId, content, message.cwd, state.threadContextDefaults);
        } catch (error) {
          if (!isThreadNotFound(error) && !isThreadNeedsResume(error)) throw error;
          if (!(await resumeSelectedThreadAndStartTurn(
            client,
            threadId,
            content,
            message.cwd,
            dispatch,
            state.threadContextDefaults,
          ))) {
            throw error;
          }
        }
      }
      updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
    } catch (error) {
      updateQueuedFollowUps(threadId, (queue) =>
        updateQueuedFollowUpStatus(queue, message.id, "paused", formatError(error)),
      );
      dispatch({ type: "log", text: formatError(error), level: "error" });
    } finally {
      sendingQueuedFollowUpId.current = null;
    }
  }, [
    activeThreadRunning,
    activeTurnId,
    client,
    ensureConnected,
    state.activeThreadId,
    state.threadContextDefaults,
    updateQueuedFollowUps,
  ]);

  const sendTurn = useCallback(async () => {
    if (composerSubmitState.disabled) {
      if (composerSubmitState.submitBlockReason !== "empty" && composerSubmitState.disabledReason) {
        dispatch({ type: "log", text: composerSubmitState.disabledReason, level: "warn" });
      }
      return;
    }
    const content = buildUserInputFromComposer(input, composerAttachments);
    if (content.length === 0) return;
    try {
      if (!(await ensureConnected())) return;
      const selectedThreadId = state.activeThreadId;
      const readyThread = await ensureThreadReadyForTurn({
        client,
        activeThread,
        activeThreadId: selectedThreadId,
        workspace,
        threads: state.threads,
        dispatch,
        context: state.threadContextDefaults,
      });
      const threadId = readyThread.threadId;
      if (!threadId) throw new Error("No active Codex thread");
      setInput("");
      setComposerAttachments([]);
      if (
        activeTurnId &&
        activeThreadRunning &&
        composerSubmitState.submitButtonMode === "queue"
      ) {
        const queued = createQueuedFollowUp({
          text: input,
          attachments: composerAttachments,
          cwd: workspace,
        });
        updateQueuedFollowUps(threadId, (queue) => [...queue, queued]);
        return;
      }
      try {
        if (activeTurnId && activeThreadRunning) {
          await steerTurn(client, threadId, content, activeTurnId);
        } else {
          await startTurn(client, threadId, content, workspace, state.threadContextDefaults);
        }
      } catch (error) {
        const recoverableSelectedThreadError = isThreadNotFound(error) || isThreadNeedsResume(error);
        if (!recoverableSelectedThreadError) throw error;
        if (selectedThreadId && readyThread.source !== "resumed") {
          if (await resumeSelectedThreadAndStartTurn(
            client,
            selectedThreadId,
            content,
            workspace,
            dispatch,
            state.threadContextDefaults,
          )) {
            return;
          }
        }
        if (selectedThreadId) {
          dispatch({ type: "removeThread", threadId: selectedThreadId });
          setInput(input);
          setComposerAttachments(composerAttachments);
          dispatch({
            type: "log",
            text: "Selected thread is no longer available; message was not sent to a new thread.",
            level: "warn",
          });
          return;
        }
        dispatch({ type: "removeThread", threadId });
        const nextThreadId = await createAndSelectThreadForTurn(client, workspace, state.threads, dispatch, state.threadContextDefaults);
        if (!nextThreadId) throw error;
        await startTurn(client, nextThreadId, content, workspace, state.threadContextDefaults);
      }
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [
    activeThread,
    activeThreadRunning,
    activeTurnId,
    client,
    composerAttachments,
    composerSubmitState.disabled,
    composerSubmitState.disabledReason,
    composerSubmitState.submitButtonMode,
    composerSubmitState.submitBlockReason,
    ensureConnected,
    input,
    state.activeThreadId,
    state.threadContextDefaults,
    state.threads,
    updateQueuedFollowUps,
    workspace,
  ]);

  useEffect(() => {
    if (!state.activeThreadId || activeThreadRunning || activePendingRequests.length > 0) return;
    const nextQueuedFollowUp = queuedFollowUpsByThread[state.activeThreadId]?.find((message) => message.status === "queued");
    if (!nextQueuedFollowUp) return;
    void sendQueuedFollowUp(state.activeThreadId, nextQueuedFollowUp);
  }, [
    activeThreadRunning,
    activePendingRequests.length,
    queuedFollowUpsByThread,
    sendQueuedFollowUp,
    state.activeThreadId,
  ]);

  const sendQueuedFollowUpNow = useCallback((message: QueuedFollowUp) => {
    if (!state.activeThreadId) return;
    void sendQueuedFollowUp(state.activeThreadId, message);
  }, [sendQueuedFollowUp, state.activeThreadId]);

  const editQueuedFollowUp = useCallback((message: QueuedFollowUp) => {
    if (!state.activeThreadId) return;
    updateQueuedFollowUps(state.activeThreadId, (queue) => removeQueuedFollowUp(queue, message.id));
    setInput(message.text);
    setComposerAttachments(message.attachments);
  }, [state.activeThreadId, updateQueuedFollowUps]);

  const deleteQueuedFollowUp = useCallback((message: QueuedFollowUp) => {
    if (!state.activeThreadId) return;
    updateQueuedFollowUps(state.activeThreadId, (queue) => removeQueuedFollowUp(queue, message.id));
  }, [state.activeThreadId, updateQueuedFollowUps]);

  const runSlashRequest = useCallback((request: Parameters<typeof runSlashRequestWorkflow>[0], payload?: Record<string, unknown>) => (
    runSlashRequestWorkflow(request, payload, {
      client,
      dispatch,
      ensureConnected,
      openCommandPanel,
      openRenameThreadDialog,
      workspace,
      defaultCwd: state.hostStatus?.defaultCwd ?? undefined,
      activeThread,
      activeThreadId: state.activeThreadId,
      activeTurnId,
      connected: state.connected,
      pid: state.hostStatus?.pid,
      modelCount: state.models.length,
      pendingRequestCount: state.pendingRequests.length,
      threads: state.threads,
    })
  ), [
    activeThread,
    activeTurnId,
    client,
    ensureConnected,
    openCommandPanel,
    openRenameThreadDialog,
    state.activeThreadId,
    state.connected,
    state.hostStatus?.defaultCwd,
    state.hostStatus?.pid,
    state.models.length,
    state.pendingRequests.length,
    state.threads,
    workspace,
  ]);

  const handleSlashAction = useCallback(async (action: SlashCommandAction) => {
    switch (action.action) {
      case "openSettings":
        setInput("");
        setComposerAttachments([]);
        if (action.panel === "models" || action.panel === "general") {
          setShowSettings(true);
        }
        if (action.panel === "mcp") {
          await runSlashRequest("listMcp");
        } else if (action.panel === "skills") {
          await runSlashRequest("listSkills");
        } else if (action.panel === "hooks") {
          await runSlashRequest("listHooks");
        } else if (action.panel === "plugins") {
          await runSlashRequest("listPlugins");
        } else if (action.panel === "apps") {
          await runSlashRequest("listApps");
        } else if (action.panel === "experimental") {
          await runSlashRequest("showExperimental");
        } else if (action.panel === "permissions" || action.panel === "approvals") {
          openLocalSettingsPanel(action.panel);
        } else if (action.panel !== "models" && action.panel !== "general") {
          openCommandPanel("generic", {
            status: "ready",
            title: `${action.panel} settings`,
            entries: [],
            message: `${action.panel} settings are not exposed by app-server yet.`,
          });
        }
        return;
      case "createThread":
        setInput("");
        setComposerAttachments([]);
        await createThread();
        return;
      case "clearInput":
        setInput("");
        setComposerAttachments([]);
        return;
      case "insertText":
        setInput(action.text);
        setComposerAttachments([]);
        return;
      case "request":
        setInput("");
        setComposerAttachments([]);
        await runSlashRequest(action.request, action.payload);
        return;
      case "showCommands":
        setInput("");
        setComposerAttachments([]);
        openCommandPanel("generic", {
          status: "ready",
          title: "Commands",
          entries: slashCommandEntries(),
          message: "",
        });
        return;
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [createThread, openCommandPanel, openLocalSettingsPanel, runSlashRequest]);

  const executeSlashCommand = useCallback((command: SlashCommand) => {
    void handleSlashAction(applySlashCommand(command.id, { input }));
  }, [handleSlashAction, input]);

  const interruptActiveTurn = useCallback(async () => {
    if (!state.activeThreadId || !activeTurnId) return;
    try {
      await client.request("turn/interrupt", {
        threadId: state.activeThreadId,
        turnId: activeTurnId,
      }, 120_000);
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeTurnId, client, state.activeThreadId]);

  const respondToRequest = useCallback(async (
    request: PendingServerRequest,
    accepted: boolean,
    answers?: Record<string, string[]>,
  ) => {
    try {
      const result = buildApprovalResult(request, accepted, answers);
      result === null
        ? await client.reject(request.id, accepted ? "Unsupported HiCodex request" : "Rejected by HiCodex user")
        : await client.respond(request.id, result);
      dispatch({ type: "resolveServerRequest", id: request.id });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client]);

  const applyModelDraft = useCallback(() => {
    void saveModelDraftWorkflow({
      client,
      dispatch,
      connect,
      modelDraft,
      connected: state.connected,
      codexHome: state.hostStatus?.codexHome,
    }).then(() => refreshThreadContextDefaults(client, dispatch, workspace));
  }, [client, connect, modelDraft, state.connected, state.hostStatus?.codexHome, workspace]);

  return (
    <div className={showRightRail ? "hc-app hc-app--with-right-rail" : "hc-app"}>
      <Sidebar
        threads={state.threads}
        activeThreadId={state.activeThreadId}
        activeThreadRunning={activeThreadRunning}
        pendingRequestAwaitingByThread={pendingRequestAwaitingByThread}
        connected={state.connected}
        connecting={state.connecting}
        onConnect={() => void connect()}
        onCreateThread={createThread}
        onRefreshThreads={() => refreshThreads(client, dispatch)}
        onSelectThread={selectThread}
        onResumeThread={resumeSelectedThread}
        onForkThread={forkSelectedThread}
        onRenameThread={openRenameThreadDialog}
        onArchiveThread={openArchiveThreadDialog}
        onOpenSettings={() => setShowSettings(true)}
        onDisconnect={disconnect}
      />

      <main className="hc-main">
        <ConversationChrome
          title={activeThread ? threadTitle(activeThread) : "Codex conversation"}
          codexHome={state.hostStatus?.codexHome}
          connected={state.connected}
          pid={state.hostStatus?.pid ?? undefined}
          workspace={workspace}
          onWorkspaceChange={setWorkspace}
          activeThread={activeThread}
          activeThreadRunning={activeThreadRunning}
          onForkThread={forkSelectedThread}
          onRenameThread={openRenameThreadDialog}
          onArchiveThread={openArchiveThreadDialog}
          onCopyWorkingDirectory={copyWorkingDirectory}
          onCopySessionId={copySessionId}
          onCopyConversationMarkdown={copyConversationMarkdown}
        />

        <section className="hc-conversation">
          <ConversationView
            units={conversation.units}
            onOpenFileReference={previewConversationFileReference}
            onOpenThreadId={openThreadById}
            emptyState={(
              <div className="hc-welcome">
                <Terminal size={28} />
                <h1>Ready for Codex app-server</h1>
                <p>Start a thread and send a prompt. Runtime facts will come from app-server ThreadItems.</p>
              </div>
            )}
          />
        </section>

        {activePendingRequests.length > 0 && (
          <PendingRequestStack
            pendingRequests={activePendingRequests}
            onRespond={respondToRequest}
            onLog={(text, level) => dispatch({ type: "log", text, level })}
          />
        )}

        <QueuedFollowUpStack
          messages={activeQueuedFollowUps}
          onSendNow={sendQueuedFollowUpNow}
          onEdit={editQueuedFollowUp}
          onDelete={deleteQueuedFollowUp}
        />

        <Composer
          input={input}
          attachments={composerAttachments}
          onInputChange={setInput}
          onAttachmentsChange={setComposerAttachments}
          submitState={composerSubmitState}
          onSend={() => void sendTurn()}
          onInterrupt={() => void interruptActiveTurn()}
          onSlashCommand={executeSlashCommand}
        />
      </main>

      {showRightRail && (
        <RightRail
          sections={rightRailSections}
          fileReference={fileReference}
          onCloseFileReference={() => setFileReference(null)}
          onOpenFileReferenceExternal={openFileReferenceExternal}
          onOpenFileReference={previewConversationFileReference}
          onOpenUrl={openRailUrl}
          onOpenSource={openRailSource}
          onOpenDiff={openActiveDiffPanel}
        />
      )}

      {showSettings && (
        <ModelSettingsPanel
          modelDraft={modelDraft}
          setModelDraft={setModelDraft}
          models={state.models}
          onClose={() => setShowSettings(false)}
          onSave={applyModelDraft}
        />
      )}

      {commandPanel && (
        <CommandPanel
          panel={commandPanel}
          onClose={() => setCommandPanel(null)}
        />
      )}

      {threadActionDialog && (
        <ThreadActionDialog
          action={threadActionDialog}
          onClose={() => setThreadActionDialog(null)}
          onRename={renameSelectedThread}
          onArchive={archiveSelectedThread}
        />
      )}
    </div>
  );
}

function localSettingsEntries(
  panel: "permissions" | "approvals",
  context: {
    pendingRequestCount: number;
    approvalPolicy?: unknown;
    sandbox?: unknown;
    connected: boolean;
  },
): CommandPanelEntry[] {
  if (panel === "permissions") {
    return [
      {
        id: "permissions:sandbox",
        title: "Sandbox",
        kind: "status",
        status: stringSetting(context.sandbox) || "default",
        meta: "Current app-server workspace policy",
      },
      {
        id: "permissions:connection",
        title: "Runtime connection",
        kind: "status",
        status: context.connected ? "connected" : "offline",
        meta: "Permissions are enforced by app-server requests",
      },
    ];
  }

  return [
    {
      id: "approvals:policy",
      title: "Approval policy",
      kind: "status",
      status: stringSetting(context.approvalPolicy) || "default",
      meta: "Configured for new thread requests",
    },
    {
      id: "approvals:pending",
      title: "Pending requests",
      kind: "status",
      status: String(context.pendingRequestCount),
      meta: "Shown above the composer when app-server asks for a decision",
    },
  ];
}

function stringSetting(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function slashCommandEntries(): CommandPanelEntry[] {
  return DEFAULT_SLASH_COMMANDS
    .filter((command) => !command.hidden)
    .map((command) => {
      const disabled = command.supported === "pending";
      return {
        id: `command:${command.id}`,
        title: `/${command.id}`,
        kind: "status",
        status: disabled ? "not wired" : command.supported,
        meta: command.title,
        disabled,
        details: [
          command.description,
          command.inlineArgs ? `Args: ${command.inlineArgs}` : "",
          command.aliases?.length ? `Aliases: ${command.aliases.join(", ")}` : "",
          disabled ? "Visible for Codex Desktop parity; app-server wiring is not available yet." : "",
        ].filter(Boolean),
      };
    });
}
