import { Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@hicodex/codex-protocol";
import { CommandPanel } from "./components/command-panel";
import { Composer } from "./components/composer";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import { ModelSettingsPanel } from "./components/model-settings-panel";
import type { OpenThreadOptions } from "./components/open-thread";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { RightRail } from "./components/right-rail";
import { Sidebar } from "./components/sidebar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import {
  ThreadActionDialog,
  type ThreadActionDialogState,
} from "./components/thread-action-dialog";
import { CodexJsonRpcClient } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import { openFileReference, pickFileReferences } from "./lib/tauri-host";
import {
  attachmentsWithDataImagePreviews,
  useTurnSubmission,
} from "./hooks/use-turn-submission";
import { shouldOpenArtifactPreview } from "./state/artifact-preview";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_MODEL_REASONING_SUMMARY,
  EMPTY_MODEL,
  normalizeModelConfig,
} from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  selectActiveThreadRuntime,
  selectItemsByThread,
  type PendingServerRequest,
} from "./state/codex-reducer";
import { buildApprovalResult } from "./state/approval-requests";
import { projectBranchDetails } from "./state/branch-details";
import { projectSidebarThreads } from "./state/sidebar-projection";
import {
  normalizeFileReference,
  type FileReferenceSelection,
} from "./state/file-references";
import {
  DEFAULT_SLASH_COMMANDS,
  applySlashCommand,
  composerAttachmentsFromPaths,
  composerPlaceholderText,
  mergeComposerAttachments,
  projectComposerSubmitState,
  slashCommandsForComposerMode,
  type ComposerAttachment,
  type ComposerMentionOption,
  type ComposerMode,
  type SlashCommand,
  type SlashCommandAction,
} from "./state/composer-workflow";
import {
  hasCollaborationModePreset,
  listCollaborationModes,
} from "./state/collaboration-modes";
import {
  createCommandPanelState,
  projectMcpToolCallResultEntries,
  type CommandPanelOptions,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelState,
} from "./state/command-panel";
import { buildConversationMarkdown } from "./state/conversation-markdown";
import {
  isThreadStatusInProgress,
  projectConversation,
  type RailEntry,
  type RailEntryReference,
  type ThreadItem,
} from "./state/render-groups";
import {
  deriveActivePendingRequests,
  summarizePendingRequestAwaitingByThread,
} from "./state/pending-request-scope";
import {
  projectRightRailSections,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
} from "./state/right-rail";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import {
  archiveThread,
  editLastUserTurn as editLastUserTurnWorkflow,
  forkThread as forkThreadWorkflow,
  forkThreadFromTurn as forkThreadFromTurnWorkflow,
  isThreadNotFound,
  isThreadNotMaterialized,
  readThread,
  readThreadForDisplay,
  refreshThreads,
  refreshThreadContextDefaults,
  renameThread as renameThreadWorkflow,
  resumeThreadWithMetadataRead,
  threadTitle,
  threadStatusLabel,
  type TurnStartOptions,
} from "./state/thread-workflow";

const EMPTY_THREAD_ITEMS: ThreadItem[] = [];

