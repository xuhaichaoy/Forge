import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CollaborationModeMask, ModelConfig } from "@hicodex/codex-protocol";
import { CommandPanel } from "./components/command-panel";
import { Composer } from "./components/composer";
import { ComposerExternalFooter } from "./components/composer-external-footer";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import { McpToolCallForm } from "./components/mcp-tool-call-form";
import { SettingsPanel } from "./components/model-settings-panel";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { RightRail } from "./components/right-rail";
import { Sidebar } from "./components/sidebar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import { ThreadActionDialog } from "./components/thread-action-dialog";
import { CodexJsonRpcClient } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import { pickFileReferences } from "./lib/tauri-host";
import {
  attachmentsWithDataImagePreviews,
  useTurnSubmission,
} from "./hooks/use-turn-submission";
import { useElementInlineSize } from "./hooks/use-element-inline-size";
import { useArtifactPreviewActions } from "./hooks/use-artifact-preview-actions";
import {
  useCommandPanelActions,
  type McpToolFormAction,
} from "./hooks/use-command-panel-actions";
import { useBackgroundAgentPanel } from "./hooks/use-background-agent-panel";
import { useSkillsPanelRefresh } from "./hooks/use-skills-panel-refresh";
import { useThreadActions } from "./hooks/use-thread-actions";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_MODEL_REASONING_SUMMARY,
  EMPTY_MODEL,
  buildModelConfigFromConfig,
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
import type { FileReferenceSelection } from "./state/file-references";
import {
  applySlashCommand,
  composerAttachmentsFromPaths,
  composerPlaceholderText,
  projectComposerSubmitState,
  type ComposerAttachment,
  type ComposerMentionOption,
  type ComposerMode,
  type SettingsPanelId,
  type SlashCommand,
  type SlashCommandAction,
} from "./state/composer-workflow";
import {
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
  dedupeComposerMentionOptions,
  mentionOptionsFromAppsResponse,
  mentionOptionsFromFuzzyFiles,
  mentionOptionsFromPluginsResponse,
  mentionOptionsFromSkillsResponse,
} from "./state/mention-options";
import {
  isThreadStatusInProgress,
  projectConversation,
  type RailEntry,
} from "./state/render-groups";
import {
  deriveActivePendingRequests,
  summarizePendingRequestAwaitingByThread,
} from "./state/pending-request-scope";
import {
  executeHiCodexImageToolCall,
  isHiCodexImageToolCall,
  loadImageGenerationSettings,
  saveImageGenerationSettings,
  shouldRegisterHiCodexImageDynamicTool,
  type ImageGenerationSettings,
} from "./state/image-generation-tool";
import {
  browserStorage,
  slashCommandEntries,
  threadGitBranch,
} from "./state/app-shell-helpers";
import {
  loadSettingsPanelContent,
} from "./state/settings-panel-loader";
import {
  projectRightRailSections,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
  rightRailShouldRender,
} from "./state/right-rail";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import {
  refreshThreads,
  refreshThreadContextDefaults,
  threadTitle,
  type TurnStartOptions,
} from "./state/thread-workflow";

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [followUpQueueingEnabled, setFollowUpQueueingEnabled] = useState(true);
  const [collaborationModes, setCollaborationModes] = useState<CollaborationModeMask[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<SettingsPanelId | null>(null);
  const [settingsPanelState, setSettingsPanelState] = useState<CommandPanelState | null>(null);
  const [commandPanel, setCommandPanel] = useState<CommandPanelState | null>(null);
  const [mcpToolForm, setMcpToolForm] = useState<McpToolFormAction | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const [imageGenerationDraft, setImageGenerationDraft] = useState<ImageGenerationSettings>(() =>
    loadImageGenerationSettings(browserStorage())
  );
  const [artifactPreview, setArtifactPreview] = useState<RailEntry | null>(null);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [backgroundTerminalCleanupPending, setBackgroundTerminalCleanupPending] = useState(false);
  const [skillsChangedNonce, setSkillsChangedNonce] = useState(0);
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const workspaceInitialized = useRef(false);
  const threadScrollOffsetsRef = useRef(new Map<string, number>());
  const mainRef = useRef<HTMLElement | null>(null);
  const mainWidth = useElementInlineSize(mainRef);

  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => {
        dispatch({ type: "notification", message });
        if (message.method === "skills/changed") {
          setSkillsChangedNonce((current) => current + 1);
        }
      },
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
  const handledImageToolRequestIdsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const request of state.pendingRequests) {
      if (!isHiCodexImageToolCall(request)) continue;
      const requestKey = String(request.id);
      if (handledImageToolRequestIdsRef.current.has(requestKey)) continue;
      handledImageToolRequestIdsRef.current.add(requestKey);
      void executeHiCodexImageToolCall(request, normalizeModelConfig(modelDraft), { imageSettings: imageGenerationDraft })
        .then((result) => client.respond(request.id, result))
        .catch((error) => client.respond(request.id, {
          success: false,
          contentItems: [{ type: "inputText", text: `Image generation request failed: ${formatError(error)}` }],
        }))
        .finally(() => {
          dispatch({ type: "resolveServerRequest", id: request.id });
        });
    }
  }, [client, imageGenerationDraft, modelDraft, state.pendingRequests]);
  const activeProgressPlan = activeThreadRuntime.turnPlan;
  const activeModelSupportsImageInput = useMemo(() => {
    const providerId = state.threadContextDefaults?.modelProvider ?? "";
    const modelSlug = state.threadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    return model?.supportsImageInput !== false;
  }, [state.models, state.threadContextDefaults?.model, state.threadContextDefaults?.modelProvider]);
  const includeImageDynamicTool = useMemo(
    () => shouldRegisterHiCodexImageDynamicTool(imageGenerationDraft),
    [imageGenerationDraft],
  );
  const conversation = useMemo(
    () => projectConversation(activeItems, { isThreadRunning: activeThreadRunning, progressPlan: activeProgressPlan }),
    [activeItems, activeProgressPlan, activeThreadRunning],
  );
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
      backgroundAgents: conversation.backgroundAgents,
      backgroundTerminals: conversation.backgroundTerminals,
      sources: conversation.sources,
    }),
    [branchDetails, conversation],
  );
  const hasRightRailContent = rightRailSections.length > 0
    || fileReference !== null
    || artifactPreview !== null;
  const showRightRail = hasRightRailContent && rightRailShouldRender(mainWidth);
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
    void refreshThreadContextDefaults(client, dispatch, workspace)
      .then((config) => {
        if (config) setModelDraft(buildModelConfigFromConfig(config));
      });
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

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  const collaborationModesForComposerMode = useCallback(async (mode: ComposerMode): Promise<CollaborationModeMask[]> => {
    if (mode !== "plan" || hasCollaborationModePreset(collaborationModes, "plan")) return collaborationModes;
    return loadCollaborationModes();
  }, [collaborationModes, loadCollaborationModes]);

  const {
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
  } = useThreadActions({
    activeThread,
    client,
    dispatch,
    ensureConnected,
    setComposerAttachments,
    setInput,
    threadContextDefaults: state.threadContextDefaults,
    threads: state.threads,
    workspace,
  });

  const {
    backgroundAgentConversation,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    openBackgroundAgentThread,
    openSideChatFromThread,
    openSideConversationPanel,
  } = useBackgroundAgentPanel({
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    threadContextDefaults: state.threadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });
  const composerPlaceholder = composerPlaceholderText({
    hasConversation: conversation.units.length > 0,
    hasBackgroundAgentsPanel: backgroundAgentPanel != null,
  });

  const openCommandPanel = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setCommandPanel(createCommandPanelState(panel, options));
  }, []);

  const openSettingsPanelContent = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setSettingsPanelState(createCommandPanelState(panel, options));
  }, []);

  const loadSettingsPanel = useCallback(async (
    panel: SettingsPanelId,
    options: { forceReload?: boolean } = {},
  ) => {
    setActiveSettingsPanel(panel);
    setCommandPanel(null);
    await loadSettingsPanelContent({
      activeTurnId,
      client,
      ensureConnected,
      forceReload: options.forceReload === true,
      includeImageDynamicTool,
      openSettingsPanelContent,
      panel,
      setSettingsPanelState,
      state,
      workspace,
    });
  }, [
    activeTurnId,
    client,
    ensureConnected,
    includeImageDynamicTool,
    openSettingsPanelContent,
    state,
    workspace,
  ]);

  const refreshActiveSettingsPanel = useCallback(() => {
    if (!activeSettingsPanel) return;
    void loadSettingsPanel(activeSettingsPanel, { forceReload: true });
  }, [activeSettingsPanel, loadSettingsPanel]);

  useSkillsPanelRefresh({
    activeSettingsPanel,
    client,
    commandPanelPanel: commandPanel?.panel,
    ensureConnected,
    setCommandPanel,
    setSettingsPanelState,
    skillsChangedNonce,
    workspace,
  });

  const setActiveComposerMode = useCallback((mode: ComposerMode) => {
    dispatch({ type: "setActiveComposerMode", mode });
  }, []);

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

  const {
    openAssistantArtifact,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewConversationFileReference,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReference,
  } = useArtifactPreviewActions({
    activeThreadCwd: activeThread?.cwd,
    defaultCwd: state.hostStatus?.defaultCwd,
    dispatch,
    setArtifactPreview,
    setFileReference,
    workspace,
  });

  const rememberThreadScrollOffset = useCallback((distanceFromBottomPx: number) => {
    threadScrollOffsetsRef.current.set(activeThreadScrollKey, Math.max(0, distanceFromBottomPx));
  }, [activeThreadScrollKey]);

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

  const cleanBackgroundTerminals = useCallback(async () => {
    const threadId = state.activeThreadId;
    if (!threadId || backgroundTerminalCleanupPending) return;
    setBackgroundTerminalCleanupPending(true);
    try {
      if (!(await ensureConnected())) return;
      await client.request("thread/backgroundTerminals/clean", { threadId }, 120_000);
      dispatch({ type: "log", text: "Background terminal cleanup requested.", level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    } finally {
      setBackgroundTerminalCleanupPending(false);
    }
  }, [backgroundTerminalCleanupPending, client, ensureConnected, state.activeThreadId]);

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
    includeImageDynamicTool,
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
      threadContextDefaults: state.threadContextDefaults,
      openSideConversationPanel,
    })
  ), [
    activeThread,
    activeTurnId,
    client,
    ensureConnected,
    openCommandPanel,
    openRenameThreadDialog,
    openSideConversationPanel,
    state.activeThreadId,
    state.connected,
    state.hostStatus?.defaultCwd,
    state.hostStatus?.pid,
    state.models.length,
    state.pendingRequests.length,
    state.threadContextDefaults,
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
        await loadSettingsPanel(action.panel);
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
  }, [composerMode, createThread, enableComposerPlanMode, loadSettingsPanel, openCommandPanel, runSlashRequest, setActiveComposerMode]);

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
    if (!query.trim()) return [];
    if (!(await ensureConnected())) return [];
    const [fileResult, skillResult, appResult, pluginResult] = await Promise.allSettled([
      cwd
        ? client.request<{ files?: Array<Record<string, unknown>> }>(
            "fuzzyFileSearch",
            { query, roots: [cwd], cancellationToken: null },
            120_000,
          )
        : Promise.resolve({ files: [] }),
      client.request<unknown>("skills/list", {
        cwds: cwd ? [cwd] : [],
        forceReload: false,
      }),
      client.request<unknown>("app/list", {
        limit: 50,
        threadId: state.activeThreadId,
      }),
      client.request<unknown>("plugin/list", {
        cwds: cwd ? [cwd] : null,
      }),
    ]);
    if (
      fileResult.status === "rejected"
      && skillResult.status === "rejected"
      && appResult.status === "rejected"
      && pluginResult.status === "rejected"
    ) throw fileResult.reason;
    return dedupeComposerMentionOptions([
      ...(skillResult.status === "fulfilled" ? mentionOptionsFromSkillsResponse(skillResult.value, query) : []),
      ...(appResult.status === "fulfilled" ? mentionOptionsFromAppsResponse(appResult.value, query) : []),
      ...(pluginResult.status === "fulfilled" ? mentionOptionsFromPluginsResponse(pluginResult.value, query) : []),
      ...(fileResult.status === "fulfilled" ? mentionOptionsFromFuzzyFiles(fileResult.value.files ?? []) : []),
    ]).slice(0, 25);
  }, [client, ensureConnected, state.activeThreadId, workspace]);

  const selectComposerPlan = useCallback(() => {
    if (composerMode === "plan") {
      setActiveComposerMode("default");
      return;
    }
    void enableComposerPlanMode();
  }, [composerMode, enableComposerPlanMode, setActiveComposerMode]);

  const {
    callMcpToolFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
  } = useCommandPanelActions({
    activeThreadId: state.activeThreadId,
    activeTurnId,
    client,
    dispatch,
    ensureConnected,
    openCommandPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setMcpToolForm,
    workspace,
  });

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
      if (isHiCodexImageToolCall(request)) {
        const result = accepted
          ? await executeHiCodexImageToolCall(request, normalizeModelConfig(modelDraft), { imageSettings: imageGenerationDraft })
          : {
              success: false,
              contentItems: [{ type: "inputText" as const, text: "Image generation was cancelled." }],
            };
        await client.respond(request.id, result);
        dispatch({ type: "resolveServerRequest", id: request.id });
        return;
      }
      const result = buildApprovalResult(request, accepted, answers);
      result === null
        ? await client.reject(request.id, accepted ? "Unsupported HiCodex request" : "Rejected by HiCodex user")
        : await client.respond(request.id, result);
      dispatch({ type: "resolveServerRequest", id: request.id });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [client, imageGenerationDraft, modelDraft]);

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
          personality: state.threadContextDefaults?.personality ?? "friendly",
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

  const applyImageGenerationDraft = useCallback(() => {
    const nextSettings = saveImageGenerationSettings(browserStorage(), imageGenerationDraft);
    setImageGenerationDraft(nextSettings);
    dispatch({
      type: "log",
      text: nextSettings.baseUrl
        ? `set image generation endpoint to ${nextSettings.baseUrl}`
        : "image generation will reuse the active model endpoint",
    });
  }, [imageGenerationDraft]);

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
        onOpenSettings={() => void loadSettingsPanel("general")}
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
          onOpenSideChat={openSideChatFromThread}
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
                onOpenPlugins={() => void loadSettingsPanel("plugins")}
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
              <ComposerExternalFooter
                branch={threadGitBranch(activeThread)}
                cwd={activeThread?.cwd || workspace}
                model={state.threadContextDefaults?.model}
                reasoningEffort={state.threadContextDefaults?.reasoningEffort}
              />
            </div>
          )}
        >
          <section className="hc-conversation" data-thread-find-target="conversation">
            <ConversationView
              units={conversation.units}
              threadId={state.activeThreadId}
              onEditLastUserMessage={editLastUserTurn}
              onOpenAssistantArtifact={openAssistantArtifact}
              onForkTurn={forkActiveThreadFromTurn}
              onOpenFileReference={previewConversationFileReference}
              onOpenThreadId={openBackgroundAgentThread}
            />
          </section>
        </ThreadScrollLayout>

        {backgroundAgentPanel && (
          <BackgroundAgentPanel
            error={backgroundAgentPanel.error}
            kind={backgroundAgentPanel.kind}
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
            artifactWorkspaceRoot={previewPathContext.workspaceRoot}
            artifactCwd={previewPathContext.cwd}
            onCloseArtifactPreview={() => setArtifactPreview(null)}
            onCloseFileReference={() => setFileReference(null)}
            onOpenArtifactPreview={previewRailArtifact}
            onOpenArtifactFileExternal={openRailArtifactFileExternal}
            onOpenFileReferenceExternal={openFileReferenceExternal}
            onOpenFileReference={previewRailFileReference}
            onOpenUrl={openRailUrl}
            onOpenDiff={openActiveDiffPanel}
            onOpenThreadId={openBackgroundAgentThread}
            onCleanBackgroundTerminals={conversation.backgroundTerminals.length > 0
              ? () => void cleanBackgroundTerminals()
              : undefined}
            backgroundTerminalCleanupPending={backgroundTerminalCleanupPending}
          />
        )}
      </main>

      {activeSettingsPanel && (
        <SettingsPanel
          activePanel={activeSettingsPanel}
          modelDraft={modelDraft}
          setModelDraft={setModelDraft}
          imageGenerationDraft={imageGenerationDraft}
          setImageGenerationDraft={setImageGenerationDraft}
          models={state.models}
          panelState={settingsPanelState}
          onClose={() => setActiveSettingsPanel(null)}
          onRefreshPanel={refreshActiveSettingsPanel}
          onSaveModel={applyModelDraft}
          onSaveImageGeneration={applyImageGenerationDraft}
          onSelectAction={(action) => selectCommandPanelAction(action, openSettingsPanelContent)}
          onSelectEntry={(entry) => {
            if (entry.disabled || !entry.action) return;
            selectCommandPanelAction(entry.action, openSettingsPanelContent);
          }}
          onSelectPanel={(panel) => void loadSettingsPanel(panel)}
        />
      )}

      {commandPanel && (
        <CommandPanel
          panel={commandPanel}
          onClose={() => setCommandPanel(null)}
          onSelectAction={(action) => selectCommandPanelAction(action)}
          onSelectEntry={selectCommandPanelEntry}
        />
      )}

      {mcpToolForm && (
        <McpToolCallForm
          action={mcpToolForm}
          onClose={() => setMcpToolForm(null)}
          onSubmit={(argumentsValue) => {
            const action = mcpToolForm;
            setMcpToolForm(null);
            void callMcpToolFromPanel({
              type: "callMcpTool",
              server: action.server,
              tool: action.tool,
              arguments: argumentsValue,
            });
          }}
        />
      )}

      {threadActionDialog && (
        <ThreadActionDialog
          action={threadActionDialog}
          onClose={closeThreadActionDialog}
          onRename={renameSelectedThread}
          onArchive={archiveSelectedThread}
        />
      )}
    </div>
  );
}
