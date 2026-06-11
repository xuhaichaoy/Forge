import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type {
  CollaborationModeMask,
  JsonRpcNotification,
  ModelConfig,
  Thread,
} from "@hicodex/codex-protocol";
import type { ThreadGoalStatus } from "@hicodex/codex-protocol/generated/v2/ThreadGoalStatus";
import { FileText, FolderOpen, Globe, Plus, X } from "lucide-react";
import { AppNavigationRail } from "./components/app-navigation-rail";
import { KbArchiveView } from "./components/kb-archive-view";
import { KbIngestView } from "./components/kb-ingest-view";
import { KbLibraryView } from "./components/kb-library-view";
import { KbTodoView } from "./components/kb-todo-view";
import { AppOverlays } from "./components/app-overlays";
import { AboveComposerPanelContainer } from "./components/above-composer-panel";
import { BrowserTabContent } from "./components/browser-tab-content";
import { FilesTabContent } from "./components/files-tab-content";
// codex: thread-app-shell-chrome-*.js — right-side
// "Side Panel + New Tab" landing page (4 cards) shown when the panel is open
// but no tab is active. Currently we wire only the Files card (HiCodex's
// equivalent of Codex's tab-open helper).
import { SidePanelNewTabPage, type SidePanelNewTabAction } from "./components/side-panel-new-tab-page";
// codex: app-shell-*.js — outer container that hosts the tab
// strip and either the active tab's content or the empty-state landing page.
import { SidePanelHost } from "./components/side-panel-host";
import { useSidePanelTabHost } from "./hooks/use-side-panel-tab-host";
// codex: keyboard-shortcuts-settings-*.js — standalone dialog rendering
// all `COMMAND_DESCRIPTORS` with their platform-formatted accelerator.
import { HooksReviewBanner } from "./components/hooks-review-banner";
import { StatusTextPanel } from "./components/status-text-panel";
import { PanelOverlays } from "./components/panel-overlays";
import { Composer } from "./components/composer";
import { ComposerExternalFooter, ComposerSettingsChips } from "./components/composer-external-footer";
import { ComposerQuotaBanner } from "./components/composer-quota-banner";
import { ComposerStatusPanel } from "./components/composer-status-panel";
import { ThreadGoalBanner, ThreadGoalReplaceConfirm, ThreadGoalResumeConfirm } from "./components/thread-goal-banner";
import { HiCodexIntlProvider } from "./components/i18n-provider";
import { ServicesProvider, useServices } from "./components/services-context";
import { TeamServiceAuthGate } from "./components/team-service-auth-gate";
import { focusComposerFromPlainTextKey, requestComposerElementFocus } from "./components/composer-keyboard";
import { PreConversationLoadingShell } from "./components/pre-conversation-loading-shell";
import { normalizeSubscriptionProviderId } from "./components/model-picker-menu";
import { normalizeReasoningEffortValue, type ReasoningEffortValue } from "./components/reasoning-picker-menu";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { BackgroundSubagentsStack } from "./components/background-subagents-stack";
import { ArtifactPreviewPanel } from "./components/artifact-preview-panel";
import { AutomationsPreviewPanel } from "./components/automations-preview-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
// codex inline-mentions-*.js / user-message-attachments-*.js context-menu wrapper —
// reveal + copy-contents actions for file-reference anchors + attachment pills,
// provided once above the conversation.
import { DelinkFileCitationsContext, FileCitationMenuContext } from "./components/file-citation-menu";
import {
  LiveTurnDiffPortal,
  shouldRenderLiveTurnDiffPortal,
} from "./components/live-turn-diff-portal";
import {
} from "./components/unified-diff-failure-dialog";
import { McpDialogs } from "./components/mcp-dialogs";
import { OnboardingEmptyState } from "./components/onboarding-empty-state";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { FilePreviewPanel, FileReferencePreviewTab } from "./components/file-preview-panel";
import { RightRail } from "./components/right-rail";
import { RemoteTaskView } from "./components/remote-task-view";
import { Sidebar } from "./components/sidebar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import { ThreadDialogs } from "./components/thread-dialogs";
import { ThreadFindBar } from "./components/thread-find-bar";
import { CodexJsonRpcClient, type RpcDebugEvent } from "./lib/codex-json-rpc-client";
import { formatError, patchFailurePathForOpen } from "./lib/format";
import {
  clearTeamServiceAuthSession,
  readTeamServiceAuthSession,
} from "./lib/team-service-auth";
import {
  revealPath,
  openThreadWindow,
  openNewWindow,
  isTauriRuntime,
  listenNativeShellEvents,
  pickFileReferences,
  pickWorkspaceFolder,
  readCodexAuthSummary,
  type CodexAuthSummary,
} from "./lib/tauri-host";
import { useAppUpdater } from "./hooks/use-app-updater";
import { useBrowserRuntime } from "./hooks/use-browser-runtime";
import { useTurnPatchAction } from "./hooks/use-turn-patch-action";
import { useClipboardCopyActions } from "./hooks/use-clipboard-copy-actions";
import { useThreadPins } from "./hooks/use-thread-pins";
import { useHooksReview } from "./hooks/use-hooks-review";
import { useWorktreeGitAndPrStatus } from "./hooks/use-worktree-status";
import { useThreadGoalActions } from "./hooks/use-thread-goal-actions";
import { useReconnectRecovery } from "./hooks/use-reconnect-recovery";
import { useThreadFind } from "./hooks/use-thread-find";
import { useRemoteTaskActions } from "./hooks/use-remote-task-actions";
import { useHiCodexImageToolResponder } from "./hooks/use-hicodex-image-tool-responder";
import { usePermissionAutoDeny } from "./hooks/use-permission-auto-deny";
import { useTeamModelGateway } from "./hooks/use-team-model-gateway";
import { useModelPreferenceState } from "./hooks/use-model-preference-state";
import { useModelPickerViewModel } from "./hooks/use-model-picker-view-model";
import { useAppShellState } from "./hooks/use-app-shell-state";
import { useAppOverlayState } from "./hooks/use-app-overlay-state";
import { useMcpAppHostBridge } from "./hooks/use-mcp-app-host-bridge";
import {
  attachmentsWithDataImagePreviews,
  useTurnSubmission,
} from "./hooks/use-turn-submission";
import { useElementInlineSize } from "./hooks/use-element-inline-size";
import { useArtifactPreviewActions } from "./hooks/use-artifact-preview-actions";
import { useFilePreviewPanelLayout } from "./hooks/use-file-preview-panel-layout";
import { useSidebarPreferences } from "./hooks/use-sidebar-preferences";
import { useSidebarResizeController } from "./hooks/use-sidebar-resize-controller";
import { useUiPreferences } from "./hooks/use-ui-preferences";
import {
  useCommandPanelActions,
  type McpServerFormAction,
  type McpToolFormAction,
} from "./hooks/use-command-panel-actions";
import { useBackgroundAgentPanel } from "./hooks/use-background-agent-panel";
import { useAppBackedPanelRefresh } from "./hooks/use-app-backed-panel-refresh";
import { useCommandPanelFileSearch } from "./hooks/use-command-panel-file-search";
import { useSkillsPanelRefresh } from "./hooks/use-skills-panel-refresh";
import { useThreadActions } from "./hooks/use-thread-actions";
// codex: app-shell-*.js — back/forward boundary helpers backing the
// ConversationChrome arrow buttons. Reducer keeps the stack in
// state.threadHistoryStack / state.threadHistoryIndex (see thread-history.ts).
import { canNavigateBackInHistory, canNavigateForwardInHistory } from "./state/thread-history";
import { artifactPreviewTabId, projectArtifactPreview, shouldOpenArtifactPreview } from "./state/artifact-preview";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_MODEL_REASONING_SUMMARY,
  encodeSelection,
  EMPTY_MODEL,
  buildModelConfigFromConfig,
  isModelProviderConfigured,
  normalizeModelConfig,
} from "./model/model-settings";
import {
  CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
  isCrossAccountModelSelectionForThread,
} from "./model/model-provider-switch";
import {
  isSettingsModelProviderExcluded,
  omitThreadModelSelection,
  SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
} from "./model/model-selection-context";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
  selectActiveThreadRuntime,
  selectItemsByThread,
  type PendingServerRequest,
  type ThreadContextDefaults,
} from "./state/codex-reducer";
import {
  accountRefreshScopeForNotification,
  authModeFromAccountUpdatedNotification,
  isSuccessfulAccountLoginCompletedNotification,
  beginAccountStateRefresh,
  hasOpenAiCredentialSummary,
  initialAccountState,
  logoutAndRefreshAccountState,
  projectComposerQuotaBanner,
  projectAccountViewModel,
  refreshAccountState,
  type AccountState,
} from "./state/account-state";
import {
  PLAN_IMPLEMENTATION_REQUEST_METHOD,
  buildApprovalResult,
  buildStopPendingRequestResult,
  planImplementationFollowUpText,
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
  collectBackgroundSubagentStopThreadIds,
  mergeBackgroundSubagentStopThreadIds,
} from "./state/background-subagents-stop";
import { resolveHiCodexBuildInfo } from "./state/build-info";
import { projectBranchDetails } from "./state/branch-details";
import {
  normalizeWorkspaceRoot,
  projectSidebarThreads,
  projectSidebarWorkspaceRootOptions,
  sidebarThreadRelativeTime,
  workspaceRootOptionsWithCurrent,
  threadProjectLabel,
} from "./state/sidebar-projection";
import {
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
} from "./state/sidebar-preferences";
import {
  fileReferenceSidePanelContextMenuItems,
  fileReferenceSidePanelTabKind,
  fileReferenceSidePanelTabId,
  type FileReferenceSelection,
} from "./state/file-references";
import {
  applySlashCommand,
  composerAttachmentsFromPaths,
  composerPlaceholderText,
  mergeComposerAttachments,
  projectComposerSubmitState,
  type ComposerAttachment,
  type ComposerMentionMarker,
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
  commandPanelThreadGroup,
  isCommandMenuPanel,
  orderCommandPanelThreadsByPinned,
  type CommandPanelKind,
  type CommandPanelState,
} from "./state/command-panel";
// codex: electron-menu-shortcuts-*.js — hotkey + command registry wiring.
import { useHotkey } from "./hooks/use-hotkey";
import {
  commandAccelerator,
  commandAccelerators,
  getCommand,
  mouseNavigationDirection,
  osRevealLabel,
  registerCommand,
  unregisterCommand,
} from "./state/command-registry";
import { COMMAND_DESCRIPTORS, COMMAND_IDS } from "./state/commands";
import {
  buildConfigBatchWriteParams,
  formatConfigWriteError,
  readConfigWriteTarget,
} from "./state/config-write-target";
import { threadIdFromCodexDeepLink } from "./state/deep-links";
import {
  permissionModeFromThreadContext,
  permissionModeThreadSettingsPatch,
  type PermissionMode,
} from "./state/permissions-mode";
import {
  basenameFromPath,
  WorkspaceFuzzyFileSearchController,
} from "./state/fuzzy-file-search-session";
import {
  dedupeComposerMentionOptions,
  mentionOptionsFromAgentThreads,
  mentionOptionsFromAppsResponse,
  mentionOptionsFromConfiguredAgentsResponse,
  mentionOptionsFromFuzzyFiles,
  mentionOptionsFromPluginsResponse,
  mentionOptionsFromSkillsResponse,
} from "./state/mention-options";
import {
  type HooksSettingsFocus,
} from "./state/hooks-review";
import {
  appRegistryEntriesFromResponse,
  isThreadStatusInProgress,
  projectConversation,
  type AppRegistryEntry,
  type RailEntry,
  type RailEntryReference,
} from "./state/render-groups";
import {
  invalidateAppList,
  loadAllApps,
} from "./state/app-list";
import { claimAppConnectOAuthCallback } from "./state/app-connect-oauth";
import {
  deriveActivePendingRequests,
  deriveBackgroundPendingRequests,
  deriveComposerPendingRequests,
  heartbeatPendingRequestType,
  pendingRequestOwnerThreadId,
  pendingRequestScope,
  summarizePendingRequestAwaitingByThread,
} from "./state/pending-request-scope";
import {
  nextOpenFileWatchRefreshKey,
  openFileWatchTargetsFromSidePanelTabs,
  watchIdFromFsChangedNotification,
  type OpenFileWatchTarget,
} from "./state/open-file-watches";
import {
  claimHiCodexImageToolRequest,
  executeHiCodexImageToolCall,
  imageToolFailureText,
  isHiCodexImageToolCall,
  loadImageGenerationSettings,
  saveImageGenerationSettings,
  shouldRegisterHiCodexImageDynamicTool,
  type ImageGenerationSettings,
} from "./state/image-generation-tool";
import {
  browserStorage,
  memoriesRootFromCodexHome,
  slashCommandEntries,
  threadGitBranch,
} from "./state/app-shell-helpers";
import { HICODEX_DESKTOP_CONFIG_KEYS } from "./state/hicodex-desktop-namespace";
import {
  createHostPendingWorktree,
  loadComposerWorkMode,
  projectWorktreeModeOptions,
  saveComposerWorkMode,
  selectableComposerWorkMode,
  type ComposerWorkMode,
  type PendingWorktree,
} from "./state/worktrees";
import {
  completeProjectlessOnboarding,
  dismissFirstNewThreadPromos,
  loadOnboardingSnapshot,
  shouldShowFirstNewThreadPromo,
  shouldShowOnboardingEmptyState,
} from "./state/onboarding";
import {
  loadSettingsPanelContent,
} from "./state/settings-panel-loader";
import {
  DESKTOP_RIGHT_RAIL_GAP_PX,
  projectRightRailSections,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
} from "./state/right-rail";
import { openBrowserRuntime } from "./state/browser-runtime";
import { TAB_KINDS } from "./state/side-panel-tab-host";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import { appendRpcDebugEvent } from "./state/rpc-debug";
import { nextToggleThemeMode } from "./state/theme";
import {
  applyThreadFindMarks,
  clampThreadFindIndex,
  clearThreadFindMarks,
  collectThreadFindUnitsFromDom,
  findThreadFindMatches,
  nextThreadFindIndex,
  scrollThreadFindMatchIntoView,
  type ThreadFindMatch,
} from "./state/thread-find";
import {
  refreshThreads,
  refreshThreadMetadata,
  resumeThreadWithMetadataRead,
  interruptThreadTurn,
  readThread,
  readWorkspaceDeveloperInstructions,
  cleanBackgroundTerminalsForThread,
  isProjectlessWorkspace,
  readInProgressTurnId,
  refreshThreadContextDefaults,
  threadTitle,
  type TurnStartOptions,
  withWorkspaceDeveloperInstructions,
} from "./state/thread-workflow";

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

const LOCAL_SIDE_PANEL_HOST_ID = "local";

const NO_READY_MODEL_PROVIDER_MESSAGE =
  "没有可用的模型服务：请先登录团队服务，或在 设置 → 模型 配置个人模型地址";

interface HiCodexClientCallbacks {
  onNotification: (message: JsonRpcNotification) => void;
  onDebugEvent: (event: RpcDebugEvent) => void;
}

interface HiCodexAppBodyProps {
  state: CodexUiState;
  clientCallbacksRef: MutableRefObject<HiCodexClientCallbacks>;
  fileSearchControllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
}

/*
 * HiCodexAppBody holds the entire workbench: every feature hook, derivation, and
 * the full JSX tree. It renders inside the shell's <ServicesProvider>, so it (and
 * its subtree) reads the JSON-RPC client + reducer dispatch via useServices()
 * instead of owning them. `state` and the two client-owned refs come from the
 * shell as props; connect / ensureConnected / auto-reconnect remain defined here
 * (unmoved) so no effect changes position.
 */
