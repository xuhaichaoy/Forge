import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from "react";
import type {
  CollaborationModeMask,
  JsonRpcNotification,
  ModelConfig,
  Thread,
} from "@forge/codex-protocol";
import { AppNavigationRail } from "./components/app-navigation-rail";
import { KbArchiveView } from "./components/kb-archive-view";
import { KbIngestView } from "./components/kb-ingest-view";
import { KbLibraryView } from "./components/kb-library-view";
import { KbTodoView } from "./components/kb-todo-view";
// codex: thread-app-shell-chrome-*.js — right-side
// "Side Panel + New Tab" landing page (4 cards) shown when the panel is open
// but no tab is active. Currently we wire only the Files card (Forge's
// equivalent of Codex's tab-open helper).
// codex: app-shell-*.js — outer container that hosts the tab
// strip and either the active tab's content or the empty-state landing page.
// codex: keyboard-shortcuts-settings-*.js — standalone dialog rendering
// all `COMMAND_DESCRIPTORS` with their platform-formatted accelerator.
import { ForgeIntlProvider } from "./components/i18n-provider";
import { ServicesProvider, useServices } from "./components/services-context";
import { TeamServiceAuthGate } from "./components/team-service-auth-gate";
// codex inline-mentions-*.js / user-message-attachments-*.js context-menu wrapper —
// reveal + copy-contents actions for file-reference anchors + attachment pills,
// provided once above the conversation.
import { DelinkFileCitationsContext, FileCitationMenuContext } from "./components/file-citation-menu";
import {
  LiveTurnFixedContent,
  shouldRenderLiveTurnFixedContent,
} from "./components/live-turn-diff-portal";
import { RemoteTaskView } from "./components/remote-task-view";
import { CodexJsonRpcClient, type RpcDebugEvent } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import {
  clearTeamServiceAuthSession,
  readTeamServiceAuthSession,
} from "./lib/team-service-auth";
import {
  isTauriRuntime,
  readCodexAuthSummary,
  type CodexAuthSummary,
} from "./lib/tauri-host";
import { useAppUpdater } from "./hooks/use-app-updater";
import { useTurnPatchAction } from "./hooks/use-turn-patch-action";
import { useThreadPins } from "./hooks/use-thread-pins";
import { useWorktreeGitAndPrStatus } from "./hooks/use-worktree-status";
import { useThreadFind } from "./hooks/use-thread-find";
import { useForgeImageToolResponder } from "./hooks/use-forge-image-tool-responder";
import { usePermissionAutoDeny } from "./hooks/use-permission-auto-deny";
import { useModelPreferenceState } from "./hooks/use-model-preference-state";
import { useAppShellState } from "./hooks/use-app-shell-state";
import { useElementInlineSize } from "./hooks/use-element-inline-size";
import { useSidebarPreferences } from "./hooks/use-sidebar-preferences";
import { useSidebarResizeController } from "./hooks/use-sidebar-resize-controller";
import { useUiPreferences } from "./hooks/use-ui-preferences";
import {
  type McpServerFormAction,
  type McpToolFormAction,
} from "./hooks/use-command-panel-actions";
import { useForgeAppApprovalsSettings } from "./hooks/use-forge-app-approvals-settings";
import { useForgeAppConnection } from "./hooks/use-forge-app-connection";
import { useForgeAppModelContext } from "./hooks/use-forge-app-model-context";
import { useForgeAppWorkspaceThreads } from "./hooks/use-forge-app-workspace-threads";
import { useForgeAppRailPanels } from "./hooks/use-forge-app-rail-panels";
import { useForgeAppSidePanelHost } from "./hooks/use-forge-app-side-panel-host";
import { useFollowUpQueueMode } from "./hooks/use-follow-up-queue-mode";
import { useForgeAppShellCommands } from "./hooks/use-forge-app-shell-commands";
import { useForgeAppThreadCommands } from "./hooks/use-forge-app-thread-commands";
import { useForgeAppPreviewWiring } from "./hooks/use-forge-app-preview-wiring";
import { useForgeAppSlashCommands } from "./hooks/use-forge-app-slash-commands";
import { useForgeAppSubmission } from "./hooks/use-forge-app-submission";
// codex: app-shell-*.js — back/forward boundary helpers backing the
// ConversationChrome arrow buttons. Reducer keeps the stack in
// state.threadHistoryStack / state.threadHistoryIndex (see thread-history.ts).
import {
  EMPTY_MODEL,
} from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
  selectActiveThreadRuntime,
  selectItemsByThread,
} from "./state/codex-reducer";
import {
  accountRefreshScopeForNotification,
  authModeFromAccountUpdatedNotification,
  isSuccessfulAccountLoginCompletedNotification,
  beginAccountStateRefresh,
  hasOpenAiCredentialSummary,
  initialAccountState,
  logoutAndRefreshAccountState,
  projectAccountViewModel,
  refreshAccountState,
  type AccountState,
} from "./state/account-state";
import {
  planImplementationPendingRequest,
} from "./state/approval-requests";
// codex: local-conversation-thread-*.js — `projectActiveThreadAutomation`
// selects the single heartbeat automation that targets the active thread so the
// right-rail `automation` section can render its Clock + name + rrule body.
import {
  projectActiveThreadAutomation,
  projectAutomationsSurface,
} from "./state/automations-viewer";
import {
  activeBackgroundSubagentThreadIds,
  mergeBackgroundSubagentStopThreadIds,
} from "./state/background-subagents-stop";
import { resolveForgeBuildInfo } from "./state/build-info";
import { projectBranchDetails } from "./state/branch-details";
import {
  type FileReferenceSelection,
} from "./state/file-references";
import {
  type ComposerAttachment,
  type SettingsPanelId,
} from "./state/composer-workflow";
import {
  type CommandPanelState,
} from "./state/command-panel";
// codex: electron-menu-shortcuts-*.js — hotkey + command registry wiring.
import {
  WorkspaceFuzzyFileSearchController,
} from "./state/fuzzy-file-search-session";
import {
  appRegistryEntriesFromResponse,
  isThreadStatusInProgress,
  itemType,
  projectConversation,
  type AccumulatedThreadItem,
  type AppRegistryEntry,
  type RailEntry,
} from "./state/render-groups";
import type { TurnPlanSnapshot } from "./state/codex-ui-types";
import {
  loadAllApps,
} from "./state/app-list";
import {
  deriveActivePendingRequests,
  deriveBackgroundPendingRequests,
  deriveComposerPendingRequests,
  heartbeatPendingRequestType,
  pendingRequestOwnerThreadId,
} from "./state/pending-request-scope";
import {
  watchIdFromFsChangedNotification,
} from "./state/open-file-watches";
import {
  loadImageGenerationSettings,
  shouldRegisterForgeImageDynamicTool,
  type ImageGenerationSettings,
} from "./state/image-generation-tool";
import {
  browserStorage,
} from "./state/app-shell-helpers";
import {
  loadComposerWorkMode,
  projectWorktreeModeOptions,
  type ComposerWorkMode,
  type PendingWorktree,
} from "./state/worktrees";
import {
  loadOnboardingSnapshot,
} from "./state/onboarding";
import { appendRpcDebugEvent } from "./state/rpc-debug";
import {
  isProjectlessWorkspace,
} from "./state/thread-workflow";
import { renderForgeAppComposerRegion } from "./forge-app-render-composer";
import { renderForgeAppMain } from "./forge-app-render-main";
import {
  renderForgeAppAppOverlays,
  renderForgeAppMcpDialogs,
  renderForgeAppPanelOverlays,
  renderForgeAppSidebar,
  renderForgeAppSidebarResizeHandle,
  renderForgeAppThreadDialogs,
} from "./forge-app-render-shell";


