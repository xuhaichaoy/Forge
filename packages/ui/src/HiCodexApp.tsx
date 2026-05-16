import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@hicodex/codex-protocol";
import { CommandPanel } from "./components/command-panel";
import { Composer } from "./components/composer";
import { ComposerExternalFooter } from "./components/composer-external-footer";
import {
  DEFAULT_PROVIDERS,
  ModelPickerMenu,
  decodeSelection,
  encodeSelection,
} from "./components/model-picker-menu";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import { McpToolCallForm } from "./components/mcp-tool-call-form";
import { McpServerConfigForm } from "./components/mcp-server-config-form";
import { McpFollowUpDialog, type McpFollowUpDialogOption } from "./components/mcp-follow-up-dialog";
import { SettingsPanel } from "./components/model-settings-panel";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { FilePreviewPanel } from "./components/file-preview-panel";
import { RightRail } from "./components/right-rail";
import { Sidebar } from "./components/sidebar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import { ThreadActionDialog } from "./components/thread-action-dialog";
import type { McpAppHostCallRequest, McpResourceReadRequest } from "./components/tool-activity-detail";
import { CodexJsonRpcClient } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import {
  openExternalUrl,
  openFileReference,
  pickFileReferences,
  pickWorkspaceFolder,
  readCodexAuthSummary,
  type CodexAuthSummary,
} from "./lib/tauri-host";
import { applyUpdate, checkForUpdates } from "./lib/updater";
import {
  attachmentsWithDataImagePreviews,
  useTurnSubmission,
} from "./hooks/use-turn-submission";
import { useElementInlineSize } from "./hooks/use-element-inline-size";
import { useArtifactPreviewActions } from "./hooks/use-artifact-preview-actions";
import { useFilePreviewPanelLayout } from "./hooks/use-file-preview-panel-layout";
import {
  useCommandPanelActions,
  type McpServerFormAction,
  type McpToolFormAction,
} from "./hooks/use-command-panel-actions";
import { useBackgroundAgentPanel } from "./hooks/use-background-agent-panel";
import { useSkillsPanelRefresh } from "./hooks/use-skills-panel-refresh";
import { useThreadActions } from "./hooks/use-thread-actions";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  DEFAULT_MODEL_REASONING_SUMMARY,
  EMPTY_MODEL,
  buildModelConfigFromConfig,
  modelSlugsForConfig,
  normalizeModelSlugs,
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
import {
  projectSidebarThreads,
  projectSidebarWorkspaceRootOptions,
  sidebarThreadRelativeTime,
  type SidebarSortKey,
  type SidebarWorkspaceRootOption,
  threadProjectLabel,
} from "./state/sidebar-projection";
import type { FileReferenceSelection } from "./state/file-references";
import {
  applySlashCommand,
  buildUserInputFromComposer,
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
  MCP_APP_BRIDGE_INTERNAL_JSON_RPC_ERROR,
  MCP_APP_BRIDGE_INTERNAL_ERROR,
  MCP_APP_BRIDGE_INVALID_PARAMS,
  MCP_APP_BRIDGE_METHOD_NOT_FOUND,
  downloadMcpAppFile,
  mcpAppBridgeError,
  mcpAppBridgeUserCancelledError,
  mcpAppExternalHref,
  mcpAppFileDownloadRequest,
  mcpAppFollowUpMessageRequest,
  mcpAppFollowUpSource,
  mcpAppResourceTemplatesListResponse,
  mcpAppResourcesListResponse,
  mcpAppMcpProxyRequest,
  mcpAppToolCallAllowed,
  mcpAppToolCallRequest,
  mcpAppToolCallRequestFromBridgeArgs,
  mcpAppToolsListResponse,
  mcpServerStatusFromListResult,
} from "./state/mcp-app-host";
import { loadAllApps } from "./state/app-list";
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
  loadMcpManagementEntries,
  loadSettingsPanelContent,
} from "./state/settings-panel-loader";
import {
  DESKTOP_RIGHT_RAIL_GAP_PX,
  projectRightRailSections,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
  rightRailShouldRender,
} from "./state/right-rail";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import {
  createAndSelectThreadForTurn,
  refreshThreads,
  refreshThreadMetadata,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  interruptThreadTurn,
  sendPanelThreadMessage,
  startSideConversation,
  refreshThreadContextDefaults,
  threadTitle,
  type TurnStartOptions,
} from "./state/thread-workflow";

function hasOpenAiCredential(summary: CodexAuthSummary | null): boolean {
  if (!summary?.hasAuthFile) return false;
  const authMode = summary.authMode?.trim().toLowerCase() ?? "";
  if (authMode === "chatgpt" || authMode === "chatgptauthtokens") {
    return summary.hasTokens;
  }
  if (authMode === "apikey" || authMode === "api_key" || authMode === "api-key") {
    return summary.hasApiKey;
  }
  return summary.hasTokens || summary.hasApiKey;
}

function hostFromBaseUrl(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  try {
    return new URL(trimmed).host || fallback;
  } catch {
    return fallback;
  }
}

const BACKGROUND_AGENT_PANEL_WIDTH_PX = 520;
const BACKGROUND_AGENT_PANEL_MIN_WIDTH_PX = 320;
const BACKGROUND_AGENT_PANEL_EDGE_MARGIN_PX = 48;

function backgroundAgentPanelWidthPx(containerWidthPx: number): number {
  if (containerWidthPx <= 0) return BACKGROUND_AGENT_PANEL_WIDTH_PX;
  return Math.max(
    BACKGROUND_AGENT_PANEL_MIN_WIDTH_PX,
    Math.min(BACKGROUND_AGENT_PANEL_WIDTH_PX, containerWidthPx - BACKGROUND_AGENT_PANEL_EDGE_MARGIN_PX),
  );
}