function HiCodexAppBody({ state, clientCallbacksRef, fileSearchControllerRef }: HiCodexAppBodyProps) {
  const { client, dispatch } = useServices();
  const buildInfo = useMemo(() => resolveHiCodexBuildInfo(
    (import.meta as unknown as { env?: Record<string, unknown> }).env,
  ), []);
  const [input, setInput] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [followUpQueueingEnabled, setFollowUpQueueingEnabled] = useState(true);
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
   * The previous HiCodex implementation kept a separate `rightRailOpen` flag
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
  // /automations?automationId=…). HiCodex tracks that focus target so the panel
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
  }, [client, state.connected, state.invalidation.authRefresh]);

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
  }, [client, codexAuthSummary, setAccountProjectionState]);

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
  }, [state.connected, state.hostStatus?.codexHome, state.invalidation.authRefresh]);

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
  const threadIds = useMemo(() => state.threads.map((thread) => thread.id), [state.threads]);
  const activeTurnId = activeThreadRuntime.activeTurnId;
  const itemsByThread = useMemo(() => selectItemsByThread(state), [state.threadsRuntime]);
  const activeThreadRunning = Boolean(activeTurnId) || isThreadStatusInProgress(activeThread?.status);
  const worktreeStatusCwd = activeThread?.cwd?.trim() || workspace.trim();
  // Turn-diff Undo / Reapply (state + re-entrancy lock + handler) lives in
  // useTurnPatchAction; ConversationView gets onPatchAction, the failure dialog reads patchFailure.
  const { handlePatchAction, patchActionState, patchActionInFlight, patchFailure, setPatchFailure } =
    useTurnPatchAction({ worktreeStatusCwd });
  const { worktreeHostGitStatus, pullRequestStatus } = useWorktreeGitAndPrStatus({ worktreeStatusCwd });
  const activeProgressPlan = activeThreadRuntime.turnPlan;
  const conversation = useMemo(
    () => projectConversation(activeItems, {
      appRegistry,
      isThreadRunning: activeThreadRunning,
      mcpServerStatuses,
      parentThreadAttachmentSourceConversationId: activeThread?.forkedFromId ?? null,
      progressPlan: activeProgressPlan,
    }),
    [activeItems, activeProgressPlan, activeThread?.forkedFromId, activeThreadRunning, appRegistry, mcpServerStatuses],
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
  const pendingRequestAwaitingByThread = useMemo(
    () => summarizePendingRequestAwaitingByThread(state.pendingRequests, { itemsByThread }),
    [itemsByThread, state.pendingRequests],
  );
  const handledImageToolRequestIdsRef = useRef(new Set<string>());
  useHiCodexImageToolResponder({
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
    () => shouldRegisterHiCodexImageDynamicTool(imageGenerationSettings),
    [imageGenerationSettings],
  );
  const activeDiff = activeThreadRuntime.turnDiff;
  const showLiveTurnDiffPortal = shouldRenderLiveTurnDiffPortal({
    diff: activeDiff,
    isThreadRunning: activeThreadRunning,
    hasBlockingRequest: activePendingRequests.length > 0,
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
  const autoConnectStarted = useRef(false);

  const connect = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "connecting", value: true });
    try {
      await client.connect();
      dispatch({ type: "connected", value: true });
      setReconnectAttempt(0);
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
      // A transient collaborationMode/list failure (its 120s timeout / a sidecar restart)
      // must NOT wipe an already-loaded catalog: clearing it makes plan mode "unavailable"
      // after it had been working — i.e. "plan auto-stops after a while". Keep prior state.
      // Once the catalog holds plan, collaborationModesForComposerMode serves it from state
      // and never re-fetches, so a later failure can no longer drop plan availability.
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
    const timer = window.setInterval(() => {
      void client.refreshStatus().catch((error) => {
        dispatch({ type: "log", text: `host_status failed: ${formatError(error)}`, level: "warn" });
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [client]);

  useEffect(() => {
    if (!autoConnectStarted.current) return;
    if (state.connected || state.connecting) return;
    const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(reconnectAttempt, 5)));
    const timer = window.setTimeout(() => {
      setReconnectAttempt((current) => current + 1);
      void connect();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [connect, reconnectAttempt, state.connected, state.connecting]);

  /*
   * CODEX-REF: projectless default. Codex starts every session PROJECTLESS — the
   * composer workspace-roots default to the `~` sentinel (no project selected), so a
   * first chat lands in "Chats" with a generated ~/Documents/Codex/<date>/<slug> cwd.
   * HiCodex models the unselected workspace as the empty string (see
   * `isProjectlessWorkspace`), so we deliberately do NOT seed `workspace` from the
   * host's defaultCwd ($HOME) anymore — seeding $HOME made every new chat look like a
   * "$HOME project" and (via the old `workspace === defaultCwd` rule) forced it
   * projectless even when the user explicitly picked $HOME as a project. `workspace`
   * is promoted to a real path only when the user opens a project thread (the
   * activeThread.cwd sync effect below) or selects a folder (`selectWorkspaceRoot`).
   */

  useEffect(() => {
    const threadCwd = activeThread?.cwd?.trim();
    if (!threadCwd) return;
    setWorkspace((current) => current === threadCwd ? current : threadCwd);
  }, [activeThread?.cwd]);

  useEffect(() => {
    const currentWorkspace = workspace.trim();
    if (!currentWorkspace) {
      setWorkspaceDeveloperInstructions(null);
      return;
    }
    let cancelled = false;
    setWorkspaceDeveloperInstructions((current) => (
      current?.workspace === currentWorkspace ? current : { workspace: currentWorkspace, value: null }
    ));
    void readWorkspaceDeveloperInstructions(currentWorkspace, { codexHome: state.hostStatus?.codexHome })
      .then((value) => {
        if (!cancelled) setWorkspaceDeveloperInstructions({ workspace: currentWorkspace, value });
      })
      .catch((error) => {
        if (cancelled) return;
        setWorkspaceDeveloperInstructions({ workspace: currentWorkspace, value: null });
        dispatch({ type: "log", text: `workspace instructions load failed: ${formatError(error)}`, level: "warn" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.hostStatus?.codexHome, workspace]);

  useEffect(() => {
    if (!state.connected) return;
    void refreshThreadContextDefaults(client, dispatch, workspace)
      .then((config) => {
        if (config) {
          const draft = buildModelConfigFromConfig(config, {
            excludedProviderIds: SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
          });
          setModelDraft(draft);
          // The draft above may be the factory placeholder; only a provider
          // with a saved config.toml entry participates in default/fallback
          // resolution.
          setPersonalProviderConfigured(isModelProviderConfigured(config, draft.id));
        }
      });
  }, [client, state.connected, workspace]);

  useEffect(() => {
    if (activeSettingsPanel !== "models" || !state.connected) return;
    if (!isSettingsModelProviderExcluded(modelDraft.id.trim())) return;
    void refreshThreadContextDefaults(client, dispatch, workspace)
      .then((config) => {
        if (config) {
          setModelDraft(buildModelConfigFromConfig(config, {
            excludedProviderIds: SETTINGS_MODEL_PROVIDER_EXCLUDED_IDS,
          }));
        }
      });
  }, [activeSettingsPanel, client, dispatch, modelDraft.id, state.connected, workspace]);

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
  }, [client, state.invalidation.mcpStatus, state.connected]);

  useEffect(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [state.activeThreadId]);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  const loadPermissionsRequirements = useCallback(async () => {
    if (!(await ensureConnected())) return undefined;
    return client.request<unknown>("configRequirements/read", {}, 120_000);
  }, [client, ensureConnected]);
  const handlePermissionsRequirementsError = useCallback((error: unknown) => {
    dispatch({
      type: "log",
      text: `Failed to load permission requirements: ${formatError(error)}`,
      level: "warn",
    });
  }, [dispatch]);
  const handleModelPickerOpen = useCallback(() => {
    dispatch({ type: "invalidateAuth" });
  }, [dispatch]);
  const {
    closeKeyboardShortcuts,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    keyboardShortcutsOpen,
    modelPickerAnchor,
    openKeyboardShortcuts,
    permissionsPickerAnchor,
    permissionsRequirements,
    reasoningPickerAnchor,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
  } = useAppOverlayState({
    loadPermissionsRequirements,
    onModelPickerOpen: handleModelPickerOpen,
    onPermissionsRequirementsError: handlePermissionsRequirementsError,
  });

  const restartRuntimeForProviderSwitch = useCallback(async (): Promise<boolean> => {
    try {
      await client.disconnect();
      dispatch({ type: "connected", value: false });
      dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
      return await connect();
    } catch (error) {
      dispatch({
        type: "log",
        text: `provider switch runtime restart failed: ${formatError(error)}`,
        level: "warn",
      });
      return false;
    }
  }, [client, connect, dispatch]);

  const {
    provider: teamModelGatewayProvider,
    handleModelSelect,
  } = useTeamModelGateway({
    client,
    dispatch,
    connect,
    connected: state.connected,
    codexHome: state.hostStatus?.codexHome,
    threadContextDefaults: state.threadContextDefaults,
    personalModelDraft: modelDraft,
    selectedModelKey,
    setSelectedModelKey,
    refreshKey: modelPickerAnchor,
  });

  const {
    modelPickerProviders,
    readyProviders,
    decodedSelectedModelSelection,
    decodedActiveThreadModelSelection,
    defaultModelSelection,
    activeThreadDisplayModelSelection,
    effectiveModelSelection,
    modelPickerDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerOverlayDefaultKey,
  } = useModelPickerViewModel({
    modelDraft,
    personalProviderConfigured,
    threadContextDefaults: state.threadContextDefaults,
    activeThreadId: state.activeThreadId,
    activeThreadModelProvider: activeThread?.modelProvider ?? null,
    activeThreadResolvedModel: state.activeThreadId
      ? state.threadsRuntime[state.activeThreadId]?.resolvedModel ?? null
      : null,
    selectedModelKey,
    threadModelSelections,
    codexAuthSummary,
    oauthAuthMethod,
    teamModelGatewayProvider,
  });
  /*
   * Provider context for the composer model chip tooltip ("团队模型 ·
   * 127.0.0.1:5050"). Personal and team gateways can serve identically named
   * models, so the chip alone cannot disambiguate which service a send hits.
   */
  const composerModelProviderHint = useMemo(() => {
    const providerId = state.activeThreadId
      ? activeThreadDisplayModelSelection?.providerId
      : decodedSelectedModelSelection?.providerId
        ?? (!effectiveModelSelection.noReadyProvider ? effectiveModelSelection.providerId : null);
    if (!providerId) return null;
    const provider = modelPickerProviders.find((candidate) => candidate.id === providerId);
    return provider ? `${provider.label} · ${provider.host}` : null;
  }, [
    activeThreadDisplayModelSelection?.providerId,
    decodedSelectedModelSelection?.providerId,
    effectiveModelSelection.noReadyProvider,
    effectiveModelSelection.providerId,
    modelPickerProviders,
    state.activeThreadId,
  ]);
  const composerSubmitState = useMemo(() => projectComposerSubmitState({
    input,
    attachmentCount: composerAttachments.length,
    connecting: state.connecting,
    threadRunning: activeThreadRunning,
    activeTurnId,
    pendingRequestCount: activePendingRequests.length,
    queueingEnabled: followUpQueueingEnabled,
    /*
     * New chats with no usable provider (team signed out, no personal
     * provider saved, no subscription) block the send with guidance instead
     * of silently dispatching to a dead endpoint. Existing chats keep their
     * birth provider and are not gated here.
     */
    modelUnavailableReason: !state.activeThreadId && effectiveModelSelection.noReadyProvider
      ? NO_READY_MODEL_PROVIDER_MESSAGE
      : undefined,
  }), [
    activeThreadRunning,
    activeTurnId,
    activePendingRequests.length,
    composerAttachments.length,
    effectiveModelSelection.noReadyProvider,
    followUpQueueingEnabled,
    input,
    state.activeThreadId,
    state.connecting,
  ]);

  /*
   * Effective ThreadContextDefaults for thread/start + thread/fork calls.
   * If the user picked a (provider, model) pair in the UI picker, override
   * the config.toml default's model + modelProvider. Otherwise pass through
   * unchanged. Workspace AGENTS.md / CLAUDE.md instructions are appended here
   * so thread/start, thread/fork, and side conversations share the same context.
   */

  const effectiveThreadContextDefaults = useMemo(() => {
    /*
     * Birth binding: an active thread only gets a model/provider override
     * when the user explicitly re-picked one FOR THAT THREAD; the global
     * picker intent applies to new chats only. Without an override the
     * model selection is omitted, so resume/turn params keep the thread's
     * recorded provider.
     */
    const picked = state.activeThreadId
      ? decodedActiveThreadModelSelection
      : decodedSelectedModelSelection;
    const shouldApplyDefaultModelSelection = !state.activeThreadId;
    let modelContext = picked ? {
      ...(state.threadContextDefaults ?? {}),
      model: picked.model,
      modelProvider: normalizeSubscriptionProviderId(picked.providerId),
    } : shouldApplyDefaultModelSelection
      ? state.threadContextDefaults
      : omitThreadModelSelection(state.threadContextDefaults);
    /*
     * Apply the not-signed-in fallback: when the intended provider is not ready
     * but another is, send to the ready (provider, model) instead. Skip when
     * nothing is ready (the composer surfaces a sign-in prompt and disables send).
     */
    if ((picked || shouldApplyDefaultModelSelection)
      && !effectiveModelSelection.noReadyProvider
      && (effectiveModelSelection.providerId !== (modelContext?.modelProvider ?? "")
        || effectiveModelSelection.model !== (modelContext?.model ?? ""))) {
      modelContext = {
        ...(modelContext ?? {}),
        model: effectiveModelSelection.model,
        modelProvider: effectiveModelSelection.providerId,
      };
    }
    /*
     * CODEX-REF: composer-*.js — m.reasoningEffort 由 setModelAndReasoningEffort
     * 写入 modelSettings，渲染时取这个值给 picker 和送给后端。HiCodex 把 user 切换
     * 后的 effort 通过 reasoningEffortOverride 覆盖 thread context 默认值。
     */
    if (reasoningEffortOverride) {
      modelContext = {
        ...(modelContext ?? {}),
        reasoningEffort: reasoningEffortOverride,
      };
    }
    const workspaceInstructions = workspaceDeveloperInstructions?.workspace === workspace.trim()
      ? workspaceDeveloperInstructions.value
      : null;
    return withWorkspaceDeveloperInstructions(modelContext, workspaceInstructions);
  }, [decodedActiveThreadModelSelection, decodedSelectedModelSelection, effectiveModelSelection, reasoningEffortOverride, state.activeThreadId, state.threadContextDefaults, workspace, workspaceDeveloperInstructions]);
  const handleComposerModelSelect = useCallback((key: string | null) => {
    // Backstop for the picker-level cross-account lock (rows are disabled
    // with an explanation; this guards programmatic callers).
    if (activeThread && isCrossAccountModelSelectionForThread({
      currentProvider: activeThread.modelProvider,
      selectedKey: key,
      fallbackProvider: defaultModelSelection?.providerId ?? state.threadContextDefaults?.modelProvider,
    })) {
      dispatch({
        type: "log",
        text: CROSS_ACCOUNT_PROVIDER_SWITCH_MESSAGE,
        level: "warn",
      });
      return;
    }
    if (activeThread) {
      /*
       * Picking while a chat is active overrides THAT chat. `null` means
       * "the config default row" in picker terms — for an existing thread
       * that is still an explicit switch to the default (provider, model),
       * so pin the resolved key instead of clearing the override.
       */
      setThreadModelSelection(activeThread.id, key ?? modelPickerDefaultKey);
    }
    handleModelSelect(key);
  }, [
    activeThread,
    defaultModelSelection?.providerId,
    dispatch,
    handleModelSelect,
    modelPickerDefaultKey,
    setThreadModelSelection,
    state.threadContextDefaults?.modelProvider,
  ]);
  const handleReasoningSelect = useCallback((effort: string | null) => {
    setReasoningEffortOverride(effort);
  }, [
    setReasoningEffortOverride,
  ]);
  const activeModelSupportsImageInput = useMemo(() => {
    const providerId = effectiveThreadContextDefaults?.modelProvider ?? "";
    const modelSlug = effectiveThreadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    return model?.supportsImageInput !== false;
  }, [effectiveThreadContextDefaults?.model, effectiveThreadContextDefaults?.modelProvider, state.models]);
  /*
   * codex composer reasoning picker: render the effective next-turn model's
   * advertised supportedReasoningEfforts instead of using the config default.
   */
  const activeModelSupportedEfforts = useMemo<readonly ReasoningEffortValue[] | undefined>(() => {
    const providerId = effectiveThreadContextDefaults?.modelProvider ?? "";
    const modelSlug = effectiveThreadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    const efforts = model?.supportedReasoningEfforts;
    if (!efforts || efforts.length === 0) return undefined;
    const normalized = efforts
      .map((effort) => normalizeReasoningEffortValue(effort))
      .filter((effort): effort is ReasoningEffortValue => effort !== null);
    return normalized.length > 0 ? normalized : undefined;
  }, [effectiveThreadContextDefaults?.model, effectiveThreadContextDefaults?.modelProvider, state.models]);
  const composerSelectedModel = effectiveThreadContextDefaults?.model
    ?? normalizeModelConfig(modelDraft).model
    ?? null;
  const composerQuotaBanner = useMemo(
    () => projectComposerQuotaBanner(
      state.account.rateLimitsByLimitId,
      state.account.rateLimits,
      composerSelectedModel,
    ),
    [state.account.rateLimits, state.account.rateLimitsByLimitId, composerSelectedModel],
  );

  const { threadGoalPendingAction, editActiveThreadGoal, setActiveThreadGoalStatus, clearActiveThreadGoal } =
    useThreadGoalActions({ ensureConnected, activeThreadId: state.activeThreadId });

  useReconnectRecovery({
    connected: state.connected,
    activeThreadId: state.activeThreadId,
    workspace,
    effectiveThreadContextDefaults,
  });

  const {
    closeMcpFollowUpDialog,
    confirmMcpFollowUpDialog,
    handleMcpAppHostCall,
    mcpFollowUpDialog,
    readMcpResource,
  } = useMcpAppHostBridge({
    activeThreadId: state.activeThreadId,
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    openSideConversationPanelRef,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });

  const collaborationModesForComposerMode = useCallback(async (mode: ComposerMode): Promise<CollaborationModeMask[]> => {
    if (mode !== "plan" || hasCollaborationModePreset(collaborationModes, "plan")) return collaborationModes;
    return loadCollaborationModes();
  }, [collaborationModes, loadCollaborationModes]);

  // modelPickerProviders, readyProviders + effectiveModelSelection are defined
  // above effectiveThreadContextDefaults (hoisted so the not-signed-in fallback
  // can resolve before the thread-context defaults / composer state are built).

  /*
   * Thread-switch fast path: a thread whose transcript is already in the
   * runtime store renders instantly on re-select — re-reading the full turn
   * payload + re-parsing the rollout on every click made switching feel
   * stuck on slower machines. Subscribed threads stay fresh via
   * notifications; unloaded threads still take the full read path.
   */
  const threadsRuntimeRef = useRef(state.threadsRuntime);
  threadsRuntimeRef.current = state.threadsRuntime;
  const hasLoadedThreadContent = useCallback((threadId: string) => {
    const runtime = threadsRuntimeRef.current[threadId];
    return Boolean(runtime && runtime.items.length > 0);
  }, []);
  const {
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
    selectThread,
    threadActionDialog,
  } = useThreadActions({
    activeThread,
    ensureConnected,
    hasLoadedThreadContent,
    setComposerAttachments,
    setInput,
    threadContextDefaults: effectiveThreadContextDefaults,
    workspace,
  });
  const createWorkbenchThread = useCallback(async () => {
    openWorkbenchTab();
    await createThread();
    requestComposerElementFocus();
  }, [createThread, openWorkbenchTab]);
  const selectWorkbenchThread = useCallback(async (thread: Thread) => {
    openWorkbenchTab();
    const selection = selectThread(thread);
    requestComposerElementFocus();
    await selection;
    requestComposerElementFocus();
  }, [openWorkbenchTab, selectThread]);
  const workspaceRootOptions = useMemo(() => (
    workspaceRootOptionsWithCurrent(
      projectSidebarWorkspaceRootOptions(state.threads),
      [activeThread?.cwd, workspace, ...selectedWorkspaceRoots],
    )
  ), [activeThread?.cwd, selectedWorkspaceRoots, state.threads, workspace]);

  const selectWorkspaceRoot = useCallback((root: string) => {
    const normalized = normalizeWorkspaceRoot(root);
    if (!normalized) return;
    setPendingWorktree((current) => (
      normalizeWorkspaceRoot(current?.path ?? "") === normalized ? current : null
    ));
    setSelectedWorkspaceRoots((current) => (
      current.includes(normalized) ? current : [normalized, ...current]
    ));
    setWorkspace(normalized);
    void createWorkbenchThread();
  }, [createWorkbenchThread]);

  // codex `composer.localCwdDropdown.clearProject` ("Don't work in a project"):
  // drop the active project → projectless ("" sentinel) so the next chat lands in
  // "Chats" with a generated ~/Documents/Codex cwd. Mirrors selectWorkspaceRoot for
  // the no-project state (does NOT add to selectedWorkspaceRoots).
  const selectProjectlessWorkspace = useCallback(() => {
    setPendingWorktree(null);
    setWorkspace("");
    void createWorkbenchThread();
  }, [createWorkbenchThread]);

  const useExistingWorkspaceFolder = useCallback(async () => {
    try {
      const root = await pickWorkspaceFolder();
      if (root) selectWorkspaceRoot(root);
    } catch (error) {
      dispatch({ type: "log", text: `folder picker failed: ${formatError(error)}`, level: "warn" });
    }
  }, [dispatch, selectWorkspaceRoot]);

  const setComposerWorkMode = useCallback(async (mode: ComposerWorkMode) => {
    const selectableMode = selectableComposerWorkMode(mode, composerWorkModeOptions);
    if (selectableMode !== mode) {
      const option = composerWorkModeOptions.find((candidate) => candidate.id === mode);
      dispatch({
        type: "log",
        text: option?.disabledReason ?? `${mode} mode is disabled for the current workspace.`,
        level: "warn",
      });
      return;
    }
    if (mode !== "worktree") {
      setComposerWorkModeState(saveComposerWorkMode(browserStorage(), selectableMode));
      return;
    }
    try {
      const pending = await createHostPendingWorktree({ cwd: worktreeStatusCwd });
      const pendingPath = normalizeWorkspaceRoot(pending.path);
      if (!pendingPath) throw new Error("Host returned an empty pending worktree path.");
      setPendingWorktree(pending);
      setSelectedWorkspaceRoots((current) => (
        current.includes(pendingPath) ? current : [pendingPath, ...current]
      ));
      setWorkspace(pendingPath);
      setComposerWorkModeState(saveComposerWorkMode(browserStorage(), "worktree"));
      await createWorkbenchThread();
      dispatch({
        type: "log",
        text: `Pending worktree ready: ${pendingPath}`,
        level: "info",
      });
    } catch (error) {
      dispatch({ type: "log", text: `create worktree failed: ${formatError(error)}`, level: "error" });
    }
  }, [
    composerWorkModeOptions,
    createWorkbenchThread,
    dispatch,
    worktreeStatusCwd,
  ]);

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
    openSideConversationPanel,
    sendBackgroundAgentPanelMessage,
    sideChatRailEntries,
    setBackgroundAgentMessageDraft,
  } = useBackgroundAgentPanel({
    ensureConnected,
    hostDefaultCwd: state.hostStatus?.defaultCwd,
    activeThreadId: state.activeThreadId,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    threadsRuntime: state.threadsRuntime,
    workspace,
  });
  // Late binding for the MCP side-chat callback defined above this hook's
  // consumer (HiCodexApp.tsx ~2129) — write in an effect, not during render,
  // matching openFilesTabRef / openArtifactPreviewTabRef.
  useEffect(() => {
    openSideConversationPanelRef.current = openSideConversationPanel;
    return () => {
      openSideConversationPanelRef.current = null;
    };
  }, [openSideConversationPanel]);

  const refreshAutomationsPanel = useCallback(async () => {
    setAutomationsPanelOpen(true);
    setAutomationsLoading(true);
    setAutomationsError(null);
    try {
      if (!(await ensureConnected())) {
        setAutomationsPayload(null);
        setAutomationsError("Runtime is offline.");
        return;
      }
      let payload: unknown;
      try {
        payload = await client.request<unknown>("automation/list", { limit: 50 }, 120_000);
      } catch (firstError) {
        const firstMessage = formatError(firstError);
        if (!/method not found|not implemented|unsupported|unknown method/i.test(firstMessage)) {
          throw firstError;
        }
        try {
          payload = await client.request<unknown>("automation/schedule/list", { limit: 50 }, 120_000);
        } catch {
          throw new Error(firstMessage);
        }
      }
      setAutomationsPayload(payload);
      setAutomationsError(null);
    } catch (error) {
      setAutomationsPayload(null);
      setAutomationsError(formatError(error));
    } finally {
      setAutomationsLoading(false);
    }
  }, [client, ensureConnected]);

  // codex: local-conversation-thread-*.js — opening the automations surface.
  // `automationId` is the deep-link focus target from the citation chip `ke`
  // handler; the generic "Automations" entry point passes nothing and the panel
  // opens unfocused (clears any stale focus). Mirrors Codex resolving a specific
  // id (`Km({automationId,…})` / `navigate-to-route ?automationId=…`).
  const openAutomationsPanel = useCallback((automationId?: string | null) => {
    setFocusedAutomationId(automationId?.trim() || null);
    closeFilePreviewPanel();
    closeBackgroundAgentPanel();
    void refreshAutomationsPanel();
  }, [closeBackgroundAgentPanel, closeFilePreviewPanel, refreshAutomationsPanel]);

  // codex: citation chip onClick (`ke`) — deep-link to the *specific* automation
  // the chip references. We thread its id through so the panel scopes/scrolls to
  // that schedule instead of opening the full list.
  const openAutomationFromConversation = useCallback((automationId: string) => {
    openAutomationsPanel(automationId);
  }, [openAutomationsPanel]);

  const composerPlaceholder = composerPlaceholderText({
    hasConversation: conversation.units.length > 0,
    hasBackgroundAgentsPanel: backgroundAgentPanel != null,
    goalMode: composerGoalMode,
  }, formatUiMessage);
  // codex: composer-*.js `/status` panel reads the context usage slice
  // populated by `thread/tokenUsage/updated`.
  const tokenUsageSnapshot = activeThreadRuntime.tokenUsage ?? null;
  // codex: browser-runtime snapshot ownership (state + Tauri boot/listen
  // effects + on-demand refresh + rail projection) lives in useBrowserRuntime.
  // setBrowserRuntimeSnapshot is returned because openBrowserSurface (side-panel
  // tab host wiring, below) pushes live runtime snapshots back through the
  // Browser tab's onRuntimeChange prop into the same state the rail reads.
  const { browserRailInput, refreshBrowserRuntime, setBrowserRuntimeSnapshot } = useBrowserRuntime();
  const rightRailSections = useMemo(
    () => projectRightRailSections({
      progress: conversation.progress,
      /*
       * CODEX-REF: local-conversation-thread-*.js — single-row
       * `automation` section (Vl sectionKey="automation"). Codex bundle 无
       * multi-list automation section，legacy `automations` 传递及对应的
       * `projectAutomationRailEntries` useMemo / import 全部删除（dead code）。
       */
      ...(activeThreadAutomation ? { automation: activeThreadAutomation } : {}),
      branchDetails,
      artifacts: conversation.artifacts,
      showOutputs: !branchDetails.hasData,
      sideChats: sideChatRailEntries,
      backgroundAgents: conversation.backgroundAgents,
      backgroundTerminals: conversation.backgroundTerminals,
      ...(browserRailInput ? { browser: browserRailInput } : {}),
      sources: conversation.sources,
    }),
    [
      activeThreadAutomation,
      branchDetails,
      browserRailInput,
      conversation,
      sideChatRailEntries,
    ],
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
  const automationsPanelEffectiveWidthPx = automationsPanelOpen
    ? backgroundAgentPanelWidthPx(mainWidth)
    : 0;
  const activeSidePanelEffectiveWidthPx = hasFilePreviewSelection
    ? filePreviewPanelEffectiveWidthPx
    : (backgroundAgentPanelEffectiveWidthPx || automationsPanelEffectiveWidthPx);
  const sidePanelRailOffsetPx = hasFilePreviewSelection
    ? (filePreviewPanelLayout.fullWidth ? mainWidth : filePreviewPanelEffectiveWidthPx)
    : activeSidePanelEffectiveWidthPx;
  const rightRailLayoutWidthPx = Math.max(0, mainWidth - sidePanelRailOffsetPx);
  /*
   * Codex Desktop Summary Rail predicate: `shouldShow = !isHiddenByRightPanel && (isPinned && displayMode !== "overlay")`.
   * `isHiddenByRightPanel` is true when a non-overlay rail is forced down by
   * the big AppShell RightPanel. HiCodex's RightPanel
   * equivalent is the file-preview side panel — `hasFilePreviewSelection`
   * drives the same auto-hide rule. Empty sections collapse, matching the
   * `rightRailSections.length > 0` term.
   *
   * codex: new-thread-panel-page-*.js — the empty/new-chat page
   * renders only `<main>` + composer; the summary rail components (`Lu`/`dS`
   * in local-conversation-thread-*.js) live exclusively inside the
   * conversation page tree. HiCodex flattens both pages into one app shell,
   * so we additionally gate on `activeThread` to keep the Environment +
   * Sources rail from leaking into the new-chat onboarding view (the host
   * git status is read from the workspace even without a thread, which would
   * otherwise paint the rail with branchDetails the moment a user opens
   * the app in a git workspace).
   */
  const rightRailMode = rightRailDisplayMode(rightRailLayoutWidthPx);
  const showRightRail = rightRailPinned
    && Boolean(activeThread)
    && rightRailSections.length > 0
    && rightRailMode !== "overlay"
    && !hasFilePreviewSelection;
  const showRightRailPopover = rightRailPopoverOpen
    && Boolean(activeThread)
    && rightRailSections.length > 0
    && rightRailMode === "overlay"
    && !hasFilePreviewSelection;
  useEffect(() => {
    if (
      rightRailMode !== "overlay"
      || !activeThread
      || rightRailSections.length === 0
      || hasFilePreviewSelection
    ) {
      setRightRailPopoverOpen(false);
    }
  }, [activeThread, hasFilePreviewSelection, rightRailMode, rightRailSections.length]);
  const mainLayoutStyle = {
    "--hc-right-panel-offset": `${Math.round(sidePanelRailOffsetPx)}px`,
  } as CSSProperties;
  // Reserve the conversation's right edge for side panels plus the summary rail.
  // Full-width file preview covers the thread instead of pushing it.
  const threadInlineEndInset = (hasFilePreviewSelection && filePreviewPanelLayout.fullWidth)
    ? 0
    : Math.round(
      activeSidePanelEffectiveWidthPx
        + rightRailReservedInlineEndPx(rightRailLayoutWidthPx, showRightRail, rightRailPinned),
    );

  const selectThreadById = useCallback((threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      dispatch({ type: "log", text: `thread not found: ${threadId}`, level: "warn" });
      return;
    }
    void selectWorkbenchThread(thread);
  }, [selectWorkbenchThread, state.threads]);
  const { openRemoteTask, openRemoteTaskExternal } = useRemoteTaskActions({ setActiveRemoteTaskId, setActiveAppTab: changeActiveAppTab });

  const openDeepLinkUrl = useCallback(async (url: string | null | undefined) => {
    const appConnectCallback = claimAppConnectOAuthCallback(url);
    if (appConnectCallback) {
      const appName = appConnectCallback.pending?.appName ?? "Connector";
      if (appConnectCallback.duplicate) {
        dispatch({
          type: "log",
          text: `${appName} OAuth callback was already handled.`,
          level: "info",
        });
        return;
      }
      if (appConnectCallback.oauthError) {
        const detail = appConnectCallback.oauthErrorDescription
          ? `${appConnectCallback.oauthError}: ${appConnectCallback.oauthErrorDescription}`
          : appConnectCallback.oauthError;
        invalidateAppList("app-connect-oauth-callback");
        dispatch({ type: "invalidateAppList", message: `${appName} OAuth failed.` });
        dispatch({
          type: "log",
          text: `${appName} OAuth failed: ${detail}. Refreshing app and plugin state.`,
          level: "error",
        });
        return;
      }
      invalidateAppList("app-connect-oauth-callback");
      dispatch({ type: "invalidateAppList", message: `${appName} OAuth callback received.` });
      dispatch({
        type: "log",
        text: `${appName} OAuth callback received. Refreshing app and plugin state.`,
        level: "info",
      });
      return;
    }
    const threadId = threadIdFromCodexDeepLink(url);
    if (!threadId) {
      dispatch({ type: "log", text: `Unsupported shell link: ${url ?? "missing URL"}`, level: "warn" });
      return;
    }
    const knownThread = state.threads.find((candidate) => candidate.id === threadId);
    if (knownThread) {
      await selectWorkbenchThread(knownThread);
      dispatch({ type: "log", text: `Opened thread from deeplink: ${threadId}`, level: "info" });
      return;
    }
    if (!(await ensureConnected())) return;
    try {
      const result = await resumeThreadWithMetadataRead(client, threadId, workspace, effectiveThreadContextDefaults);
      openWorkbenchTab();
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
      dispatch({ type: "log", text: `Opened thread from deeplink: ${threadId}`, level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: `Failed to open deeplink ${threadId}: ${formatError(error)}`, level: "error" });
    }
  }, [client, effectiveThreadContextDefaults, ensureConnected, openWorkbenchTab, selectWorkbenchThread, state.threads, workspace]);

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
    const visibleThreads = projectSidebarThreads(state.threads, { sortKey: sidebarPreferences.sortKey });
    const orderedThreads = orderCommandPanelThreadsByPinned(visibleThreads, pinnedThreadIds);
    openCommandPanel("generic", {
      status: "ready",
      title: "Search chats",
      message: "",
      entries: orderedThreads.map((thread): CommandPanelEntry => ({
        id: `thread:${thread.id}`,
        title: threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null),
        kind: "thread",
        ...commandPanelThreadGroup(thread.id, pinnedThreadIds),
        meta: threadProjectLabel(thread),
        status: sidebarThreadRelativeTime(thread),
        action: { type: "selectThread", threadId: thread.id },
      })),
      searchable: true,
    });
  }, [openCommandPanel, pinnedThreadIds, sidebarPreferences.sortKey, state.threads, state.threadsRuntime]);

  const commandMenuEntries = useCallback((): CommandPanelEntry[] => {
    const visibleThreads = projectSidebarThreads(state.threads, { sortKey: sidebarPreferences.sortKey });
    const orderedThreads = orderCommandPanelThreadsByPinned(visibleThreads, pinnedThreadIds);
    const workspaceRoot = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    const activeThreadPinned = activeThread ? pinnedThreadIds.has(activeThread.id) : false;
    const fileSearchEntries: CommandPanelEntry[] = workspaceRoot ? [{
      id: "command:search-files",
      title: "Search files",
      kind: "file",
      meta: workspaceRoot,
      status: "Files",
      details: ["Search workspace files and attach a mention to the composer."],
      action: { type: "openFileSearch", title: "Search files" },
    }] : [];
    const threadPinEntries: CommandPanelEntry[] = activeThread ? [{
      id: "command:toggle-thread-pin",
      title: "Pin/unpin chat",
      kind: "thread",
      meta: threadTitle(activeThread, state.threadsRuntime[activeThread.id]?.items ?? null),
      status: activeThreadPinned ? "Pinned" : "Unpinned",
      details: ["Toggle pinned state for the current chat."],
      action: {
        type: "setThreadPinned",
        title: "Pin/unpin chat",
        threadId: activeThread.id,
        pinned: !activeThreadPinned,
      },
    }] : [];
    return [
      ...slashCommandEntries(composerMode),
      ...fileSearchEntries,
      ...threadPinEntries,
      ...orderedThreads.map((thread): CommandPanelEntry => ({
        id: `command-thread:${thread.id}`,
        title: threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null),
        kind: "thread",
        ...commandPanelThreadGroup(thread.id, pinnedThreadIds),
        meta: threadProjectLabel(thread),
        status: sidebarThreadRelativeTime(thread),
        details: ["Past chat"],
        action: { type: "selectThread", threadId: thread.id },
      })),
    ];
  }, [activeThread, composerMode, pinnedThreadIds, sidebarPreferences.sortKey, state.hostStatus?.defaultCwd, state.threads, state.threadsRuntime, workspace]);

  const openCommandMenu = useCallback(() => {
    openCommandPanel("generic", {
      status: "ready",
      title: "Search commands and chats",
      message: "",
      entries: commandMenuEntries(),
      searchable: true,
    });
  }, [commandMenuEntries, openCommandPanel]);

  const {
    closeCommandPanel,
    openFileSearchPanel,
    searchCommandMenuFromPanel,
    searchFilesFromCommandPanel,
    searchWorkspaceFilesForFilesTab,
  } = useCommandPanelFileSearch({
    activeThreadCwd: activeThread?.cwd,
    commandMenuEntries,
    commandPanel,
    defaultCwd: state.hostStatus?.defaultCwd,
    dispatch,
    ensureConnected,
    fileSearchControllerRef,
    setCommandPanel,
    workspace,
  });

  const loadSettingsPanel = useCallback(async (
    panel: SettingsPanelId,
    options: { forceReload?: boolean; hooksFocus?: HooksSettingsFocus | null } = {},
  ) => {
    setActiveSettingsPanel(panel);
    setCommandPanel(null);
    await loadSettingsPanelContent({
      activeTurnId,
      client,
      ensureConnected,
      forceReload: options.forceReload === true,
      hooksFocus: options.hooksFocus ?? null,
      includeImageDynamicTool,
      notificationPreferences,
      openSettingsPanelContent,
      panel,
      pendingWorktree,
      setSettingsPanelState,
      state,
      uiLocale,
      uiTheme: uiThemeSnapshot,
      uiAppearance,
      workMode: composerWorkMode,
      workspace,
    });
  }, [
    activeTurnId,
    client,
    composerWorkMode,
    ensureConnected,
    includeImageDynamicTool,
    notificationPreferences,
    openSettingsPanelContent,
    pendingWorktree,
    state,
    uiLocale,
    uiThemeSnapshot,
    uiAppearance,
    workspace,
  ]);

  const refreshActiveSettingsPanel = useCallback(() => {
    if (!activeSettingsPanel) return;
    void loadSettingsPanel(activeSettingsPanel, { forceReload: true });
  }, [activeSettingsPanel, loadSettingsPanel]);

  const { hooksReviewSnapshot, trustAllHooks, reviewHooks } = useHooksReview({
    hooksChangedNonce: state.invalidation.hooks,
    ensureConnected,
    loadSettingsPanel,
    activeThread,
    workspace,
    defaultCwd: state.hostStatus?.defaultCwd,
  });
  const showHooksReviewBanner = !activeThread
    && (hooksReviewSnapshot?.count ?? 0) > 0
    && input.trim().length === 0
    && composerAttachments.length === 0;

  /*
   * codex: app-shell-tab-controller-*.js `x({ panelId: 'right', panelOpen$, setPanelOpen })`
   * factory + `RightPanelOutlet`/`RightPanelTabs`/`RightPanelTabsEmptyState`
   * slot wiring in app-shell-*.js + 4-card landing page in
   * thread-app-shell-chrome-*.js.
   *
   * `sidePanel` mirrors Codex's right-panel tab controller singleton. The Files
   * card opens a `file-tree` tab whose Component is HiCodex's existing
   * `WorkspaceFilesPanel` wrapped as `FilesTabContent`; the Browser card opens
   * the runtime-backed Browser control tab once the Tauri bridge is available.
   * Terminal/Timeline/Side chat/Review stay omitted until HiCodex has matching
   * host/protocol-backed implementations.
   */
  const sidePanel = useSidePanelTabHost({ panelId: "right" });
  /*
   * Stable tabId for the Files tab. Codex auto-generates `component:${UUID}`
   * for tabs without explicit id (app-shell-tab-controller-*.js),
   * which dedupes per Component reference. HiCodex pins the id so the ⌘⇧E
   * shortcut can deterministically check tab presence by id.
   */
  const FILES_TAB_ID = "file-tree";
  const openBrowserSurface = useCallback((tabId?: string | null) => {
    const normalizedTabId = tabId?.trim() || undefined;
    const sidePanelTabId = normalizedTabId ? `browser:${normalizedTabId}` : "browser";
    sidePanel.controller.openTab({
      id: sidePanelTabId,
      kind: TAB_KINDS.browser,
      Component: BrowserTabContent,
      title: "Browser",
      tooltip: "Browser",
      icon: <Globe size={14} aria-hidden="true" />,
      props: {
        ...(normalizedTabId ? { initialTabId: normalizedTabId } : {}),
        onRuntimeChange: setBrowserRuntimeSnapshot,
      },
    });
    if (normalizedTabId) {
      void openBrowserRuntime(null, normalizedTabId).then(setBrowserRuntimeSnapshot);
      return;
    }
    void refreshBrowserRuntime();
  }, [refreshBrowserRuntime, sidePanel]);

  // codex: electron-menu-shortcuts-*.js (`toggleFileTreePanel` default = ⌘⇧E)
  // The legacy `workspaceFilesPanelOpen` flag is gone; the shortcut now routes
  // through the side-panel tab host. Behaviour matches Codex's
  // `toggleFileTreePanel` (an open-or-focus action that lands on the Files
  // tab) — opening if the tab isn't present, activating it if it is, closing
  // the panel only when the user explicitly hits the close button.
  //
  // The actual "create new Files tab" closure lives in a ref so it can be
  // re-assigned later in the component body once `openFileReferenceExternal`
  // (from `useArtifactPreviewActions`, declared further down) is in scope.
  // Defining the toggle here keeps the command-registration effect happy
  // (which expects `toggleWorkspaceFilesPanel` as a dep above its use) while
  // avoiding a TDZ on the later-declared destructured value.
  const openFilesTabRef = useRef<(() => void) | null>(null);
  const openFileWatchTargetsRef = useRef(new Map<string, OpenFileWatchTarget>());
  useEffect(() => {
    const refreshTabsForWatch = (watchId: string) => {
      const target = openFileWatchTargetsRef.current.get(watchId);
      if (!target) return;
      const snapshot = sidePanel.controller.getSnapshot();
      for (const tabId of target.tabIds) {
        const tab = snapshot.tabsById[tabId];
        if (!tab) continue;
        sidePanel.controller.updateTab(tabId, {
          props: {
            ...tab.props,
            refreshKey: nextOpenFileWatchRefreshKey(tab.props.refreshKey),
          },
        });
      }
    };
    refreshOpenFileWatchTabsRef.current = refreshTabsForWatch;
    return () => {
      if (refreshOpenFileWatchTabsRef.current === refreshTabsForWatch) {
        refreshOpenFileWatchTabsRef.current = null;
      }
    };
  }, [sidePanel.controller]);

  useEffect(() => {
    if (!state.connected) {
      openFileWatchTargetsRef.current = new Map();
      return;
    }

    const nextTargets = new Map(
      openFileWatchTargetsFromSidePanelTabs(sidePanel.tabs)
        .map((target) => [target.watchId, target] as const),
    );
    const previousTargets = openFileWatchTargetsRef.current;

    for (const watchId of previousTargets.keys()) {
      if (nextTargets.has(watchId)) continue;
      void Promise.resolve()
        .then(() => client.request("fs/unwatch", { watchId }, 10_000))
        .catch((error: unknown) => {
          dispatch({ type: "log", text: `fs/unwatch ${watchId} failed: ${formatError(error)}`, level: "warn" });
        });
    }

    for (const target of nextTargets.values()) {
      if (previousTargets.has(target.watchId)) continue;
      void Promise.resolve()
        .then(() => client.request("fs/watch", { watchId: target.watchId, path: target.watchPath }, 10_000))
        .catch((error: unknown) => {
          dispatch({ type: "log", text: `fs/watch ${target.watchPath} failed: ${formatError(error)}`, level: "warn" });
        });
    }

    openFileWatchTargetsRef.current = nextTargets;
  }, [client, sidePanel.tabs, state.connected]);

  useEffect(() => {
    return () => {
      const watchIds = [...openFileWatchTargetsRef.current.keys()];
      openFileWatchTargetsRef.current = new Map();
      for (const watchId of watchIds) {
        void Promise.resolve()
          .then(() => client.request("fs/unwatch", { watchId }, 10_000))
          .catch(() => undefined);
      }
    };
  }, [client]);

  const toggleWorkspaceFilesPanel = useCallback(() => {
    const snapshot = sidePanel.controller.getSnapshot();
    const filesTabExists = snapshot.tabsById[FILES_TAB_ID] != null;
    const filesActive = snapshot.activeTabId === FILES_TAB_ID;
    if (sidePanel.panelOpen && filesActive) {
      sidePanel.setPanelOpen(false);
      return;
    }
    if (filesTabExists) {
      sidePanel.controller.activateTab(FILES_TAB_ID);
      sidePanel.setPanelOpen(true);
      return;
    }
    openFilesTabRef.current?.();
  }, [sidePanel]);
  // codex: use-hotkey-*.js — composer auto-focus on plain-text keypresses
  // stays a non-hotkey listener (it is not modifier-gated).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      focusComposerFromPlainTextKey(event);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // codex: electron-menu-shortcuts-*.js — derive prev/next thread IDs
  // from the visible thread list so the hotkey handlers can dispatch instantly.
  const previousThreadId = useMemo<string | null>(() => {
    if (!state.activeThreadId) return null;
    const index = state.threads.findIndex((t) => t.id === state.activeThreadId);
    if (index <= 0) return null;
    return state.threads[index - 1]?.id ?? null;
  }, [state.activeThreadId, state.threads]);
  const nextThreadId = useMemo<string | null>(() => {
    if (!state.activeThreadId) return null;
    const index = state.threads.findIndex((t) => t.id === state.activeThreadId);
    if (index < 0 || index >= state.threads.length - 1) return null;
    return state.threads[index + 1]?.id ?? null;
  }, [state.activeThreadId, state.threads]);

  // codex: electron-menu-shortcuts-*.js — register the ported command
  // descriptors with handlers that thunk into the existing HiCodexApp callbacks.
  // Handlers are read via getCommand() inside useHotkey closures so they always
  // see the latest registry entry without re-binding listeners.
  useEffect(() => {
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.openCommandMenu)!,
      () => openCommandMenu(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.findInThread)!,
      () => openThreadFindBar(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleSidebar)!,
      () => toggleSidebar(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleFileTreePanel)!,
      () => toggleWorkspaceFilesPanel(),
    );
    // codex: TODO — searchChats fallback reuses openChatSearchPanel until a
    // dedicated `chats` sub-mode is wired into the command menu.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.searchChats)!,
      () => openChatSearchPanel(),
    );
    // codex: app-main-*.js — searchFiles opens the cmdk Hd="files"
    // sub-mode. openFileSearchPanel installs a `files` CommandPanelState
    // which CommandPanel reads via commandPanelSubModeFromPanel() to swap
    // to the "Search files" placeholder and the file-list empty state.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.searchFiles)!,
      () => openFileSearchPanel(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.newThread)!,
      () => { void createWorkbenchThread(); },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.openFolder)!,
      () => { void useExistingWorkspaceFolder(); },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.previousThread)!,
      () => {
        if (previousThreadId) selectThreadById(previousThreadId);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.nextThread)!,
      () => {
        if (nextThreadId) selectThreadById(nextThreadId);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.settings)!,
      () => { void loadSettingsPanel("general"); },
    );
    // codex newWindow — ⌘⇧N opens a fresh window (desktop-only; no-op/caught in browser).
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.newWindow)!,
      () => { void openNewWindow().catch(() => undefined); },
    );
    return () => {
      // codex: electron-menu-shortcuts-*.js — only unregister the
      // IDs this effect owns so the second-wave effect (archive/rename/pin/
      // navigate/copy/threadN) keeps its registrations when this effect
      // re-runs due to dependency churn.
      unregisterCommand(COMMAND_IDS.openCommandMenu);
      unregisterCommand(COMMAND_IDS.findInThread);
      unregisterCommand(COMMAND_IDS.toggleSidebar);
      unregisterCommand(COMMAND_IDS.toggleFileTreePanel);
      unregisterCommand(COMMAND_IDS.searchChats);
      unregisterCommand(COMMAND_IDS.searchFiles);
      unregisterCommand(COMMAND_IDS.newThread);
      unregisterCommand(COMMAND_IDS.openFolder);
      unregisterCommand(COMMAND_IDS.previousThread);
      unregisterCommand(COMMAND_IDS.nextThread);
      unregisterCommand(COMMAND_IDS.settings);
      unregisterCommand(COMMAND_IDS.newWindow);
    };
  }, [
    createWorkbenchThread,
    loadSettingsPanel,
    nextThreadId,
    openChatSearchPanel,
    openCommandMenu,
    openFileSearchPanel,
    openThreadFindBar,
    previousThreadId,
    selectThreadById,
    toggleSidebar,
    toggleWorkspaceFilesPanel,
    useExistingWorkspaceFolder,
  ]);

  // codex: use-hotkey-*.js — one useHotkey call per ported command. The
  // accelerator string is resolved through the registry so users overriding a
  // descriptor still bind through the same path.
  // codex: electron-menu-shortcuts-*.js#openCommandMenu — bind both
  // CmdOrCtrl+K and CmdOrCtrl+Shift+P (Codex's platformDefaultKeybindings
  // ships both accelerators for openCommandMenu on macOS and default).
  const openCommandMenuAccelerators = useMemo(() => {
    const all = commandAccelerators(COMMAND_IDS.openCommandMenu);
    return all.length > 0 ? all : ["CmdOrCtrl+K", "CmdOrCtrl+Shift+P"];
  }, []);
  // codex: electron-menu-shortcuts-*.js#newThread — Desktop binds both
  // CmdOrCtrl+N and CmdOrCtrl+Shift+O to New Chat.
  const newThreadAccelerators = useMemo(() => {
    const all = commandAccelerators(COMMAND_IDS.newThread);
    return all.length > 0 ? all : ["CmdOrCtrl+N", "CmdOrCtrl+Shift+O"];
  }, []);
  useHotkey({
    accelerator: openCommandMenuAccelerators,
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.openCommandMenu)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.findInThread) ?? "CmdOrCtrl+F",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.findInThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleSidebar) ?? "CmdOrCtrl+B",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleSidebar)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleFileTreePanel) ?? "CmdOrCtrl+Shift+E",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleFileTreePanel)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.searchChats) ?? "CmdOrCtrl+G",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.searchChats)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.searchFiles) ?? "CmdOrCtrl+P",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.searchFiles)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: newThreadAccelerators,
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.newThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.openFolder) ?? "CmdOrCtrl+O",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.openFolder)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.previousThread) ?? "CmdOrCtrl+Shift+[",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.previousThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.nextThread) ?? "CmdOrCtrl+Shift+]",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.nextThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.settings) ?? "CmdOrCtrl+,",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.settings)?.handler?.(event);
    },
  });

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listenNativeShellEvents((event) => {
      switch (event.action) {
        case "newChat":
          void createWorkbenchThread();
          return;
        case "openFolder":
          void useExistingWorkspaceFolder();
          return;
        case "search":
          openCommandMenu();
          return;
        case "settings":
          void loadSettingsPanel("general");
          return;
        case "openDeepLink":
          void openDeepLinkUrl(event.url);
          return;
        default:
          if (event.message) {
            dispatch({ type: "log", text: event.message, level: event.supported === false ? "warn" : "info" });
          }
      }
    }).then((dispose) => {
      if (cancelled) {
        dispose();
        return;
      }
      unlisten = dispose;
    }).catch((error) => {
      dispatch({ type: "log", text: `native shell listener failed: ${formatError(error)}`, level: "warn" });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [createWorkbenchThread, loadSettingsPanel, openCommandMenu, openDeepLinkUrl, useExistingWorkspaceFolder]);

  // codex threadHeader.openInNewWindow — a window opened via host_open_thread_window
  // injects `window.__HICODEX_INITIAL_THREAD__`; once connected, route to that thread
  // once via the existing deep-link path. The first/main window has no such global.
  const initialThreadRoutedRef = useRef(false);
  useEffect(() => {
    if (initialThreadRoutedRef.current || !state.connected) return;
    const globalScope =
      typeof window !== "undefined" ? (window as { __HICODEX_INITIAL_THREAD__?: unknown }) : null;
    if (!globalScope) return;
    const initialThread = globalScope.__HICODEX_INITIAL_THREAD__;
    if (typeof initialThread !== "string" || initialThread.length === 0) return;
    initialThreadRoutedRef.current = true;
    delete globalScope.__HICODEX_INITIAL_THREAD__;
    void openDeepLinkUrl(`codex://threads/${initialThread}`);
  }, [state.connected, openDeepLinkUrl]);

  // codex newWindow — a window opened via host_open_new_window injects
  // `window.__HICODEX_INITIAL_NEW_CHAT__`; once connected, start a fresh chat once. The
  // first/main window has no such global, so this is a no-op there.
  const initialNewChatRef = useRef(false);
  useEffect(() => {
    if (initialNewChatRef.current || !state.connected) return;
    const globalScope =
      typeof window !== "undefined" ? (window as { __HICODEX_INITIAL_NEW_CHAT__?: unknown }) : null;
    if (!globalScope || globalScope.__HICODEX_INITIAL_NEW_CHAT__ !== true) return;
    initialNewChatRef.current = true;
    delete globalScope.__HICODEX_INITIAL_NEW_CHAT__;
    void createWorkbenchThread();
  }, [state.connected, createWorkbenchThread]);

  useSkillsPanelRefresh({
    activeSettingsPanel,
    commandPanelPanel: commandPanel?.panel,
    ensureConnected,
    setCommandPanel,
    setSettingsPanelState,
    skillsChangedNonce: state.invalidation.skills,
    workspace,
  });

  useAppBackedPanelRefresh({
    activeSettingsPanel,
    activeThreadId: state.activeThreadId,
    appListMessage: state.invalidation.appListMessage,
    appListNonce: state.invalidation.appList,
    commandPanelPanel: commandPanel?.panel,
    ensureConnected,
    mcpServerStartupStatuses: state.mcpServerStartupStatuses,
    mcpStatusMessage: state.invalidation.mcpStatusMessage,
    mcpStatusNonce: state.invalidation.mcpStatus,
    setAppRegistry,
    setCommandPanel,
    setSettingsPanelState,
    workspace,
  });

  const setActiveComposerMode = useCallback((mode: ComposerMode) => {
    dispatch({ type: "setActiveComposerMode", mode });
  }, []);

  const {
    copyTextToClipboard,
    copyWorkingDirectory,
    copySessionId,
    copyThreadWorkingDirectory,
    copyThreadSessionId,
    copyThreadDeeplink,
    copyConversationMarkdown,
  } = useClipboardCopyActions({
    activeThread,
    workspace,
    conversationUnits: conversation.units,
  });

  const openThreadFolder = useCallback(async (thread: Thread) => {
    const cwd = typeof thread.cwd === "string" ? thread.cwd.trim() : "";
    if (!cwd) {
      dispatch({ type: "log", text: "Working directory is unavailable", level: "warn" });
      return;
    }
    try {
      // codex sidebar-thread-section `open-thread-folder` — REVEAL the workspace
      // root in the OS file manager ("Reveal in Finder", i18n desc "reveal a
      // folder"), i.e. select it in its parent, rather than just opening it.
      await revealPath(cwd);
    } catch (error) {
      dispatch({ type: "log", text: `reveal folder failed: ${formatError(error)}`, level: "error" });
    }
  }, []);

  // codex threadHeader.openInNewWindow — open the thread in a second app window
  // (host_open_thread_window; the new window routes to the thread on startup).
  const openThreadInNewWindow = useCallback((thread: Thread) => {
    void openThreadWindow(thread.id).catch((error) => {
      dispatch({ type: "log", text: `open in new window failed: ${formatError(error)}`, level: "warn" });
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

  // codex: electron-menu-shortcuts-*.js#thread1..thread9 — slot helper.
  // Resolves the Nth visible thread in `state.threads` (Codex's keyboard
  // shortcuts target the same ordered list rendered in the sidebar) and
  // delegates to the existing `selectThreadById` path so we share its
  // workbench-tab + thread-read side-effects.
  const activateThreadBySlot = useCallback((slotIndex: number) => {
    const thread = state.threads[slotIndex];
    if (!thread) {
      dispatch({
        type: "log",
        text: `Thread slot ${slotIndex + 1} is empty`,
        level: "info",
      });
      return;
    }
    selectThreadById(thread.id);
  }, [selectThreadById, state.threads]);

  // codex: electron-menu-shortcuts-*.js#archiveThread/renameThread/
  // toggleThreadPin/copy* — register the second wave of Codex desktop
  // shortcuts. Mirrors the existing register/unregister pattern; handlers
  // closed-over from this scope reference the latest state via React refs
  // inside useCallback.
  useEffect(() => {
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.archiveThread)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to archive", level: "info" });
          return;
        }
        void archiveSelectedThread(activeThread);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.renameThread)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to rename", level: "info" });
          return;
        }
        openRenameThreadDialog(activeThread);
      },
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.toggleThreadPin)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to pin", level: "info" });
          return;
        }
        const pinned = pinnedThreadIds.has(activeThread.id);
        toggleThreadPinned(activeThread, !pinned);
      },
    );
    // codex: electron-menu-shortcuts-*.js#navigateBack — Codex
    // Desktop dispatches `host-message` (run-command-*.js) to fire
    // `history.back/forward` against its webview. HiCodex has no router,
    // so we drive an in-app thread history stack maintained in the
    // reducer (`./state/thread-history.ts`). Boundary checks live in the
    // reducer so the handler can stay a no-op on either end of the stack.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateBack)!,
      () => dispatch({ type: "navigateBackInHistory" }),
    );
    // codex: electron-menu-shortcuts-*.js#navigateForward — mirror
    // of navigateBack against the same thread history stack.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.navigateForward)!,
      () => dispatch({ type: "navigateForwardInHistory" }),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copySessionId)!,
      () => copySessionId(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyWorkingDirectory)!,
      () => copyWorkingDirectory(),
    );
    // codex: local-conversation-thread-*.js registers copy-conversation-path
    // to the same copyWorkingDirectory(cwd) action as copy-working-directory.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyConversationPath)!,
      () => copyWorkingDirectory(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyDeeplink)!,
      () => {
        if (!activeThread) {
          dispatch({ type: "log", text: "No active thread to copy deeplink", level: "info" });
          return;
        }
        copyThreadDeeplink(activeThread);
      },
    );
    // codex: electron-menu-shortcuts-*.js#copyConversationMarkdown.
    // Wires the existing `copyConversationMarkdown` callback (which already
    // owns the Markdown serialization via `buildConversationMarkdown`) into
    // the shared command registry so menu/command-palette entries can dispatch
    // it. The callback was previously defined but never registered.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.copyConversationMarkdown)!,
      () => copyConversationMarkdown(),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread1)!,
      () => activateThreadBySlot(0),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread2)!,
      () => activateThreadBySlot(1),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread3)!,
      () => activateThreadBySlot(2),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread4)!,
      () => activateThreadBySlot(3),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread5)!,
      () => activateThreadBySlot(4),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread6)!,
      () => activateThreadBySlot(5),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread7)!,
      () => activateThreadBySlot(6),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread8)!,
      () => activateThreadBySlot(7),
    );
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.thread9)!,
      () => activateThreadBySlot(8),
    );
    // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
    registerCommand(
      COMMAND_DESCRIPTORS.find((d) => d.id === COMMAND_IDS.showKeyboardShortcuts)!,
      () => openKeyboardShortcuts(),
    );
    return () => {
      unregisterCommand(COMMAND_IDS.archiveThread);
      unregisterCommand(COMMAND_IDS.renameThread);
      unregisterCommand(COMMAND_IDS.toggleThreadPin);
      unregisterCommand(COMMAND_IDS.navigateBack);
      unregisterCommand(COMMAND_IDS.navigateForward);
      unregisterCommand(COMMAND_IDS.copySessionId);
      unregisterCommand(COMMAND_IDS.copyWorkingDirectory);
      unregisterCommand(COMMAND_IDS.copyConversationPath);
      unregisterCommand(COMMAND_IDS.copyDeeplink);
      unregisterCommand(COMMAND_IDS.copyConversationMarkdown);
      unregisterCommand(COMMAND_IDS.thread1);
      unregisterCommand(COMMAND_IDS.thread2);
      unregisterCommand(COMMAND_IDS.thread3);
      unregisterCommand(COMMAND_IDS.thread4);
      unregisterCommand(COMMAND_IDS.thread5);
      unregisterCommand(COMMAND_IDS.thread6);
      unregisterCommand(COMMAND_IDS.thread7);
      unregisterCommand(COMMAND_IDS.thread8);
      unregisterCommand(COMMAND_IDS.thread9);
      unregisterCommand(COMMAND_IDS.showKeyboardShortcuts);
    };
  }, [
    activateThreadBySlot,
    activeThread,
    archiveSelectedThread,
    copyConversationMarkdown,
    copySessionId,
    copyTextToClipboard,
    copyThreadDeeplink,
    copyWorkingDirectory,
    openKeyboardShortcuts,
    openRenameThreadDialog,
    pinnedThreadIds,
    toggleThreadPinned,
    workspace,
  ]);

  // codex: app-main-*.js#Ij/Fj — mouse "back"/"forward" side buttons (button
  // 3/4) drive history navigation, mirroring Codex Desktop. The gesture is gated
  // on each command still carrying its MouseBack/MouseForward pseudo-key (so a
  // keymap override that drops it also disables the gesture); button 3/4 presses
  // are suppressed on mousedown/auxclick (preventDefault + stopPropagation) and
  // navigation fires on a trusted mouseup. Reuses the same in-app history actions
  // as the ⌘[ / ⌘] keyboard accelerators (navigateBack/navigateForward handlers).
  useEffect(() => {
    const backEnabled = commandAccelerators(COMMAND_IDS.navigateBack).includes("MouseBack");
    const forwardEnabled = commandAccelerators(COMMAND_IDS.navigateForward).includes("MouseForward");
    if (!backEnabled && !forwardEnabled) return;
    const suppress = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      suppress(event);
      if (!event.isTrusted) return;
      const direction = mouseNavigationDirection(event.button, backEnabled, forwardEnabled);
      if (direction === "back") dispatch({ type: "navigateBackInHistory" });
      else if (direction === "forward") dispatch({ type: "navigateForwardInHistory" });
    };
    window.addEventListener("mousedown", suppress, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("auxclick", suppress, true);
    return () => {
      window.removeEventListener("mousedown", suppress, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("auxclick", suppress, true);
    };
  }, [dispatch]);

  // codex: use-hotkey-*.js — one useHotkey call per ported command
  // from the second wave (archive/rename/pin/navigate/copy/threadN).
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.archiveThread) ?? "CmdOrCtrl+Shift+A",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.archiveThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.renameThread) ?? "CmdOrCtrl+Alt+R",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.renameThread)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.toggleThreadPin) ?? "CmdOrCtrl+Alt+P",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.toggleThreadPin)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.navigateBack) ?? "CmdOrCtrl+[",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.navigateBack)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.navigateForward) ?? "CmdOrCtrl+]",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.navigateForward)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copySessionId) ?? "CmdOrCtrl+Alt+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copySessionId)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyWorkingDirectory) ?? "CmdOrCtrl+Shift+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyWorkingDirectory)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyConversationPath) ?? "CmdOrCtrl+Alt+Shift+C",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyConversationPath)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.copyDeeplink) ?? "CmdOrCtrl+Alt+L",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.copyDeeplink)?.handler?.(event);
    },
  });
  // codex: electron-menu-shortcuts-*.js#thread1..thread9 — 9 top-level
  // useHotkey calls (no loop / no conditional) so React's rules-of-hooks
  // ordering is preserved and each binding owns its own listener.
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread1) ?? "CmdOrCtrl+1",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread1)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread2) ?? "CmdOrCtrl+2",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread2)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread3) ?? "CmdOrCtrl+3",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread3)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread4) ?? "CmdOrCtrl+4",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread4)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread5) ?? "CmdOrCtrl+5",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread5)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread6) ?? "CmdOrCtrl+6",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread6)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread7) ?? "CmdOrCtrl+7",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread7)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread8) ?? "CmdOrCtrl+8",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread8)?.handler?.(event);
    },
  });
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.thread9) ?? "CmdOrCtrl+9",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.thread9)?.handler?.(event);
    },
  });
  // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts — ⌘⇧/.
  useHotkey({
    accelerator: commandAccelerator(COMMAND_IDS.showKeyboardShortcuts) ?? "CmdOrCtrl+Shift+/",
    onKeyDown: (event) => {
      event.preventDefault();
      getCommand(COMMAND_IDS.showKeyboardShortcuts)?.handler?.(event);
    },
  });

  const {
    copyFileReferenceContents,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailUrl,
    previewPathContext,
    previewRailArtifact,
    resolveFileSelection,
    revealFileReference,
  } = useArtifactPreviewActions({
    activeThreadCwd: activeThread?.cwd,
    defaultCwd: state.hostStatus?.defaultCwd,
    setArtifactPreview,
    workspace,
  });
  const handlePatchFailureOpenPath = useCallback((path: string) => {
    const target = patchFailurePathForOpen(path, worktreeStatusCwd);
    if (!target) return;
    openFileReferenceExternal({ path: target, lineStart: 1, lineEnd: 1 });
  }, [openFileReferenceExternal, worktreeStatusCwd]);
  const openFileReferenceSidePanelTab = useCallback((
    reference: { path: string; lineStart: number; lineEnd?: number; hostId?: string | null },
    options: {
      isPreview: boolean;
      hostId?: string | null;
      tabId?: string;
      title?: string;
      workspaceRoot?: string | null;
      cwd?: string | null;
    },
  ) => {
    const resolvedReference = resolveFileSelection(reference);
    if (!resolvedReference) return;
    const hostId = resolvedReference.hostId ?? options.hostId ?? LOCAL_SIDE_PANEL_HOST_ID;
    const tabReference = { ...resolvedReference, hostId };
    const tabId = options.tabId ?? fileReferenceSidePanelTabId(resolvedReference.path, hostId);
    sidePanel.controller.openTab({
      id: tabId,
      Component: FileReferencePreviewTab,
      title: options.title ?? basenameFromPath(resolvedReference.path),
      tooltip: resolvedReference.path,
      icon: <FileText size={14} aria-hidden="true" />,
      isPreview: options.isPreview,
      kind: fileReferenceSidePanelTabKind(hostId),
      contextMenuItems: fileReferenceSidePanelContextMenuItems({
        onOpenFile: () => openFileReferenceExternal(tabReference),
        onCopyPath: () => {
          void globalThis.navigator?.clipboard?.writeText(resolvedReference.path);
        },
        onCopyContents: () => copyFileReferenceContents(tabReference),
        onRevealPath: () => revealFileReference(tabReference),
        revealLabel: osRevealLabel(),
      }, formatUiMessage),
      props: {
        path: resolvedReference.path,
        lineStart: resolvedReference.lineStart,
        lineEnd: resolvedReference.lineEnd,
        hostId,
        refreshKey: 0,
        workspaceRoot: options.workspaceRoot ?? previewPathContext.workspaceRoot,
        cwd: options.cwd ?? previewPathContext.cwd,
      },
    });
  }, [
    copyFileReferenceContents,
    openFileReferenceExternal,
    previewPathContext.cwd,
    previewPathContext.workspaceRoot,
    revealFileReference,
    resolveFileSelection,
    sidePanel.controller,
  ]);
  const memoryCitationRoot = useMemo(
    () => memoriesRootFromCodexHome(state.hostStatus?.codexHome),
    [state.hostStatus?.codexHome],
  );

  /*
   * Late binding of the Files-tab opener (referenced from the early-defined
   * `toggleWorkspaceFilesPanel` via `openFilesTabRef`). Closure captures the
   * current `worktreeStatusCwd` + `openFileReferenceExternal` each render, so
   * the next ⌘⇧E / Files-card click always sees fresh values.
   *
   * codex: card onSelect in thread-app-shell-chrome-*.js — Files card calls
   *   `Qe = () => U != null && (de(p, null, { hostId, target, workspaceRoot: U }), l?.());`
   * where `de(...)` ultimately resolves to a
   * `controller.openTab(workspaceDirectoryTree, { props: { root: U, onSelectFile: ... } })`.
   * HiCodex collapses this into a direct `openTab(FilesTabContent, { ... })`.
   */
  useEffect(() => {
    openFilesTabRef.current = () => {
      if (!worktreeStatusCwd) return;
      sidePanel.controller.openTab({
        id: FILES_TAB_ID,
        Component: FilesTabContent,
        title: "Files",
        tooltip: "Workspace files",
        icon: <FolderOpen size={14} aria-hidden="true" />,
        props: {
          workspaceRoot: worktreeStatusCwd,
          onSelectFile: (relPath: string, _options: { isPreview: boolean }) => {
            const root = worktreeStatusCwd.replace(/\/$/, "");
            const reference = { path: `${root}/${relPath}`, lineStart: 1, lineEnd: 1 };
            openFileReferenceSidePanelTab(reference, {
              // codex: review-file-source-tab-*.js `ia(...)` forces pinned
              // when selecting from the empty workspace-browser tab (`t == null`).
              isPreview: false,
              workspaceRoot: root,
              cwd: root,
            });
            sidePanel.controller.closeTab(FILES_TAB_ID);
          },
          onAddFileToChat: (relPath: string) => {
            const root = worktreeStatusCwd.replace(/\/$/, "");
            const path = `${root}/${relPath}`;
            setComposerAttachments((current) =>
              mergeComposerAttachments(current, [{
                type: "mention",
                name: basenameFromPath(relPath),
                path,
              }]),
            );
          },
          searchWorkspaceFiles: searchWorkspaceFilesForFilesTab,
        },
      });
    };
  }, [
    sidePanel,
    worktreeStatusCwd,
    openFileReferenceSidePanelTab,
    searchWorkspaceFilesForFilesTab,
    setComposerAttachments,
  ]);

  /*
   * codex: thread-app-shell-chrome-*.js landing-page action
   * list, gated by per-feature visibility. HiCodex only emits cards whose
   * underlying behaviour is implemented:
   *   • Files — wired to `openFilesTabRef.current()` above.
   *   • Browser — wired to the Tauri Browser runtime bridge.
   *   • Terminal / Timeline / Side chat / Review — omitted until backed by
   *     host/protocol flows. Adding them as no-op cards would be dead UI.
   */
  const sidePanelNewTabActions = useMemo<readonly SidePanelNewTabAction[]>(() => {
    const actions: SidePanelNewTabAction[] = [];
    if (worktreeStatusCwd) {
      actions.push({
        id: "open-file",
        title: formatUiMessage({ id: "thread.sidePanel.openFile", defaultMessage: "Files" }),
        description: formatUiMessage({ id: "thread.sidePanel.newTab.openFile.description", defaultMessage: "Browse project files" }),
        icon: <FolderOpen size={18} aria-hidden="true" />,
        onSelect: () => openFilesTabRef.current?.(),
      });
    }
    if (isTauriRuntime()) {
      actions.push({
        id: "open-browser",
        title: "Browser",
        description: "Open Browser",
        icon: <Globe size={18} aria-hidden="true" />,
        onSelect: () => openBrowserSurface(),
      });
    }
    return actions;
  }, [openBrowserSurface, worktreeStatusCwd]);

  // CODEX-REF: local-conversation-thread-*.js + review-file-source-tab-*.js —
  // file/source opens route through the AppShell side panel tab controller,
  // using preview tabs for inline conversation citations and rail source rows.
  const previewConversationFileReferenceAndOpenRail = useCallback((reference: {
    path: string;
    lineStart: number;
    lineEnd?: number;
  }) => {
    openFileReferenceSidePanelTab(reference, { isPreview: true });
  }, [openFileReferenceSidePanelTab]);
  const previewRailFileReferenceAndOpenRail = useCallback((reference: RailEntryReference) => {
    openFileReferenceSidePanelTab(reference, { isPreview: true });
  }, [openFileReferenceSidePanelTab]);
  const openAssistantArtifactInSidePanel = useCallback((entry: RailEntry) => {
    if (shouldOpenArtifactPreview(entry)) {
      previewRailArtifact(entry);
      return;
    }
    if (entry.reference) {
      previewRailFileReferenceAndOpenRail(entry.reference);
      return;
    }
    if (entry.action?.kind === "url") {
      openRailUrl(entry.action.url);
      return;
    }
    previewRailArtifact(entry);
  }, [
    openRailUrl,
    previewRailArtifact,
    previewRailFileReferenceAndOpenRail,
  ]);
  const revealAssistantEndResource = useCallback((entry: RailEntry) => {
    const reference = entry.action?.kind === "file" ? entry.action.reference : entry.reference;
    if (!reference) return;
    revealFileReference(reference);
  }, [revealFileReference]);

  useEffect(() => {
    openArtifactPreviewTabRef.current = (entry: RailEntry) => {
      const preview = projectArtifactPreview(entry);
      const hostId = preview.reference?.hostId ?? LOCAL_SIDE_PANEL_HOST_ID;
      const tabId = artifactPreviewTabId(entry, hostId);
      const openArtifactSourceInPlace = (reference: RailEntryReference) => {
        openFileReferenceSidePanelTab(reference, {
          // codex: artifact-tab-content.electron-*.js View source calls the
          // source-tab opener with the current artifact `tabId`; the tab
          // controller updates that id in place and defaults preview=false.
          isPreview: false,
          hostId,
          tabId,
          title: preview.title,
          workspaceRoot: previewPathContext.workspaceRoot,
          cwd: previewPathContext.cwd,
        });
      };
      sidePanel.controller.openTab({
        id: tabId,
        Component: ArtifactPreviewPanel,
        title: preview.title,
        tooltip: preview.title,
        icon: <FileText size={14} aria-hidden="true" />,
        isPreview: true,
        kind: preview.reference ? fileReferenceSidePanelTabKind(hostId) : undefined,
        props: {
          entry,
          hostId,
          ...(preview.reference ? {
            path: preview.reference.path,
            lineStart: preview.reference.lineStart,
            lineEnd: preview.reference.lineEnd,
          } : {}),
          refreshKey: 0,
          workspaceRoot: previewPathContext.workspaceRoot,
          cwd: previewPathContext.cwd,
          onOpenFileReference: openArtifactSourceInPlace,
          onOpenFileExternal: openRailArtifactFileExternal,
          onOpenUrl: openRailUrl,
        },
      });
    };
    return () => {
      openArtifactPreviewTabRef.current = null;
    };
  }, [
    openRailArtifactFileExternal,
    openRailUrl,
    previewPathContext.cwd,
    previewPathContext.workspaceRoot,
    openFileReferenceSidePanelTab,
    sidePanel.controller,
  ]);

  const rememberThreadScrollOffset = useCallback((distanceFromBottomPx: number) => {
    threadScrollOffsetsRef.current.set(activeThreadScrollKey, Math.max(0, distanceFromBottomPx));
  }, [activeThreadScrollKey]);

  /*
   * codex: `wa(o)` Review-changes deep-link; the optional `filePath` is the
   * `wa(o, { path })` overload — per-file Review row in TurnDiffBlock.
   */
  const openActiveDiffPanel = useCallback(
    (filePath?: string) => {
      const diff = activeDiff.trim();
      const focusedPath = typeof filePath === "string" && filePath.trim().length > 0 ? filePath.trim() : null;
      openCommandPanel("diff", {
        status: diff ? "ready" : "empty",
        message: diff
          ? focusedPath
            ? `Reviewing ${focusedPath}`
            : `${diff.split("\n").length} diff line(s)`
          : "No active thread diff is available.",
        entries: diff
          ? [
              {
                id: focusedPath ? `diff:active-thread:${focusedPath}` : "diff:active-thread",
                title: focusedPath ?? "Active thread diff",
                kind: "diff",
                meta: activeThread ? threadTitle(activeThread) : undefined,
                details: diff.split("\n").slice(0, 80),
              },
            ]
          : [],
      });
    },
    [activeDiff, activeThread, openCommandPanel],
  );

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

  // codex composer.threadGoal.replaceConfirmation — submitting a goal while one
  // already exists routes through a confirm dialog before the replace.
  const [pendingGoalReplace, setPendingGoalReplace] = useState<string | null>(null);
  const onRequestGoalReplace = useCallback((objective: string) => {
    setPendingGoalReplace(objective);
  }, []);

  // codex composer.threadGoal.resumeConfirmation — when a thread is resumed with a
  // paused/blocked/usage-limited goal, prompt once to resume it (codex tui
  // maybe_prompt_resume_paused_goal_after_resume). Tracked per thread/session so
  // switching back doesn't re-prompt after the user answers.
  const resumeGoalPromptedRef = useRef<Set<string>>(new Set());
  const [resumeGoalPrompt, setResumeGoalPrompt] = useState<{ threadId: string; objective: string; status: ThreadGoalStatus } | null>(null);
  const activeGoalStatus = activeThreadRuntime.threadGoal?.status ?? null;
  const activeGoalObjective = activeThreadRuntime.threadGoal?.objective ?? "";
  useEffect(() => {
    const threadId = state.activeThreadId;
    // Drop a stale prompt once the goal is resumed/cleared elsewhere (the dialog
    // would otherwise hold an obsolete status/objective).
    if (!threadId || activeGoalStatus === null || activeGoalStatus === "active" || activeGoalStatus === "complete") {
      setResumeGoalPrompt((current) => (current ? null : current));
      return;
    }
    if (resumeGoalPromptedRef.current.has(threadId)) return;
    if (activeGoalStatus === "paused" || activeGoalStatus === "blocked" || activeGoalStatus === "usageLimited") {
      resumeGoalPromptedRef.current.add(threadId);
      setResumeGoalPrompt({ threadId, objective: activeGoalObjective, status: activeGoalStatus });
    }
    // Depend on the intrinsic goal fields (not the runtime object reference) so
    // the effect doesn't re-run on unrelated thread-runtime updates.
  }, [state.activeThreadId, activeGoalStatus, activeGoalObjective]);

  const {
    activeQueuedFollowUps,
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    reorderQueuedFollowUp,
    sendQueuedFollowUpNow,
    sendTurn,
    startingConversation,
  } = useTurnSubmission({
    activeModelSupportsImageInput,
    activePendingRequestCount: activePendingRequests.length,
    activeThread,
    activeThreadGoal: activeThreadRuntime.threadGoal != null,
    activeThreadId: state.activeThreadId,
    activeThreadRunning,
    activeTurnId,
    composerGoalMode,
    setComposerGoalMode,
    onRequestGoalReplace,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerMode,
    composerSubmitState,
    ensureConnected,
    includeImageDynamicTool,
    input,
    rememberLatestCollaborationMode,
    restartRuntimeForProviderSwitch,
    resetComposerSelectionAfterCreatedThread,
    setActiveComposerMode,
    setComposerAttachments,
    setInput,
    threadContextDefaults: effectiveThreadContextDefaults,
    threadIds,
    workspace,
  });

  useEffect(() => {
    if (state.threads.length === 0) return;
    setOnboardingSnapshot((current) => {
      if (current.projectlessCompleted === true && current.lastCompletedOnboarding !== null) return current;
      return completeProjectlessOnboarding(browserStorage());
    });
  }, [state.threads.length]);

  const dismissOnboardingPromo = useCallback((options?: { ambientSuggestionsEnabled?: boolean }) => {
    setOnboardingSnapshot(dismissFirstNewThreadPromos(browserStorage(), options));
  }, []);

  const onboardingEmptyStateVisible = shouldShowOnboardingEmptyState({
    activeThreadId: state.activeThreadId,
    connected: state.connected,
    connecting: state.connecting,
    startingConversation,
  });
  const showFirstNewThreadPromo = shouldShowFirstNewThreadPromo(onboardingSnapshot, {
    activeThreadId: state.activeThreadId,
    connected: state.connected,
    connecting: state.connecting,
    startingConversation,
    threadCount: state.threads.length,
  });
  const conversationEmptyState = !activeThread ? (
    onboardingEmptyStateVisible ? (
      <OnboardingEmptyState
        showPromo={showFirstNewThreadPromo}
        workspace={workspace}
        onDismissPromo={dismissOnboardingPromo}
        onStartChat={() => { void createWorkbenchThread(); }}
        onUseExistingFolder={useExistingWorkspaceFolder}
      />
    ) : (
      <PreConversationLoadingShell
        connected={state.connected}
        connecting={state.connecting}
        startingConversation={startingConversation}
      />
    )
  ) : null;

  const runSlashRequest = useCallback((request: Parameters<typeof runSlashRequestWorkflow>[0], payload?: Record<string, unknown>) => (
    runSlashRequestWorkflow(request, payload, {
      client,
      formatMessage: formatUiMessage,
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
      threadContextDefaults: effectiveThreadContextDefaults,
      openSideConversationPanel,
      accountState: state.account,
      setAccountState: setAccountProjectionState,
      uiTheme: uiThemeSnapshot,
      logs: state.logs,
      rpcDebugEvents,
      buildInfo,
      onShowStatusPanel: () => setComposerStatusPanelOpen(true),
    })
  ), [
    state.account,
    activeThread,
    activeTurnId,
    buildInfo,
    client,
    formatUiMessage,
    ensureConnected,
    openCommandPanel,
    openRenameThreadDialog,
    openSideConversationPanel,
    setAccountProjectionState,
    state.activeThreadId,
    state.connected,
    state.hostStatus?.defaultCwd,
    state.hostStatus?.pid,
    state.models.length,
    state.pendingRequests.length,
    state.logs,
    setComposerStatusPanelOpen,
    rpcDebugEvents,
    effectiveThreadContextDefaults,
    uiThemeSnapshot,
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
        await createWorkbenchThread();
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
      case "setGoalMode":
        // codex /goal slash → enter goal-input mode (independent of plan); the
        // next submit sets the goal through the replace-confirm gate. Clear the
        // "/goal" slash text so the goal placeholder shows (pre-fill if an
        // objective arg was supplied).
        setComposerGoalMode(action.on);
        setInput(action.text ?? "");
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
        openCommandMenu();
        return;
      case "showReasoningPicker": {
        /*
         * CODEX-REF: composer-*.js — `/reasoning` slash command opens the
         * Reasoning effort dropdown anchored to the composer footer chip. HiCodex
         * 用 `[data-chip="reasoning"]` 选 footer chip 作为 anchor；如果 chip 不存在
         * （e.g. effort 字段未设置时该 chip 不渲染），把 anchor 设为 composer
         * footer 本身作为退路。
         */
        setInput("");
        setComposerAttachments([]);
        if (typeof document !== "undefined") {
          const chip = document.querySelector<HTMLElement>('[data-chip="reasoning"]')
            ?? document.querySelector<HTMLElement>(".hc-composer-settings-chips");
          if (chip) {
            toggleReasoningPickerAnchor(chip);
          }
        }
        return;
      }
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [composerMode, createWorkbenchThread, enableComposerPlanMode, loadSettingsPanel, openCommandMenu, runSlashRequest, setActiveComposerMode, toggleReasoningPickerAnchor]);

  const executeSlashCommand = useCallback((command: SlashCommand) => {
    void handleSlashAction(applySlashCommand(command.id, { input, mode: composerMode }));
  }, [composerMode, handleSlashAction, input]);

  const runSlashCommandFromPanel = useCallback((commandId: string) => {
    void handleSlashAction(applySlashCommand(commandId, { input: "", mode: composerMode }));
  }, [composerMode, handleSlashAction]);

  const browseComposerFiles = useCallback(async (kind: "file" | "image"): Promise<ComposerAttachment[]> => {
    const paths = await pickFileReferences(kind, true);
    const attachments = composerAttachmentsFromPaths(paths);
    const visibleAttachments = kind === "image"
      ? attachments.filter((attachment) => attachment.type === "localImage")
      : attachments;
    return attachmentsWithDataImagePreviews(visibleAttachments);
  }, []);

  const searchComposerMentions = useCallback(async (
    query: string,
    marker: ComposerMentionMarker,
  ): Promise<ComposerMentionOption[]> => {
    const cwd = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    if (!(await ensureConnected())) return [];
    const trimmedQuery = query.trim();
    if (marker === "$") {
      const [skillResult, appResult] = await Promise.allSettled([
        client.request<unknown>("skills/list", {
          cwds: cwd ? [cwd] : [],
          forceReload: false,
        }),
        loadAllApps(client, { threadId: state.activeThreadId }),
      ]);
      if (skillResult.status === "rejected" && appResult.status === "rejected") throw skillResult.reason;
      if (appResult.status === "fulfilled") {
        setAppRegistry(appRegistryEntriesFromResponse(appResult.value));
      }
      return dedupeComposerMentionOptions([
        ...(skillResult.status === "fulfilled" ? mentionOptionsFromSkillsResponse(skillResult.value, query) : []),
        ...(appResult.status === "fulfilled" ? mentionOptionsFromAppsResponse(appResult.value, query) : []),
      ]).slice(0, 25);
    }
    const liveAgentOptions = mentionOptionsFromAgentThreads(state.threads, query, {
      excludedThreadIds: [state.activeThreadId],
    });
    const liveAgentRoles = state.threads.map((thread) => thread.agentRole);
    const [pluginResult, skillResult, fileResult, configResult] = await Promise.allSettled([
      client.request<unknown>("plugin/list", {
        cwds: cwd ? [cwd] : null,
      }),
      trimmedQuery
        ? client.request<unknown>("skills/list", {
            cwds: cwd ? [cwd] : [],
            forceReload: false,
          })
        : Promise.resolve(null),
      trimmedQuery && cwd
        ? fileSearchControllerRef.current?.searchOnce({
            roots: [cwd],
            query,
            timeoutMs: 120_000,
          }) ?? Promise.resolve({ files: [] })
        : Promise.resolve({ files: [] }),
      client.request<unknown>("config/read", {
        includeLayers: false,
        cwd: cwd || null,
      }, 120_000),
    ]);
    if (
      pluginResult.status === "rejected"
      && skillResult.status === "rejected"
      && fileResult.status === "rejected"
      && configResult.status === "rejected"
      && liveAgentOptions.length === 0
    ) throw pluginResult.reason;
    return dedupeComposerMentionOptions([
      ...liveAgentOptions,
      ...(configResult.status === "fulfilled"
        ? mentionOptionsFromConfiguredAgentsResponse(configResult.value, query, liveAgentRoles)
        : []),
      ...(pluginResult.status === "fulfilled" ? mentionOptionsFromPluginsResponse(pluginResult.value, query) : []),
      ...(skillResult.status === "fulfilled" ? mentionOptionsFromSkillsResponse(skillResult.value, query) : []),
      ...(fileResult.status === "fulfilled" ? mentionOptionsFromFuzzyFiles(fileResult.value.files ?? []) : []),
    ]).slice(0, 25);
  }, [activeThread?.cwd, client, ensureConnected, state.activeThreadId, state.hostStatus?.defaultCwd, state.threads, workspace]);

  const selectComposerPlan = useCallback(() => {
    if (composerMode === "plan") {
      setActiveComposerMode("default");
      return;
    }
    void enableComposerPlanMode();
  }, [composerMode, enableComposerPlanMode, setActiveComposerMode]);
  // codex composer.goalDropdown "Pursue goal" — toggles goal mode; submitting in
  // goal mode sets the thread goal (handled in useTurnSubmission's sendTurn).
  const pursueComposerGoal = useCallback(() => {
    setComposerGoalMode((on) => !on);
  }, []);
  const hasPlanComposerMode = hasCollaborationModePreset(collaborationModes, "plan");

  const {
    callMcpToolFromPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    writeMcpServerConfigFromPanel,
  } = useCommandPanelActions({
    activeThreadId: state.activeThreadId,
    activeTurnId,
    ensureConnected,
    openCommandPanel,
    setActiveSettingsPanel,
    setCommandPanel,
    setComposerAttachments,
    setInput,
    setMcpServerForm,
    setMcpToolForm,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand: runSlashCommandFromPanel,
    openFileSearchPanel,
    setThreadPinnedById,
    selectThreadById,
    workspace,
  });

  const handleSettingsPanelSelectAction = useCallback(
    (action: Parameters<typeof selectCommandPanelAction>[0]) => selectCommandPanelAction(action, openSettingsPanelContent),
    [selectCommandPanelAction, openSettingsPanelContent],
  );
  const handleSettingsPanelSelectEntry = useCallback(
    (entry: Parameters<NonNullable<import("./components/model-settings-panel").SettingsPanelProps["onSelectEntry"]>>[0]) => {
      if (entry.disabled || !entry.action) return;
      selectCommandPanelAction(entry.action, openSettingsPanelContent);
    },
    [selectCommandPanelAction, openSettingsPanelContent],
  );
  // CODEX-REF: composer-*.js / use-permissions-mode-*.js — composer quick
  // permission choices apply to the current thread's next turns, not global
  // config.toml defaults.
  const applyComposerPermissionMode = useCallback(
    (mode: PermissionMode) => {
      const threadId = state.activeThreadId;
      if (!threadId) {
        dispatch({ type: "log", text: "Select or start a thread before changing permissions.", level: "warn" });
        closePermissionsPicker();
        return;
      }
      closePermissionsPicker();
      void (async () => {
        if (!(await ensureConnected())) return;
        try {
          await client.request("thread/settings/update", {
            threadId,
            ...permissionModeThreadSettingsPatch(mode),
          }, 120_000);
        } catch (error) {
          dispatch({ type: "log", text: `Failed to update permissions: ${formatError(error)}`, level: "error" });
        }
      })();
    },
    [client, closePermissionsPicker, dispatch, ensureConnected, state.activeThreadId],
  );

  const handleMcpToolFormSubmit = useCallback((argumentsValue: Record<string, unknown>) => {
    const action = mcpToolForm;
    setMcpToolForm(null);
    void callMcpToolFromPanel({ type: "callMcpTool", server: action!.server, tool: action!.tool, arguments: argumentsValue });
  }, [mcpToolForm, callMcpToolFromPanel]);

  const handleMcpServerFormSubmit = useCallback((name: string, config: Record<string, unknown>) => {
    const formAction = mcpServerForm;
    setMcpServerForm(null);
    void writeMcpServerConfigFromPanel({
      type: "writeMcpServerConfig",
      title: formAction!.mode === "edit" ? `Save ${name}` : "Add MCP server",
      name,
      config,
    }, openSettingsPanelContent);
  }, [mcpServerForm, writeMcpServerConfigFromPanel, openSettingsPanelContent]);

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
      if (request.method === PLAN_IMPLEMENTATION_REQUEST_METHOD) {
        setDismissedPlanImplementationRequestIds((current) => new Set([...current, String(request.id)]));
        dispatch({ type: "resolveServerRequest", id: request.id });
        if (!accepted) return;
        const followUp = planImplementationFollowUpText(request, answers);
        if (!followUp) return;
        setActiveComposerMode("default");
        await sendTurn({
          bypassSubmitState: true,
          input: followUp,
          mode: "default",
        });
        return;
      }
      if (isHiCodexImageToolCall(request)) {
        if (!claimHiCodexImageToolRequest(handledImageToolRequestIdsRef.current, request)) {
          dispatch({ type: "resolveServerRequest", id: request.id });
          return;
        }
        const result = accepted
          ? await executeHiCodexImageToolCall(request, normalizeModelConfig(modelDraft), {
              codexHome: state.hostStatus?.codexHome,
              imageSettings: imageGenerationSettings,
            })
          : {
              success: false,
              contentItems: [{ type: "inputText" as const, text: "Image generation was cancelled." }],
            };
        if (accepted) {
          const failureText = imageToolFailureText(result);
          if (failureText) dispatch({ type: "log", text: failureText, level: "error" });
        }
        await client.respond(request.id, result);
        dispatch({ type: "resolveServerRequest", id: request.id });
        return;
      }
      if (request.method === "item/tool/requestUserInput" && !accepted) {
        const scope = pendingRequestScope(request);
        const threadId = scope.threadId
          ?? pendingRequestOwnerThreadId(request, { itemsByThread })
          ?? state.activeThreadId;
        const runtime = threadId ? state.threadsRuntime[threadId] : null;
        const turnId = scope.turnId ?? runtime?.activeTurnId ?? (threadId === state.activeThreadId ? activeTurnId : null);
        if (threadId && turnId) {
          await interruptThreadTurn(client, threadId, turnId);
          dispatch({ type: "resolveServerRequest", id: request.id });
          return;
        }
      }
      const result = buildApprovalResult(request, accepted, answers);
      result === null
        ? await client.reject(request.id, accepted ? "Unsupported HiCodex request" : "Rejected by HiCodex user")
        : await client.respond(request.id, result);
      dispatch({ type: "resolveServerRequest", id: request.id });
    } catch (error) {
      dispatch({ type: "log", text: formatError(error), level: "error" });
    }
  }, [
    activeTurnId,
    client,
    imageGenerationSettings,
    itemsByThread,
    modelDraft,
    sendTurn,
    setActiveComposerMode,
    state.activeThreadId,
    state.hostStatus?.codexHome,
    state.threadsRuntime,
  ]);

  const stopBackgroundSubagents = useCallback(async () => {
    if (backgroundSubagentsStopAllPending || backgroundSubagentStopThreadIds.length === 0) return;
    setBackgroundSubagentsStopAllPending(true);
    try {
      if (!(await ensureConnected())) return;
      const stopThreadIds = await collectBackgroundSubagentStopThreadIds({
        activeThreadId: state.activeThreadId,
        seedThreadIds: backgroundSubagentStopThreadIds,
        readThread: (threadId) => readThread(client, threadId, true),
      });
      const stopPendingRequests = deriveBackgroundPendingRequests(state.pendingRequests, {
        activeThreadId: state.activeThreadId,
        backgroundThreadIds: stopThreadIds,
        itemsByThread,
      });
      let pendingRequestCount = 0;
      let interruptedCount = 0;
      let terminalCleanupCount = 0;
      let failedCount = 0;
      const requestThreadIds = new Set<string>();
      for (const request of stopPendingRequests) {
        const ownerThreadId = pendingRequestOwnerThreadId(request, { itemsByThread });
        if (ownerThreadId) requestThreadIds.add(ownerThreadId);
        try {
          const result = buildStopPendingRequestResult(request);
          result === null
            ? await client.reject(request.id, "Stopped by HiCodex user")
            : await client.respond(request.id, result);
          dispatch({ type: "resolveServerRequest", id: request.id });
          pendingRequestCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      const refreshedThreadIds = new Set<string>();
      for (const threadId of stopThreadIds) {
        let turnId = state.threadsRuntime[threadId]?.activeTurnId ?? null;
        if (!turnId) {
          try {
            turnId = await readInProgressTurnId(client, threadId);
          } catch {
            failedCount += 1;
          }
        }
        let shouldRefresh = requestThreadIds.has(threadId);
        try {
          if (turnId) {
            await interruptThreadTurn(client, threadId, turnId);
            interruptedCount += 1;
            shouldRefresh = true;
          } else {
            await cleanBackgroundTerminalsForThread(client, threadId);
            terminalCleanupCount += 1;
            shouldRefresh = true;
          }
          if (shouldRefresh && !refreshedThreadIds.has(threadId)) {
            await refreshThreadMetadata(client, threadId, dispatch);
            refreshedThreadIds.add(threadId);
          }
        } catch {
          failedCount += 1;
        }
      }

      const handledCount = pendingRequestCount + interruptedCount + terminalCleanupCount;
      if (handledCount > 0) {
        const parts = [
          interruptedCount > 0
            ? `${interruptedCount} running background agent${interruptedCount === 1 ? "" : "s"}`
            : null,
          pendingRequestCount > 0
            ? `${pendingRequestCount} pending request${pendingRequestCount === 1 ? "" : "s"}`
            : null,
          terminalCleanupCount > 0
            ? `${terminalCleanupCount} background terminal cleanup${terminalCleanupCount === 1 ? "" : "s"}`
            : null,
        ].filter(Boolean);
        dispatch({
          type: "log",
          text: `Stop requested for ${parts.join(" and ")}.`,
          level: failedCount > 0 ? "warn" : "info",
        });
      } else {
        dispatch({
          type: "log",
          text: failedCount > 0
            ? "Failed to stop background agents."
            : "No running background agent turns or terminals were found.",
          level: failedCount > 0 ? "error" : "warn",
        });
      }
    } finally {
      setBackgroundSubagentsStopAllPending(false);
    }
  }, [
    backgroundSubagentStopThreadIds,
    backgroundSubagentsStopAllPending,
    client,
    ensureConnected,
    itemsByThread,
    state.activeThreadId,
    state.pendingRequests,
    state.threadsRuntime,
  ]);

  const applyModelDraft = useCallback(() => {
    const nextModel = normalizeModelConfig(modelDraft);
    if (nextModel.model) {
      setSelectedModelKey(encodeSelection(nextModel.id, nextModel.model));
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
      restartRuntime: true,
      // models.json is a full overwrite — keep the team gateway entries alive.
      additionalCatalogModels: teamModelGatewayProvider?.models ?? [],
    }).then((result) => {
      if (!result.restartedRuntime) {
        void refreshThreadContextDefaults(client, dispatch, workspace);
      }
    });
  }, [
    client,
    connect,
    modelDraft,
    setSelectedModelKey,
    state.connected,
    state.hostStatus?.codexHome,
    state.threadContextDefaults,
    teamModelGatewayProvider?.models,
    workspace,
  ]);

  const applyImageGenerationDraft = useCallback(() => {
    const nextSettings = saveImageGenerationSettings(browserStorage(), imageGenerationDraft);
    setImageGenerationSettings(nextSettings);
    setImageGenerationDraft(nextSettings);
    dispatch({
      type: "log",
      text: nextSettings.baseUrl
        ? `set image generation endpoint to ${nextSettings.baseUrl}`
        : "image generation will reuse the active model endpoint",
    });
  }, [imageGenerationDraft]);

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
    <HiCodexIntlProvider locale={uiLocale}>
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
        * motion-one spring. HiCodex pins mount to `workbenchVisible` (not
        * `sidebarOpen`) so open/close runs as CSS transitions on
        * `--hc-sidebar-width` / `.hc-sidebar`, not React mount/unmount.
        */}
      {workbenchVisible && (
        <Sidebar
          threads={projectSidebarThreads(state.threads, { sortKey: sidebarPreferences.sortKey })}
          activeThreadId={state.activeThreadId}
          // codex sidebar-thread-section ht — swaps the active thread's fork label.
          activeThreadIsWorktree={worktreeHostGitStatus?.isWorktree ?? false}
          connected={state.connected}
          connecting={state.connecting}
          updateAvailable={updateBadge}
          onApplyUpdate={runUpdate}
          onConnect={() => void connect()}
          onCreateThread={createWorkbenchThread}
          onOpenSearch={openChatSearchPanel}
          onOpenPlugins={() => void loadSettingsPanel("plugins")}
          onOpenAutomations={openAutomationsPanel}
          onUseExistingFolder={useExistingWorkspaceFolder}
          onSelectThread={selectWorkbenchThread}
          onForkThread={forkSelectedThread}
          onForkThreadIntoWorktree={forkSelectedThreadIntoWorktree}
          onOpenThreadWindow={openThreadInNewWindow}
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
          resolvedUiTheme={resolvedUiTheme}
          onToggleTheme={() => setUiThemeMode(nextToggleThemeMode(resolvedUiTheme))}
          accountView={accountViewModel}
          onSignOut={signOutAccount}
          sortKey={sidebarPreferences.sortKey}
          onSortKeyChange={setSidebarSortKey}
          organizeMode={sidebarPreferences.organizeMode}
          currentWorkspaceRoot={activeThread?.cwd || workspace}
          selectedWorkspaceRoots={selectedWorkspaceRoots}
          onOrganizeModeChange={setSidebarOrganizeMode}
          collapsedGroupKeys={sidebarCollapsedGroupKeys}
          onCollapsedGroupKeysChange={setSidebarCollapsedGroupKeys}
          getThreadTitle={(thread) => threadTitle(thread, state.threadsRuntime[thread.id]?.items ?? null)}
        />
      )}

      {workbenchVisible && (
        <div
          className="hc-sidebar-resize-handle"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_WIDTH_MIN_PX}
          aria-valuemax={SIDEBAR_WIDTH_MAX_PX}
          aria-valuenow={sidebarWidthPx}
          data-visible={sidebarVisible ? "true" : "false"}
          data-resizing={sidebarResizing ? "true" : undefined}
          tabIndex={sidebarVisible ? 0 : -1}
          title="Resize sidebar"
          onPointerDown={startSidebarResize}
          onKeyDown={resizeSidebarByKeyboard}
        />
      )}

      {workbenchVisible ? (
      <main
        className="hc-main"
        data-right-rail-mode={showRightRail ? rightRailMode : undefined}
        ref={mainRef}
        style={mainLayoutStyle}
      >
        <ConversationChrome
          title={activeThread ? threadTitle(activeThread, state.threadsRuntime[activeThread.id]?.items ?? null) : "New chat"}
          activeThread={activeThread}
          // codex thread-env-icon — local vs (linked git) worktree indicator for the active thread.
          env={worktreeHostGitStatus?.isWorktree ? "worktree" : "local"}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          /*
           * Codex Desktop header carries `Toggle pinned summary` button
           * (local-conversation-page-*.js, actionId
           * `local-thread-summary-panel-toggle`). HiCodex shows it only when
           * the active thread has rail content AND the viewport isn't in
           * overlay mode — matching Codex's gating where the pin variant
           * is only used for `displayMode !== "overlay"`.
           *
           * The toggle is also suppressed in the new-chat empty state
           * (`!activeThread`): Codex's `new-thread-panel-page-*.js`
           * has no summary rail at all, so its header has nothing to toggle.
           */
          rightRailToggleAvailable={Boolean(activeThread) && rightRailSections.length > 0}
          rightRailPinned={rightRailPinned}
          rightRailPopoverOpen={showRightRailPopover}
          canPinRightRail={rightRailMode !== "overlay"}
          onToggleRightRailPinned={() => {
            // The file-preview panel and the summary rail share the right
            // panel, so the rail is suppressed while a preview is selected
            // (hasFilePreviewSelection gates showRightRail). Without freeing it
            // here the toggle is a dead no-op whenever a preview is open —
            // including a blank/failed preview (e.g. backend down) the user may
            // not recognize as open. Revealing the rail closes the preview.
            if (!rightRailPinned && hasFilePreviewSelection) closeFilePreviewPanel();
            setRightRailPinned(!rightRailPinned);
          }}
          onToggleRightRailPopover={() => {
            if (!showRightRailPopover && hasFilePreviewSelection) {
              // Closing the preview frees right-panel width, which can flip the
              // layout out of overlay mode — pin too so the rail still shows
              // inline in that case.
              closeFilePreviewPanel();
              setRightRailPinned(true);
            }
            setRightRailPopoverOpen((open) => !open);
          }}
          // codex: app-shell-*.js — sidebar trigger group back/forward arrows.
          canNavigateBack={canNavigateBackInHistory(state.threadHistoryStack, state.threadHistoryIndex)}
          canNavigateForward={canNavigateForwardInHistory(state.threadHistoryStack, state.threadHistoryIndex)}
          onNavigateBack={() => dispatch({ type: "navigateBackInHistory" })}
          onNavigateForward={() => dispatch({ type: "navigateForwardInHistory" })}
        />
        {threadFindOpen && (
          <ThreadFindBar
            currentIndex={visibleThreadFindIndex}
            focusToken={threadFindFocusToken}
            matchCount={activeThreadFindMatches.length}
            query={threadFindQuery}
            onClose={closeThreadFindBar}
            onNext={() => goToThreadFindMatch(1)}
            onPrevious={() => goToThreadFindMatch(-1)}
            onQueryChange={setThreadFindQuery}
          />
        )}

        <ThreadScrollLayout
          resetKey={activeThreadScrollKey}
          initialOffset={initialThreadScrollOffset}
          onScroll={rememberThreadScrollOffset}
          inlineEndInset={threadInlineEndInset}
          contentVersion={`${conversation.units.length}:${activeThreadRunning}:${activePendingRequests.length}:${activeQueuedFollowUps.length}:${showLiveTurnDiffPortal ? activeDiff.length : 0}`}
          footer={(
            <div
              className="hc-thread-composer-region"
              data-thread-find-composer="true"
            >
              <div
                className="hc-above-composer-portal"
                data-above-composer-portal="true"
                data-above-composer-conversation-id={state.activeThreadId ?? undefined}
              >
                {/*
                 * codex: composer-*.js — Codex packs ALL 7 above-composer
                 * slots (QueuedMessages / GoalBanner / BackgroundSubagents /
                 * WindowsSandbox / HooksReview / aboveComposerHeaderContent /
                 * StatusText) into a single `createPortal(<vs>{children}</vs>, So)`
                 * so the rounded-corner stacking (`first:rounded-t-2xl` gated by
                 * `HasPortalContentContext`) renders as one continuous card.
                 * HiCodex wires queued follow-ups, background subagents, hooks
                 * review, and the placeholder StatusText slot through this
                 * shared container. Quota/account banners render as siblings
                 * after this portal in the current Desktop bundle, and the
                 * `/status` panel is composer-local chrome rather than part of
                 * this above-composer stack.
                 */}
                <LiveTurnDiffPortal
                  diff={activeDiff}
                  isThreadRunning={activeThreadRunning}
                  hasBlockingRequest={activePendingRequests.length > 0}
                  onOpenDiff={openActiveDiffPanel}
                />
                <AboveComposerPanelContainer hasAboveComposerPortalContent={showLiveTurnDiffPortal}>
                  <QueuedFollowUpStack
                    messages={activeQueuedFollowUps}
                    isQueueingEnabled={followUpQueueingEnabled}
                    onSendNow={sendQueuedFollowUpNow}
                    onEdit={editQueuedFollowUp}
                    onDelete={deleteQueuedFollowUp}
                    onQueueingChange={setFollowUpQueueingEnabled}
                    onReorder={reorderQueuedFollowUp}
                  />
                  <ThreadGoalBanner
                    goal={activeThreadRuntime.threadGoal}
                    pendingAction={threadGoalPendingAction}
                    onEditGoal={editActiveThreadGoal}
                    onSetGoalStatus={setActiveThreadGoalStatus}
                    onClearGoal={clearActiveThreadGoal}
                  />
                  {pendingGoalReplace !== null && (
                    <ThreadGoalReplaceConfirm
                      objective={pendingGoalReplace}
                      pending={threadGoalPendingAction === "edit"}
                      onConfirm={() => {
                        const objective = pendingGoalReplace;
                        setPendingGoalReplace(null);
                        void editActiveThreadGoal(objective);
                      }}
                      onCancel={() => setPendingGoalReplace(null)}
                    />
                  )}
                  {resumeGoalPrompt && (
                    <ThreadGoalResumeConfirm
                      objective={resumeGoalPrompt.objective}
                      status={resumeGoalPrompt.status}
                      pending={threadGoalPendingAction === "status"}
                      onResume={() => {
                        setResumeGoalPrompt(null);
                        void setActiveThreadGoalStatus("active");
                      }}
                      onDismiss={() => setResumeGoalPrompt(null)}
                    />
                  )}
                  <BackgroundSubagentsStack
                    canStopAll={backgroundSubagentStopThreadIds.length > 0}
                    entries={conversation.backgroundAgents}
                    onOpenThread={openBackgroundAgentThread}
                    onStopAll={stopBackgroundSubagents}
                    stopAllPending={backgroundSubagentsStopAllPending}
                  />
                  <HooksReviewBanner
                    count={showHooksReviewBanner ? (hooksReviewSnapshot?.count ?? 0) : 0}
                    onReview={reviewHooks}
                    onTrustAll={trustAllHooks}
                  />
                  {/*
                   * codex: composer-*.js — StatusTextPanel (above-composer
                   * slot 7). Aria-live polite text used by Codex for steered-message
                   * echo / generic transient turn-status notices. HiCodex currently
                   * has no equivalent data source wired (no steer feature, no
                   * sandbox banner), so `text` stays undefined and the panel renders
                   * nothing. Slot is in place for future wiring.
                   */}
                  <StatusTextPanel text={undefined} />
                  {/*
                   * Codex Desktop does not mount the latest-turn preview drawer in
                   * the normal local-thread composer. The drawer is wired through
                   * local-conversation-page-*.js and rendered only when the
                   * side-panel state hides the main composer (the page renders the
                   * drawer in place of the composer). Keeping it out of
                   * this default footer prevents the stray full-width
                   * "Worked for ..." bar above the input.
                   */}
                </AboveComposerPanelContainer>
              </div>

              {/*
               * codex: composer-zFOdryLS.pretty.js — the quota / rate-limit
               * banner is a sibling after the above-composer portal, not one
               * of the rounded stacked portal rows.
               */}
              <ComposerQuotaBanner
                banner={composerQuotaBanner}
                onViewStatus={() => setComposerStatusPanelOpen(true)}
              />

              {/*
               * codex: composer-*.js — Codex also exposes a second portal
               * target `data-above-composer-queue-portal` (`$o`) for asymmetric
               * future slots. Codex bundle has no `createPortal` writing into it
               * (verified via grep); HiCodex keeps the anchor for forward
               * compatibility but currently leaves it empty.
               */}
              <div
                className="hc-above-composer-queue-portal"
                data-above-composer-queue-portal="true"
                data-above-composer-conversation-id={state.activeThreadId ?? undefined}
              />

              {composerStatusPanelOpen && (
                <ComposerStatusPanel
                  threadId={state.activeThreadId}
                  tokensUsed={tokenUsageSnapshot?.usedTokens}
                  contextWindow={tokenUsageSnapshot?.contextWindow}
                  rateLimits={state.account.rateLimits}
                  rateLimitsByLimitId={state.account.rateLimitsByLimitId}
                  onClose={() => setComposerStatusPanelOpen(false)}
                />
              )}

              <Composer
                input={input}
                attachments={composerAttachments}
                mode={composerMode}
                goalMode={composerGoalMode}
                placeholder={composerPlaceholder}
                onInputChange={setInput}
                onAttachmentsChange={setComposerAttachments}
                supportsImageInput={activeModelSupportsImageInput}
                onAttachmentError={(message) => dispatch({ type: "log", text: message, level: "warn" })}
                onBrowseFiles={browseComposerFiles}
                onMentionSearch={searchComposerMentions}
                conversationId={state.activeThreadId}
                hasPlanMode={hasPlanComposerMode}
                onPlanSelected={selectComposerPlan}
                onPursueGoal={pursueComposerGoal}
                onOpenPlugins={() => void loadSettingsPanel("plugins")}
                pendingRequestContent={activePendingRequests.length > 0 ? (
                  <PendingRequestStack
                    pendingRequests={activePendingRequests}
                    requestActors={activePendingRequestActors}
                    onRespond={respondToRequest}
                    onLog={(text, level) => dispatch({ type: "log", text, level })}
                  />
                ) : null}
                submitState={composerSubmitState}
                onSend={() => void sendTurn()}
                onInterrupt={() => void interruptActiveTurn()}
                onSlashCommand={executeSlashCommand}
                footerSettings={(
                  <ComposerSettingsChips
                    model={
                      // Same source as the picker checkmark
                      // (activeThreadDisplayModelSelection) so chip and menu
                      // can never disagree about the chat's current model.
                      (state.activeThreadId
                        ? activeThreadDisplayModelSelection?.model
                        : effectiveThreadContextDefaults?.model ?? state.threadContextDefaults?.model)
                        ?? null
                    }
                    modelProviderHint={composerModelProviderHint}
                    approvalPolicy={effectiveThreadContextDefaults?.approvalPolicy ?? state.threadContextDefaults?.approvalPolicy}
                    approvalsReviewer={effectiveThreadContextDefaults?.approvalsReviewer ?? state.threadContextDefaults?.approvalsReviewer}
                    reasoningEffort={effectiveThreadContextDefaults?.reasoningEffort ?? state.threadContextDefaults?.reasoningEffort}
                    sandboxMode={effectiveThreadContextDefaults?.sandbox ?? state.threadContextDefaults?.sandbox}
                    onOpenPermissions={togglePermissionsPickerAnchor}
                    onOpenModelPicker={toggleModelPickerAnchor}
                    onOpenReasoningPicker={toggleReasoningPickerAnchor}
                  />
                )}
              />
              {onboardingEmptyStateVisible ? (
                <ComposerExternalFooter
                  variant="home"
                  branch={threadGitBranch(activeThread)}
                  cwd={activeThread?.cwd || workspace}
                  workMode={composerWorkMode}
                  workModeOptions={composerWorkModeOptions}
                  workspaceRoots={workspaceRootOptions}
                  onWorkspaceRootSelected={selectWorkspaceRoot}
                  onUseExistingFolder={useExistingWorkspaceFolder}
                  onSelectProjectless={selectProjectlessWorkspace}
                  onWorkModeChange={setComposerWorkMode}
                />
              ) : null}
            </div>
          )}
        >
          <section className="hc-conversation" data-thread-find-target="conversation">
            <ConversationView
              units={conversation.units}
              scrollToUnitKeyRef={threadFindScrollToUnitRef}
              emptyState={conversationEmptyState}
              threadId={state.activeThreadId}
              onEditLastUserMessage={editLastUserTurn}
              onOpenAssistantArtifact={openAssistantArtifactInSidePanel}
              onRevealAssistantEndResource={revealAssistantEndResource}
              onOpenDiff={openActiveDiffPanel}
              onForkTurn={forkActiveThreadFromTurn}
              onOpenFileReference={previewConversationFileReferenceAndOpenRail}
              onOpenAutomation={openAutomationFromConversation}
              memoryCitationRoot={memoryCitationRoot}
              onOpenThreadId={openBackgroundAgentThread}
              onOpenConversationThreadId={selectThreadById}
              onOpenRemoteTask={openRemoteTask}
              onMcpAppHostCall={handleMcpAppHostCall}
              onReadMcpResource={readMcpResource}
              onPatchAction={handlePatchAction}
              patchActionState={patchActionState}
              patchActionInFlight={patchActionInFlight}
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
            onOpenFileReference={previewConversationFileReferenceAndOpenRail}
            onOpenAutomation={openAutomationFromConversation}
            memoryCitationRoot={memoryCitationRoot}
            onOpenThreadId={openBackgroundAgentThread}
            onReadMcpResource={readMcpResource}
            onSendMessage={sendBackgroundAgentPanelMessage}
          />
        )}

        {automationsPanelOpen && (
          <AutomationsPreviewPanel
            model={automationsModel}
            onClose={() => {
              setAutomationsPanelOpen(false);
              // codex: clear the deep-link focus target on close so a later
              // generic "Automations" open doesn't re-scope to a stale id.
              setFocusedAutomationId(null);
            }}
            onRefresh={refreshAutomationsPanel}
          />
        )}

        {(showRightRail || showRightRailPopover) && (
          <RightRail
            sections={rightRailSections}
            displayMode={showRightRailPopover ? "overlay" : rightRailMode}
            isPinned={showRightRail ? rightRailPinned : true}
            onOpenArtifactPreview={previewRailArtifact}
            onOpenFileReference={previewRailFileReferenceAndOpenRail}
            onOpenUrl={openRailUrl}
            onOpenDiff={openActiveDiffPanel}
            onOpenThreadId={openBackgroundAgentThread}
            onCleanBackgroundTerminals={conversation.backgroundTerminals.length > 0
              ? () => void cleanBackgroundTerminals()
              : undefined}
            backgroundTerminalCleanupPending={backgroundTerminalCleanupPending}
            // codex: au row onClick — open automation editor modal. Codex's
            // `ke` handler (local-conversation-thread-*.js) deep-links the
            // *specific* automation (Km({automationId,…}) / navigate-to-route
            // ?automationId=…). HiCodex threads the rail row's id through
            // `openAutomationsPanel`, which records it as the surface model's
            // `focusedAutomationId` focus target (resolved via
            // `focusedAutomationSchedule`) so the panel can scope to that
            // schedule instead of the generic full list.
            onAutomationOpen={(automationId) => openAutomationsPanel(automationId)}
            onBrowserOpen={openBrowserSurface}
          />
        )}

        {/*
          * codex: thread-app-shell-chrome-*.js right-panel
          * outlet + tabs + sticky "+" + close button. HiCodex consolidates
          * the wiring into `<SidePanelHost>` (state in `useSidePanelTabHost`).
          *
          * Empty state = `<SidePanelNewTabPage>` (4-card landing
          * page); active tab content = the tab's Component (currently only
          * `FilesTabContent`, opened by the Files card or by ⌘⇧E).
          *
          * Hidden when `sidePanel.panelOpen === false`. Codex:
          *   `activeTab == null ? <div>{emptyState}</div> : <Component .../>`
          * — the empty state is rendered by the host itself, we only need to
          * pass it as a child.
          */}
        {sidePanel.panelOpen && (
          <SidePanelHost
            controller={sidePanel.controller}
            tabs={sidePanel.tabs}
            activeTab={sidePanel.activeTab}
            activeTabReactKey={sidePanel.activeTabReactKey}
            emptyState={<SidePanelNewTabPage actions={sidePanelNewTabActions} />}
            afterTabsStickySlot={
              <>
                {/*
                  * codex: thread-app-shell-chrome-*.js sticky "+"
                  * button. onClick is `() => { activateTab(null); openPanel(true); }`
                  * — clears the active tab so the empty-state landing page
                  * (4 cards) returns to view. Idempotent when already in
                  * empty state (matches the "looks unresponsive" observation
                  * the user reported on Codex Desktop).
                  */}
                <button
                  type="button"
                  className="hc-side-panel-tab-bar-button"
                  aria-label={formatUiMessage({ id: "thread.sidePanel.openTab", defaultMessage: "Open side panel tab" })}
                  title={formatUiMessage({ id: "thread.sidePanel.openTab", defaultMessage: "Open side panel tab" })}
                  onClick={() => {
                    sidePanel.controller.activateTab(null);
                    sidePanel.setPanelOpen(true);
                  }}
                >
                  {/* codex ghost-toolbar glyph = icon-xs (16px) */}
                  <Plus size={16} aria-hidden="true" />
                </button>
                {/*
                  * codex: thread-app-shell-chrome-*.js close button.
                  * Codex puts this in the AppShell `HeaderAction` slot at
                  * slotPosition='right' / order=300, but the rendered button
                  * itself is the same — the close-panel handler. HiCodex
                  * places it inline next to "+" to avoid threading a new slot
                  * through ConversationChrome.
                  */}
                <button
                  type="button"
                  className="hc-side-panel-tab-bar-button"
                  aria-label="Close side panel"
                  title="Close side panel"
                  onClick={() => sidePanel.setPanelOpen(false)}
                >
                  {/* codex ghost-toolbar glyph = icon-xs (16px) */}
                  <X size={16} aria-hidden="true" />
                </button>
              </>
            }
          />
        )}

        {/*
          * Codex Desktop opens file previews into its AppShell RightPanel
          * (in `app-shell-*.js`), not into the summary rail.
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
      ) : remoteTaskVisible ? (
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

      <PanelOverlays
        activeSettingsPanel={activeSettingsPanel}
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
        onSelectAction={handleSettingsPanelSelectAction}
        onSelectEntry={handleSettingsPanelSelectEntry}
        onSelectPanel={(panel) => void loadSettingsPanel(panel)}
        keymapOverrides={keymapOverrides}
        onSetKeyboardShortcut={setUiKeyboardShortcut}
        onResetKeyboardShortcut={resetUiKeyboardShortcut}
        uiTheme={uiThemeSnapshot}
        uiAppearance={uiAppearance}
        uiLocale={uiLocale}
        onSetUiTheme={setUiThemeMode}
        onSetUiFontSize={setUiFontSize}
        onSetCodeFontSize={setUiCodeFontSize}
        onSetReducedMotion={setUiReducedMotion}
        onSetUiLocale={setUiLocale}
        commandPanel={commandPanel}
        onCommandPanelClose={closeCommandPanel}
        onCommandPanelSelectAction={(action) => selectCommandPanelAction(action)}
        onCommandPanelSelectEntry={selectCommandPanelEntry}
        onSearchFiles={searchFilesFromCommandPanel}
        onSearchCommandMenu={searchCommandMenuFromPanel}
      />

      <McpDialogs
        toolForm={mcpToolForm}
        onToolFormClose={() => setMcpToolForm(null)}
        onToolFormSubmit={handleMcpToolFormSubmit}
        serverForm={mcpServerForm}
        onServerFormClose={() => setMcpServerForm(null)}
        onServerFormSubmit={handleMcpServerFormSubmit}
        followUpDialog={mcpFollowUpDialog}
        onFollowUpClose={closeMcpFollowUpDialog}
        onFollowUpSend={confirmMcpFollowUpDialog}
      />

      <ThreadDialogs
        threadActionDialog={threadActionDialog}
        onThreadActionClose={closeThreadActionDialog}
        onRename={renameSelectedThread}
        onArchive={archiveSelectedThread}
        forkConfirmOpen={forkConfirmOpen}
        forkConfirmSubmitting={forkConfirmSubmitting}
        onForkClose={dismissForkFromOlderTurn}
        onForkConfirm={confirmForkFromOlderTurn}
      />

      <AppOverlays
        patchFailure={patchFailure}
        onPatchFailureClose={() => setPatchFailure(null)}
        onPatchFailureOpenPath={handlePatchFailureOpenPath}
        modelPickerAnchor={modelPickerAnchor}
        modelPickerProviders={modelPickerProviders}
        modelPickerSelectedKey={modelPickerOverlaySelectedKey}
        modelPickerDefaultKey={modelPickerOverlayDefaultKey}
        modelPickerReadyProviders={readyProviders}
        modelPickerActiveThreadProviderId={activeThread?.modelProvider ?? null}
        onModelSelect={handleComposerModelSelect}
        onModelPickerOpenSettings={() => loadSettingsPanel("models")}
        onModelPickerSignIn={() => { void runSlashRequest("loginChatgpt"); }}
        onModelPickerClose={closeModelPicker}
        reasoningPickerAnchor={reasoningPickerAnchor}
        reasoningCurrentEffort={normalizeReasoningEffortValue(
          effectiveThreadContextDefaults?.reasoningEffort ?? state.threadContextDefaults?.reasoningEffort,
        )}
        reasoningSupportedEfforts={activeModelSupportedEfforts}
        onReasoningSelect={handleReasoningSelect}
        onReasoningPickerClose={closeReasoningPicker}
        permissionsPickerAnchor={permissionsPickerAnchor}
        permissionsCurrentMode={permissionModeFromThreadContext(
          effectiveThreadContextDefaults ?? state.threadContextDefaults ?? null,
        )}
        permissionsRequirements={permissionsRequirements}
        onPermissionApplyMode={applyComposerPermissionMode}
        onPermissionOpenCustomSettings={() => loadSettingsPanel("permissions")}
        onPermissionsPickerClose={closePermissionsPicker}
        keyboardShortcutsOpen={keyboardShortcutsOpen}
        onKeyboardShortcutsClose={closeKeyboardShortcuts}
        toastLogs={state.logs}
      />
      </div>
    </HiCodexIntlProvider>
    </DelinkFileCitationsContext.Provider>
    </FileCitationMenuContext.Provider>
  );
}

export function HiCodexApp() {
  const [state, dispatch] = useReducer(codexUiReducer, initialCodexUiState);
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const clientCallbacksRef = useRef<HiCodexClientCallbacks>({
    onNotification: () => {},
    onDebugEvent: () => {},
  });
  const fileSearchControllerRef = useRef<WorkspaceFuzzyFileSearchController | null>(null);
  /*
   * Thin shell: owns the true global singletons (reducer state/dispatch + the
   * JSON-RPC client) and provides them via ServicesContext so HiCodexAppBody and
   * its subtree read them with useServices() rather than via prop-drilling. The
   * client is built once here; its two body-coupled callbacks are reached through
   * clientCallbacksRef, which HiCodexAppBody (re)assigns each render. connect /
   * ensureConnected / auto-reconnect deliberately stay in the body (unmoved) so
   * no effect changes position — this split is behaviour-preserving.
   */
  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => clientCallbacksRef.current.onNotification(message),
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
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
        <HiCodexAppBody
          state={state}
          clientCallbacksRef={clientCallbacksRef}
          fileSearchControllerRef={fileSearchControllerRef}
        />
      </TeamServiceAuthGate>
    </ServicesProvider>
  );
}