interface BackgroundAgentPanelState {
  threadId: string;
  displayName: string | null;
  model: string | null;
  role: string | null;
  loading: boolean;
  error: string | null;
}

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [followUpQueueingEnabled, setFollowUpQueueingEnabled] = useState(true);
  const [collaborationModes, setCollaborationModes] = useState<CollaborationModeMask[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [commandPanel, setCommandPanel] = useState<CommandPanelState | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const [artifactPreview, setArtifactPreview] = useState<RailEntry | null>(null);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [threadActionDialog, setThreadActionDialog] = useState<ThreadActionDialogState | null>(null);
  const [backgroundAgentPanel, setBackgroundAgentPanel] = useState<BackgroundAgentPanelState | null>(null);
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const threadSelectionRequestId = useRef(0);
  const backgroundAgentRequestId = useRef(0);
  const workspaceInitialized = useRef(false);
  const threadScrollOffsetsRef = useRef(new Map<string, number>());
  const mainRef = useRef<HTMLElement | null>(null);
  const mainWidth = useElementInlineSize(mainRef);

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

  const activeThreadRuntime = selectActiveThreadRuntime(state);
  const activeItems = activeThreadRuntime.items;
  const composerMode = state.composerMode;
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
  const activeThreadScrollKey = state.activeThreadId ?? "new-thread";
  const initialThreadScrollOffset = threadScrollOffsetsRef.current.get(activeThreadScrollKey) ?? 0;
  const threadIds = useMemo(() => state.threads.map((thread) => thread.id), [state.threads]);
  const activeTurnId = activeThreadRuntime.activeTurnId;
  const itemsByThread = useMemo(() => selectItemsByThread(state), [state.threadsRuntime]);
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
    () => summarizePendingRequestAwaitingByThread(state.pendingRequests, { itemsByThread }),
    [itemsByThread, state.pendingRequests],
  );
  const activeProgressPlan = activeThreadRuntime.turnPlan;
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
  const composerPlaceholder = composerPlaceholderText({
    hasConversation: conversation.units.length > 0,
    hasBackgroundAgentsPanel: backgroundAgentPanel != null,
  });
  const backgroundAgentThread = backgroundAgentPanel
    ? state.threads.find((thread) => thread.id === backgroundAgentPanel.threadId) ?? null
    : null;
  const backgroundAgentRuntime = backgroundAgentPanel
    ? state.threadsRuntime[backgroundAgentPanel.threadId] ?? null
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
    : backgroundAgentPanel?.displayName || "Background agent";
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
  const activeDiff = activeThreadRuntime.turnDiff;
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
  const showRightRail = rightRailSections.length > 0
    || fileReference !== null
    || artifactPreview !== null;
  const rightRailMode = rightRailDisplayMode(mainWidth);
  const threadInlineEndInset = rightRailReservedInlineEndPx(mainWidth, showRightRail);
  const composerSubmitState = useMemo(() => projectComposerSubmitState({
    input,
    attachmentCount: composerAttachments.length,
    connecting: state.connecting,
    threadRunning: activeThreadRunning,
    activeTurnId,
    pendingRequestCount: activePendingRequests.length,
    queueingEnabled: followUpQueueingEnabled,
  }), [
    activeThreadRunning,
    activeTurnId,
    activePendingRequests.length,
    composerAttachments.length,
    followUpQueueingEnabled,
    input,
    state.connecting,
  ]);

  const autoConnectStarted = useRef(false);

  const connect = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "connecting", value: true });
    try {
      await client.connect();
      dispatch({ type: "connected", value: true });
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
    setArtifactPreview(null);
    setFileReference(null);
  }, [state.activeThreadId]);

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
    dispatch({ type: "setActiveComposerMode", mode });
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
    const model = normalizedOption(options.model);
    const role = normalizedAgentRole(options.role);
    const nextPanel = {
      threadId: id,
      displayName,
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
  }, [client, ensureConnected]);

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

  const forkActiveThreadFromTurn = useCallback(async (turnId: string) => {
    if (!activeThread) return;
    try {
      if (!(await ensureConnected())) return;
      const result = await forkThreadFromTurnWorkflow(
        client,
        activeThread.id,
        turnId,
        workspace,
        state.threadContextDefaults,
      );
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [activeThread, client, ensureConnected, state.threadContextDefaults, workspace]);

  const editLastUserTurn = useCallback(async (turnId: string, message: string) => {
    if (!activeThread) return;
    try {
      if (!(await ensureConnected())) return;
      await editLastUserTurnWorkflow(
        client,
        activeThread.id,
        turnId,
        message,
        workspace,
        state.threadContextDefaults,
        (thread) => {
          dispatch({ type: "upsertThread", thread, select: true });
        },
      );
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
      throw error;
    }
  }, [activeThread, client, ensureConnected, state.threadContextDefaults, workspace]);

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

  const previewRailArtifact = useCallback((entry: RailEntry) => {
    setArtifactPreview(entry);
  }, []);

  const previewRailFileReference = useCallback((reference: RailEntryReference) => {
    setArtifactPreview(null);
    previewConversationFileReference(reference);
  }, [previewConversationFileReference]);

  const rememberThreadScrollOffset = useCallback((distanceFromBottomPx: number) => {
    threadScrollOffsetsRef.current.set(activeThreadScrollKey, Math.max(0, distanceFromBottomPx));
  }, [activeThreadScrollKey]);

  const openFileReferenceExternal = useCallback((reference: FileReferenceSelection) => {
    void openFileReference(reference.path, reference.lineStart).catch((error) => {
      dispatch({ type: "log", text: formatError(error), level: "warn" });
    });
  }, []);

  const openRailArtifactFileExternal = useCallback((reference: RailEntryReference) => {
    const normalized = normalizeFileReference(reference);
    if (!normalized) return;
    openFileReferenceExternal(normalized);
  }, [openFileReferenceExternal]);

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

  const openFirstConversationArtifact = useCallback(() => {
    const entry = conversation.artifacts[0];
    if (!entry) {
      dispatch({ type: "log", text: "Artifacts are unavailable", level: "warn" });
      return;
    }
    if (shouldOpenArtifactPreview(entry)) {
      previewRailArtifact(entry);
      return;
    }
    if (entry.reference) {
      previewRailFileReference(entry.reference);
      return;
    }
    if (entry.action?.kind === "url") {
      openRailUrl(entry.action.url);
      return;
    }
    previewRailArtifact(entry);
  }, [conversation.artifacts, openRailUrl, previewRailArtifact, previewRailFileReference]);

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
    dispatch({ type: "resetThreadComposerMode", threadId });
  }, []);

  const {
    activeQueuedFollowUps,
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    reorderQueuedFollowUp,
    sendQueuedFollowUpNow,
    sendTurn,
  } = useTurnSubmission({
    activeModelSupportsImageInput,
    activePendingRequestCount: activePendingRequests.length,
    activeThread,
    activeThreadId: state.activeThreadId,
    activeThreadRunning,
    activeTurnId,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerMode,
    composerSubmitState,
    dispatch,
    ensureConnected,
    input,
    rememberLatestCollaborationMode,
    resetComposerSelectionAfterCreatedThread,
    setActiveComposerMode,
    setComposerAttachments,
    setInput,
    threadContextDefaults: state.threadContextDefaults,
    threadIds,
    workspace,
  });

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
      activeItems,
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

  const searchComposerMentions = useCallback(async (query: string): Promise<ComposerMentionOption[]> => {
    const cwd = workspace.trim();
    if (!cwd || !query.trim()) return [];
    if (!(await ensureConnected())) return [];
    const result = await client.request<{ files?: Array<Record<string, unknown>> }>(
      "fuzzyFileSearch",
      { query, roots: [cwd], cancellationToken: null },
      120_000,
    );
    return mentionOptionsFromFuzzyFiles(result.files ?? []);
  }, [client, ensureConnected, workspace]);

  const selectComposerPlan = useCallback(() => {
    if (composerMode === "plan") {
      setActiveComposerMode("default");
      return;
    }
    void enableComposerPlanMode();
  }, [composerMode, enableComposerPlanMode, setActiveComposerMode]);

  const callMcpToolFromPanel = useCallback(async (
    action: Extract<NonNullable<CommandPanelEntry["action"]>, { type: "callMcpTool" }>,
  ) => {
    const threadId = state.activeThreadId;
    const title = `${action.server}:${action.tool}`;
    if (!threadId) {
      const message = "Select or start a thread before calling an MCP tool.";
      dispatch({ type: "log", text: message, level: "warn" });
      openCommandPanel("mcp", { status: "error", title, error: message, entries: [] });
      return;
    }
    if (!(await ensureConnected())) return;
    openCommandPanel("mcp", { status: "loading", title, message: "Calling MCP tool...", entries: [] });
    try {
      const result = await client.request<unknown>("mcpServer/tool/call", {
        threadId,
        server: action.server,
        tool: action.tool,
        arguments: action.arguments,
      }, 120_000);
      openCommandPanel("mcp", {
        status: "ready",
        title,
        message: "MCP tool call completed.",
        entries: projectMcpToolCallResultEntries(action.server, action.tool, result),
      });
    } catch (error) {
      openCommandPanel("mcp", {
        status: "error",
        title,
        error: formatError(error),
        entries: [],
      });
    }
  }, [client, ensureConnected, openCommandPanel, state.activeThreadId]);

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
      return;
    }
    if (action.type === "callMcpTool") {
      void callMcpToolFromPanel(action);
    }
  }, [callMcpToolFromPanel]);

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
        threads={projectSidebarThreads(state.threads)}
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
        getThreadTitle={(thread) => threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null)}
      />

      <main
        className="hc-main"
        data-right-rail-mode={showRightRail ? rightRailMode : undefined}
        ref={mainRef}
      >
        <ConversationChrome
          title={activeThread ? threadTitle(activeThread, conversation.units.flatMap((unit) => "items" in unit ? unit.items : [])) : "Codex conversation"}
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

        <ThreadScrollLayout
          resetKey={activeThreadScrollKey}
          initialOffset={initialThreadScrollOffset}
          onScroll={rememberThreadScrollOffset}
          inlineEndInset={threadInlineEndInset}
          contentVersion={`${conversation.units.length}:${activeThreadRunning}:${activePendingRequests.length}:${activeQueuedFollowUps.length}`}
          footer={(
            <div
              className="hc-thread-composer-region"
              data-thread-find-composer="true"
            >
              <div
                className="hc-above-composer-portal"
                data-above-composer-portal="true"
                data-above-composer-conversation-id={state.activeThreadId ?? undefined}
              />

              <div
                className="hc-above-composer-queue-portal"
                data-above-composer-queue-portal="true"
                data-above-composer-conversation-id={state.activeThreadId ?? undefined}
              >
                <QueuedFollowUpStack
                  messages={activeQueuedFollowUps}
                  isQueueingEnabled={followUpQueueingEnabled}
                  onSendNow={sendQueuedFollowUpNow}
                  onEdit={editQueuedFollowUp}
                  onDelete={deleteQueuedFollowUp}
                  onQueueingChange={setFollowUpQueueingEnabled}
                  onReorder={reorderQueuedFollowUp}
                />
              </div>

              <Composer
                input={input}
                attachments={composerAttachments}
                mode={composerMode}
                placeholder={composerPlaceholder}
                onInputChange={setInput}
                onAttachmentsChange={setComposerAttachments}
                supportsImageInput={activeModelSupportsImageInput}
                onAttachmentError={(message) => dispatch({ type: "log", text: message, level: "warn" })}
                onBrowseFiles={browseComposerFiles}
                onMentionSearch={searchComposerMentions}
                onPlanSelected={selectComposerPlan}
                onOpenPlugins={() => void runSlashRequest("listPlugins")}
                pendingRequestContent={activePendingRequests.length > 0 ? (
                  <PendingRequestStack
                    pendingRequests={activePendingRequests}
                    onRespond={respondToRequest}
                    onLog={(text, level) => dispatch({ type: "log", text, level })}
                  />
                ) : null}
                submitState={composerSubmitState}
                onSend={() => void sendTurn()}
                onInterrupt={() => void interruptActiveTurn()}
                onSlashCommand={executeSlashCommand}
              />
            </div>
          )}
        >
          <section className="hc-conversation" data-thread-find-target="conversation">
            <ConversationView
              units={conversation.units}
              threadId={state.activeThreadId}
              onEditLastUserMessage={editLastUserTurn}
              onOpenAssistantArtifacts={openFirstConversationArtifact}
              onForkTurn={forkActiveThreadFromTurn}
              onOpenFileReference={previewConversationFileReference}
              onOpenThreadId={openBackgroundAgentThread}
              emptyState={(
                <div className="hc-welcome">
                  <Terminal size={28} />
                  <h1>Ready for Codex app-server</h1>
                  <p>Start a thread and send a prompt. Runtime facts will come from app-server ThreadItems.</p>
                </div>
              )}
            />
          </section>
        </ThreadScrollLayout>

        {backgroundAgentPanel && (
          <BackgroundAgentPanel
            error={backgroundAgentPanel.error}
            loading={backgroundAgentPanel.loading}
            status={backgroundAgentStatus}
            subtitle={backgroundAgentSubtitle}
            threadId={backgroundAgentPanel.threadId}
            title={backgroundAgentTitle}
            units={backgroundAgentConversation.units}
            onClose={closeBackgroundAgentPanel}
            onOpenFileReference={previewConversationFileReference}
            onOpenThreadId={openBackgroundAgentThread}
          />
        )}

        {showRightRail && (
          <RightRail
            sections={rightRailSections}
            displayMode={rightRailMode}
            artifactPreview={artifactPreview}
            fileReference={fileReference}
            onCloseArtifactPreview={() => setArtifactPreview(null)}
            onCloseFileReference={() => setFileReference(null)}
            onOpenArtifactPreview={previewRailArtifact}
            onOpenArtifactFileExternal={openRailArtifactFileExternal}
            onOpenFileReferenceExternal={openFileReferenceExternal}
            onOpenFileReference={previewRailFileReference}
            onOpenUrl={openRailUrl}
            onOpenDiff={openActiveDiffPanel}
          />
        )}
      </main>

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

