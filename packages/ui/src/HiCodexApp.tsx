import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type {
  CollaborationModeMask,
  JsonRpcNotification,
  ModelConfig,
  Thread,
} from "@hicodex/codex-protocol";
import { FileText, FolderOpen, Globe, Plus, X } from "lucide-react";
import { AppNavigationRail, type AppNavigationTab } from "./components/app-navigation-rail";
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
import { ThreadGoalBanner } from "./components/thread-goal-banner";
import { HiCodexIntlProvider } from "./components/i18n-provider";
import { ServicesProvider, useServices } from "./components/services-context";
import { focusComposerFromPlainTextKey } from "./components/composer-keyboard";
import { PreConversationLoadingShell } from "./components/pre-conversation-loading-shell";
import type { McpFollowUpDialogRequest } from "./components/mcp-follow-up-dialog";
import {
  DEFAULT_PROVIDERS,
  isSubscriptionProviderId,
  normalizeSubscriptionProviderId,
  resolveEffectiveModelSelection,
} from "./components/model-picker-menu";
import { normalizeReasoningEffortValue } from "./components/reasoning-picker-menu";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { BackgroundSubagentsStack } from "./components/background-subagents-stack";
import { ArtifactPreviewPanel } from "./components/artifact-preview-panel";
import { AutomationsPreviewPanel } from "./components/automations-preview-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
// codex inline-mentions-*.js / user-message-attachments-*.js context-menu wrapper —
// reveal + copy-contents actions for file-reference anchors + attachment pills,
// provided once above the conversation.
import { FileCitationMenuContext } from "./components/file-citation-menu";
import type { SubmitTurnRatingEvent } from "./components/turn-rating-controls";
import {
  turnFeedbackUploadClassification,
  turnFeedbackUploadReason,
  turnFeedbackUploadTags,
} from "./components/turn-rating-controls";
import {
  LiveTurnDiffPortal,
  shouldRenderLiveTurnDiffPortal,
} from "./components/live-turn-diff-portal";
import {
} from "./components/unified-diff-failure-dialog";
import type { McpFollowUpDialogOption } from "./components/mcp-follow-up-dialog";
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
import type { McpAppHostCallRequest, McpResourceReadRequest } from "./components/tool-activity-detail";
import { CodexJsonRpcClient, type RpcDebugEvent } from "./lib/codex-json-rpc-client";
import { formatError, hostFromBaseUrl, patchFailurePathForOpen } from "./lib/format";
import {
  openExternalUrl,
  revealPath,
  openThreadWindow,
  openNewWindow,
  isTauriRuntime,
  listenNativeShellEvents,
  pickFileReferences,
  pickWorkspaceFolder,
  readCodexAuthSummary,
  type CodexAuthSummary,
  type WorkspaceDirEntry,
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
// codex: app-shell-*.js — back/forward boundary helpers backing the
// ConversationChrome arrow buttons. Reducer keeps the stack in
// state.threadHistoryStack / state.threadHistoryIndex (see thread-history.ts).
import { canNavigateBackInHistory, canNavigateForwardInHistory } from "./state/thread-history";
import { artifactPreviewTabId, projectArtifactPreview, shouldOpenArtifactPreview } from "./state/artifact-preview";
import { refreshModels, saveModelDraft as saveModelDraftWorkflow } from "./model/model-workflow";
import {
  DEFAULT_SUBSCRIPTION_PROVIDER_ID,
  DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID,
  DEFAULT_MODEL_REASONING_SUMMARY,
  decodeSelection,
  encodeSelection,
  migrateSubscriptionModelSelection,
  EMPTY_MODEL,
  buildModelConfigFromConfig,
  modelSlugsForConfig,
  normalizeModelSlugs,
  normalizeModelConfig,
  LEGACY_SELECTED_MODEL_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
} from "./model/model-settings";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
  selectActiveThreadRuntime,
  selectItemsByThread,
  type PendingServerRequest,
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
  type SidebarOrganizeMode,
  type SidebarSortKey,
  threadProjectLabel,
} from "./state/sidebar-projection";
import {
  loadSidebarPreferences,
  saveSidebarPreferences,
  sidebarCollapsedGroupKeys as sidebarCollapsedGroupKeysFromPreferences,
  sidebarCollapsedGroupsFromKeys,
  sidebarPreferenceStorage,
  type SidebarPreferences,
} from "./state/sidebar-preferences";
import {
  fileReferenceSidePanelContextMenuItems,
  fileReferenceSidePanelTabKind,
  fileReferenceSidePanelTabId,
  type FileReferenceSelection,
} from "./state/file-references";
import {
  applySlashCommand,
  buildUserInputFromComposer,
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
  projectCommandPanelEntries,
  projectFileSearchEntries,
  projectPluginEntries,
  type CommandPanelOptions,
  type CommandPanelEntry,
  commandPanelThreadGroup,
  isAppBackedPanelState,
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
  basenameFromPath,
  fuzzyFileResultsToWorkspaceEntries,
  WorkspaceFuzzyFileSearchController,
  type WorkspaceFuzzyFileSearchSession,
  type WorkspaceFuzzyFileSearchSessionUpdated,
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
import {
  createI18nBundle,
  formatI18nMessage,
  loadHiCodexLocale,
  saveHiCodexLocale,
  type HiCodexLocale,
} from "./state/i18n";
import { readMigratedStorageValue } from "./state/hicodex-desktop-namespace";
import {
  loadNotificationPreferences,
  mergeNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "./state/notification-preferences";
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
  loadMcpManagementEntries,
  loadSettingsPanelContent,
} from "./state/settings-panel-loader";
import {
  DESKTOP_RIGHT_RAIL_GAP_PX,
  loadRightRailPinned,
  projectRightRailSections,
  rightRailDisplayMode,
  rightRailPreferenceStorage,
  rightRailReservedInlineEndPx,
  saveRightRailPinned,
} from "./state/right-rail";
import { openBrowserRuntime } from "./state/browser-runtime";
import { TAB_KINDS } from "./state/side-panel-tab-host";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import { recordObject } from "./state/thread-item-fields";
import { appendRpcDebugEvent } from "./state/rpc-debug";
import {
  loadUiThemeMode,
  nextToggleThemeMode,
  readSystemThemeVariant,
  subscribeSystemThemeVariant,
  resolveUiThemeMode,
  saveUiThemeMode,
  type ResolvedUiTheme,
  type UiThemeMode,
} from "./state/theme";
/*
 * CODEX-REF: Appearance preferences beyond Theme — Code font size (Codex
 * settings.general.appearance.codeFontSize.row) and Reduce motion (Codex
 * settings.general.appearance.reducedMotion.label). The setters mirror the
 * existing setUiThemeMode pattern: setState → save to desktop.hicodex.*
 * localStorage namespace. See [[appearance]] / packages/ui/src/state/appearance.ts.
 */
import {
  clampCodeFontSize,
  loadUiAppearance,
  saveUiCodeFontSize,
  saveUiReducedMotion,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "./state/appearance";
/*
 * CODEX-REF: keyboard-shortcuts-settings-*.js — user keymap overrides
 * state. Boot-loaded from localStorage, mutated by Edit/Reset/Unbind flows
 * from the Settings panel, and mirrored into the module-level singleton so
 * accelerator resolvers (useHotkey, descriptorAcceleratorLabel) see the
 * latest value without prop drilling.
 */
import {
  loadKeymapOverrides,
  saveKeymapOverrides,
  setActiveKeymapOverrides,
  withKeymapOverride,
  withoutKeymapOverride,
  type KeymapOverrides,
} from "./state/keymap-overrides";
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
  createAndSelectThreadForTurn,
  refreshThreads,
  refreshThreadMetadata,
  resumeThreadWithMetadataRead,
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  interruptThreadTurn,
  readThread,
  readWorkspaceDeveloperInstructions,
  sendPanelThreadMessage,
  startSideConversation,
  cleanBackgroundTerminalsForThread,
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

/*
 * Shared workspace-file-search session lifecycle: reuse the live session when
 * the roots key matches, otherwise stop the previous one and start a fresh
 * session, writing the session + roots-key refs back. The composer mention and
 * command-menu getters share this exact flow; only the back-store refs, the
 * close-failure warn wording (onCloseError), and the panel projection
 * (onUpdated) differ, so those are injected.
 */
function createDedupedFileSearchSession(config: {
  sessionRef: MutableRefObject<WorkspaceFuzzyFileSearchSession | null>;
  rootsKeyRef: MutableRefObject<string>;
  controllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
  onCloseError: (error: unknown) => void;
  onUpdated: (payload: WorkspaceFuzzyFileSearchSessionUpdated) => void;
}): (roots: string[]) => Promise<WorkspaceFuzzyFileSearchSession> {
  const { sessionRef, rootsKeyRef, controllerRef, onCloseError, onUpdated } = config;
  return async (roots: string[]): Promise<WorkspaceFuzzyFileSearchSession> => {
    const rootsKey = roots.join("\0");
    if (sessionRef.current && rootsKeyRef.current === rootsKey) {
      return sessionRef.current;
    }
    const previousSession = sessionRef.current;
    sessionRef.current = null;
    rootsKeyRef.current = "";
    if (previousSession) {
      await previousSession.stop().catch(onCloseError);
    }
    const controller = controllerRef.current;
    if (!controller) throw new Error("Fuzzy file search is unavailable.");
    const session = await controller.createSession({
      roots,
      onUpdated,
    });
    sessionRef.current = session;
    rootsKeyRef.current = rootsKey;
    return session;
  };
}



const LOCAL_SIDE_PANEL_HOST_ID = "local";



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
  const [uiLocale, setUiLocaleState] = useState<HiCodexLocale>(() => (
    loadHiCodexLocale(browserStorage(), typeof navigator === "undefined" ? null : navigator.language)
  ));
  const [uiThemeMode, setUiThemeModeState] = useState<UiThemeMode>(() => (
    loadUiThemeMode(browserStorage())
  ));
  // CODEX-REF: loadUiAppearance reads desktop.hicodex.appearance.codeFontSize
  // and desktop.hicodex.appearance.reducedMotion (see hicodex-desktop-namespace).
  const [uiAppearance, setUiAppearanceState] = useState<UiAppearancePreferences>(() => (
    loadUiAppearance(browserStorage())
  ));
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js. Boot-loaded snapshot
   * is also pushed into the module-level singleton (see setActiveKeymapOverrides
   * useEffect below) so accelerator resolvers in command-registry.ts and
   * commands.ts see overrides immediately, including for commands registered
   * during this render pass via useHotkey.
   */
  const [keymapOverrides, setKeymapOverridesState] = useState<KeymapOverrides>(() => {
    const initial = loadKeymapOverrides(browserStorage());
    setActiveKeymapOverrides(initial);
    return initial;
  });
  const [notificationPreferences, setNotificationPreferencesState] = useState<NotificationPreferences>(() => (
    loadNotificationPreferences(browserStorage())
  ));
  const notificationPreferencesRef = useRef(notificationPreferences);
  const [onboardingSnapshot, setOnboardingSnapshot] = useState(() => (
    loadOnboardingSnapshot(browserStorage())
  ));
  const [systemTheme, setSystemTheme] = useState<ResolvedUiTheme>(() => readSystemThemeVariant());
  const resolvedUiTheme = resolveUiThemeMode(uiThemeMode, systemTheme);
  const uiThemeSnapshot = useMemo(() => ({
    mode: uiThemeMode,
    resolved: resolvedUiTheme,
  }), [resolvedUiTheme, uiThemeMode]);
  const setUiThemeMode = useCallback((mode: UiThemeMode) => {
    setUiThemeModeState(mode);
    saveUiThemeMode(browserStorage(), mode);
  }, []);
  /*
   * CODEX-REF: settings.general.appearance.codeFontSize.row commit. Codex
   * Desktop persists onBlur; HiCodex commits each +/- click. clamp matches
   * the documented 8-24 px range from appearance-settings-*.js §4.
   */
  const setUiCodeFontSize = useCallback((size: number) => {
    const clamped = clampCodeFontSize(size);
    setUiAppearanceState((prev) => prev.codeFontSize === clamped ? prev : { ...prev, codeFontSize: clamped });
    saveUiCodeFontSize(browserStorage(), clamped);
  }, []);
  /*
   * CODEX-REF: settings.general.appearance.reducedMotion.label commit. Mode
   * string matches Codex option IDs system/on/off.
   */
  const setUiReducedMotion = useCallback((mode: ReducedMotionMode) => {
    setUiAppearanceState((prev) => prev.reducedMotion === mode ? prev : { ...prev, reducedMotion: mode });
    saveUiReducedMotion(browserStorage(), mode);
  }, []);
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js set/replace mutation.
   * Persists override, updates React state for the panel to re-render, and
   * synchronously pushes the new snapshot into the module singleton so
   * useHotkey closures rebind without waiting for the next effect tick.
   */
  const setUiKeyboardShortcut = useCallback((commandId: string, accelerator: string | null) => {
    setKeymapOverridesState((prev) => {
      const next = withKeymapOverride(prev, commandId, accelerator);
      setActiveKeymapOverrides(next);
      saveKeymapOverrides(browserStorage(), next);
      return next;
    });
  }, []);
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js reset mutation. Drops
   * the override so the descriptor default takes effect again.
   */
  const resetUiKeyboardShortcut = useCallback((commandId: string) => {
    setKeymapOverridesState((prev) => {
      const next = withoutKeymapOverride(prev, commandId);
      if (next === prev) return prev;
      setActiveKeymapOverrides(next);
      saveKeymapOverrides(browserStorage(), next);
      return next;
    });
  }, []);
  const setUiLocale = useCallback((locale: HiCodexLocale) => {
    setUiLocaleState(locale);
    saveHiCodexLocale(browserStorage(), locale);
  }, []);
  const setNotificationPreferences = useCallback((patch: Partial<NotificationPreferences>) => {
    const next = mergeNotificationPreferences(notificationPreferencesRef.current, patch);
    notificationPreferencesRef.current = next;
    setNotificationPreferencesState(next);
    saveNotificationPreferences(browserStorage(), next);
    return next;
  }, []);
  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);
  useEffect(() => subscribeSystemThemeVariant(setSystemTheme), []);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.lang = uiLocale;
    root.dataset.hcLocale = uiLocale;
    root.dataset.hcTheme = resolvedUiTheme;
    root.dataset.hcThemeMode = uiThemeMode;
    root.classList.toggle("dark", resolvedUiTheme === "dark");
    root.classList.toggle("electron-dark", resolvedUiTheme === "dark");
  }, [resolvedUiTheme, uiLocale, uiThemeMode]);
  /*
   * Locale-aware formatter for the label projections computed in this component.
   * HiCodexApp renders (and therefore sits ABOVE) the HiCodexIntlProvider, so it
   * cannot use useHiCodexIntl; instead it builds the same bundle from uiLocale so
   * projection labels (composer placeholder, slash/memories copy, settings nav)
   * localize identically to hook-based components.
   */
  const formatUiMessage = useMemo(() => {
    const bundle = createI18nBundle(uiLocale);
    return (
      descriptor: Parameters<typeof formatI18nMessage>[1],
      values?: Parameters<typeof formatI18nMessage>[2],
    ) => formatI18nMessage(bundle, descriptor, values);
  }, [uiLocale]);
  /*
   * CODEX-REF: Apply Code font size + Reduce motion to the DOM root.
   *
   *   - --codex-chat-code-font-size is the existing token defined in base.css
   *     :65; overriding it on `documentElement.style` lets every consumer of
   *     that variable (chat code blocks, inline `code`, diff hunks) update
   *     live without restart.
   *   - data-hc-reduce-motion="on" / "off" lets base.css forcibly enable or
   *     suppress transitions and animations regardless of the OS
   *     prefers-reduced-motion media query. "system" leaves the value unset so
   *     the media query alone decides — matching Codex Desktop §8 behaviour.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--codex-chat-code-font-size", `${uiAppearance.codeFontSize}px`);
    if (uiAppearance.reducedMotion === "system") {
      delete root.dataset.hcReduceMotion;
    } else {
      root.dataset.hcReduceMotion = uiAppearance.reducedMotion;
    }
  }, [uiAppearance.codeFontSize, uiAppearance.reducedMotion]);
  const [sidebarPreferences, setSidebarPreferencesState] = useState<SidebarPreferences>(() => (
    loadSidebarPreferences(sidebarPreferenceStorage())
  ));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("workbench");
  const [activeRemoteTaskId, setActiveRemoteTaskId] = useState<string | null>(null);
  const openWorkbenchTab = useCallback(() => {
    setActiveAppTab("workbench");
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);
  const sidebarCollapsedGroupKeys = useMemo(() => (
    new Set(sidebarCollapsedGroupKeysFromPreferences(sidebarPreferences.collapsedGroups))
  ), [sidebarPreferences.collapsedGroups]);
  const setSidebarPreferences = useCallback((patch: Partial<SidebarPreferences>) => {
    setSidebarPreferencesState((current) => {
      const next = { ...current, ...patch };
      saveSidebarPreferences(sidebarPreferenceStorage(), next);
      return next;
    });
  }, []);
  const setSidebarSortKey = useCallback((sortKey: SidebarSortKey) => {
    setSidebarPreferences({ sortKey });
  }, [setSidebarPreferences]);
  const setSidebarOrganizeMode = useCallback((organizeMode: SidebarOrganizeMode) => {
    setSidebarPreferences({ organizeMode });
  }, [setSidebarPreferences]);
  const setSidebarCollapsedGroupKeys = useCallback((collapsedGroupKeys: string[]) => {
    setSidebarPreferences({ collapsedGroups: sidebarCollapsedGroupsFromKeys(collapsedGroupKeys) });
  }, [setSidebarPreferences]);
  const [rightRailPinned, setRightRailPinnedState] = useState(() => (
    loadRightRailPinned(rightRailPreferenceStorage())
  ));
  const setRightRailPinned = useCallback((isPinned: boolean) => {
    setRightRailPinnedState(isPinned);
    saveRightRailPinned(rightRailPreferenceStorage(), isPinned);
  }, []);
  const [rightRailPopoverOpen, setRightRailPopoverOpen] = useState(false);
  const [composerStatusPanelOpen, setComposerStatusPanelOpen] = useState(false);
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
  const mcpFollowUpDialogPendingRef = useRef(false);
  const mcpFollowUpDialogDispatchingRef = useRef(false);
  const openSideConversationPanelRef = useRef<((thread: Thread) => void) | null>(null);
  /*
   * User-overridden model selection for new chats. Persisted under the
   * `desktop.hicodex.*` app namespace. When non-null, applied to ThreadStart /
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
      const stored = readMigratedStorageValue(window.localStorage, SELECTED_MODEL_STORAGE_KEY, [LEGACY_SELECTED_MODEL_STORAGE_KEY]);
      const migrated = migrateSubscriptionModelSelection(stored);
      if (migrated !== stored) {
        if (migrated) window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, migrated);
        else window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
      }
      return migrated;
    } catch {
      return null;
    }
  });
  const setSelectedModelKey = useCallback((key: string | null) => {
    const nextKey = migrateSubscriptionModelSelection(key);
    setSelectedModelKeyState(nextKey);
    try {
      if (nextKey) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, nextKey);
      } else {
        window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_SELECTED_MODEL_STORAGE_KEY);
      }
    } catch {
      // localStorage not available — selection still works in memory
    }
  }, []);

  /*
   * CODEX-REF: composer-*.js — Codex setter `f(d.model, t) =
   * setModelAndReasoningEffort` writes selected effort to modelSettings, which
   * feeds into composer's `m.reasoningEffort` (= effectiveThreadContextDefaults
   * 在 HiCodex 这边). HiCodex 用同 selectedModelKey 模式：单独 useState 持久化到
   * localStorage，effectiveThreadContextDefaults 合并时优先取这里。
   */
  const [reasoningEffortOverride, setReasoningEffortOverrideState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem("hicodex.reasoningEffortOverride");
    } catch {
      return null;
    }
  });
  const setReasoningEffortOverride = useCallback((effort: string | null) => {
    setReasoningEffortOverrideState(effort);
    try {
      if (effort) {
        window.localStorage.setItem("hicodex.reasoningEffortOverride", effort);
      } else {
        window.localStorage.removeItem("hicodex.reasoningEffortOverride");
      }
    } catch {
      // localStorage not available — selection still works in memory
    }
  }, []);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<HTMLElement | null>(null);
  const toggleModelPickerAnchor = useCallback((anchor: HTMLElement) => {
    setModelPickerAnchor((current) => (current === anchor ? null : anchor));
  }, []);
  /*
   * CODEX-REF: composer-*.js — Reasoning picker uses `Ia` popover anchored
   * to footer trigger button. HiCodex 复刻同 anchor 模式：toggleable HTMLElement
   * state，由 footer chip 的 onClick 通过 setReasoningPickerAnchor 打开 popover。
   */
  const [reasoningPickerAnchor, setReasoningPickerAnchor] = useState<HTMLElement | null>(null);
  const toggleReasoningPickerAnchor = useCallback((anchor: HTMLElement) => {
    setReasoningPickerAnchor((current) => (current === anchor ? null : anchor));
  }, []);
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
  const [modelDraft, setModelDraft] = useState<ModelConfig>(EMPTY_MODEL);
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
  const mcpStartupStatusPanelHandledRef = useRef(0);
  const appListChangedHandledRef = useRef(0);
  const openArtifactPreviewTabRef = useRef<((entry: RailEntry) => void) | null>(null);
  const refreshOpenFileWatchTabsRef = useRef<((watchId: string) => void) | null>(null);
  const authRefreshTokenOnNextRefreshRef = useRef(false);
  const accountRefreshTokenOnNextRefreshRef = useRef(false);
  const workspaceInitialized = useRef(false);
  const fileSearchRequestSeqRef = useRef(0);
  const fileSearchSessionRef = useRef<WorkspaceFuzzyFileSearchSession | null>(null);
  const fileSearchSessionRootsKeyRef = useRef("");
  const fileSearchActiveQueryRef = useRef("");
  const commandMenuSearchRequestSeqRef = useRef(0);
  const commandMenuFileSearchSessionRef = useRef<WorkspaceFuzzyFileSearchSession | null>(null);
  const commandMenuFileSearchSessionRootsKeyRef = useRef("");
  const commandMenuFileSearchActiveRef = useRef<{
    query: string;
    baseEntries: CommandPanelEntry[];
  } | null>(null);
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
  const submitTurnFeedback = useCallback<SubmitTurnRatingEvent>(async (event) => {
    try {
      await client.request("feedback/upload", {
        classification: turnFeedbackUploadClassification(event),
        reason: turnFeedbackUploadReason(event),
        threadId: event.threadId,
        includeLogs: false,
        tags: turnFeedbackUploadTags(event),
      }, 120_000);
      if (event.eventKind === "action") {
        dispatch({ type: "log", text: "Turn feedback sent.", level: "info" });
      }
    } catch (error) {
      const prefix = event.eventKind === "action" ? "Turn feedback submit failed" : "Turn rating failed";
      dispatch({ type: "log", text: `${prefix}: ${formatError(error)}`, level: "warn" });
    }
  }, [client]);

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

  // Re-check when the picker opens (covers OAuth completing while picker is closed).
  useEffect(() => {
    if (modelPickerAnchor) dispatch({ type: "invalidateAuth" });
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
  const activeModelSupportsImageInput = useMemo(() => {
    const providerId = state.threadContextDefaults?.modelProvider ?? "";
    const modelSlug = state.threadContextDefaults?.model ?? "";
    const model = state.models.find((item) => item.id === providerId)
      ?? state.models.find((item) => item.model === modelSlug)
      ?? null;
    return model?.supportsImageInput !== false;
  }, [state.models, state.threadContextDefaults?.model, state.threadContextDefaults?.modelProvider]);
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
    }),
    [composerWorkMode, worktreeHostGitStatus],
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

  useEffect(() => {
    if (workspaceInitialized.current || !state.hostStatus?.defaultCwd) return;
    workspaceInitialized.current = true;
    /*
     * CODEX-REF: thread-context-*.js / use-webview-execution-target-*.js
     * Codex 桌面版 thread.cwd 来自 Environment/worktree picker 的 workspaceRoot，
     * 永远是用户实际工作目录（非进程 CWD）。HiCodex 之前用 host 上报的 defaultCwd
     * 作为 workspace 初值——Rust 端 host 已修为优先 `$HOME`，但前端仍兜底过滤：
     * 拒绝明显是 Tauri 进程目录 / 仓内构建目录的路径，防止旧 host bin 仍 leak 出错误值。
     */
    setWorkspace((current) => {
      if (current.trim()) return current;
      const candidate = (state.hostStatus?.defaultCwd ?? "").trim();
      if (!candidate) return "";
      const lower = candidate.toLowerCase();
      if (
        lower.endsWith("/src-tauri")
        || lower.includes("/src-tauri/")
        || lower.includes("/node_modules/")
        || lower.includes("/target/")
      ) {
        // host bin 还在报告进程 cwd 的旧路径——丢弃，让用户后续 setWorkspace
        // (例如打开 thread 时 activeThread.cwd 同步) 设入正确值。
        return "";
      }
      return candidate;
    });
  }, [state.hostStatus?.defaultCwd]);

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
  }, [client, state.invalidation.mcpStatus, state.connected]);

  useEffect(() => {
    setArtifactPreview(null);
    setFileReference(null);
  }, [state.activeThreadId]);

  const ensureConnected = useCallback(async () => {
    if (state.connected) return true;
    return connect();
  }, [connect, state.connected]);

  /*
   * Effective ThreadContextDefaults for thread/start + thread/fork calls.
   * If the user picked a (provider, model) pair in the UI picker, override
   * the config.toml default's model + modelProvider. Otherwise pass through
   * unchanged. Workspace AGENTS.md / CLAUDE.md instructions are appended here
   * so thread/start, thread/fork, and side conversations share the same context.
   *
   * `selectedModelKey` here stores `${providerId}::${modelSlug}` —
   * see DEFAULT_PROVIDERS + encodeSelection in model-picker-menu.tsx.
   */
  const modelPickerProviders = useMemo(() => {
    const localFallback = DEFAULT_PROVIDERS.find((provider) => provider.id === "hicodex_local")
      ?? DEFAULT_PROVIDERS[0];
    const subscriptionProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID);
    const activeProviderId = state.threadContextDefaults?.modelProvider?.trim() || localFallback.id;
    const draftProviderId = modelDraft.id.trim();
    const activeIsSubscription = isSubscriptionProviderId(activeProviderId);
    const useDraftForLocalProvider = draftProviderId.length > 0 && !isSubscriptionProviderId(draftProviderId);
    const localProviderId = useDraftForLocalProvider
      ? draftProviderId
      : (!activeIsSubscription ? activeProviderId : localFallback.id);
    const localModels = normalizeModelSlugs([
      ...modelSlugsForConfig(modelDraft),
    ]);
    const subscriptionModels = subscriptionProvider
      ? normalizeModelSlugs([
          ...subscriptionProvider.models,
          activeIsSubscription ? state.threadContextDefaults?.model : null,
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
      ...(subscriptionProvider
        ? [{
            ...subscriptionProvider,
            models: subscriptionModels.length > 0 ? subscriptionModels : subscriptionProvider.models,
          }]
        : []),
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
   *   - For ChatGPT subscription providers: ready when `getAuthStatus` returns
   *     any non-null auth method, or when the isolated HiCodex auth.json has a
   *     ChatGPT/API-key credential. `getAuthStatus` is scoped to the active
   *     provider, so a local API provider with `requires_openai_auth = false`
   *     would otherwise make the subscription provider look signed out.
   */
  const readyProviders = useMemo(() => {
    const ready = new Set<string>();
    const active = state.threadContextDefaults?.modelProvider ?? "";
    // `getAuthStatus` is provider-scoped: local gateways with
    // `requires_openai_auth = false` report no OpenAI auth even when ChatGPT
    // OAuth is complete. Keep the subscription provider ready when either the
    // live RPC reports an auth method or the isolated Codex auth.json contains
    // a ChatGPT/API-key credential.
    if (active && !isSubscriptionProviderId(active)) {
      ready.add(active);
    }
    if ((oauthAuthMethod && oauthAuthMethod.length > 0) || hasOpenAiCredentialSummary(codexAuthSummary)) {
      ready.add(DEFAULT_SUBSCRIPTION_PROVIDER_ID);
      ready.add(DEFAULT_SUBSCRIPTION_HTTP_PROVIDER_ID);
    }
    return ready;
  }, [codexAuthSummary, state.threadContextDefaults?.modelProvider, oauthAuthMethod]);

  /*
   * If the intended model's provider is not signed in, resolve to a ready
   * provider+model so a new chat actually sends instead of spinning on
   * "Reconnecting…". The intended pick stays in selectedModelKey / config, so
   * signing in restores it automatically. `noReadyProvider` → the composer
   * blocks send and prompts sign-in / configuration instead.
   */
  const effectiveModelSelection = useMemo(() => {
    const intendedKey = selectedModelKey
      ?? (state.threadContextDefaults?.modelProvider && state.threadContextDefaults?.model
        ? encodeSelection(
            normalizeSubscriptionProviderId(state.threadContextDefaults.modelProvider),
            state.threadContextDefaults.model,
          )
        : null);
    return resolveEffectiveModelSelection({
      intended: decodeSelection(intendedKey),
      providers: modelPickerProviders,
      readyProviders,
    });
  }, [
    modelPickerProviders,
    readyProviders,
    selectedModelKey,
    state.threadContextDefaults?.model,
    state.threadContextDefaults?.modelProvider,
  ]);

  const effectiveThreadContextDefaults = useMemo(() => {
    const picked = decodeSelection(selectedModelKey);
    let modelContext = picked ? {
      ...(state.threadContextDefaults ?? {}),
      model: picked.model,
      modelProvider: normalizeSubscriptionProviderId(picked.providerId),
    } : state.threadContextDefaults;
    /*
     * Apply the not-signed-in fallback: when the intended provider is not ready
     * but another is, send to the ready (provider, model) instead. Skip when
     * nothing is ready (the composer surfaces a sign-in prompt and disables send).
     */
    if (!effectiveModelSelection.noReadyProvider
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
  }, [effectiveModelSelection, reasoningEffortOverride, selectedModelKey, state.threadContextDefaults, workspace, workspaceDeveloperInstructions]);
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

  useEffect(() => {
    if (!mcpFollowUpDialog && !mcpFollowUpDialogDispatchingRef.current) {
      mcpFollowUpDialogPendingRef.current = false;
    }
  }, [mcpFollowUpDialog]);

  const closeMcpFollowUpDialog = useCallback(() => {
    const pending = mcpFollowUpDialog;
    setMcpFollowUpDialog(null);
    mcpFollowUpDialogPendingRef.current = false;
    pending?.reject(mcpAppBridgeUserCancelledError());
  }, [mcpFollowUpDialog]);

  const confirmMcpFollowUpDialog = useCallback(async (prompt: string, option: McpFollowUpDialogOption) => {
    const pending = mcpFollowUpDialog;
    if (!pending) return;
    mcpFollowUpDialogDispatchingRef.current = true;
    setMcpFollowUpDialog(null);
    try {
      const result = await sendMcpAppFollowUpMessage(pending.request, prompt, option);
      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
      dispatch({ type: "log", text: `MCP app follow-up failed: ${formatError(error)}`, level: "error" });
    } finally {
      mcpFollowUpDialogDispatchingRef.current = false;
      mcpFollowUpDialogPendingRef.current = false;
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

  // modelPickerProviders, readyProviders + effectiveModelSelection are defined
  // above effectiveThreadContextDefaults (hoisted so the not-signed-in fallback
  // can resolve before the thread-context defaults / composer state are built).

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
    setComposerAttachments,
    setInput,
    threadContextDefaults: effectiveThreadContextDefaults,
    threads: state.threads,
    workspace,
  });
  const createWorkbenchThread = useCallback(async () => {
    openWorkbenchTab();
    await createThread();
  }, [createThread, openWorkbenchTab]);
  const selectWorkbenchThread = useCallback(async (thread: Thread) => {
    openWorkbenchTab();
    await selectThread(thread);
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
    openSideChatFromThread,
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
  openSideConversationPanelRef.current = openSideConversationPanel;

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
  const { openRemoteTask, openRemoteTaskExternal } = useRemoteTaskActions({ setActiveRemoteTaskId, setActiveAppTab });

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

  const stopFileSearchSession = useCallback(() => {
    fileSearchRequestSeqRef.current += 1;
    fileSearchActiveQueryRef.current = "";
    fileSearchSessionRootsKeyRef.current = "";
    const session = fileSearchSessionRef.current;
    fileSearchSessionRef.current = null;
    if (!session) return;
    void session.stop().catch((error) => {
      dispatch({ type: "log", text: `Failed to close fuzzy file search session: ${formatError(error)}`, level: "warn" });
    });
  }, []);

  const stopCommandMenuFileSearchSession = useCallback(() => {
    commandMenuSearchRequestSeqRef.current += 1;
    commandMenuFileSearchActiveRef.current = null;
    commandMenuFileSearchSessionRootsKeyRef.current = "";
    const session = commandMenuFileSearchSessionRef.current;
    commandMenuFileSearchSessionRef.current = null;
    if (!session) return;
    void session.stop().catch((error) => {
      dispatch({ type: "log", text: `Failed to close command menu file search session: ${formatError(error)}`, level: "warn" });
    });
  }, []);

  const getFileSearchSession = useCallback(createDedupedFileSearchSession({
    sessionRef: fileSearchSessionRef,
    rootsKeyRef: fileSearchSessionRootsKeyRef,
    controllerRef: fileSearchControllerRef,
    onCloseError: (error) => {
      dispatch({ type: "log", text: `Failed to close fuzzy file search session: ${formatError(error)}`, level: "warn" });
    },
    onUpdated: ({ query, files }) => {
      if (query !== fileSearchActiveQueryRef.current) return;
      const entries = projectFileSearchEntries({ files });
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: entries.length > 0 ? "ready" : "empty",
            title: "Search files",
            message: entries.length > 0
              ? `${entries.length} matching file(s). Select one to mention it.`
              : "No matching files found.",
            entries,
          })
        : current);
    },
  }), []);

  const getCommandMenuFileSearchSession = useCallback(createDedupedFileSearchSession({
    sessionRef: commandMenuFileSearchSessionRef,
    rootsKeyRef: commandMenuFileSearchSessionRootsKeyRef,
    controllerRef: fileSearchControllerRef,
    onCloseError: (error) => {
      dispatch({ type: "log", text: `Failed to close command menu file search session: ${formatError(error)}`, level: "warn" });
    },
    onUpdated: ({ query, files }) => {
      const active = commandMenuFileSearchActiveRef.current;
      if (!active || query !== active.query) return;
      const fileEntries = projectFileSearchEntries({ files });
      setCommandPanel((current) => isCommandMenuPanel(current)
        ? createCommandPanelState("generic", {
            status: "ready",
            title: "Search commands and chats",
            message: fileEntries.length > 0 ? `${fileEntries.length} workspace file result(s).` : "",
            entries: [...active.baseEntries, ...fileEntries],
            searchable: true,
          })
        : current);
    },
  }), []);

  const openFileSearchPanel = useCallback(() => {
    fileSearchRequestSeqRef.current += 1;
    stopCommandMenuFileSearchSession();
    openCommandPanel("files", {
      status: "empty",
      title: "Search files",
      message: "Type to search workspace files.",
      entries: [],
    });
  }, [openCommandPanel, stopCommandMenuFileSearchSession]);

  const searchFilesFromCommandPanel = useCallback((query: string) => {
    const trimmedQuery = query.trim();
    const cwd = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    const requestSeq = fileSearchRequestSeqRef.current + 1;
    fileSearchRequestSeqRef.current = requestSeq;
    fileSearchActiveQueryRef.current = trimmedQuery;
    if (!trimmedQuery) {
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: "empty",
            title: "Search files",
            message: "Type to search workspace files.",
            entries: [],
          })
        : current);
      return;
    }
    if (!cwd) {
      setCommandPanel((current) => current?.panel === "files"
        ? createCommandPanelState("files", {
            status: "error",
            title: "Search files",
            error: "No workspace cwd is available for file search.",
            entries: [],
          })
        : current);
      return;
    }
    setCommandPanel((current) => current?.panel === "files"
      ? createCommandPanelState("files", {
          status: "loading",
          title: "Search files",
          message: `Searching files for "${trimmedQuery}"...`,
          entries: [],
        })
      : current);
    void (async () => {
      try {
        if (!(await ensureConnected())) {
          if (fileSearchRequestSeqRef.current !== requestSeq) return;
          setCommandPanel((current) => current?.panel === "files"
            ? createCommandPanelState("files", {
                status: "error",
                title: "Search files",
                error: "Runtime is offline.",
                entries: [],
              })
            : current);
          return;
        }
        const session = await getFileSearchSession([cwd]);
        if (fileSearchRequestSeqRef.current !== requestSeq) return;
        await session.update(trimmedQuery);
      } catch (error) {
        if (fileSearchRequestSeqRef.current !== requestSeq) return;
        setCommandPanel((current) => current?.panel === "files"
          ? createCommandPanelState("files", {
              status: "error",
              title: "Search files",
              error: formatError(error),
              entries: [],
            })
          : current);
      }
    })();
  }, [activeThread?.cwd, ensureConnected, getFileSearchSession, state.hostStatus?.defaultCwd, workspace]);

  const searchWorkspaceFilesForFilesTab = useCallback(async (
    query: string,
    root: string,
  ): Promise<WorkspaceDirEntry[]> => {
    if (!(await ensureConnected())) {
      throw new Error("Runtime is offline.");
    }
    const controller = fileSearchControllerRef.current;
    if (!controller) throw new Error("Fuzzy file search is unavailable.");
    const result = await controller.searchOnce({ roots: [root], query });
    return fuzzyFileResultsToWorkspaceEntries(root, result.files ?? []);
  }, [ensureConnected]);

  const searchCommandMenuFromPanel = useCallback((query: string) => {
    const trimmedQuery = query.trim();
    const baseEntries = commandMenuEntries();
    const cwd = activeThread?.cwd?.trim() || workspace.trim() || state.hostStatus?.defaultCwd?.trim() || "";
    const requestSeq = commandMenuSearchRequestSeqRef.current + 1;
    commandMenuSearchRequestSeqRef.current = requestSeq;
    commandMenuFileSearchActiveRef.current = trimmedQuery
      ? { query: trimmedQuery, baseEntries }
      : null;
    if (!trimmedQuery || !cwd) {
      setCommandPanel((current) => isCommandMenuPanel(current)
        ? createCommandPanelState("generic", {
            status: "ready",
            title: "Search commands and chats",
            message: "",
            entries: baseEntries,
            searchable: true,
          })
        : current);
      return;
    }
    void (async () => {
      try {
        if (!(await ensureConnected())) return;
        const session = await getCommandMenuFileSearchSession([cwd]);
        if (commandMenuSearchRequestSeqRef.current !== requestSeq) return;
        await session.update(trimmedQuery);
      } catch {
        if (commandMenuSearchRequestSeqRef.current !== requestSeq) return;
        setCommandPanel((current) => isCommandMenuPanel(current)
          ? createCommandPanelState("generic", {
              status: "ready",
              title: "Search commands and chats",
              message: "",
              entries: baseEntries,
              searchable: true,
            })
          : current);
      }
    })();
  }, [activeThread?.cwd, commandMenuEntries, ensureConnected, getCommandMenuFileSearchSession, state.hostStatus?.defaultCwd, workspace]);

  useEffect(() => {
    if (!commandPanel) {
      stopFileSearchSession();
      stopCommandMenuFileSearchSession();
      return;
    }
    if (commandPanel.panel !== "files") stopFileSearchSession();
    if (!isCommandMenuPanel(commandPanel)) stopCommandMenuFileSearchSession();
  }, [commandPanel, stopCommandMenuFileSearchSession, stopFileSearchSession]);

  const closeCommandPanel = useCallback(() => {
    stopFileSearchSession();
    stopCommandMenuFileSearchSession();
    setCommandPanel(null);
  }, [stopCommandMenuFileSearchSession, stopFileSearchSession]);

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
  // codex: electron-menu-shortcuts-*.js#showKeyboardShortcuts (default = ⌘⇧/) +
  // keyboard-shortcuts-settings-*.js — dialog state.
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

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

  useEffect(() => {
    const commandAppsOpen = commandPanel?.panel === "apps";
    const commandPluginsOpen = commandPanel?.panel === "plugins";
    const settingsAppsOpen = activeSettingsPanel === "apps";
    const settingsPluginsOpen = activeSettingsPanel === "plugins";
    const hasOpenAppBackedPanel = commandAppsOpen || commandPluginsOpen || settingsAppsOpen || settingsPluginsOpen;
    if (state.invalidation.appList === 0 || !hasOpenAppBackedPanel) return;
    if (appListChangedHandledRef.current === state.invalidation.appList) return;
    appListChangedHandledRef.current = state.invalidation.appList;
    const refreshMessage = state.invalidation.appListMessage;
    let disposed = false;
    setCommandPanel((current) => isAppBackedPanelState(current)
      ? {
          ...current,
          status: "loading",
          message: `${refreshMessage} Refreshing Apps and Plugins...`,
        }
      : current);
    setSettingsPanelState((current) => isAppBackedPanelState(current)
      ? {
          ...current,
          status: "loading",
          message: `${refreshMessage} Refreshing Apps and Plugins...`,
        }
      : current);

    async function refreshAppBackedPanels() {
      if (!(await ensureConnected())) {
        if (disposed) return;
        setCommandPanel((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: "Runtime is offline.",
              entries: current.entries,
            })
          : current);
        return;
      }
      try {
        const apps = await loadAllApps(client, { forceRefetch: true, threadId: state.activeThreadId });
        setAppRegistry(appRegistryEntriesFromResponse(apps));
        const pluginsNeeded = commandPluginsOpen || settingsPluginsOpen;
        const plugins = pluginsNeeded
          ? await client.request<unknown>("plugin/list", {
              cwds: workspace.trim() ? [workspace.trim()] : null,
            }, 120_000)
          : null;
        if (disposed) return;
        setCommandPanel((current) => {
          if (current?.panel === "apps") {
            return createCommandPanelState("apps", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Apps from app-server.`,
              entries: projectCommandPanelEntries({ apps }),
            });
          }
          if (current?.panel === "plugins" && plugins !== null) {
            return createCommandPanelState("plugins", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Plugins from app-server.`,
              entries: projectPluginEntries(plugins, { apps }),
            });
          }
          return current;
        });
        setSettingsPanelState((current) => {
          if (current?.panel === "apps") {
            return createCommandPanelState("apps", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Apps from app-server.`,
              entries: projectCommandPanelEntries({ apps }),
            });
          }
          if (current?.panel === "plugins" && plugins !== null) {
            return createCommandPanelState("plugins", {
              status: "ready",
              title: current.title,
              message: `${refreshMessage} Refreshed Plugins from app-server.`,
              entries: projectPluginEntries(plugins, { apps }),
            });
          }
          return current;
        });
      } catch (error) {
        if (disposed) return;
        setCommandPanel((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
        setSettingsPanelState((current) => isAppBackedPanelState(current)
          ? createCommandPanelState(current.panel, {
              status: "error",
              title: current.title,
              error: formatError(error),
              entries: current.entries,
            })
          : current);
      }
    }

    void refreshAppBackedPanels();
    return () => {
      disposed = true;
    };
  }, [
    activeSettingsPanel,
    state.invalidation.appList,
    client,
    commandPanel?.panel,
    ensureConnected,
    state.activeThreadId,
    workspace,
  ]);

  useEffect(() => {
    if (state.invalidation.mcpStatus === 0 || activeSettingsPanel !== "mcp") return;
    if (mcpStartupStatusPanelHandledRef.current === state.invalidation.mcpStatus) return;
    mcpStartupStatusPanelHandledRef.current = state.invalidation.mcpStatus;
    let disposed = false;
    const refreshMessage = state.invalidation.mcpStatusMessage;
    setSettingsPanelState((current) => current?.panel === "mcp"
      ? { ...current, status: "loading", message: `${refreshMessage} Refreshing...` }
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
          workspace,
        });
        if (disposed) return;
        setSettingsPanelState((current) => current?.panel === "mcp"
          ? {
              ...current,
              status: "ready",
              message: `${refreshMessage} Refreshed MCP status.`,
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
    state.invalidation.mcpStatus,
    state.mcpServerStartupStatuses,
  ]);

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
      () => setKeyboardShortcutsOpen(true),
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
    openRenameThreadDialog,
    pinnedThreadIds,
    toggleThreadPinned,
    workspace,
  ]);

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
    setFileReference,
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
      }),
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
        title: "Files",
        description: "Browse project files",
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
  const previewRailArtifactAndOpenRail = useCallback<typeof previewRailArtifact>((entry) => {
    return previewRailArtifact(entry);
  }, [previewRailArtifact]);
  const previewRailFileReferenceAndOpenRail = useCallback((reference: RailEntryReference) => {
    openFileReferenceSidePanelTab(reference, { isPreview: true });
  }, [openFileReferenceSidePanelTab]);
  const openRailUrlAndOpenRail = useCallback<typeof openRailUrl>((url) => {
    return openRailUrl(url);
  }, [openRailUrl]);
  const openAssistantArtifactInSidePanel = useCallback((entry: RailEntry) => {
    if (shouldOpenArtifactPreview(entry)) {
      previewRailArtifactAndOpenRail(entry);
      return;
    }
    if (entry.reference) {
      previewRailFileReferenceAndOpenRail(entry.reference);
      return;
    }
    if (entry.action?.kind === "url") {
      openRailUrlAndOpenRail(entry.action.url);
      return;
    }
    previewRailArtifactAndOpenRail(entry);
  }, [
    openRailUrlAndOpenRail,
    previewRailArtifactAndOpenRail,
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
          onOpenUrl: openRailUrlAndOpenRail,
        },
      });
    };
    return () => {
      openArtifactPreviewTabRef.current = null;
    };
  }, [
    openRailArtifactFileExternal,
    openRailUrlAndOpenRail,
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
    activeThreadId: state.activeThreadId,
    activeThreadRunning,
    activeTurnId,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerMode,
    composerSubmitState,
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
      threads: state.threads,
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
    state.threads,
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
            setReasoningPickerAnchor((current) => current === chip ? null : chip);
          }
        }
        return;
      }
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [composerMode, createWorkbenchThread, enableComposerPlanMode, loadSettingsPanel, openCommandMenu, runSlashRequest, setActiveComposerMode, setReasoningPickerAnchor]);

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
  // codex: inline file references carry the workspace-file context menu; provide the
  // reveal + copy-contents actions (host + path resolution) to every FileCitationAnchor.
  const fileCitationMenuActions = useMemo(
    () => ({ onReveal: revealFileReference, onCopyContents: copyFileReferenceContents }),
    [revealFileReference, copyFileReferenceContents],
  );

  return (
    <FileCitationMenuContext.Provider value={fileCitationMenuActions}>
    <HiCodexIntlProvider locale={uiLocale}>
      <div
        className={appClassName}
        data-app-tab={activeAppTab}
        data-locale={uiLocale}
        data-sidebar-open={sidebarVisible ? "true" : "false"}
        data-theme={resolvedUiTheme}
        data-theme-mode={uiThemeMode}
        lang={uiLocale}
      >
      <AppNavigationRail
        activeTab={activeAppTab}
        onTabChange={setActiveAppTab}
        onOpenSettings={() => void loadSettingsPanel("general")}
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
                    model={effectiveThreadContextDefaults?.model ?? state.threadContextDefaults?.model}
                    approvalPolicy={effectiveThreadContextDefaults?.approvalPolicy ?? state.threadContextDefaults?.approvalPolicy}
                    approvalsReviewer={effectiveThreadContextDefaults?.approvalsReviewer ?? state.threadContextDefaults?.approvalsReviewer}
                    reasoningEffort={effectiveThreadContextDefaults?.reasoningEffort ?? state.threadContextDefaults?.reasoningEffort}
                    sandboxMode={effectiveThreadContextDefaults?.sandbox ?? state.threadContextDefaults?.sandbox}
                    onOpenPermissions={() => void loadSettingsPanel("permissions")}
                    onOpenModelPicker={toggleModelPickerAnchor}
                    onOpenReasoningPicker={toggleReasoningPickerAnchor}
                  />
                )}
              />
              <ComposerExternalFooter
                variant={!activeThread ? "home" : "default"}
                branch={threadGitBranch(activeThread)}
                cwd={activeThread?.cwd || workspace}
                workMode={composerWorkMode}
                workModeOptions={composerWorkModeOptions}
                workspaceRoots={workspaceRootOptions}
                onWorkspaceRootSelected={selectWorkspaceRoot}
                onUseExistingFolder={useExistingWorkspaceFolder}
                onWorkModeChange={setComposerWorkMode}
              />
            </div>
          )}
        >
          <section className="hc-conversation" data-thread-find-target="conversation">
            <ConversationView
              units={conversation.units}
              emptyState={conversationEmptyState}
              threadId={state.activeThreadId}
              onEditLastUserMessage={editLastUserTurn}
              onOpenAssistantArtifact={openAssistantArtifactInSidePanel}
              onRevealAssistantEndResource={revealAssistantEndResource}
              onOpenDiff={openActiveDiffPanel}
              onForkTurn={forkActiveThreadFromTurn}
              onSubmitTurnFeedback={submitTurnFeedback}
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
            onSubmitTurnFeedback={submitTurnFeedback}
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
            onOpenArtifactPreview={previewRailArtifactAndOpenRail}
            onOpenFileReference={previewRailFileReferenceAndOpenRail}
            onOpenUrl={openRailUrlAndOpenRail}
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
                  aria-label="Open side panel tab"
                  title="Open side panel tab"
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
          onOpenUrl={openRailUrlAndOpenRail}
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
        modelPickerSelectedKey={effectiveModelSelection.noReadyProvider
          ? selectedModelKey
          : encodeSelection(effectiveModelSelection.providerId, effectiveModelSelection.model)}
        modelPickerDefaultKey={state.threadContextDefaults?.modelProvider && state.threadContextDefaults?.model
          ? encodeSelection(normalizeSubscriptionProviderId(state.threadContextDefaults.modelProvider), state.threadContextDefaults.model)
          : null}
        modelPickerReadyProviders={readyProviders}
        onModelSelect={setSelectedModelKey}
        onModelPickerOpenSettings={() => loadSettingsPanel("models")}
        onModelPickerSignIn={() => { void runSlashRequest("loginChatgpt"); }}
        onModelPickerClose={() => setModelPickerAnchor(null)}
        reasoningPickerAnchor={reasoningPickerAnchor}
        reasoningCurrentEffort={normalizeReasoningEffortValue(
          effectiveThreadContextDefaults?.reasoningEffort ?? state.threadContextDefaults?.reasoningEffort,
        )}
        onReasoningSelect={setReasoningEffortOverride}
        onReasoningPickerClose={() => setReasoningPickerAnchor(null)}
        keyboardShortcutsOpen={keyboardShortcutsOpen}
        onKeyboardShortcutsClose={() => setKeyboardShortcutsOpen(false)}
        toastLogs={state.logs}
      />
      </div>
    </HiCodexIntlProvider>
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
      connecting={state.connecting}
    >
      <HiCodexAppBody
        state={state}
        clientCallbacksRef={clientCallbacksRef}
        fileSearchControllerRef={fileSearchControllerRef}
      />
    </ServicesProvider>
  );
}