interface McpFollowUpDialogRequest {
  prompt: string;
  request: McpAppHostCallRequest;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  source: ReturnType<typeof mcpAppFollowUpSource>;
}

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [followUpQueueingEnabled, setFollowUpQueueingEnabled] = useState(true);
  const [collaborationModes, setCollaborationModes] = useState<CollaborationModeMask[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [selectedWorkspaceRoots, setSelectedWorkspaceRoots] = useState<string[]>([]);
  const [sidebarSortKey, setSidebarSortKey] = useState<SidebarSortKey>("updated_at");
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => new Set());
  /*
   * Tauri auto-update state (mirror of Codex Desktop's update banner). The
   * `pendingUpdate` ref holds the Update plugin handle (the actual download
   * trigger); the visible state slice is only the version + progress + error
   * so React doesn't re-render on every plugin internal mutation.
   */
  const [updateBadge, setUpdateBadge] = useState<{
    version: string;
    progress: number | null;
    error: string | null;
  } | null>(null);
  const pendingUpdateRef = useRef<unknown>(null);
  const mcpFollowUpDialogPendingRef = useRef(false);
  const openSideConversationPanelRef = useRef<((thread: Thread) => void) | null>(null);
  /*
   * User-overridden model selection for new chats. Persisted to localStorage
   * under `hicodex.selectedModelKey`. When non-null, applied to ThreadStart /
   * ThreadFork params (codex-protocol v2 ThreadStartParams.modelProvider /
   * .model accept overrides — see thread-workflow.ts buildThreadContextParams).
   *
   * `null` falls through to the config.toml default (state.threadContextDefaults).
   * Existing in-flight threads keep their original model (protocol locks model
   * per-thread); to change model for an active conversation users must fork it.
   */
  /* Selected `${providerId}::${modelSlug}`; null = follow config.toml default. */
  const [selectedModelKey, setSelectedModelKeyState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem("hicodex.selectedModelKey");
    } catch {
      return null;
    }
  });
  const setSelectedModelKey = useCallback((key: string | null) => {
    setSelectedModelKeyState(key);
    try {
      if (key) window.localStorage.setItem("hicodex.selectedModelKey", key);
      else window.localStorage.removeItem("hicodex.selectedModelKey");
    } catch {
      // localStorage not available — selection still works in memory
    }
  }, []);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<HTMLElement | null>(null);
  /*
   * Auth status from codex-rs's `getAuthStatus` RPC. The actual `client` is
   * declared further down, so the refresh function + effect live there too.
   * Here we only declare the state slot. authMethod values:
   *   "chatgpt" → OAuth signed in (subscription)
   *   "apikey"  → API key configured (env var or [model_providers.openai].api_key)
   *   null      → not authenticated
   */
  const [oauthAuthMethod, setOauthAuthMethod] = useState<string | null>(null);
  const [codexAuthSummary, setCodexAuthSummary] = useState<CodexAuthSummary | null>(null);
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<SettingsPanelId | null>(null);
  const [settingsPanelState, setSettingsPanelState] = useState<CommandPanelState | null>(null);
  const [commandPanel, setCommandPanel] = useState<CommandPanelState | null>(null);
  const [mcpServerForm, setMcpServerForm] = useState<McpServerFormAction | null>(null);
  const [mcpToolForm, setMcpToolForm] = useState<McpToolFormAction | null>(null);
  const [mcpFollowUpDialog, setMcpFollowUpDialog] = useState<McpFollowUpDialogRequest | null>(null);
  const [mcpServerStatuses, setMcpServerStatuses] = useState<unknown>(null);
  const [mcpServerStatusNonce, setMcpServerStatusNonce] = useState(0);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  const [imageGenerationDraft, setImageGenerationDraft] = useState<ImageGenerationSettings>(() =>
    loadImageGenerationSettings(browserStorage())
  );
  const [artifactPreview, setArtifactPreviewState] = useState<RailEntry | null>(null);
  /*
   * Bumped each time the artifact preview is (re-)opened so `ArtifactPreviewPanel`
   * remounts via `key={...}` even when the user clicks the same artifact entry
   * twice. Without this, React reuses the panel instance and its read-file
   * useEffects keep their cached output (filed by the path-only dependency), so a
   * file the model just rewrote on disk still shows the original contents.
   */
  const [artifactPreviewNonce, setArtifactPreviewNonce] = useState(0);
  const setArtifactPreview = useCallback((entry: RailEntry | null) => {
    setArtifactPreviewState(entry);
    if (entry !== null) setArtifactPreviewNonce((value) => value + 1);
  }, []);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [backgroundTerminalCleanupPending, setBackgroundTerminalCleanupPending] = useState(false);
  const [skillsChangedNonce, setSkillsChangedNonce] = useState(0);
  const mcpStartupStatusPanelHandledRef = useRef(0);
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
        if (message.method === "mcpServer/startupStatus/updated") {
          setMcpServerStatusNonce((current) => current + 1);
        }
        // OAuth completion → re-query auth status so the picker's Sign-in
        // button + readyProviders flip immediately.
        if (message.method === "account/login/completed"
          || message.method === "account/updated") {
          setAuthRefreshNonce((current) => current + 1);
        }
      },
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
    });
    clientRef.current = rpc;
    return rpc;
  }, []);

  /* Auth refresh — bumped by login/logout notifications + manual picker opens. */
  const [authRefreshNonce, setAuthRefreshNonce] = useState(0);
  useEffect(() => {
    if (!state.connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await client.request<{ authMethod?: string | null; requiresOpenaiAuth?: boolean | null }>(
          "getAuthStatus",
          { includeToken: false, refreshToken: false },
          15_000,
        );
        if (cancelled) return;
        const method = result?.authMethod ?? null;
        setOauthAuthMethod(method);
        dispatch({
          type: "log",
          text: `getAuthStatus → authMethod=${method ?? "null"} requiresOpenaiAuth=${result?.requiresOpenaiAuth ?? "null"}`,
          level: "info",
        });
      } catch (err) {
        if (!cancelled) {
          setOauthAuthMethod(null);
          dispatch({
            type: "log",
            text: `getAuthStatus failed: ${err instanceof Error ? err.message : String(err)}`,
            level: "warn",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [client, state.connected, authRefreshNonce]);

  useEffect(() => {
    if (!state.connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const summary = await readCodexAuthSummary(state.hostStatus?.codexHome ?? null);
        if (!cancelled) {
          setCodexAuthSummary(summary);
        }
      } catch (err) {
        if (!cancelled) {
          setCodexAuthSummary(null);
          dispatch({
            type: "log",
            text: `read auth summary failed: ${err instanceof Error ? err.message : String(err)}`,
            level: "warn",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [state.connected, state.hostStatus?.codexHome, authRefreshNonce]);

  // Re-check when the picker opens (covers OAuth completing while picker is closed).
  useEffect(() => {
    if (modelPickerAnchor) setAuthRefreshNonce((current) => current + 1);
  }, [modelPickerAnchor]);

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
  const activeDiff = activeThreadRuntime.turnDiff;
  const conversation = useMemo(
    () => projectConversation(activeItems, {
      isThreadRunning: activeThreadRunning,
      mcpServerStatuses,
      progressPlan: activeProgressPlan,
      // Feed the live turn-diff stream so projectConversation can emit the
      // `inProgressDiff` render unit (mirror of Codex `sT` portal at
      // codex-local-conversation-thread.pretty.js :8003).
      turnDiff: activeDiff,
    }),
    [activeDiff, activeItems, activeProgressPlan, activeThreadRunning, mcpServerStatuses],
  );
  const branchDetails = useMemo(
    () => projectBranchDetails({
      thread: activeThread,
      diff: activeDiff ? { diff: activeDiff } : null,
    }),
    [activeDiff, activeThread],
  );
  const hasFilePreviewSelection = artifactPreview !== null || fileReference !== null;
  /*
   * Codex Desktop opens file/artifact previews into the AppShell RightPanel
   * (`app-shell.formatted.js:518` `vn`), not into the summary rail. Drag <
   * 320 px closes the panel — Codex `if (e3 < x(320)) v(s2, false)`. We
   * close the artifact / file selection here so the panel unmounts.
   */
  const closeFilePreviewPanel = useCallback(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [setArtifactPreview, setFileReference]);
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
    if (!state.connected) {
      setMcpServerStatuses(null);
      return;
    }
    let cancelled = false;
    void client.request<unknown>("mcpServerStatus/list", { limit: 50, detail: "toolsAndAuthOnly" }, 120_000)
      .then((result) => {
        if (!cancelled) setMcpServerStatuses(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setMcpServerStatuses(null);
          dispatch({ type: "log", text: `mcpServerStatus/list failed: ${formatError(error)}`, level: "warn" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, mcpServerStatusNonce, state.connected]);

  useEffect(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [state.activeThreadId]);

  /*
   * Tauri auto-update check. Runs once on mount (5s after the app settles so
   * we don't compete with the initial connect/listThreads burst), and then
   * every 6 hours for long-running sessions. Failures are silently swallowed
   * (placeholder endpoint, offline, DNS, etc.) — the badge simply doesn't
   * appear and the app continues to work normally.
   */
  useEffect(() => {
    let cancelled = false;
    const doCheck = async () => {
      const result = await checkForUpdates();
      if (cancelled) return;
      if (result.state === "available") {
        pendingUpdateRef.current = result.update;
        setUpdateBadge({
          version: result.update.version,
          progress: null,
          error: null,
        });
      }
    };
    const initialTimer = window.setTimeout(() => { void doCheck(); }, 5_000);
    const periodicTimer = window.setInterval(() => { void doCheck(); }, 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, []);

  const runUpdate = useCallback(async () => {
    const update = pendingUpdateRef.current as { downloadAndInstall?: unknown } | null;
    if (!update) return;
    setUpdateBadge((current) => (current ? { ...current, progress: 0, error: null } : current));
    try {
      await applyUpdate(update as Parameters<typeof applyUpdate>[0], (loaded, total) => {
        const fraction = total > 0 ? Math.min(loaded / total, 1) : 0;
        setUpdateBadge((current) => (current ? { ...current, progress: fraction } : current));
      });
      // 走到这里说明 relaunch() 已经触发；进程要重启，UI 状态不再相关。
    } catch (err) {
      setUpdateBadge((current) => (current ? {
        ...current,
        progress: null,
        error: err instanceof Error ? err.message : String(err),
      } : current));
    }
  }, []);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  /*
   * Effective ThreadContextDefaults for thread/start + thread/fork calls.
   * If the user picked a (provider, model) pair in the UI picker, override
   * the config.toml default's model + modelProvider. Otherwise pass through
   * unchanged.
   *
   * `selectedModelKey` here stores `${providerId}::${modelSlug}` —
   * see DEFAULT_PROVIDERS + encodeSelection in model-picker-menu.tsx.
   */
  const effectiveThreadContextDefaults = useMemo(() => {
    const picked = decodeSelection(selectedModelKey);
    if (!picked) return state.threadContextDefaults;
    return {
      ...(state.threadContextDefaults ?? {}),
      model: picked.model,
      modelProvider: picked.providerId,
    };
  }, [selectedModelKey, state.threadContextDefaults]);

  const readMcpResource = useCallback(async ({ server, threadId, uri }: McpResourceReadRequest) => {
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    return client.request<unknown>("mcpServer/resource/read", {
      threadId: threadId ?? state.activeThreadId ?? null,
      server,
      uri,
    }, 120_000);
  }, [client, ensureConnected, state.activeThreadId]);

  const loadMcpServerStatus = useCallback(async (server: string, detail: "full" | "toolsAndAuthOnly" = "full") => {
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    const result = await client.request<unknown>("mcpServerStatus/list", { limit: 50, detail }, 120_000);
    const status = mcpServerStatusFromListResult(result, server);
    if (!status) throw mcpAppBridgeError(`MCP server not found: ${server}`);
    return status;
  }, [client, ensureConnected]);

  const callMcpAppTool = useCallback(async (
    request: McpAppHostCallRequest,
    toolCall: { name: string; arguments: unknown; meta?: unknown },
  ) => {
    const threadId = request.threadId ?? state.activeThreadId;
    if (!threadId) throw mcpAppBridgeError("Select or start a thread before calling an MCP tool.");
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");
    const status = await loadMcpServerStatus(request.server, "toolsAndAuthOnly");
    if (!mcpAppToolCallAllowed(status, toolCall.name)) {
      throw mcpAppBridgeError(
        `MCP app widgets cannot call tools that accept file parameters: ${toolCall.name}`,
        MCP_APP_BRIDGE_INTERNAL_JSON_RPC_ERROR,
      );
    }
    return client.request<unknown>("mcpServer/tool/call", {
      threadId,
      server: request.server,
      tool: toolCall.name,
      arguments: toolCall.arguments,
      ...(Object.prototype.hasOwnProperty.call(toolCall, "meta") ? { _meta: toolCall.meta } : {}),
    }, 120_000);
  }, [client, ensureConnected, loadMcpServerStatus, state.activeThreadId]);

  const sendMcpAppFollowUpMessage = useCallback(async (
    request: McpAppHostCallRequest,
    prompt: string,
    option?: McpFollowUpDialogOption,
  ) => {
    const content = buildUserInputFromComposer(prompt);
    if (content.length === 0) throw mcpAppBridgeError("Invalid follow-up message.", MCP_APP_BRIDGE_INVALID_PARAMS);
    const target = option?.id ?? "current-thread";
    if (target === "local" || target === "worktree") {
      throw mcpAppBridgeError(
        `MCP app follow-up target is disabled: ${option?.label ?? target}.`,
        MCP_APP_BRIDGE_INVALID_PARAMS,
      );
    }
    if (!(await ensureConnected())) throw mcpAppBridgeError("Runtime is offline.");

    const sourceThreadId = request.threadId ?? state.activeThreadId;
    const sourceThread = sourceThreadId
      ? state.threads.find((candidate) => candidate.id === sourceThreadId) ?? null
      : null;
    const sourceWorkspace = sourceThread?.cwd || workspace.trim() || state.hostStatus?.defaultCwd || "";

    if (target === "new-thread") {
      const threadId = await createAndSelectThreadForTurn(
        client,
        sourceWorkspace,
        dispatch,
        effectiveThreadContextDefaults,
      );
      if (!threadId) throw mcpAppBridgeError("Unable to create a follow-up thread.");
      let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
      try {
        optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content);
        await sendPanelThreadMessage(client, threadId, content, sourceWorkspace, effectiveThreadContextDefaults, null);
        await refreshThreadMetadata(client, threadId, dispatch);
        dispatch({ type: "log", text: "Sent MCP app follow-up message in a new thread.", level: "info" });
        return {};
      } catch (error) {
        if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
        throw error;
      }
    }

    if (target === "new-side-chat") {
      if (!sourceThreadId) throw mcpAppBridgeError("Select or start a thread before opening an MCP app side chat.");
      const result = await startSideConversation(
        client,
        sourceThreadId,
        sourceWorkspace,
        effectiveThreadContextDefaults,
        prompt,
      );
      const sideThread = result.thread;
      openSideConversationPanelRef.current?.(sideThread);
      let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
      try {
        optimistic = dispatchOptimisticUserMessage(dispatch, sideThread.id, content, null);
        await sendPanelThreadMessage(
          client,
          sideThread.id,
          content,
          sideThread.cwd || sourceWorkspace,
          effectiveThreadContextDefaults,
          null,
        );
        await refreshThreadMetadata(client, sideThread.id, dispatch);
        dispatch({ type: "log", text: "Sent MCP app follow-up message in a new side chat.", level: "info" });
        return {};
      } catch (error) {
        if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
        throw error;
      }
    }

    const threadId = sourceThreadId;
    if (!threadId) throw mcpAppBridgeError("Select or start a thread before sending an MCP app follow-up.");
    const thread = state.threads.find((candidate) => candidate.id === threadId) ?? null;
    const runtime = state.threadsRuntime[threadId] ?? null;
    const targetActiveTurnId = runtime?.activeTurnId ?? null;
    const targetRunning = Boolean(targetActiveTurnId) || isThreadStatusInProgress(thread?.status);
    if (targetRunning && !targetActiveTurnId) {
      throw mcpAppBridgeError(
        "Waiting for the active turn before steering this thread.",
        MCP_APP_BRIDGE_INTERNAL_ERROR,
      );
    }

    let optimistic: ReturnType<typeof dispatchOptimisticUserMessage> | null = null;
    try {
      optimistic = dispatchOptimisticUserMessage(dispatch, threadId, content, targetActiveTurnId);
      await sendPanelThreadMessage(
        client,
        threadId,
        content,
        thread?.cwd || workspace.trim() || state.hostStatus?.defaultCwd || "",
        effectiveThreadContextDefaults,
        targetActiveTurnId,
      );
      if (!targetActiveTurnId) await refreshThreadMetadata(client, threadId, dispatch);
      dispatch({ type: "log", text: "Sent MCP app follow-up message.", level: "info" });
      return {};
    } catch (error) {
      if (optimistic) dropOptimisticUserMessage(dispatch, optimistic);
      throw error;
    }
  }, [
    client,
    dispatch,
    effectiveThreadContextDefaults,
    ensureConnected,
    state.activeThreadId,
    state.hostStatus?.defaultCwd,
    state.threads,
    state.threadsRuntime,
    workspace,
  ]);

  const requestMcpAppFollowUpMessage = useCallback((
    request: McpAppHostCallRequest,
    prompt: string,
  ) => {
    if (mcpFollowUpDialogPendingRef.current) {
      throw mcpAppBridgeError(
        "A follow-up message is already awaiting confirmation.",
        MCP_APP_BRIDGE_INTERNAL_ERROR,
      );
    }
    mcpFollowUpDialogPendingRef.current = true;
    return new Promise((resolve, reject) => {
      setMcpFollowUpDialog({ prompt, request, resolve, reject, source: mcpAppFollowUpSource(request) });
    });
  }, []);

  const closeMcpFollowUpDialog = useCallback(() => {
    const pending = mcpFollowUpDialog;
    setMcpFollowUpDialog(null);
    mcpFollowUpDialogPendingRef.current = false;
    pending?.reject(mcpAppBridgeUserCancelledError());
  }, [mcpFollowUpDialog]);

  const confirmMcpFollowUpDialog = useCallback(async (prompt: string, option: McpFollowUpDialogOption) => {
    const pending = mcpFollowUpDialog;
    if (!pending) return;
    setMcpFollowUpDialog(null);
    mcpFollowUpDialogPendingRef.current = false;
    try {
      const result = await sendMcpAppFollowUpMessage(pending.request, prompt, option);
      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
      dispatch({ type: "log", text: `MCP app follow-up failed: ${formatError(error)}`, level: "error" });
    }
  }, [dispatch, mcpFollowUpDialog, sendMcpAppFollowUpMessage]);

  const handleMcpAppHostCall = useCallback(async (request: McpAppHostCallRequest): Promise<unknown> => {
    if (request.method === "sendFollowUpMessage") {
      const followUp = mcpAppFollowUpMessageRequest(request.args[0]);
      if (!followUp) throw mcpAppBridgeError("Invalid follow-up message.", MCP_APP_BRIDGE_INVALID_PARAMS);
      return requestMcpAppFollowUpMessage(request, followUp.prompt);
    }
    if (request.method === "openExternal") {
      const href = mcpAppExternalHref(request.args[0]);
      if (!href) return {};
      await openExternalUrl(href);
      return {};
    }
    if (request.method === "callTool") {
      const toolCall = mcpAppToolCallRequestFromBridgeArgs(request.args);
      if (!toolCall) throw mcpAppBridgeError("Invalid MCP tool call params.", MCP_APP_BRIDGE_INVALID_PARAMS);
      return callMcpAppTool(request, toolCall);
    }
    if (request.method !== "callMcp") {
      throw mcpAppBridgeError(`Unsupported MCP app host method: ${request.method}`, MCP_APP_BRIDGE_METHOD_NOT_FOUND);
    }

    const proxyRequest = mcpAppMcpProxyRequest(request.args[0]);
    if (!proxyRequest) throw mcpAppBridgeError("Invalid MCP proxy request.", MCP_APP_BRIDGE_INVALID_PARAMS);
    switch (proxyRequest.method) {
      case "ping":
        return {};
      case "ui/download-file": {
        const download = mcpAppFileDownloadRequest(proxyRequest.params);
        if (!download) throw mcpAppBridgeError("Invalid MCP file download params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        downloadMcpAppFile(download);
        return {};
      }
      case "tools/call": {
        const toolCall = mcpAppToolCallRequest(proxyRequest.params);
        if (!toolCall) throw mcpAppBridgeError("Invalid MCP tool call params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        return callMcpAppTool(request, toolCall);
      }
      case "resources/read": {
        const params = recordObject(proxyRequest.params);
        const uri = typeof params.uri === "string" ? params.uri : "";
        if (!uri.trim()) throw mcpAppBridgeError("Invalid MCP resource read params.", MCP_APP_BRIDGE_INVALID_PARAMS);
        return readMcpResource({ server: request.server, threadId: request.threadId, uri });
      }
      case "tools/list": {
        const status = await loadMcpServerStatus(request.server, "toolsAndAuthOnly");
        return mcpAppToolsListResponse(status);
      }
      case "resources/list": {
        const status = await loadMcpServerStatus(request.server, "full");
        return mcpAppResourcesListResponse(status, request.server);
      }
      case "resources/templates/list": {
        const status = await loadMcpServerStatus(request.server, "full");
        return mcpAppResourceTemplatesListResponse(status, request.server);
      }
      case "prompts/list":
        return { prompts: [] };
      default:
        throw mcpAppBridgeError(
          `Unsupported MCP proxy method: ${proxyRequest.method}`,
          MCP_APP_BRIDGE_METHOD_NOT_FOUND,
        );
    }
  }, [callMcpAppTool, loadMcpServerStatus, readMcpResource, requestMcpAppFollowUpMessage]);

  const collaborationModesForComposerMode = useCallback(async (mode: ComposerMode): Promise<CollaborationModeMask[]> => {
    if (mode !== "plan" || hasCollaborationModePreset(collaborationModes, "plan")) return collaborationModes;
    return loadCollaborationModes();
  }, [collaborationModes, loadCollaborationModes]);

  const modelPickerProviders = useMemo(() => {
    const localFallback = DEFAULT_PROVIDERS.find((provider) => provider.id === "hicodex_local")
      ?? DEFAULT_PROVIDERS[0];
    const openaiProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === DEFAULT_SUBSCRIPTION_PROVIDER_ID);
    const activeProviderId = state.threadContextDefaults?.modelProvider?.trim() || localFallback.id;
    const draftProviderId = modelDraft.id.trim();
    const useDraftForLocalProvider = draftProviderId.length > 0 && draftProviderId !== DEFAULT_SUBSCRIPTION_PROVIDER_ID;
    const localProviderId = useDraftForLocalProvider
      ? draftProviderId
      : (activeProviderId !== DEFAULT_SUBSCRIPTION_PROVIDER_ID ? activeProviderId : localFallback.id);
    const localModels = normalizeModelSlugs([
      ...modelSlugsForConfig(modelDraft),
    ]);
    const openaiModels = openaiProvider
      ? normalizeModelSlugs([
          ...openaiProvider.models,
          activeProviderId === DEFAULT_SUBSCRIPTION_PROVIDER_ID ? state.threadContextDefaults?.model : null,
        ])
      : [];
    return [
      {
        ...localFallback,
        id: localProviderId,
        label: useDraftForLocalProvider && modelDraft.name.trim()
          ? modelDraft.name.trim()
          : localFallback.label,
        host: useDraftForLocalProvider
          ? hostFromBaseUrl(modelDraft.baseUrl, localFallback.host)
          : localFallback.host,
        baseUrl: useDraftForLocalProvider && modelDraft.baseUrl.trim()
          ? modelDraft.baseUrl.trim()
          : localFallback.baseUrl,
        models: localModels.length > 0 ? localModels : localFallback.models,
      },
      ...(openaiProvider ? [{ ...openaiProvider, models: openaiModels.length > 0 ? openaiModels : openaiProvider.models }] : []),
    ];
  }, [
    modelDraft.baseUrl,
    modelDraft.id,
    modelDraft.model,
    modelDraft.models,
    modelDraft.name,
    state.threadContextDefaults?.model,
    state.threadContextDefaults?.modelProvider,
  ]);

  /*
   * Set of providers whose auth is verified — drives "not signed in" / "no key"
   * picker warnings and the inline Sign-in button.
   *
   * Logic:
   *   - The active config.toml provider is always considered ready (the user
   *     is presumably already using it, so its credential layer works).
   *   - For the built-in `openai` provider: ready when `getAuthStatus` returns
   *     any non-null auth method, or when the isolated HiCodex auth.json has a
   *     ChatGPT/API-key credential. `getAuthStatus` is scoped to the active
   *     provider, so a local API provider with `requires_openai_auth = false`
   *     would otherwise make the subscription provider look signed out.
   */
  const readyProviders = useMemo(() => {
    const ready = new Set<string>();
    const active = state.threadContextDefaults?.modelProvider ?? "";
    if (active) ready.add(active);
    if ((oauthAuthMethod && oauthAuthMethod.length > 0) || hasOpenAiCredential(codexAuthSummary)) {
      ready.add(DEFAULT_SUBSCRIPTION_PROVIDER_ID);
    }
    return ready;
  }, [state.threadContextDefaults?.modelProvider, oauthAuthMethod, codexAuthSummary]);

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
    selectThread,
    threadActionDialog,
  } = useThreadActions({
    activeThread,
    client,
    dispatch,
    ensureConnected,
    setComposerAttachments,
    setInput,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    workspace,
  });
  const workspaceRootOptions = useMemo(() => (
    workspaceRootOptionsWithCurrent(
      projectSidebarWorkspaceRootOptions(state.threads),
      [activeThread?.cwd, workspace, ...selectedWorkspaceRoots],
    )
  ), [activeThread?.cwd, selectedWorkspaceRoots, state.threads, workspace]);

  const selectWorkspaceRoot = useCallback((root: string) => {
    const normalized = normalizeWorkspaceRoot(root);
    if (!normalized) return;
    setSelectedWorkspaceRoots((current) => (
      current.includes(normalized) ? current : [normalized, ...current]
    ));
    setWorkspace(normalized);
    void createThread();
  }, [createThread]);

  const useExistingWorkspaceFolder = useCallback(async () => {
    try {
      const root = await pickWorkspaceFolder();
      if (root) selectWorkspaceRoot(root);
    } catch (error) {
      dispatch({ type: "log", text: `folder picker failed: ${formatError(error)}`, level: "warn" });
    }
  }, [dispatch, selectWorkspaceRoot]);

  const {
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
    interruptBackgroundAgentPanelTurn,
    openBackgroundAgentThread,
    openSideChatFromThread,
    openSideConversationPanel,
    sendBackgroundAgentPanelMessage,
    sideChatRailEntries,
    setBackgroundAgentMessageDraft,
  } = useBackgroundAgentPanel({
    client,
    dispatch,
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    activeThreadId: state.activeThreadId,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });
  openSideConversationPanelRef.current = openSideConversationPanel;
  const composerPlaceholder = composerPlaceholderText({
    hasConversation: conversation.units.length > 0,
    hasBackgroundAgentsPanel: backgroundAgentPanel != null,
  });
  const rightRailSections = useMemo(
    () => projectRightRailSections({
      progress: conversation.progress,
      branchDetails,
      artifacts: conversation.artifacts,
      sideChats: sideChatRailEntries,
      backgroundAgents: conversation.backgroundAgents,
      backgroundTerminals: conversation.backgroundTerminals,
      sources: conversation.sources,
    }),
    [branchDetails, conversation, sideChatRailEntries],
  );
  const filePreviewPanelLayout = useFilePreviewPanelLayout({
    containerWidthPx: mainWidth,
    onShouldClose: closeFilePreviewPanel,
  });
  const filePreviewPanelEffectiveWidthPx = hasFilePreviewSelection && !filePreviewPanelLayout.fullWidth
    ? filePreviewPanelLayout.widthPx
    : 0;
  const backgroundAgentPanelEffectiveWidthPx = backgroundAgentPanel
    ? backgroundAgentPanelWidthPx(mainWidth)
    : 0;
  const sidePanelRailOffsetPx = hasFilePreviewSelection
    ? (filePreviewPanelLayout.fullWidth ? mainWidth : filePreviewPanelEffectiveWidthPx)
    : backgroundAgentPanelEffectiveWidthPx;
  const rightRailLayoutWidthPx = Math.max(0, mainWidth - sidePanelRailOffsetPx);
  const showRightRail = rightRailSections.length > 0 && rightRailShouldRender(rightRailLayoutWidthPx);
  const rightRailMode = rightRailDisplayMode(rightRailLayoutWidthPx);
  const mainLayoutStyle = {
    "--hc-right-panel-offset": `${Math.round(sidePanelRailOffsetPx)}px`,
  } as CSSProperties;
  // Reserve the conversation's right edge for side panels plus the summary rail.
  // Full-width file preview covers the thread instead of pushing it.
  const threadInlineEndInset = (hasFilePreviewSelection && filePreviewPanelLayout.fullWidth)
    ? 0
    : Math.round(
      (hasFilePreviewSelection ? filePreviewPanelEffectiveWidthPx : backgroundAgentPanelEffectiveWidthPx)
      + rightRailReservedInlineEndPx(rightRailLayoutWidthPx, showRightRail),
    );

  const selectThreadById = useCallback((threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      dispatch({ type: "log", text: `thread not found: ${threadId}`, level: "warn" });
      return;
    }
    void selectThread(thread);
  }, [selectThread, state.threads]);

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

  const openChatSearchPanel = useCallback(() => {
    const visibleThreads = projectSidebarThreads(state.threads);
    openCommandPanel("generic", {
      status: "ready",
      title: "Search chats",
      message: "",
      entries: visibleThreads.map((thread): CommandPanelEntry => ({
        id: `thread:${thread.id}`,
        title: threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null),
        kind: "thread",
        meta: threadProjectLabel(thread),
        status: sidebarThreadRelativeTime(thread),
        action: { type: "selectThread", threadId: thread.id },
      })),
    });
  }, [openCommandPanel, state.threads, state.threadsRuntime]);

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

  useEffect(() => {
    if (mcpServerStatusNonce === 0 || activeSettingsPanel !== "mcp") return;
    if (mcpStartupStatusPanelHandledRef.current === mcpServerStatusNonce) return;
    mcpStartupStatusPanelHandledRef.current = mcpServerStatusNonce;
    let disposed = false;
    setSettingsPanelState((current) => current?.panel === "mcp"
      ? { ...current, status: "loading", message: "MCP startup status changed. Refreshing..." }
      : current);

    async function refreshOpenMcpPanel() {
      if (!(await ensureConnected())) {
        if (!disposed) {
          setSettingsPanelState((current) => current?.panel === "mcp"
            ? { ...current, status: "error", error: "Runtime is offline." }
            : current);
        }
        return;
      }
      try {
        const entries = await loadMcpManagementEntries({
          client,
          forceReload: false,
          startupStatuses: state.mcpServerStartupStatuses,
        });
        if (disposed) return;
        setSettingsPanelState((current) => current?.panel === "mcp"
          ? {
              ...current,
              status: "ready",
              message: "MCP startup status updated.",
              entries,
            }
          : current);
      } catch (error) {
        if (!disposed) {
          setSettingsPanelState((current) => current?.panel === "mcp"
            ? {
                ...current,
                status: "error",
                error: formatError(error),
              }
            : current);
        }
      }
    }

    void refreshOpenMcpPanel();
    return () => {
      disposed = true;
    };
  }, [
    activeSettingsPanel,
    client,
    ensureConnected,
    mcpServerStatusNonce,
    state.mcpServerStartupStatuses,
  ]);

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

  const copyThreadWorkingDirectory = useCallback((thread: Thread) => {
    void copyTextToClipboard("Working directory", thread.cwd || workspace || "");
  }, [copyTextToClipboard, workspace]);

  const copyThreadSessionId = useCallback((thread: Thread) => {
    void copyTextToClipboard("Session ID", thread.id);
  }, [copyTextToClipboard]);

  const copyThreadDeeplink = useCallback((thread: Thread) => {
    void copyTextToClipboard("Deeplink", `codex://threads/${thread.id}`);
  }, [copyTextToClipboard]);

  const openThreadFolder = useCallback(async (thread: Thread) => {
    const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
    if (!cwd) {
      dispatch({ type: "log", text: "Working directory is unavailable", level: "warn" });
      return;
    }
    try {
      await openFileReference(cwd);
    } catch (error) {
      dispatch({ type: "log", text: `open folder failed: ${formatError(error)}`, level: "error" });
    }
  }, []);

  const toggleThreadPinned = useCallback((thread: Thread, pinned: boolean) => {
    setPinnedThreadIds((current) => {
      const next = new Set(current);
      if (pinned) {
        next.add(thread.id);
      } else {
        next.delete(thread.id);
      }
      return next;
    });
  }, []);

  const markThreadUnread = useCallback((thread: Thread) => {
    dispatch({
      type: "setThreads",
      threads: state.threads.map((item) =>
        item.id === thread.id
          ? ({ ...(item as Thread & Record<string, unknown>), hasUnreadTurn: true, has_unread_turn: true } as Thread)
          : item,
      ),
    });
  }, [state.threads]);

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
    threadContextDefaults: effectiveThreadContextDefaults,
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
      threadContextDefaults: effectiveThreadContextDefaults,
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
    effectiveThreadContextDefaults,
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
      loadAllApps(client, { threadId: state.activeThreadId }),
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
      ...(pluginResult.status === "fulfilled"
        ? mentionOptionsFromPluginsResponse(
            pluginResult.value,
            query,
            appResult.status === "fulfilled" ? appResult.value : undefined,
          )
        : []),
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
    writeMcpServerConfigFromPanel,
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
    setMcpServerForm,
    setMcpToolForm,
    selectThreadById,
    workspace,
  });

  const interruptActiveTurn = useCallback(async () => {
    if (!state.activeThreadId || !activeTurnId) return;
    try {
      await interruptThreadTurn(client, state.activeThreadId, activeTurnId);
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
        threads={projectSidebarThreads(state.threads, { sortKey: sidebarSortKey })}
        activeThreadId={state.activeThreadId}
        connected={state.connected}
        connecting={state.connecting}
        updateAvailable={updateBadge}
        onApplyUpdate={runUpdate}
        onConnect={() => void connect()}
        onCreateThread={createThread}
        onOpenSearch={openChatSearchPanel}
        onOpenPlugins={() => void loadSettingsPanel("plugins")}
        onUseExistingFolder={useExistingWorkspaceFolder}
        onSelectThread={selectThread}
        onForkThread={forkSelectedThread}
        onRenameThread={openRenameThreadDialog}
        onArchiveThread={archiveSelectedThread}
        pinnedThreadIds={pinnedThreadIds}
        onToggleThreadPinned={toggleThreadPinned}
        onMarkThreadUnread={markThreadUnread}
        onOpenThreadFolder={openThreadFolder}
        onCopyWorkingDirectory={copyThreadWorkingDirectory}
        onCopySessionId={copyThreadSessionId}
        onCopyDeeplink={copyThreadDeeplink}
        onOpenSettings={() => void loadSettingsPanel("general")}
        sortKey={sidebarSortKey}
        onSortKeyChange={setSidebarSortKey}
        getThreadTitle={(thread) => threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null)}
      />

      <main
        className="hc-main"
        data-right-rail-mode={showRightRail ? rightRailMode : undefined}
        ref={mainRef}
        style={mainLayoutStyle}
      >
        <ConversationChrome
          title={activeThread ? threadTitle(activeThread, state.threadsRuntime[activeThread.id]?.items ?? null) : "Codex conversation"}
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
                model={effectiveThreadContextDefaults?.model ?? state.threadContextDefaults?.model}
                workspaceRoots={workspaceRootOptions}
                onWorkspaceRootSelected={selectWorkspaceRoot}
                onUseExistingFolder={useExistingWorkspaceFolder}
                reasoningEffort={state.threadContextDefaults?.reasoningEffort}
                onOpenModelPicker={setModelPickerAnchor}
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
              onOpenDiff={openActiveDiffPanel}
              onForkTurn={forkActiveThreadFromTurn}
              onOpenFileReference={previewConversationFileReference}
              onOpenThreadId={openBackgroundAgentThread}
              onMcpAppHostCall={handleMcpAppHostCall}
              onReadMcpResource={readMcpResource}
            />
          </section>
        </ThreadScrollLayout>

        {backgroundAgentPanel && (
          <BackgroundAgentPanel
            canInterrupt={backgroundAgentCanInterrupt}
            error={backgroundAgentPanel.error}
            interrupting={backgroundAgentInterrupting}
            kind={backgroundAgentPanel.kind}
            loading={backgroundAgentPanel.loading}
            status={backgroundAgentStatus}
            messageDraft={backgroundAgentMessageDraft}
            messageError={backgroundAgentMessageError}
            messageSending={backgroundAgentMessageSending}
            subtitle={backgroundAgentSubtitle}
            threadId={backgroundAgentPanel.threadId}
            title={backgroundAgentTitle}
            units={backgroundAgentConversation.units}
            onClose={closeBackgroundAgentPanel}
            onInterrupt={interruptBackgroundAgentPanelTurn}
            onMessageDraftChange={setBackgroundAgentMessageDraft}
            onMcpAppHostCall={handleMcpAppHostCall}
            onOpenFileReference={previewConversationFileReference}
            onOpenThreadId={openBackgroundAgentThread}
            onReadMcpResource={readMcpResource}
            onSendMessage={sendBackgroundAgentPanelMessage}
          />
        )}

        {showRightRail && (
          <RightRail
            sections={rightRailSections}
            displayMode={rightRailMode}
            onOpenArtifactPreview={previewRailArtifact}
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

        {/*
          * Codex Desktop opens file previews into its AppShell RightPanel
          * (`vn` at `app-shell.formatted.js:518`), not into the summary rail.
          * `<FilePreviewPanel>` is HiCodex's analogue: resizable (default
          * 600 px / min 320 px), full-width toggle, double-click reset.
          * Mounts only when there is an artifact / file selection.
          */}
        <FilePreviewPanel
          artifactPreview={artifactPreview}
          artifactPreviewNonce={artifactPreviewNonce}
          fileReference={fileReference}
          workspaceRoot={previewPathContext.workspaceRoot}
          cwd={previewPathContext.cwd}
          resize={{
            widthPx: filePreviewPanelLayout.widthPx,
            isResizing: filePreviewPanelLayout.isResizing,
            fullWidth: filePreviewPanelLayout.fullWidth,
            onResizeStart: filePreviewPanelLayout.startResize,
            onResetWidth: filePreviewPanelLayout.resetWidth,
            onToggleFullWidth: filePreviewPanelLayout.toggleFullWidth,
          }}
          onCloseArtifactPreview={() => setArtifactPreview(null)}
          onCloseFileReference={() => setFileReference(null)}
          onOpenArtifactFileExternal={openRailArtifactFileExternal}
          onOpenFileReferenceExternal={openFileReferenceExternal}
          onOpenUrl={openRailUrl}
        />
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

      {mcpServerForm && (
        <McpServerConfigForm
          action={mcpServerForm}
          onClose={() => setMcpServerForm(null)}
          onSubmit={(name, config) => {
            const formAction = mcpServerForm;
            setMcpServerForm(null);
            void writeMcpServerConfigFromPanel({
              type: "writeMcpServerConfig",
              title: formAction.mode === "edit" ? `Save ${name}` : "Add MCP server",
              name,
              config,
            }, openSettingsPanelContent);
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
      {mcpFollowUpDialog && (
        <McpFollowUpDialog
          request={{ prompt: mcpFollowUpDialog.prompt, source: mcpFollowUpDialog.source }}
          onClose={closeMcpFollowUpDialog}
          onSend={confirmMcpFollowUpDialog}
        />
      )}
      {modelPickerAnchor && (
        <ModelPickerMenu
          anchor={modelPickerAnchor}
          providers={modelPickerProviders}
          selectedKey={selectedModelKey}
          defaultKey={
            state.threadContextDefaults?.modelProvider && state.threadContextDefaults?.model
              ? encodeSelection(state.threadContextDefaults.modelProvider, state.threadContextDefaults.model)
              : null
          }
          readyProviders={readyProviders}
          onSelect={setSelectedModelKey}
          onOpenSettings={() => loadSettingsPanel("models")}
          onSignIn={() => { void runSlashRequest("loginChatgpt"); }}
          onClose={() => setModelPickerAnchor(null)}
        />
      )}
    </div>
  );
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeWorkspaceRoot(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/[\\/]+$/, "") || trimmed;
}

function workspaceRootOptionsWithCurrent(
  options: SidebarWorkspaceRootOption[],
  roots: Array<string | null | undefined>,
): SidebarWorkspaceRootOption[] {
  const merged = [...options];
  const seen = new Set(merged.map((option) => normalizeWorkspaceRoot(option.root)));
  for (const rootValue of roots) {
    const root = normalizeWorkspaceRoot(rootValue ?? "");
    if (!root || seen.has(root) || root === "~") continue;
    seen.add(root);
    merged.unshift({ root, label: workspaceRootLabel(root) });
  }
  return merged;
}

function workspaceRootLabel(root: string): string {
  return root.split(/[\\/]+/).filter(Boolean).pop() || root;
}
