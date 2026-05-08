import { Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@hicodex/codex-protocol";
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
import { openFileReference, pickFileReferences, readImageDataUrl } from "./lib/tauri-host";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_MODEL_REASONING_SUMMARY,
  EMPTY_MODEL,
  normalizeModelConfig,
} from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  type PendingServerRequest,
  type ThreadContextDefaults,
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
  composerAttachmentsFromPaths,
  composerHasImageAttachments,
  mergeComposerAttachments,
  projectComposerSubmitState,
  slashCommandsForComposerMode,
  type ComposerAttachment,
  type ComposerMode,
  type SlashCommand,
  type SlashCommandAction,
} from "./state/composer-workflow";
import {
  collaborationModeFromComposerMode,
  composerModeFromCollaborationMode,
  hasCollaborationModePreset,
  listCollaborationModes,
} from "./state/collaboration-modes";
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
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
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
  type OptimisticUserMessageHandle,
  type TurnStartOptions,
} from "./state/thread-workflow";
import { SEED_TEAMS } from "./state/team-config";

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [composerMode, setComposerMode] = useState<ComposerMode>("default");
  const [composerModesByThread, setComposerModesByThread] = useState<Record<string, ComposerMode>>({});
  const [collaborationModes, setCollaborationModes] = useState<CollaborationModeMask[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [commandPanel, setCommandPanel] = useState<CommandPanelState | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | null>(null);
  const [queuedFollowUpsByThread, setQueuedFollowUpsByThread] = useState<Record<string, QueuedFollowUp[]>>({});
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const sendingQueuedFollowUpId = useRef<string | null>(null);
  const threadSelectionRequestId = useRef(0);
  const workspaceInitialized = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);

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
  const activeModelSupportsImageInput = useMemo(() => {
    const providerId = state.threadContextDefaults?.modelProvider ?? "";
    const modelSlug = state.threadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    return model?.supportsImageInput !== false;
  }, [state.models, state.threadContextDefaults?.model, state.threadContextDefaults?.modelProvider]);
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

  const loadCollaborationModes = useCallback(async (): Promise<CollaborationModeMask[]> => {
    try {
      const modes = await listCollaborationModes(client);
      setCollaborationModes(modes);
      return modes;
    } catch (error) {
      setCollaborationModes([]);
      dispatch({ type: "log", text: `collaborationMode/list failed: ${formatError(error)}`, level: "warn" });
      return [];
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

  useEffect(() => {
    if (!state.connected) return;
    void loadCollaborationModes();
  }, [loadCollaborationModes, state.connected]);

  useEffect(() => {
    const previousThreadId = activeThreadIdRef.current;
    const nextThreadId = state.activeThreadId;
    if (previousThreadId === nextThreadId) return;
    activeThreadIdRef.current = nextThreadId;
    if (previousThreadId) {
      const previousLatestCollaborationMode = state.latestCollaborationModesByThread[previousThreadId] ?? null;
      const latestComposerMode = composerModeFromCollaborationMode(previousLatestCollaborationMode);
      setComposerModesByThread((current) => {
        if (composerMode !== latestComposerMode) return { ...current, [previousThreadId]: composerMode };
        const { [previousThreadId]: _removed, ...rest } = current;
        return rest;
      });
    }
    const latestCollaborationMode = nextThreadId
      ? state.latestCollaborationModesByThread[nextThreadId] ?? null
      : null;
    setComposerMode(nextThreadId
      ? composerModesByThread[nextThreadId] ?? composerModeFromCollaborationMode(latestCollaborationMode)
      : "default");
  }, [composerMode, composerModesByThread, state.activeThreadId, state.latestCollaborationModesByThread]);

  const disconnect = useCallback(async () => {
    try {
      await client.disconnect();
      dispatch({ type: "connected", value: false });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client]);

  const createThread = useCallback(async () => {
    threadSelectionRequestId.current += 1;
    setInput("");
    setComposerAttachments([]);
    dispatch({ type: "setActiveThread", threadId: null });
  }, []);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  const collaborationModesForComposerMode = useCallback(async (mode: ComposerMode): Promise<CollaborationModeMask[]> => {
    if (mode !== "plan" || hasCollaborationModePreset(collaborationModes, "plan")) return collaborationModes;
    return loadCollaborationModes();
  }, [collaborationModes, loadCollaborationModes]);

  const openCommandPanel = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setCommandPanel(createCommandPanelState(panel, options));
  }, []);

  const setActiveComposerMode = useCallback((mode: ComposerMode) => {
    setComposerMode(mode);
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    setComposerModesByThread((current) => ({ ...current, [threadId]: mode }));
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
  }, [client]);

  const openThreadById = useCallback(async (threadId: string) => {
    const id = threadId.trim();
    if (!id) return;
    const requestId = threadSelectionRequestId.current + 1;
    threadSelectionRequestId.current = requestId;
    dispatch({ type: "setActiveThread", threadId: id });
    try {
      const metadata = await readThread(client, id, false);
      if (threadSelectionRequestId.current !== requestId) return;
      const thread = metadata.thread;
      if (!thread) {
        dispatch({ type: "log", text: `thread not found: ${id}`, level: "error" });
        return;
      }
      const displayThread = await readThreadForDisplay(client, thread, dispatch);
      if (threadSelectionRequestId.current !== requestId) return;
      dispatch({ type: "upsertThread", thread: displayThread ?? thread, select: true });
    } catch (error) {
      if (threadSelectionRequestId.current !== requestId) return;
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
    setComposerModesByThread((current) => {
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

  const rememberLatestCollaborationMode = useCallback((
    threadId: string,
    options: TurnStartOptions | null | undefined,
  ) => {
    dispatch({
      type: "setLatestCollaborationMode",
      threadId,
      collaborationMode: options?.collaborationMode ?? null,
    });
  }, []);

  const resetComposerSelectionAfterCreatedThread = useCallback((threadId: string) => {
    setComposerMode("default");
    setComposerModesByThread((current) => ({ ...current, [threadId]: "default" }));
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
      if (composerHasImageAttachments(message.attachments) && !activeModelSupportsImageInput) {
        const reason = "Current model does not declare image input support";
        updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "paused", reason));
        dispatch({ type: "log", text: reason, level: "warn" });
        return;
      }
      const sendAttachments = await attachmentsWithDataImagePreviews(message.attachments);
      const content = buildUserInputFromComposer(message.text, sendAttachments);
      if (content.length === 0) {
        updateQueuedFollowUps(threadId, (queue) => removeQueuedFollowUp(queue, message.id));
        return;
      }
      let optimistic: OptimisticUserMessageHandle | null = null;
      if (activeTurnId && activeThreadRunning && threadId === state.activeThreadId) {
        optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content, activeTurnId);
        try {
          await steerTurn(client, threadId, content, activeTurnId);
        } catch (error) {
          dropOptimisticUserMessage(dispatch, optimistic);
          throw error;
        }
      } else {
        const messageMode = message.mode ?? "default";
        const modes = await collaborationModesForComposerMode(messageMode);
        const turnStartOptions = turnStartOptionsFromComposerMode(
          messageMode,
          modes,
          state.threadContextDefaults,
        );
        if (messageMode === "plan" && !turnStartOptions?.collaborationMode) {
          const reason = "Plan mode is unavailable until collaboration modes load from app-server";
          updateQueuedFollowUps(threadId, (queue) => updateQueuedFollowUpStatus(queue, message.id, "paused", reason));
          dispatch({ type: "log", text: reason, level: "warn" });
          return;
        }
        optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
        try {
          await startTurn(client, threadId, content, message.cwd, state.threadContextDefaults, turnStartOptions);
          rememberLatestCollaborationMode(threadId, turnStartOptions);
        } catch (error) {
          if (!isThreadNotFound(error) && !isThreadNeedsResume(error)) {
            dropOptimisticUserMessage(dispatch, optimistic);
            throw error;
          }
          if (!(await resumeSelectedThreadAndStartTurn(
            client,
            threadId,
            content,
            message.cwd,
            dispatch,
            state.threadContextDefaults,
            turnStartOptions,
          ))) {
            dropOptimisticUserMessage(dispatch, optimistic);
            throw error;
          }
          rememberLatestCollaborationMode(threadId, turnStartOptions);
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
    activeModelSupportsImageInput,
    client,
    collaborationModesForComposerMode,
    ensureConnected,
    rememberLatestCollaborationMode,
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
    if (composerHasImageAttachments(composerAttachments) && !activeModelSupportsImageInput) {
      dispatch({ type: "log", text: "Current model does not declare image input support", level: "warn" });
      return;
    }
    const sendAttachments = await attachmentsWithDataImagePreviews(composerAttachments);
    const content = buildUserInputFromComposer(input, sendAttachments);
    if (content.length === 0) return;
    try {
      if (!(await ensureConnected())) return;
      const shouldQueueFollowUp = Boolean(
        activeTurnId &&
        activeThreadRunning &&
        composerSubmitState.submitButtonMode === "queue",
      );
      const modes = shouldQueueFollowUp
        ? collaborationModes
        : await collaborationModesForComposerMode(composerMode);
      const turnStartOptions = shouldQueueFollowUp
        ? null
        : turnStartOptionsFromComposerMode(composerMode, modes, state.threadContextDefaults);
      if (!shouldQueueFollowUp && composerMode === "plan" && !turnStartOptions?.collaborationMode) {
        dispatch({
          type: "log",
          text: "Plan mode is unavailable until collaboration modes load from app-server",
          level: "warn",
        });
        return;
      }
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
          attachments: sendAttachments,
          cwd: workspace,
          mode: composerMode,
        });
        updateQueuedFollowUps(threadId, (queue) => [...queue, queued]);
        return;
      }
      let optimistic: OptimisticUserMessageHandle | null = null;
      try {
        if (activeTurnId && activeThreadRunning) {
          optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content, activeTurnId);
          await steerTurn(client, threadId, content, activeTurnId);
        } else {
          optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
          await startTurn(client, threadId, content, workspace, state.threadContextDefaults, turnStartOptions);
          rememberLatestCollaborationMode(threadId, turnStartOptions);
          if (readyThread.source === "created") resetComposerSelectionAfterCreatedThread(threadId);
        }
      } catch (error) {
        const recoverableSelectedThreadError = isThreadNotFound(error) || isThreadNeedsResume(error);
        if (!recoverableSelectedThreadError) {
          dropOptimisticUserMessage(dispatch, optimistic);
          throw error;
        }
        dropOptimisticUserMessage(dispatch, optimistic);
        optimistic = null;
        if (selectedThreadId && readyThread.source !== "resumed") {
          optimistic = dispatchOptimisticUserMessage(dispatch, selectedThreadId, content);
          if (await resumeSelectedThreadAndStartTurn(
            client,
            selectedThreadId,
            content,
            workspace,
            dispatch,
            state.threadContextDefaults,
            turnStartOptions,
          )) {
            rememberLatestCollaborationMode(selectedThreadId, turnStartOptions);
            return;
          }
          dropOptimisticUserMessage(dispatch, optimistic);
          optimistic = null;
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
        optimistic = dispatchOptimisticUserMessage(dispatch, nextThreadId, content);
        try {
          await startTurn(client, nextThreadId, content, workspace, state.threadContextDefaults, turnStartOptions);
        } catch (subError) {
          dropOptimisticUserMessage(dispatch, optimistic);
          throw subError;
        }
        rememberLatestCollaborationMode(nextThreadId, turnStartOptions);
        resetComposerSelectionAfterCreatedThread(nextThreadId);
      }
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [
    activeThread,
    activeThreadRunning,
    activeTurnId,
    activeModelSupportsImageInput,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerMode,
    composerSubmitState.disabled,
    composerSubmitState.disabledReason,
    composerSubmitState.submitButtonMode,
    composerSubmitState.submitBlockReason,
    ensureConnected,
    input,
    rememberLatestCollaborationMode,
    resetComposerSelectionAfterCreatedThread,
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
    setActiveComposerMode(message.mode ?? "default");
  }, [setActiveComposerMode, state.activeThreadId, updateQueuedFollowUps]);

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

  const enableComposerPlanMode = useCallback(async (): Promise<boolean> => {
    const modes = await collaborationModesForComposerMode("plan");
    if (!hasCollaborationModePreset(modes, "plan")) {
      dispatch({
        type: "log",
        text: "Plan mode is unavailable until collaboration modes load from app-server",
        level: "warn",
      });
      return false;
    }
    setActiveComposerMode("plan");
    return true;
  }, [collaborationModesForComposerMode, setActiveComposerMode]);

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
      case "setComposerMode":
        if (action.mode === "plan") {
          if (action.text !== undefined) {
            setInput(action.text);
            setComposerAttachments([]);
          } else {
            setInput("");
          }
          void enableComposerPlanMode();
          return;
        }
        setActiveComposerMode(action.mode);
        if (action.text !== undefined) {
          setInput(action.text);
          setComposerAttachments([]);
        } else {
          setInput("");
        }
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
          entries: slashCommandEntries(composerMode),
          message: "",
        });
        return;
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [composerMode, createThread, enableComposerPlanMode, openCommandPanel, openLocalSettingsPanel, runSlashRequest, setActiveComposerMode]);

  const executeSlashCommand = useCallback((command: SlashCommand) => {
    void handleSlashAction(applySlashCommand(command.id, { input, mode: composerMode }));
  }, [composerMode, handleSlashAction, input]);

  const browseComposerFiles = useCallback(async (kind: "file" | "image"): Promise<ComposerAttachment[]> => {
    const paths = await pickFileReferences(kind, true);
    const attachments = composerAttachmentsFromPaths(paths);
    const visibleAttachments = kind === "image"
      ? attachments.filter((attachment) => attachment.type === "localImage")
      : attachments;
    return attachmentsWithDataImagePreviews(visibleAttachments);
  }, []);

  const selectComposerPlan = useCallback(() => {
    if (composerMode === "plan") {
      setActiveComposerMode("default");
      return;
    }
    void enableComposerPlanMode();
  }, [composerMode, enableComposerPlanMode, setActiveComposerMode]);

  const selectCommandPanelEntry = useCallback((entry: CommandPanelEntry) => {
    const action = entry.action;
    if (!action) return;
    if (action.type === "attachMention") {
      setComposerAttachments((current) => mergeComposerAttachments(current, [{
        type: "mention",
        name: action.name,
        path: action.path,
      }]));
      setCommandPanel(null);
      return;
    }
    if (action.type === "attachSkill") {
      setComposerAttachments((current) => mergeComposerAttachments(current, [{
        type: "skill",
        name: action.name,
        path: action.path,
      }]));
      setCommandPanel(null);
    }
  }, []);

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
    const nextModel = normalizeModelConfig(modelDraft);
    if (nextModel.model) {
      dispatch({
        type: "setThreadContextDefaults",
        context: {
          ...(state.threadContextDefaults ?? {}),
          model: nextModel.model,
          modelProvider: nextModel.id,
          reasoningSummary: state.threadContextDefaults?.reasoningSummary ?? DEFAULT_MODEL_REASONING_SUMMARY,
          personality: state.threadContextDefaults?.personality ?? "pragmatic",
        },
      });
    }
    void saveModelDraftWorkflow({
      client,
      dispatch,
      connect,
      modelDraft,
      connected: state.connected,
      codexHome: state.hostStatus?.codexHome,
    }).then(() => refreshThreadContextDefaults(client, dispatch, workspace));
  }, [
    client,
    connect,
    modelDraft,
    state.connected,
    state.hostStatus?.codexHome,
    state.threadContextDefaults,
    workspace,
  ]);

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
          mode={composerMode}
          onInputChange={setInput}
          onAttachmentsChange={setComposerAttachments}
          supportsImageInput={activeModelSupportsImageInput}
          onAttachmentError={(message) => dispatch({ type: "log", text: message, level: "warn" })}
          onBrowseFiles={browseComposerFiles}
          onPlanSelected={selectComposerPlan}
          onOpenPlugins={() => void runSlashRequest("listPlugins")}
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
          onSelectEntry={selectCommandPanelEntry}
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

async function attachmentsWithDataImagePreviews(attachments: ComposerAttachment[]): Promise<ComposerAttachment[]> {
  const resolved: ComposerAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.type !== "localImage") {
      resolved.push(attachment);
      continue;
    }
    try {
      resolved.push({
        type: "image",
        url: await readImageDataUrl(attachment.path),
        name: fileNameFromPath(attachment.path),
      });
    } catch {
      resolved.push(attachment);
    }
  }
  return resolved;
}

function fileNameFromPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || "image";
}

function turnStartOptionsFromComposerMode(
  mode: ComposerMode,
  collaborationModes: CollaborationModeMask[],
  context: ThreadContextDefaults | null | undefined,
): TurnStartOptions | null {
  const collaborationMode = collaborationModeFromComposerMode(mode, collaborationModes, context);
  return collaborationMode ? { collaborationMode } : null;
}

function slashCommandEntries(mode: ComposerMode): CommandPanelEntry[] {
  return slashCommandsForComposerMode(mode, DEFAULT_SLASH_COMMANDS)
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