interface ForgeClientCallbacks {
  onNotification: (message: JsonRpcNotification) => void;
  onDebugEvent: (event: RpcDebugEvent) => void;
}

interface ForgeAppBodyProps {
  state: CodexUiState;
  clientCallbacksRef: MutableRefObject<ForgeClientCallbacks>;
  fileSearchControllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
}

function activeTurnPlanFromTodoListItems(
  items: AccumulatedThreadItem[],
  threadId: string | null,
  activeTurnId: string | null,
): TurnPlanSnapshot | null {
  if (!threadId || !activeTurnId) return null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as AccumulatedThreadItem | undefined;
    if (!item || itemType(item) !== "todo-list") continue;
    const record = item as Record<string, unknown>;
    if (record._turnId !== activeTurnId || !Array.isArray(record.plan)) continue;
    return {
      threadId,
      turnId: activeTurnId,
      explanation: typeof record.explanation === "string" ? record.explanation : null,
      plan: record.plan,
      updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
    };
  }
  return null;
}

/*
 * ForgeAppBody holds the entire workbench: every feature hook, derivation, and
 * the full JSX tree. It renders inside the shell's <ServicesProvider>, so it (and
 * its subtree) reads the JSON-RPC client + reducer dispatch via useServices()
 * instead of owning them. `state` and the two client-owned refs come from the
 * shell as props; connect / ensureConnected / auto-reconnect remain defined here
 * (unmoved) so no effect changes position.
 */