function normalizedOption(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function useElementInlineSize<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [inlineSize, setInlineSize] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const setMeasuredInlineSize = (next: number) => {
      if (!Number.isFinite(next) || next < 0) return;
      setInlineSize((current) => Math.abs(current - next) < 1 ? current : next);
    };
    const measure = () => setMeasuredInlineSize(element.getBoundingClientRect().width);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(([entry]) => {
      const borderBoxSize = entry?.borderBoxSize;
      const firstBox = Array.isArray(borderBoxSize) ? borderBoxSize[0] : borderBoxSize;
      setMeasuredInlineSize(firstBox?.inlineSize ?? entry?.contentRect.width ?? element.getBoundingClientRect().width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return inlineSize;
}

function normalizedAgentRole(value: string | null | undefined): string | null {
  const role = normalizedOption(value);
  return role && role !== "default" ? role : null;
}

function shortThreadId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
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

function mentionOptionsFromFuzzyFiles(files: Array<Record<string, unknown>>): ComposerMentionOption[] {
  const options: ComposerMentionOption[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const path = stringRecordValue(file, "path")
      || stringRecordValue(file, "fsPath")
      || stringRecordValue(file, "file_path");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = stringRecordValue(file, "file_name")
      || stringRecordValue(file, "label")
      || basename(path);
    const detail = stringRecordValue(file, "relativePathWithoutFileName")
      || stringRecordValue(file, "relative_path_without_file_name")
      || path;
    const scoreValue = file.score;
    options.push({
      name,
      path,
      detail,
      ...(typeof scoreValue === "number" ? { score: scoreValue } : {}),
    });
  }
  return options.slice(0, 25);
}

function stringRecordValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "file";
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