function ForgeAppBody({ state, clientCallbacksRef, fileSearchControllerRef }: ForgeAppBodyProps) {
  const { client, dispatch } = useServices();
  const buildInfo = useMemo(() => resolveForgeBuildInfo(
    (import.meta as unknown as { env?: Record<string, unknown> }).env,
  ), []);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [collaborationModes, setCollaborationModes] = useState<CollaborationModeMask[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [composerWorkMode, setComposerWorkModeState] = useState<ComposerWorkMode>(() =>
    loadComposerWorkMode(browserStorage())
  );
  const [pendingWorktree, setPendingWorktree] = useState<PendingWorktree | null>(null);
  const [workspaceDeveloperInstructions, setWorkspaceDeveloperInstructions] = useState<{
    workspace: string;
    value: string | null;
  } | null>(null);
  const [selectedWorkspaceRoots, setSelectedWorkspaceRoots] = useState<string[]>([]);
  const {
    uiLocale,
    uiThemeSnapshot,
    resolvedUiTheme,
    uiAppearance,
    keymapOverrides,
    notificationPreferences,
    formatUiMessage,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    setNotificationPreferences,
  } = useUiPreferences();
  const [teamServiceAuthSession, setTeamServiceAuthSession] = useState(() => readTeamServiceAuthSession());
  const [onboardingSnapshot, setOnboardingSnapshot] = useState(() => (
    loadOnboardingSnapshot(browserStorage())
  ));
  const signOutTeamServiceAccount = useCallback(() => {
    clearTeamServiceAuthSession();
    setTeamServiceAuthSession(null);
    if (typeof window !== "undefined") window.location.reload();
  }, []);
  const {
    sidebarPreferences,
    sidebarCollapsedGroupKeys,
    setSidebarWidthPx,
    setSidebarSortKey,
    setSidebarOrganizeMode,
    setSidebarCollapsedGroupKeys,
  } = useSidebarPreferences();
  const {
    activeAppTab,
    activeRemoteTaskId,
    sidebarOpen,
    rightRailPinned,
    rightRailPopoverOpen,
    composerStatusPanelOpen,
    setActiveRemoteTaskId,
    setRightRailPopoverOpen,
    setComposerStatusPanelOpen,
    changeActiveAppTab,
    openWorkbenchTab,
    toggleSidebar,
    setRightRailPinned,
  } = useAppShellState();
  /*
   * Codex Desktop Summary Rail visibility (in
   * `local-conversation-thread-*.js`) is derived state, not
   * a user-toggleable atom:
   *   shouldShow = isPinned && displayMode !== "overlay" && !isRightPanelOpen
   * The previous Forge implementation kept a separate `rightRailOpen` flag
   * (defaulting to false and force-opened by file-preview handlers) which
   * mis-modeled Codex's RightPanel atom and inverted the
   * Summary Rail semantics — Progress/Git/Outputs/Sources disappeared by
   * default until the user clicked into a preview. The derived formula
   * lives in `showRightRail` below; the storage-backed `rightRailOpen`
   * state has been removed.
   */
  const { pinnedThreadIds, setThreadPinnedById, toggleThreadPinned } = useThreadPins();
  /*
   * Tauri auto-update state (mirror of Codex Desktop's update banner). The
   * `pendingUpdate` ref holds the Update plugin handle (the actual download
   * trigger); the visible state slice is only the version + progress + error
   * so React doesn't re-render on every plugin internal mutation.
   */
  const { updateBadge, runUpdate } = useAppUpdater();
  const openSideConversationPanelRef = useRef<((thread: Thread) => void) | null>(null);
  const {
    selectedModelKey,
    setSelectedModelKey,
    threadModelSelections,
    setThreadModelSelection,
    reasoningEffortOverride,
    setReasoningEffortOverride,
  } = useModelPreferenceState();
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
  const [mcpServerStatuses, setMcpServerStatuses] = useState<unknown>(null);
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
  /*
   * True only when the personal provider has a saved config.toml entry. The
   * draft above starts as a factory placeholder — that placeholder must never
   * win default/fallback resolution (a fresh install would silently send to
   * a dead 127.0.0.1 endpoint).
   */
  const [personalProviderConfigured, setPersonalProviderConfigured] = useState(false);
  const [imageGenerationSettings, setImageGenerationSettings] = useState<ImageGenerationSettings>(() =>
    loadImageGenerationSettings(browserStorage())
  );
  const [imageGenerationDraft, setImageGenerationDraft] = useState<ImageGenerationSettings>(imageGenerationSettings);
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
    if (entry === null) {
      setArtifactPreviewState(null);
      return;
    }
    setArtifactPreviewState(null);
    setArtifactPreviewNonce((value) => value + 1);
    openArtifactPreviewTabRef.current?.(entry);
  }, []);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [backgroundTerminalCleanupPending, setBackgroundTerminalCleanupPending] = useState(false);
  const [backgroundSubagentsStopAllPending, setBackgroundSubagentsStopAllPending] = useState(false);
  const [appRegistry, setAppRegistry] = useState<AppRegistryEntry[]>([]);
  const [rpcDebugEvents, setRpcDebugEvents] = useState<RpcDebugEvent[]>([]);
  const [automationsPanelOpen, setAutomationsPanelOpen] = useState(false);
  const [automationsPayload, setAutomationsPayload] = useState<unknown>(null);
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  // codex: local-conversation-thread-*.js — citation chip `ke` handler deep-links
  // a *specific* automation id (Km({automationId,…}) / navigate-to-route
  // /automations?automationId=…). Forge tracks that focus target so the panel
  // can scope to the matching schedule instead of the generic list.
  const [focusedAutomationId, setFocusedAutomationId] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const accountStateRef = useRef<AccountState>(initialAccountState);
  const openArtifactPreviewTabRef = useRef<((entry: RailEntry) => void) | null>(null);
  // ⌘F jump target: assigned by ConversationView's virtualized turn list.
  const threadFindScrollToUnitRef = useRef<((unitKey: string) => boolean) | null>(null);
  const refreshOpenFileWatchTabsRef = useRef<((watchId: string) => void) | null>(null);
  const authRefreshTokenOnNextRefreshRef = useRef(false);
  const accountRefreshTokenOnNextRefreshRef = useRef(false);
  const threadScrollOffsetsRef = useRef(new Map<string, number>());
  const mainRef = useRef<HTMLElement | null>(null);
  const mainWidth = useElementInlineSize(mainRef);
  const setAccountProjectionState = useCallback((next: AccountState) => {
    accountStateRef.current = next;
    dispatch({ type: "setAccount", account: next });
  }, [dispatch]);
  // Keep the shadow ref the refresh effects read in sync with the reducer's
  // account slice: explicit setAccountProjectionState writes it eagerly, and
  // this render-phase line covers notification-driven updates (the effects read
  // .current to avoid stale closures).
  accountStateRef.current = state.account;
  const accountViewModel = useMemo(
    () => projectAccountViewModel(state.account, codexAuthSummary, formatUiMessage),
    [state.account, codexAuthSummary, formatUiMessage],
  );
  clientCallbacksRef.current = {
    onNotification: (message: JsonRpcNotification) => {
      fileSearchControllerRef.current?.handleNotification(message);
      dispatch({ type: "notification", message });
      if (message.method === "fs/changed") {
        const watchId = watchIdFromFsChangedNotification(message.params);
        if (watchId) refreshOpenFileWatchTabsRef.current?.(watchId);
      }
      const accountRefreshScope = accountRefreshScopeForNotification(message);
      if (accountRefreshScope) {
        if (isSuccessfulAccountLoginCompletedNotification(message)) {
          authRefreshTokenOnNextRefreshRef.current = true;
          accountRefreshTokenOnNextRefreshRef.current = true;
        }
      }
      // OAuth completion → re-query auth status so the picker's Sign-in
      // button + readyProviders flip immediately.
      if (message.method === "account/login/completed"
        || message.method === "account/updated") {
        if (message.method === "account/updated") {
          setOauthAuthMethod(authModeFromAccountUpdatedNotification(message));
        }
      }
    },
    onDebugEvent: (event: RpcDebugEvent) => setRpcDebugEvents((current) => appendRpcDebugEvent(current, event)),
  };
  useEffect(() => {
    if (!state.connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const refreshToken = authRefreshTokenOnNextRefreshRef.current;
        authRefreshTokenOnNextRefreshRef.current = false;
        const result = await client.request<{ authMethod?: string | null; requiresOpenaiAuth?: boolean | null }>(
          "getAuthStatus",
          { includeToken: false, refreshToken },
          15_000,
        );
        if (cancelled) return;
        const method = result?.authMethod ?? null;
        if (method || result?.requiresOpenaiAuth !== false) {
          setOauthAuthMethod(method);
        }
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
  }, [client, dispatch, state.connected, state.invalidation.authRefresh]);

  useEffect(() => {
    if (!state.connected) return;
    let cancelled = false;
    const previous = accountStateRef.current;
    const refreshToken = accountRefreshTokenOnNextRefreshRef.current;
    accountRefreshTokenOnNextRefreshRef.current = false;
    setAccountProjectionState(beginAccountStateRefresh(previous));
    void refreshAccountState(client, previous, { refreshToken })
      .then((next) => {
        if (!cancelled) setAccountProjectionState(next);
      });
    return () => { cancelled = true; };
  }, [state.invalidation.accountRefresh, client, setAccountProjectionState, state.connected]);

  useEffect(() => {
    if (!state.connected) {
      setAppRegistry([]);
      return;
    }
    let cancelled = false;
    void loadAllApps(client, {
      forceRefetch: state.invalidation.appList > 0,
      threadId: state.activeThreadId,
    })
      .then((apps) => {
        if (!cancelled) setAppRegistry(appRegistryEntriesFromResponse(apps));
      })
      .catch(() => {
        if (!cancelled) setAppRegistry([]);
      });
    return () => { cancelled = true; };
  }, [state.invalidation.appList, client, state.activeThreadId, state.connected]);

  const signOutAccount = useCallback(async () => {
    const previous = accountStateRef.current;
    if ((!previous.account && !hasOpenAiCredentialSummary(codexAuthSummary)) || previous.refreshing) return;
    setAccountProjectionState(beginAccountStateRefresh(previous));
    try {
      const next = await logoutAndRefreshAccountState(client, previous);
      setAccountProjectionState(next);
      setOauthAuthMethod(null);
      setCodexAuthSummary({
        hasAuthFile: false,
        authMode: null,
        hasApiKey: false,
        hasTokens: false,
        email: null,
        planType: null,
      });
      dispatch({ type: "invalidateAuth" });
      dispatch({ type: "log", text: "Logged out from the current Codex account.", level: "info" });
    } catch (error) {
      setAccountProjectionState({
        ...accountStateRef.current,
        status: "error",
        refreshing: false,
        error: formatError(error),
      });
      dispatch({ type: "log", text: `Logout failed: ${formatError(error)}`, level: "error" });
    }
  }, [client, codexAuthSummary, dispatch, setAccountProjectionState]);

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
  }, [dispatch, state.connected, state.hostStatus?.codexHome, state.invalidation.authRefresh]);

  const activeThreadRuntime = selectActiveThreadRuntime(state);
  const activeItems = activeThreadRuntime.items;
  const composerMode = state.composerMode;
  // codex: "Pursue goal" is an INDEPENDENT toggle from Plan mode (both can be on
  // together), so goal-input mode is tracked as its own flag rather than a
  // ComposerMode value. Reset when switching threads (like composerMode does).
  const [composerGoalMode, setComposerGoalMode] = useState(false);
  useEffect(() => {
    setComposerGoalMode(false);
  }, [state.activeThreadId]);
  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
  const activeThreadScrollKey = state.activeThreadId ?? "new-thread";
  const initialThreadScrollOffset = threadScrollOffsetsRef.current.get(activeThreadScrollKey) ?? 0;
  const activeTurnId = activeThreadRuntime.activeTurnId;
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- selectItemsByThread 只读 state.threadsRuntime；故意以该精确切片为失效键，避免无关 state 变化重建 items 映射
  const itemsByThread = useMemo(() => selectItemsByThread(state), [state.threadsRuntime]);
  const activeThreadRunning = Boolean(activeTurnId) || isThreadStatusInProgress(activeThread?.status);
  const worktreeStatusCwd = activeThread?.cwd?.trim() || workspace.trim();
  // Turn-diff Undo / Reapply (state + re-entrancy lock + handler) lives in
  // useTurnPatchAction; ConversationView gets onPatchAction, the failure dialog reads patchFailure.
  const { handlePatchAction, patchActionState, patchActionInFlight, patchFailure, setPatchFailure } =
    useTurnPatchAction({ worktreeStatusCwd });
  const { worktreeHostGitStatus, pullRequestStatus } = useWorktreeGitAndPrStatus({ worktreeStatusCwd });
  const activeProgressPlan = activeThreadRuntime.turnPlan;
  const activeFixedPlan = useMemo(
    () => activeTurnPlanFromTodoListItems(activeItems, state.activeThreadId, activeTurnId) ?? activeProgressPlan,
    [activeItems, activeProgressPlan, activeTurnId, state.activeThreadId],
  );
  const conversation = useMemo(
    () => projectConversation(activeItems, {
      appRegistry,
      isThreadRunning: activeThreadRunning,
      mcpServerStatuses,
      parentThreadAttachmentSourceConversationId: activeThread?.forkedFromId ?? null,
    }),
    [activeItems, activeThread?.forkedFromId, activeThreadRunning, appRegistry, mcpServerStatuses],
  );
  const backgroundPendingThreadIds = useMemo(
    () => conversation.backgroundAgents
      .map((entry) => entry.action?.kind === "thread" ? entry.action.threadId : null)
      .filter((threadId): threadId is string => Boolean(threadId && threadId !== state.activeThreadId)),
    [conversation.backgroundAgents, state.activeThreadId],
  );
  const activeThreadPendingRequests = useMemo(
    () => deriveActivePendingRequests(state.pendingRequests, {
      activeThreadId: state.activeThreadId,
      activeTurnId,
      activeItemIds: activeItems.map((item) => item.id),
    }),
    [activeItems, activeTurnId, state.activeThreadId, state.pendingRequests],
  );
  const [dismissedPlanImplementationRequestIds, setDismissedPlanImplementationRequestIds] = useState<ReadonlySet<string>>(() => new Set());
  const activePlanImplementationRequest = useMemo(
    () => planImplementationPendingRequest(activeItems, state.activeThreadId, dismissedPlanImplementationRequestIds),
    [activeItems, dismissedPlanImplementationRequestIds, state.activeThreadId],
  );
  const activePendingRequests = useMemo(
    () => {
      const composerRequests = deriveComposerPendingRequests(state.pendingRequests, {
        activeThreadId: state.activeThreadId,
        activeTurnId,
        activeItemIds: activeItems.map((item) => item.id),
        backgroundThreadIds: backgroundPendingThreadIds,
        itemsByThread,
      });
      if (!activePlanImplementationRequest) return composerRequests;
      if (composerRequests.some((request) => String(request.id) === String(activePlanImplementationRequest.id))) {
        return composerRequests;
      }
      return [...composerRequests, activePlanImplementationRequest];
    },
    [
      activeItems,
      activePlanImplementationRequest,
      activeTurnId,
      backgroundPendingThreadIds,
      itemsByThread,
      state.activeThreadId,
      state.pendingRequests,
    ],
  );
  const backgroundSubagentPendingRequests = useMemo(
    () => deriveBackgroundPendingRequests(state.pendingRequests, {
      activeThreadId: state.activeThreadId,
      backgroundThreadIds: backgroundPendingThreadIds,
      itemsByThread,
    }),
    [backgroundPendingThreadIds, itemsByThread, state.activeThreadId, state.pendingRequests],
  );
  const backgroundSubagentStopThreadIds = useMemo(
    () => mergeBackgroundSubagentStopThreadIds(
      activeBackgroundSubagentThreadIds(conversation.backgroundAgents, state.activeThreadId),
      backgroundSubagentPendingRequests,
      itemsByThread,
    ),
    [backgroundSubagentPendingRequests, conversation.backgroundAgents, itemsByThread, state.activeThreadId],
  );
  const activePendingRequestActors = useMemo(() => {
    const labelsByThreadId = new Map<string, string>();
    for (const entry of conversation.backgroundAgents) {
      if (entry.action?.kind !== "thread") continue;
      const displayName = entry.action.displayName?.trim() || entry.title.trim();
      if (displayName) labelsByThreadId.set(entry.action.threadId, displayName);
    }
    const actors: Record<string, string> = {};
    for (const request of activePendingRequests) {
      const threadId = pendingRequestOwnerThreadId(request, { itemsByThread });
      if (!threadId || threadId === state.activeThreadId) continue;
      const label = labelsByThreadId.get(threadId);
      if (label) actors[String(request.id)] = label;
    }
    return actors;
  }, [activePendingRequests, conversation.backgroundAgents, itemsByThread, state.activeThreadId]);
  const latestTurnIdForHeartbeat = activeTurnId ?? activeThreadRuntime.turnOrder.at(-1) ?? null;
  const automationsModel = useMemo(() => projectAutomationsSurface({
    connected: state.connected,
    error: automationsError,
    loading: automationsLoading,
    payload: automationsPayload,
    // codex: deep-link focus target from the citation chip `ke` handler.
    focusedAutomationId,
    heartbeat: {
      hasConversation: Boolean(state.activeThreadId),
      hostSupported: true,
      latestTurnId: latestTurnIdForHeartbeat,
      latestTurnStatus: activeThreadRunning
        ? "inProgress"
        : latestTurnIdForHeartbeat
          ? "completed"
          : null,
      pendingRequestType: heartbeatPendingRequestType(activeThreadPendingRequests),
      resumeState: state.connected ? "resumed" : "resuming",
    },
  }), [
    activeThreadPendingRequests,
    activeThreadRunning,
    automationsError,
    automationsLoading,
    automationsPayload,
    focusedAutomationId,
    latestTurnIdForHeartbeat,
    state.activeThreadId,
    state.connected,
  ]);
  /*
   * CODEX-REF: Codex 仅渲染 single automation。legacy multi-list `automations`
   * 已删除，对应的 `projectAutomationRailEntries` useMemo (dead code) 也删除。
   * 仍保留 `projectActiveThreadAutomation` 提供 single automation 数据。
   */
  // codex: local-conversation-thread-*.js — single-entry automation
  // summary input for the right-rail `automation` section. Pulls the active
  // heartbeat automation targeting the current thread (same filter as the
  // legacy `automations` list, but collapsed to one row with rrule + next run).
  const activeThreadAutomation = useMemo(
    () => projectActiveThreadAutomation(automationsModel, state.activeThreadId),
    [automationsModel, state.activeThreadId],
  );
  const handledImageToolRequestIdsRef = useRef(new Set<string>());
  useForgeImageToolResponder({
    handledImageToolRequestIdsRef,
    pendingRequests: state.pendingRequests,
    modelDraft,
    codexHome: state.hostStatus?.codexHome,
    imageGenerationSettings,
  });
  const handledPermissionAutoDenyRef = useRef(new Set<string>());
  usePermissionAutoDeny({
    handledRequestIdsRef: handledPermissionAutoDenyRef,
    pendingRequests: state.pendingRequests,
  });
  const includeImageDynamicTool = useMemo(
    () => shouldRegisterForgeImageDynamicTool(imageGenerationSettings),
    [imageGenerationSettings],
  );
  const activeDiff = activeThreadRuntime.turnDiff;
  const showLiveTurnFixedContent = shouldRenderLiveTurnFixedContent({
    activeTurnId,
    diff: activeDiff,
    isThreadRunning: activeThreadRunning,
    hasBlockingRequest: activePendingRequests.length > 0,
    plan: activeFixedPlan,
    turnId: activeThreadRuntime.turnDiffTurnId,
  });
  const branchDetails = useMemo(
    () => projectBranchDetails({
      thread: activeThread,
      diff: activeDiff ? { diff: activeDiff } : null,
      gitStatus: worktreeHostGitStatus,
      // codex: local-conversation-thread-*.js row 4 PR widget input.
      pullRequest: pullRequestStatus
        ? {
            number: pullRequestStatus.number,
            title: pullRequestStatus.title,
            url: pullRequestStatus.url,
            isDraft: pullRequestStatus.isDraft,
            state: pullRequestStatus.state,
          }
        : null,
    }),
    [activeDiff, activeThread, pullRequestStatus, worktreeHostGitStatus],
  );
  const composerWorkModeOptions = useMemo(
    () => projectWorktreeModeOptions({
      hostGitStatus: worktreeHostGitStatus,
      mode: composerWorkMode,
      tauriRuntimeAvailable: isTauriRuntime(),
      formatMessage: formatUiMessage,
    }),
    [composerWorkMode, worktreeHostGitStatus, formatUiMessage],
  );
  const {
    threadFindOpen,
    threadFindQuery,
    setThreadFindQuery,
    threadFindFocusToken,
    visibleThreadFindIndex,
    activeThreadFindMatches,
    openThreadFindBar,
    closeThreadFindBar,
    goToThreadFindMatch,
  } = useThreadFind({
    setCommandPanel,
    setActiveSettingsPanel,
    activeThreadScrollKey,
    conversationUnits: conversation.units,
    scrollToUnitKeyRef: threadFindScrollToUnitRef,
  });
  const hasFilePreviewSelection = artifactPreview !== null || fileReference !== null;
  /*
   * Codex Desktop opens file/artifact previews into the AppShell RightPanel
   * (`app-shell-*.js`), not into the summary rail. Drag <
   * 320 px closes the panel — Codex closes the RightPanel below a 320 px width. We
   * close the artifact / file selection here so the panel unmounts.
   */
  const closeFilePreviewPanel = useCallback(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [setArtifactPreview, setFileReference]);
  const {
    connect,
    ensureConnected,
    loadCollaborationModes,
  } = useForgeAppConnection({
    activeSettingsPanel, activeThread, client, dispatch, modelDraft, reconnectAttempt, setArtifactPreview,
    setCollaborationModes, setFileReference, setMcpServerStatuses, setModelDraft,
    setPersonalProviderConfigured, setReconnectAttempt, setWorkspace, setWorkspaceDeveloperInstructions,
    state, workspace,
  });
  const { followUpQueueingEnabled, setFollowUpQueueingEnabled } = useFollowUpQueueMode({
    client,
    connected: state.connected,
    dispatch,
    ensureConnected,
  });

  const {
    activeModelSupportedEfforts,
    activeModelSupportsImageInput,
    activeThreadDisplayModelSelection,
    clearActiveThreadGoal,
    closeKeyboardShortcuts,
    closeMcpFollowUpDialog,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    collaborationModesForComposerMode,
    composerModelProviderHint,
    composerQuotaBanner,
    composerSubmitState,
    confirmMcpFollowUpDialog,
    editActiveThreadGoal,
    effectiveThreadContextDefaults,
    handleComposerModelSelect,
    handleMcpAppHostCall,
    handleReasoningSelect,
    keyboardShortcutsOpen,
    mcpFollowUpDialog,
    modelPickerAnchor,
    modelPickerOverlayDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerProviders,
    openKeyboardShortcuts,
    permissionsPickerAnchor,
    permissionsRequirements,
    readMcpResource,
    readyProviders,
    reasoningPickerAnchor,
    restartRuntimeForProviderSwitch,
    setActiveThreadGoalStatus,
    teamModelGatewayProvider,
    threadGoalPendingAction,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
  } = useForgeAppModelContext({
    activePendingRequests, activeThread, activeThreadRunning, activeTurnId, client, codexAuthSummary,
    collaborationModes, composerAttachments, connect, dispatch, ensureConnected, followUpQueueingEnabled,
    formatUiMessage, input, loadCollaborationModes, modelDraft, oauthAuthMethod,
    openSideConversationPanelRef, personalProviderConfigured, reasoningEffortOverride, selectedModelKey,
    setReasoningEffortOverride, setSelectedModelKey, setThreadModelSelection, state, threadModelSelections,
    workspace, workspaceDeveloperInstructions,
  });

  const {
    archiveSelectedThread,
    backgroundAgentCanInterrupt,
    backgroundAgentConversation,
    backgroundAgentInterrupting,
    backgroundAgentMessageDraft,
    backgroundAgentMessageError,
    backgroundAgentMessageSending,
    backgroundAgentPanel,
    backgroundAgentStatus,
    backgroundAgentSubtitle,
    backgroundAgentTitle,
    closeBackgroundAgentPanel,
    closeThreadActionDialog,
    confirmForkFromOlderTurn,
    createWorkbenchThread,
    dismissForkFromOlderTurn,
    editLastUserTurn,
    forkActiveThreadFromTurn,
    forkConfirmOpen,
    forkConfirmSubmitting,
    forkSelectedThread,
    forkSelectedThreadIntoWorktree,
    interruptBackgroundAgentPanelTurn,
    openAutomationFromConversation,
    openAutomationsPanel,
    openBackgroundAgentThread,
    openExistingWorkspaceFolder,
    openRenameThreadDialog,
    openSideConversationPanel,
    refreshAutomationsPanel,
    renameSelectedThread,
    selectProjectlessWorkspace,
    selectWorkbenchThread,
    selectWorkspaceRoot,
    sendBackgroundAgentPanelMessage,
    setBackgroundAgentMessageDraft,
    setComposerWorkMode,
    sideChatRailEntries,
    threadActionDialog,
    workspaceRootOptions,
  } = useForgeAppWorkspaceThreads({
    activeThread, client, closeFilePreviewPanel, composerWorkModeOptions, dispatch,
    effectiveThreadContextDefaults, ensureConnected, openSideConversationPanelRef, openWorkbenchTab,
    selectedWorkspaceRoots, setAutomationsError, setAutomationsLoading, setAutomationsPanelOpen,
    setAutomationsPayload, setComposerAttachments, setComposerWorkModeState, setFocusedAutomationId,
    setInput, setPendingWorktree, setSelectedWorkspaceRoots, setWorkspace, state, workspace,
    worktreeStatusCwd,
  });

  const {
    closeCommandPanel,
    composerPlaceholder,
    filePreviewPanelLayout,
    hooksReviewSnapshot,
    loadSettingsPanel,
    mainLayoutStyle,
    openChatSearchPanel,
    openCommandMenu,
    openCommandPanel,
    openDeepLinkUrl,
    openFileSearchPanel,
    openRemoteTask,
    openRemoteTaskExternal,
    openSettingsPanelContent,
    refreshActiveSettingsPanel,
    refreshBrowserRuntime,
    reviewHooks,
    rightRailMode,
    rightRailSections,
    searchChatsFromCommandPanel,
    searchCommandMenuFromPanel,
    searchFilesFromCommandPanel,
    searchWorkspaceFilesForFilesTab,
    selectThreadById,
    setBrowserRuntimeSnapshot,
    showHooksReviewBanner,
    showRightRail,
    showRightRailPopover,
    threadInlineEndInset,
    tokenUsageSnapshot,
    trustAllHooks,
  } = useForgeAppRailPanels({
    activeSettingsPanel, activeThread, activeThreadAutomation, activeThreadRuntime, activeTurnId,
    automationsPanelOpen, backgroundAgentPanel, branchDetails, changeActiveAppTab, client,
    closeFilePreviewPanel, commandPanel, composerAttachments, composerGoalMode, composerMode,
    composerWorkMode,
    conversation, dispatch, effectiveThreadContextDefaults, ensureConnected, fileSearchControllerRef,
    formatUiMessage, hasFilePreviewSelection, includeImageDynamicTool, input, mainWidth,
    notificationPreferences, openWorkbenchTab, pendingWorktree, pinnedThreadIds, rightRailPinned,
    rightRailPopoverOpen, selectWorkbenchThread, setActiveRemoteTaskId, setActiveSettingsPanel,
    setCommandPanel, setRightRailPopoverOpen, setSettingsPanelState, sidebarPreferences,
    sideChatRailEntries, state, uiAppearance, uiLocale, uiThemeSnapshot, workspace,
  });

  const {
    FILES_TAB_ID,
    openBrowserSurface,
    openFilesTabRef,
    sidePanel,
  } = useForgeAppSidePanelHost({
    client, dispatch, refreshBrowserRuntime, refreshOpenFileWatchTabsRef, setBrowserRuntimeSnapshot, state,
  });

  useForgeAppShellCommands({
    FILES_TAB_ID, createWorkbenchThread, dispatch, loadSettingsPanel, openChatSearchPanel, openCommandMenu,
    openDeepLinkUrl, openExistingWorkspaceFolder, openFilesTabRef, openFileSearchPanel, openThreadFindBar,
    selectThreadById, sidePanel, state, toggleSidebar,
  });

  const {
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    markThreadUnread,
    openThreadFolder,
    openThreadInNewWindow,
    setActiveComposerMode,
  } = useForgeAppThreadCommands({
    activeSettingsPanel, activeThread, archiveSelectedThread, commandPanel, conversation, dispatch,
    ensureConnected, openKeyboardShortcuts, openRenameThreadDialog, pinnedThreadIds, selectThreadById,
    setAppRegistry, setCommandPanel, setSettingsPanelState, state, toggleThreadPinned, workspace,
  });

  const {
    copyFileReferenceContents,
    handlePatchFailureOpenPath,
    memoryCitationRoot,
    openActiveDiffPanel,
    openAssistantArtifactInSidePanel,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewConversationFileReferenceAndOpenRail,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReferenceAndOpenRail,
    rememberThreadScrollOffset,
    revealAssistantEndResource,
    revealFileReference,
    sidePanelNewTabActions,
  } = useForgeAppPreviewWiring({
    FILES_TAB_ID, activeDiff, activeThread, activeThreadScrollKey, formatUiMessage,
    openArtifactPreviewTabRef, openBrowserSurface, openCommandPanel, openFilesTabRef,
    searchWorkspaceFilesForFilesTab, setArtifactPreview, setComposerAttachments, sidePanel, state,
    threadScrollOffsetsRef, workspace, worktreeStatusCwd,
  });

  const {
    activeQueuedFollowUps,
    activeQueuedFollowUpsInterrupted,
    cleanBackgroundTerminals,
    conversationEmptyState,
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    onboardingEmptyStateVisible,
    pauseActiveQueuedFollowUps,
    pausedQueueSubmitPrompt,
    pendingGoalReplace,
    reorderQueuedFollowUp,
    resolvePausedQueueSubmitPrompt,
    resumeInterruptedQueuedFollowUps,
    resumeGoalPrompt,
    sendQueuedFollowUpNow,
    sendTurn,
    setPendingGoalReplace,
    setResumeGoalPrompt,
  } = useForgeAppSubmission({
    activeModelSupportsImageInput, activePendingRequests, activeThread, activeThreadRunning,
    activeThreadRuntime, activeTurnId, backgroundTerminalCleanupPending, client, collaborationModes,
    collaborationModesForComposerMode, composerAttachments, composerGoalMode, composerMode,
    composerSubmitState, createWorkbenchThread, dispatch, effectiveThreadContextDefaults, ensureConnected,
    includeImageDynamicTool, input, onboardingSnapshot, openExistingWorkspaceFolder,
    restartRuntimeForProviderSwitch, setActiveComposerMode, setBackgroundTerminalCleanupPending,
    setComposerAttachments, setComposerGoalMode, setInput, setOnboardingSnapshot, state,
    workspace,
  });

  const {
    browseComposerFiles,
    executeSlashCommand,
    hasPlanComposerMode,
    pursueComposerGoal,
    runSlashCommandFromPanel,
    runSlashRequest,
    searchComposerMentions,
    selectComposerPlan,
  } = useForgeAppSlashCommands({
    activeItems, activeThread, activeTurnId, buildInfo, client, collaborationModes,
    collaborationModesForComposerMode, composerMode, createWorkbenchThread, dispatch,
    effectiveThreadContextDefaults, ensureConnected, fileSearchControllerRef, formatUiMessage, input, loadSettingsPanel, openCommandMenu, openCommandPanel,
    openRenameThreadDialog, openSideConversationPanel, rpcDebugEvents, setAccountProjectionState,
    setActiveComposerMode, setAppRegistry, setComposerAttachments, setComposerGoalMode,
    setComposerStatusPanelOpen, setInput, state, toggleReasoningPickerAnchor, uiThemeSnapshot, workspace,
  });

  const {
    applyComposerPermissionMode,
    applyImageGenerationDraft,
    applyModelDraft,
    handleMcpServerFormSubmit,
    handleMcpToolFormSubmit,
    handleSettingsPanelSelectAction,
    handleSettingsPanelSelectEntry,
    interruptActiveTurn,
    respondToRequest,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    stopBackgroundSubagents,
  } = useForgeAppApprovalsSettings({
    activeTurnId, backgroundSubagentsStopAllPending, backgroundSubagentStopThreadIds, client,
    closePermissionsPicker, connect, dispatch, ensureConnected, handledImageToolRequestIdsRef,
    imageGenerationDraft, imageGenerationSettings, itemsByThread, mcpServerForm, mcpToolForm, modelDraft,
    notificationPreferences, openCommandPanel, openFileSearchPanel, openSettingsPanelContent,
    resetUiKeyboardShortcut, runSlashCommandFromPanel, selectThreadById, sendTurn, setActiveComposerMode,
    setActiveSettingsPanel, setBackgroundSubagentsStopAllPending, setCommandPanel, setComposerAttachments,
    setDismissedPlanImplementationRequestIds, setImageGenerationDraft, setImageGenerationSettings, setInput,
    setMcpServerForm, setMcpToolForm, setNotificationPreferences, setSelectedModelKey, setThreadPinnedById,
    setUiCodeFontSize, setUiKeyboardShortcut, setUiLocale, setUiReducedMotion, setUiThemeMode, state,
    teamModelGatewayProvider, workspace,
  });

  const workbenchVisible = activeAppTab === "workbench";
  const remoteTaskVisible = activeAppTab === "remoteTask" && activeRemoteTaskId !== null;
  const sidebarVisible = workbenchVisible && sidebarOpen;
  const appClassName = workbenchVisible && showRightRail ? "hc-app hc-app--with-right-rail" : "hc-app";
  const {
    appShellStyle,
    resizeSidebarByKeyboard,
    sidebarResizing,
    sidebarWidthPx,
    startSidebarResize,
  } = useSidebarResizeController({
    sidebarVisible,
    widthPx: sidebarPreferences.widthPx,
    setSidebarWidthPx,
  });
  // codex: inline file references carry the workspace-file context menu; provide the
  // reveal + copy-contents actions (host + path resolution) to every FileCitationAnchor.
  const fileCitationMenuActions = useMemo(
    () => ({ onReveal: revealFileReference, onCopyContents: copyFileReferenceContents }),
    [revealFileReference, copyFileReferenceContents],
  );

  return (
    <FileCitationMenuContext.Provider value={fileCitationMenuActions}>
    <DelinkFileCitationsContext.Provider value={isProjectlessWorkspace(activeThread?.cwd || workspace)}>
    <ForgeIntlProvider locale={uiLocale}>
      <div
        className={appClassName}
        data-app-tab={activeAppTab}
        data-locale={uiLocale}
        data-sidebar-open={sidebarVisible ? "true" : "false"}
        data-sidebar-resizing={sidebarResizing ? "true" : undefined}
        data-theme={resolvedUiTheme}
        data-theme-mode={uiThemeSnapshot.mode}
        lang={uiLocale}
        style={appShellStyle}
      >
      <AppNavigationRail
        activeTab={activeAppTab}
        onTabChange={changeActiveAppTab}
        onOpenSettings={() => void loadSettingsPanel("general")}
        productAccount={teamServiceAuthSession}
        onProductSignOut={signOutTeamServiceAccount}
      />

      {/*
        * codex: app-shell-state-*.js — sidebar collapse animation.
        * Codex Desktop keeps the sidebar mounted and animates width via a
        * motion-one spring. Forge pins mount to `workbenchVisible` (not
        * `sidebarOpen`) so open/close runs as CSS transitions on
        * `--hc-sidebar-width` / `.hc-sidebar`, not React mount/unmount.
        */}
      {workbenchVisible && renderForgeAppSidebar({
        accountViewModel, activeThread, archiveSelectedThread, connect, copyThreadDeeplink,
        copyThreadSessionId, copyThreadWorkingDirectory, createWorkbenchThread, forkSelectedThread,
        forkSelectedThreadIntoWorktree, loadSettingsPanel, markThreadUnread, openAutomationsPanel,
        openChatSearchPanel, openExistingWorkspaceFolder, openRenameThreadDialog, openThreadFolder,
        openThreadInNewWindow, pinnedThreadIds, resolvedUiTheme, runUpdate, selectedWorkspaceRoots,
        selectWorkbenchThread, setSidebarCollapsedGroupKeys, setSidebarOrganizeMode, setSidebarSortKey,
        sidebarCollapsedGroupKeys, sidebarPreferences, signOutAccount, state, toggleThreadPinned,
        updateBadge, workspace, worktreeHostGitStatus,
      })}

      {workbenchVisible && renderForgeAppSidebarResizeHandle({
        resizeSidebarByKeyboard, sidebarResizing, sidebarVisible, sidebarWidthPx, startSidebarResize,
      })}

      {workbenchVisible ? renderForgeAppMain({
        activeDiff, activePendingRequests, activeQueuedFollowUps, activeThread, activeThreadFindMatches,
        activeThreadRunning, activeThreadScrollKey, artifactPreview, artifactPreviewNonce, automationsModel,
        automationsPanelOpen, backgroundAgentCanInterrupt, backgroundAgentConversation,
        backgroundAgentInterrupting, backgroundAgentMessageDraft, backgroundAgentMessageError,
        backgroundAgentMessageSending, backgroundAgentPanel, backgroundAgentStatus, backgroundAgentSubtitle,
        backgroundAgentTitle, backgroundTerminalCleanupPending, cleanBackgroundTerminals,
        closeBackgroundAgentPanel, closeFilePreviewPanel, closeThreadFindBar, conversation,
        conversationEmptyState, dispatch, editLastUserTurn, filePreviewPanelLayout, fileReference,
        forkActiveThreadFromTurn, formatUiMessage, goToThreadFindMatch, handleMcpAppHostCall,
        handlePatchAction, hasFilePreviewSelection, initialThreadScrollOffset,
        interruptBackgroundAgentPanelTurn, mainLayoutStyle, mainRef, memoryCitationRoot, openActiveDiffPanel,
        openAssistantArtifactInSidePanel, openAutomationFromConversation, openAutomationsPanel,
        openBackgroundAgentThread, openBrowserSurface, openFileReferenceExternal,
        openRailArtifactFileExternal, openRailUrl, openRemoteTask, patchActionInFlight, patchActionState,
        previewConversationFileReferenceAndOpenRail, previewPathContext, previewRailArtifact,
        previewRailFileReferenceAndOpenRail, readMcpResource, refreshAutomationsPanel,
        rememberThreadScrollOffset, revealAssistantEndResource, rightRailMode, rightRailPinned,
        rightRailSections, selectThreadById, sendBackgroundAgentPanelMessage, setArtifactPreview,
        setAutomationsPanelOpen, setBackgroundAgentMessageDraft, setFileReference, setFocusedAutomationId,
        setRightRailPinned, setRightRailPopoverOpen, setThreadFindQuery, showLiveTurnFixedContent,
        showRightRail, showRightRailPopover, sidebarOpen, sidePanel, sidePanelNewTabActions, state,
        threadFindFocusToken, threadFindOpen, threadFindQuery, threadFindScrollToUnitRef,
        threadInlineEndInset, toggleSidebar, visibleThreadFindIndex, worktreeHostGitStatus,
        fixedContent: (
          <LiveTurnFixedContent
            activeTurnId={activeTurnId}
            diff={activeDiff}
            isThreadRunning={activeThreadRunning}
            hasBlockingRequest={activePendingRequests.length > 0}
            plan={activeFixedPlan}
            turnId={activeThreadRuntime.turnDiffTurnId}
            onOpenDiff={openActiveDiffPanel}
          />
        ),
        footer: renderForgeAppComposerRegion({
          activeModelSupportsImageInput, activePendingRequestActors, activePendingRequests,
          activeQueuedFollowUps, activeQueuedFollowUpsInterrupted, activeThread,
          activeThreadDisplayModelSelection, activeThreadRuntime,
          backgroundSubagentsStopAllPending, backgroundSubagentStopThreadIds,
          browseComposerFiles, clearActiveThreadGoal, composerAttachments, composerGoalMode, composerMode,
          composerModelProviderHint, composerPlaceholder, composerQuotaBanner, composerStatusPanelOpen,
          composerSubmitState, composerWorkMode, composerWorkModeOptions, conversation, deleteQueuedFollowUp,
          dispatch, editActiveThreadGoal, editQueuedFollowUp, effectiveThreadContextDefaults,
          executeSlashCommand, followUpQueueingEnabled, hasPlanComposerMode, hooksReviewSnapshot, input,
          interruptActiveTurn, loadSettingsPanel, onboardingEmptyStateVisible,
          openBackgroundAgentThread, openExistingWorkspaceFolder, pauseActiveQueuedFollowUps,
          pausedQueueSubmitPrompt, pendingGoalReplace, pursueComposerGoal, reorderQueuedFollowUp,
          resolvePausedQueueSubmitPrompt, respondToRequest,
          resumeInterruptedQueuedFollowUps, resumeGoalPrompt, reviewHooks, selectComposerPlan,
          selectProjectlessWorkspace, selectWorkspaceRoot, sendQueuedFollowUpNow, sendTurn,
          setActiveThreadGoalStatus, setComposerAttachments, setComposerStatusPanelOpen, setComposerWorkMode,
          setFollowUpQueueingEnabled, setInput, setPendingGoalReplace, setResumeGoalPrompt,
          showHooksReviewBanner, state, stopBackgroundSubagents,
          searchComposerMentions, threadGoalPendingAction, toggleModelPickerAnchor,
          togglePermissionsPickerAnchor, toggleReasoningPickerAnchor, tokenUsageSnapshot, trustAllHooks,
          workspace, workspaceRootOptions,
        }),
      }) : remoteTaskVisible ? (
        <RemoteTaskView
          taskId={activeRemoteTaskId}
          onBack={openWorkbenchTab}
          onOpenExternal={openRemoteTaskExternal}
        />
      ) : activeAppTab === "knowledge" ? (
        <KbLibraryView />
      ) : activeAppTab === "ingest" ? (
        <KbIngestView />
      ) : activeAppTab === "archive" ? (
        <KbArchiveView />
      ) : activeAppTab === "todo" ? (
        <KbTodoView />
      ) : null}

      {renderForgeAppPanelOverlays({
        activeSettingsPanel, applyImageGenerationDraft, applyModelDraft, closeCommandPanel, commandPanel,
        handleSettingsPanelSelectAction, handleSettingsPanelSelectEntry, imageGenerationDraft,
        keymapOverrides, loadSettingsPanel, modelDraft, refreshActiveSettingsPanel, resetUiKeyboardShortcut,
        searchChatsFromCommandPanel, searchCommandMenuFromPanel, searchFilesFromCommandPanel, selectCommandPanelAction,
        selectCommandPanelEntry, setActiveSettingsPanel, setImageGenerationDraft, setModelDraft,
        settingsPanelState, setUiCodeFontSize, setUiFontSize, setUiKeyboardShortcut, setUiLocale,
        setUiReducedMotion, setUiThemeMode, state, uiAppearance, uiLocale, uiThemeSnapshot,
      })}

      {renderForgeAppMcpDialogs({
        closeMcpFollowUpDialog, confirmMcpFollowUpDialog, handleMcpServerFormSubmit, handleMcpToolFormSubmit,
        mcpFollowUpDialog, mcpServerForm, mcpToolForm, setMcpServerForm, setMcpToolForm,
      })}

      {renderForgeAppThreadDialogs({
        archiveSelectedThread, closeThreadActionDialog, confirmForkFromOlderTurn, dismissForkFromOlderTurn,
        forkConfirmOpen, forkConfirmSubmitting, renameSelectedThread, threadActionDialog,
      })}

      {renderForgeAppAppOverlays({
        activeModelSupportedEfforts, activeThread, applyComposerPermissionMode, closeKeyboardShortcuts,
        closeModelPicker, closePermissionsPicker, closeReasoningPicker, effectiveThreadContextDefaults,
        handleComposerModelSelect, handlePatchFailureOpenPath, handleReasoningSelect, keyboardShortcutsOpen,
        loadSettingsPanel, modelPickerAnchor, modelPickerOverlayDefaultKey, modelPickerOverlaySelectedKey,
        modelPickerProviders, patchFailure, permissionsPickerAnchor, permissionsRequirements, readyProviders,
        reasoningPickerAnchor, runSlashRequest, setPatchFailure, state,
      })}
      </div>
    </ForgeIntlProvider>
    </DelinkFileCitationsContext.Provider>
    </FileCitationMenuContext.Provider>
  );
}

export function ForgeApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const clientCallbacksRef = useRef<ForgeClientCallbacks>({
    onNotification: () => {},
    onDebugEvent: () => {},
  });
  const fileSearchControllerRef = useRef<WorkspaceFuzzyFileSearchController | null>(null);
  /*
   * Thin shell: owns the true global singletons (reducer state/dispatch + the
   * JSON-RPC client) and provides them via ServicesContext so ForgeAppBody and
   * its subtree read them with useServices() rather than via prop-drilling. The
   * client is built once here; its two body-coupled callbacks are reached through
   * clientCallbacksRef, which ForgeAppBody (re)assigns each render. connect /
   * ensureConnected / auto-reconnect deliberately stay in the body (unmoved) so
   * no effect changes position — this split is behaviour-preserving.
   */
  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => clientCallbacksRef.current.onNotification(message),
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
      onConnectionClosed: () => dispatch({ type: "connected", value: false }),
      onDebugEvent: (event) => clientCallbacksRef.current.onDebugEvent(event),
    });
    clientRef.current = rpc;
    fileSearchControllerRef.current = new WorkspaceFuzzyFileSearchController(rpc);
    return rpc;
  }, [dispatch]);
  return (
    <ServicesProvider
      client={client}
      dispatch={dispatch}
      connected={state.connected}
    >
      <TeamServiceAuthGate>
        <ForgeAppBody
          state={state}
          clientCallbacksRef={clientCallbacksRef}
          fileSearchControllerRef={fileSearchControllerRef}
        />
      </TeamServiceAuthGate>
    </ServicesProvider>
  );
}
