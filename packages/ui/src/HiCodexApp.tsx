import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { CollaborationModeMask, ModelConfig, Thread } from "@hicodex/codex-protocol";
import { Loader2 } from "lucide-react";
import { AppNavigationRail, type AppNavigationTab } from "./components/app-navigation-rail";
import { AppToastViewport } from "./components/app-toast-viewport";
import { AboveComposerPlanSuggestion } from "./components/above-composer-plan-suggestion";
import { CommandPanel } from "./components/command-panel";
import { Composer } from "./components/composer";
import { ComposerExternalFooter } from "./components/composer-external-footer";
import { HiCodexIntlProvider, useHiCodexIntl } from "./components/i18n-provider";
import { insertPromptEditorText } from "./components/prompt-editor";
import {
  DEFAULT_PROVIDERS,
  ModelPickerMenu,
  decodeSelection,
  encodeSelection,
} from "./components/model-picker-menu";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { AutomationsPreviewPanel } from "./components/automations-preview-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import type { PatchAction, PatchActionState } from "./components/conversation-view";
import {
  UnifiedDiffFailureDialog,
  type UnifiedDiffFailure,
} from "./components/unified-diff-failure-dialog";
import { McpToolCallForm } from "./components/mcp-tool-call-form";
import { McpServerConfigForm } from "./components/mcp-server-config-form";
import { McpFollowUpDialog, type McpFollowUpDialogOption } from "./components/mcp-follow-up-dialog";
import { OnboardingEmptyState } from "./components/onboarding-empty-state";
import { SettingsPanel } from "./components/model-settings-panel";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { FilePreviewPanel } from "./components/file-preview-panel";
import { RightRail } from "./components/right-rail";
import { Sidebar } from "./components/sidebar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import { ThreadActionDialog } from "./components/thread-action-dialog";
import { ThreadFindBar } from "./components/thread-find-bar";
import type { McpAppHostCallRequest, McpResourceReadRequest } from "./components/tool-activity-detail";
import { CodexJsonRpcClient, type RpcDebugEvent } from "./lib/codex-json-rpc-client";
import { formatError } from "./lib/format";
import {
  applyPatchAction,
  openExternalUrl,
  openFileReference,
  isTauriRuntime,
  listenNativeShellEvents,
  pickFileReferences,
  pickWorkspaceFolder,
  readCodexAuthSummary,
  type CodexAuthSummary,
  type PatchActionResult,
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
import {
  accountRefreshScopeForNotification,
  applyAccountNotification,
  beginAccountStateRefresh,
  hasOpenAiCredentialSummary,
  initialAccountState,
  logoutAndRefreshAccountState,
  projectAccountViewModel,
  refreshAccountState,
  type AccountState,
} from "./state/account-state";
import { buildApprovalResult } from "./state/approval-requests";
import { projectAutomationsSurface } from "./state/automations-viewer";
import { resolveHiCodexBuildInfo } from "./state/build-info";
import { projectBranchDetails } from "./state/branch-details";
import {
  projectSidebarThreads,
  projectSidebarWorkspaceRootOptions,
  sidebarThreadRelativeTime,
  type SidebarOrganizeMode,
  type SidebarSortKey,
  type SidebarWorkspaceRootOption,
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
import type { FileReferenceSelection } from "./state/file-references";
import {
  applySlashCommand,
  buildUserInputFromComposer,
  composerAttachmentsFromPaths,
  composerPlaceholderText,
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
  type CommandPanelKind,
  type CommandPanelState,
} from "./state/command-panel";
import { buildConversationMarkdown } from "./state/conversation-markdown";
import { threadIdFromCodexDeepLink } from "./state/deep-links";
import {
  WorkspaceFuzzyFileSearchController,
  type WorkspaceFuzzyFileSearchSession,
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
  appRegistryEntriesFromResponse,
  isThreadStatusInProgress,
  projectConversation,
  type AppRegistryEntry,
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
import {
  invalidateAppList,
  invalidateAppListForNotification,
  loadAllApps,
  type AppListInvalidationReason,
} from "./state/app-list";
import { claimAppConnectOAuthCallback } from "./state/app-connect-oauth";
import {
  deriveActivePendingRequests,
  summarizePendingRequestAwaitingByThread,
} from "./state/pending-request-scope";
import {
  claimHiCodexImageToolRequest,
  executeHiCodexImageToolCall,
  imageToolFailureText,
  isHiCodexImageToolCall,
  loadImageGenerationSettings,
  saveImageGenerationSettings,
  shouldRegisterHiCodexImageDynamicTool,
  type DynamicToolCallResponseLike,
  type ImageGenerationSettings,
} from "./state/image-generation-tool";
import {
  browserStorage,
  slashCommandEntries,
  threadGitBranch,
} from "./state/app-shell-helpers";
import {
  loadHiCodexLocale,
  saveHiCodexLocale,
  type HiCodexLocale,
} from "./state/i18n";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./state/hicodex-desktop-namespace";
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
  readCurrentHostGitStatus,
  saveComposerWorkMode,
  selectableComposerWorkMode,
  type ComposerWorkMode,
  type HostGitStatus,
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
  rightRailShouldRender,
  saveRightRailPinned,
} from "./state/right-rail";
import {
  loadPinnedThreadIds,
  savePinnedThreadIds,
  updatePinnedThreadIds,
} from "./state/thread-pins";
import { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import { appendRpcDebugEvent } from "./state/rpc-debug";
import {
  loadUiThemeMode,
  nextToggleThemeMode,
  resolveUiThemeMode,
  saveUiThemeMode,
  type ResolvedUiTheme,
  type UiThemeMode,
} from "./state/theme";
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
  readWorkspaceDeveloperInstructions,
  sendPanelThreadMessage,
  startSideConversation,
  refreshThreadContextDefaults,
  threadTitle,
  type TurnStartOptions,
  withWorkspaceDeveloperInstructions,
} from "./state/thread-workflow";

function hostFromBaseUrl(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  try {
    return new URL(trimmed).host || fallback;
  } catch {
    return fallback;
  }
}

function isSuccessfulAccountLoginCompletedNotification(message: { method: string; params?: unknown }): boolean {
  if (message.method !== "account/login/completed") return false;
  const params = message.params;
  return Boolean(params && typeof params === "object" && (params as { success?: unknown }).success === true);
}

function authModeFromAccountUpdatedNotification(message: { method: string; params?: unknown }): string | null {
  if (message.method !== "account/updated") return null;
  const params = message.params;
  if (!params || typeof params !== "object") return null;
  const authMode = (params as { authMode?: unknown }).authMode;
  return typeof authMode === "string" && authMode.trim() ? authMode.trim() : null;
}

const BACKGROUND_AGENT_PANEL_WIDTH_PX = 520;
const BACKGROUND_AGENT_PANEL_MIN_WIDTH_PX = 320;
const BACKGROUND_AGENT_PANEL_EDGE_MARGIN_PX = 48;
const COMMAND_PANEL_PINNED_CHATS_GROUP = { key: "pinned-chats", label: "Pinned chats" };
const COMMAND_PANEL_RECENT_CHATS_GROUP = { key: "recent-chats", label: "Recent chats" };

function backgroundAgentPanelWidthPx(containerWidthPx: number): number {
  if (containerWidthPx <= 0) return BACKGROUND_AGENT_PANEL_WIDTH_PX;
  return Math.max(
    BACKGROUND_AGENT_PANEL_MIN_WIDTH_PX,
    Math.min(BACKGROUND_AGENT_PANEL_WIDTH_PX, containerWidthPx - BACKGROUND_AGENT_PANEL_EDGE_MARGIN_PX),
  );
}

function commandPanelThreadGroup(threadId: string, pinnedThreadIds: Set<string>): Pick<CommandPanelEntry, "groupKey" | "groupLabel"> {
  const group = pinnedThreadIds.has(threadId)
    ? COMMAND_PANEL_PINNED_CHATS_GROUP
    : COMMAND_PANEL_RECENT_CHATS_GROUP;
  return { groupKey: group.key, groupLabel: group.label };
}

function orderCommandPanelThreadsByPinned<T extends { id: string }>(threads: T[], pinnedThreadIds: Set<string>): T[] {
  const pinnedThreads = threads.filter((thread) => pinnedThreadIds.has(thread.id));
  const recentThreads = threads.filter((thread) => !pinnedThreadIds.has(thread.id));
  return [...pinnedThreads, ...recentThreads];
}

const LEGACY_SELECTED_MODEL_STORAGE_KEY = "hicodex.selectedModelKey";
const SELECTED_MODEL_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.selectedModelKey;

function readSystemThemeVariant(): ResolvedUiTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribeSystemThemeVariant(onChange: (theme: ResolvedUiTheme) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => onChange(media.matches ? "dark" : "light");
  listener();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media.addListener(listener);
  return () => media.removeListener(listener);
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
  const [worktreeHostGitStatus, setWorktreeHostGitStatus] = useState<HostGitStatus | null>(null);
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
  const [sidebarPreferences, setSidebarPreferencesState] = useState<SidebarPreferences>(() => (
    loadSidebarPreferences(sidebarPreferenceStorage())
  ));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeAppTab, setActiveAppTab] = useState<AppNavigationTab>("workbench");
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
  /*
   * Codex Desktop Summary Rail visibility (`cp` in
   * `local-conversation-thread-BX7YNcUw.js` byte 153908) is derived state, not
   * a user-toggleable atom:
   *   shouldShow = isPinned && displayMode !== "overlay" && !isRightPanelOpen
   * The previous HiCodex implementation kept a separate `rightRailOpen` flag
   * (defaulting to false and force-opened by file-preview handlers) which
   * mis-modeled Codex's `ea = A(P, !1)` RightPanel atom and inverted the
   * Summary Rail semantics — Progress/Git/Outputs/Sources disappeared by
   * default until the user clicked into a preview. The derived formula
   * lives in `showRightRail` below; the storage-backed `rightRailOpen`
   * state has been removed.
   */
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => loadPinnedThreadIds(browserStorage()));
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
      return readMigratedStorageValue(window.localStorage, SELECTED_MODEL_STORAGE_KEY, [LEGACY_SELECTED_MODEL_STORAGE_KEY]);
    } catch {
      return null;
    }
  });
  const setSelectedModelKey = useCallback((key: string | null) => {
    setSelectedModelKeyState(key);
    try {
      if (key) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, key);
      } else {
        window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_SELECTED_MODEL_STORAGE_KEY);
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
  const [threadFindOpen, setThreadFindOpen] = useState(false);
  const [threadFindQuery, setThreadFindQuery] = useState("");
  const [threadFindIndex, setThreadFindIndex] = useState(0);
  const [threadFindFocusToken, setThreadFindFocusToken] = useState(0);
  const [threadFindResult, setThreadFindResult] = useState<{ query: string; matches: ThreadFindMatch[] }>({
    query: "",
    matches: [],
  });
  const previousThreadFindQueryRef = useRef("");
  const [mcpServerForm, setMcpServerForm] = useState<McpServerFormAction | null>(null);
  const [mcpToolForm, setMcpToolForm] = useState<McpToolFormAction | null>(null);
  const [mcpFollowUpDialog, setMcpFollowUpDialog] = useState<McpFollowUpDialogRequest | null>(null);
  const [mcpServerStatuses, setMcpServerStatuses] = useState<unknown>(null);
  const [mcpServerStatusNonce, setMcpServerStatusNonce] = useState(0);
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
    setArtifactPreviewState(entry);
    if (entry !== null) setArtifactPreviewNonce((value) => value + 1);
  }, []);
  const [fileReference, setFileReference] = useState<FileReferenceSelection | null>(null);
  const [backgroundTerminalCleanupPending, setBackgroundTerminalCleanupPending] = useState(false);
  const [skillsChangedNonce, setSkillsChangedNonce] = useState(0);
  const [appListChangedNonce, setAppListChangedNonce] = useState(0);
  const [appRegistry, setAppRegistry] = useState<AppRegistryEntry[]>([]);
  const [accountState, setAccountState] = useState<AccountState>(initialAccountState);
  const [accountRefreshNonce, setAccountRefreshNonce] = useState(0);
  const [rpcDebugEvents, setRpcDebugEvents] = useState<RpcDebugEvent[]>([]);
  const [automationsPanelOpen, setAutomationsPanelOpen] = useState(false);
  const [automationsPayload, setAutomationsPayload] = useState<unknown>(null);
  const [automationsError, setAutomationsError] = useState<string | null>(null);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const accountStateRef = useRef<AccountState>(initialAccountState);
  const mcpStartupStatusPanelHandledRef = useRef(0);
  const appListChangedHandledRef = useRef(0);
  const appListRefreshMessageRef = useRef("App list changed.");
  const mcpServerStatusRefreshMessageRef = useRef("MCP startup status changed.");
  const clientRef = useRef<CodexJsonRpcClient | null>(null);
  const authRefreshTokenOnNextRefreshRef = useRef(false);
  const accountRefreshTokenOnNextRefreshRef = useRef(false);
  const workspaceInitialized = useRef(false);
  const hasConnectedOnceRef = useRef(false);
  const needsReconnectRecoveryRef = useRef(false);
  const fileSearchRequestSeqRef = useRef(0);
  const fileSearchControllerRef = useRef<WorkspaceFuzzyFileSearchController | null>(null);
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
    setAccountState(next);
  }, []);
  const accountViewModel = useMemo(
    () => projectAccountViewModel(accountState, codexAuthSummary),
    [accountState, codexAuthSummary],
  );
  const client = useMemo(() => {
    const rpc = new CodexJsonRpcClient({
      onHostStatus: (status) => dispatch({ type: "hostStatus", status }),
      onNotification: (message) => {
        fileSearchControllerRef.current?.handleNotification(message);
        dispatch({ type: "notification", message });
        const appListInvalidation = invalidateAppListForNotification(message.method);
        if (appListInvalidation) {
          appListRefreshMessageRef.current = appListRefreshMessage(appListInvalidation.reason);
          setAppListChangedNonce((current) => current + 1);
        }
        if (message.method === "skills/changed") {
          setSkillsChangedNonce((current) => current + 1);
        }
        if (message.method === "mcpServer/startupStatus/updated") {
          mcpServerStatusRefreshMessageRef.current = "MCP startup status changed.";
          setMcpServerStatusNonce((current) => current + 1);
        }
        if (message.method === "mcpServer/oauthLogin/completed") {
          mcpServerStatusRefreshMessageRef.current = mcpOauthLoginRefreshMessage(message.params);
          setMcpServerStatusNonce((current) => current + 1);
        }
        const accountRefreshScope = accountRefreshScopeForNotification(message);
        if (accountRefreshScope) {
          setAccountProjectionState(applyAccountNotification(accountStateRef.current, message));
          if (isSuccessfulAccountLoginCompletedNotification(message)) {
            authRefreshTokenOnNextRefreshRef.current = true;
            accountRefreshTokenOnNextRefreshRef.current = true;
          }
          setAccountRefreshNonce((current) => current + 1);
        }
        // OAuth completion → re-query auth status so the picker's Sign-in
        // button + readyProviders flip immediately.
        if (message.method === "account/login/completed"
          || message.method === "account/updated") {
          if (message.method === "account/updated") {
            setOauthAuthMethod(authModeFromAccountUpdatedNotification(message));
          }
          setAuthRefreshNonce((current) => current + 1);
        }
      },
      onServerRequest: (request) => dispatch({ type: "serverRequest", request }),
      onLog: (text, level) => dispatch({ type: "log", text, level }),
      onDebugEvent: (event) => setRpcDebugEvents((current) => appendRpcDebugEvent(current, event)),
    });
    clientRef.current = rpc;
    fileSearchControllerRef.current = new WorkspaceFuzzyFileSearchController(rpc);
    return rpc;
  }, [setAccountProjectionState]);

  /* Auth refresh — bumped by login/logout notifications + manual picker opens. */
  const [authRefreshNonce, setAuthRefreshNonce] = useState(0);
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
  }, [client, state.connected, authRefreshNonce]);

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
  }, [accountRefreshNonce, client, setAccountProjectionState, state.connected]);

  useEffect(() => {
    if (!state.connected) {
      setAppRegistry([]);
      return;
    }
    let cancelled = false;
    void loadAllApps(client, {
      forceRefetch: appListChangedNonce > 0,
      threadId: state.activeThreadId,
    })
      .then((apps) => {
        if (!cancelled) setAppRegistry(appRegistryEntriesFromResponse(apps));
      })
      .catch(() => {
        if (!cancelled) setAppRegistry([]);
      });
    return () => { cancelled = true; };
  }, [appListChangedNonce, client, state.activeThreadId, state.connected]);

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
      setAuthRefreshNonce((current) => current + 1);
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
  const worktreeStatusCwd = activeThread?.cwd?.trim() || workspace.trim();

  /*
   * Codex Desktop turn-diff Undo / Reapply state. Mirrors the local state
   * `[g,_] = useState(null)` + `[z,B] = useState(...)` pattern around
   * local-conversation-thread byte ~423000: `patchActionState` tracks which
   * direction the toolbar button is currently in (undo ↔ reapply); `patchFailure`
   * drives the `<UnifiedDiffFailureDialog/>` overlay. We hand the callback
   * straight to `ConversationView`; it bubbles down to `TurnDiffBlock`'s
   * `onPatchAction`.
   */
  const [patchActionState, setPatchActionState] = useState<PatchActionState>(null);
  const [patchFailure, setPatchFailure] = useState<UnifiedDiffFailure | null>(null);
  const [patchActionInFlight, setPatchActionInFlight] = useState(false);
  /*
   * Synchronous re-entrancy lock — `setPatchActionInFlight(true)` only updates
   * state on the NEXT render, so a fast double-click can clear the `if
   * (patchActionInFlight) return;` guard twice before React commits. A ref
   * mutates immediately and blocks the second handler call before any git
   * apply runs against the working tree.
   */
  const patchActionLockRef = useRef(false);
  const handlePatchAction = useCallback(
    (action: PatchAction, diff: string) => {
      if (patchActionLockRef.current) return;
      patchActionLockRef.current = true;
      const cwd = worktreeStatusCwd;
      if (!cwd) {
        patchActionLockRef.current = false;
        setPatchFailure({
          action: action === "undo" ? "revert" : "reapply",
          result: { appliedPaths: [], skippedPaths: [], conflictedPaths: [] },
          errorCode: "not-git-repo",
        });
        return;
      }
      setPatchActionInFlight(true);
      const apiAction = action === "undo" ? "revert" : "reapply";
      applyPatchAction({ action: apiAction, diff, cwd })
        .then((result: PatchActionResult) => {
          const conflicted = result.conflictedPaths ?? [];
          const skipped = result.skippedPaths ?? [];
          const errorCode = result.errorCode ?? undefined;
          const failed =
            (errorCode != null && errorCode.length > 0)
            || conflicted.length > 0
            || skipped.length > 0;
          if (failed) {
            setPatchFailure({
              action: result.action,
              result: {
                appliedPaths: result.appliedPaths ?? [],
                skippedPaths: skipped,
                conflictedPaths: conflicted,
                execOutput: result.execOutput ?? null,
              },
              errorCode,
            });
            return;
          }
          // Clean apply / reverse — flip the toolbar button so the user can
          // toggle back without re-mounting the row. Codex `setZ` symmetry.
          setPatchActionState({ action, diff });
        })
        .catch((error: unknown) => {
          /*
           * Tauri rejections (host_apply_patch_action returned Err, or the
           * IPC layer threw before reaching Rust) used to be swallowed,
           * leaving the Failure Dialog with empty `execOutput`. Surface the
           * actual error text via the same `execOutput.output` slot Codex
           * Desktop uses for `git apply` stderr — readers see the Rust /
           * Tauri error verbatim under the "Git apply error" panel.
           */
          const errorText = formatError(error);
          setPatchFailure({
            action: apiAction,
            result: {
              appliedPaths: [],
              skippedPaths: [],
              conflictedPaths: [],
              execOutput: errorText ? { output: errorText } : null,
            },
          });
        })
        .finally(() => {
          patchActionLockRef.current = false;
          setPatchActionInFlight(false);
        });
    },
    [worktreeStatusCwd],
  );
  const activePendingRequests = useMemo(
    () => deriveActivePendingRequests(state.pendingRequests, {
      activeThreadId: state.activeThreadId,
      activeTurnId,
      activeItemIds: activeItems.map((item) => item.id),
    }),
    [activeItems, activeTurnId, state.activeThreadId, state.pendingRequests],
  );
  const latestTurnIdForHeartbeat = activeTurnId ?? activeThreadRuntime.turnOrder.at(-1) ?? null;
  const automationsModel = useMemo(() => projectAutomationsSurface({
    connected: state.connected,
    error: automationsError,
    loading: automationsLoading,
    payload: automationsPayload,
    heartbeat: {
      hasConversation: Boolean(state.activeThreadId),
      hostSupported: true,
      latestTurnId: latestTurnIdForHeartbeat,
      latestTurnStatus: activeThreadRunning
        ? "inProgress"
        : latestTurnIdForHeartbeat
          ? "completed"
          : null,
      pendingRequestType: heartbeatPendingRequestType(activePendingRequests),
      resumeState: state.connected ? "resumed" : "resuming",
    },
  }), [
    activePendingRequests,
    activeThreadRunning,
    automationsError,
    automationsLoading,
    automationsPayload,
    latestTurnIdForHeartbeat,
    state.activeThreadId,
    state.connected,
  ]);
  const pendingRequestAwaitingByThread = useMemo(
    () => summarizePendingRequestAwaitingByThread(state.pendingRequests, { itemsByThread }),
    [itemsByThread, state.pendingRequests],
  );
  const handledImageToolRequestIdsRef = useRef(new Set<string>());
  useEffect(() => {
    for (const request of state.pendingRequests) {
      if (!isHiCodexImageToolCall(request)) continue;
      if (!claimHiCodexImageToolRequest(handledImageToolRequestIdsRef.current, request)) continue;
      void (async () => {
        let result: DynamicToolCallResponseLike;
        try {
          result = await executeHiCodexImageToolCall(request, normalizeModelConfig(modelDraft), {
            codexHome: state.hostStatus?.codexHome,
            imageSettings: imageGenerationSettings,
          });
        } catch (error) {
          result = {
            success: false,
            contentItems: [{ type: "inputText" as const, text: `Image generation request failed: ${formatError(error)}` }],
          };
        }
        const failureText = imageToolFailureText(result);
        if (failureText) dispatch({ type: "log", text: failureText, level: "error" });
        try {
          await client.respond(request.id, result);
        } catch (error) {
          dispatch({ type: "log", text: `Image generation response failed: ${formatError(error)}`, level: "error" });
        }
      })()
        .finally(() => {
          dispatch({ type: "resolveServerRequest", id: request.id });
        });
    }
  }, [client, imageGenerationSettings, modelDraft, state.hostStatus?.codexHome, state.pendingRequests]);
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
    () => shouldRegisterHiCodexImageDynamicTool(imageGenerationSettings),
    [imageGenerationSettings],
  );
  const activeDiff = activeThreadRuntime.turnDiff;
  const conversation = useMemo(
    () => projectConversation(activeItems, {
      appRegistry,
      isThreadRunning: activeThreadRunning,
      mcpServerStatuses,
      progressPlan: activeProgressPlan,
      // Feed the live turn-diff stream so projectConversation can emit the
      // `inProgressDiff` render unit (mirror of Codex `sT` portal at
      // codex-local-conversation-thread.pretty.js :8003).
      turnDiff: activeDiff,
    }),
    [activeDiff, activeItems, activeProgressPlan, activeThreadRunning, appRegistry, mcpServerStatuses],
  );
  const branchDetails = useMemo(
    () => projectBranchDetails({
      thread: activeThread,
      diff: activeDiff ? { diff: activeDiff } : null,
      gitStatus: worktreeHostGitStatus,
    }),
    [activeDiff, activeThread, worktreeHostGitStatus],
  );
  useEffect(() => {
    if (!worktreeStatusCwd || !isTauriRuntime()) {
      setWorktreeHostGitStatus(null);
      return;
    }
    let cancelled = false;
    void readCurrentHostGitStatus(worktreeStatusCwd)
      .then((status) => {
        if (cancelled) return;
        setWorktreeHostGitStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        setWorktreeHostGitStatus(null);
        dispatch({ type: "log", text: `host git status failed: ${formatError(error)}`, level: "warn" });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, worktreeStatusCwd]);
  const composerWorkModeOptions = useMemo(
    () => projectWorktreeModeOptions({
      hostGitStatus: worktreeHostGitStatus,
      mode: composerWorkMode,
      tauriRuntimeAvailable: isTauriRuntime(),
    }),
    [composerWorkMode, worktreeHostGitStatus],
  );
  const activeThreadFindMatches = useMemo(
    () => (threadFindResult.query === threadFindQuery ? threadFindResult.matches : []),
    [threadFindQuery, threadFindResult],
  );
  const visibleThreadFindIndex = clampThreadFindIndex(threadFindIndex, activeThreadFindMatches.length);
  const activeThreadFindMatch = activeThreadFindMatches[visibleThreadFindIndex] ?? null;
  const openThreadFindBar = useCallback(() => {
    setCommandPanel(null);
    setActiveSettingsPanel(null);
    setThreadFindOpen(true);
    setThreadFindFocusToken((current) => current + 1);
  }, []);
  const closeThreadFindBar = useCallback(() => {
    setThreadFindOpen(false);
  }, []);
  const goToThreadFindMatch = useCallback((direction: 1 | -1) => {
    setThreadFindIndex((current) => nextThreadFindIndex(current, activeThreadFindMatches.length, direction));
  }, [activeThreadFindMatches.length]);
  useEffect(() => {
    if (!threadFindOpen || typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>("[data-thread-find-target='conversation']");
    if (!root) {
      setThreadFindResult({ query: threadFindQuery, matches: [] });
      return;
    }
    clearThreadFindMarks(root);
    const matches = findThreadFindMatches(collectThreadFindUnitsFromDom(root), threadFindQuery);
    const queryChanged = previousThreadFindQueryRef.current !== threadFindQuery;
    previousThreadFindQueryRef.current = threadFindQuery;
    setThreadFindResult({ query: threadFindQuery, matches });
    setThreadFindIndex((current) => queryChanged ? 0 : clampThreadFindIndex(current, matches.length));
  }, [activeThreadScrollKey, conversation.units, threadFindOpen, threadFindQuery]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>("[data-thread-find-target='conversation']");
    if (!root) return;
    if (!threadFindOpen) {
      clearThreadFindMarks(root);
      return;
    }
    applyThreadFindMarks(root, activeThreadFindMatches, activeThreadFindMatch?.id ?? null);
    if (activeThreadFindMatch) scrollThreadFindMatchIntoView(activeThreadFindMatch, root);
    return () => clearThreadFindMarks(root);
  }, [activeThreadFindMatch, activeThreadFindMatches, threadFindOpen]);
  useEffect(() => {
    if (!threadFindOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeThreadFindBar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeThreadFindBar, threadFindOpen]);
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
    setWorkspace((current) => current.trim() || state.hostStatus?.defaultCwd || "");
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
   * unchanged. Workspace AGENTS.md / CLAUDE.md instructions are appended here
   * so thread/start, thread/fork, and side conversations share the same context.
   *
   * `selectedModelKey` here stores `${providerId}::${modelSlug}` —
   * see DEFAULT_PROVIDERS + encodeSelection in model-picker-menu.tsx.
   */
  const effectiveThreadContextDefaults = useMemo(() => {
    const picked = decodeSelection(selectedModelKey);
    const modelContext = picked ? {
      ...(state.threadContextDefaults ?? {}),
      model: picked.model,
      modelProvider: picked.providerId,
    } : state.threadContextDefaults;
    const workspaceInstructions = workspaceDeveloperInstructions?.workspace === workspace.trim()
      ? workspaceDeveloperInstructions.value
      : null;
    return withWorkspaceDeveloperInstructions(modelContext, workspaceInstructions);
  }, [selectedModelKey, state.threadContextDefaults, workspace, workspaceDeveloperInstructions]);

  useEffect(() => {
    if (!state.connected) {
      if (hasConnectedOnceRef.current) needsReconnectRecoveryRef.current = true;
      return;
    }
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }
    if (!needsReconnectRecoveryRef.current) return;
    needsReconnectRecoveryRef.current = false;
    dispatch({ type: "markThreadsNeedResumeAfterReconnect" });
    if (!state.activeThreadId) return;
    const threadId = state.activeThreadId;
    void resumeThreadWithMetadataRead(client, threadId, workspace, effectiveThreadContextDefaults)
      .then((result) => dispatch({ type: "upsertThread", thread: result.thread, select: true }))
      .catch((error) => {
        dispatch({
          type: "log",
          text: `resume after reconnect failed: ${formatError(error)}`,
          level: "warn",
        });
      });
  }, [client, effectiveThreadContextDefaults, state.activeThreadId, state.connected, workspace]);

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
    // `getAuthStatus` is provider-scoped: local gateways with
    // `requires_openai_auth = false` report no OpenAI auth even when ChatGPT
    // OAuth is complete. Keep the subscription provider ready when either the
    // live RPC reports an auth method or the isolated Codex auth.json contains
    // a ChatGPT/API-key credential.
    if (active && active !== DEFAULT_SUBSCRIPTION_PROVIDER_ID) {
      ready.add(active);
    }
    if ((oauthAuthMethod && oauthAuthMethod.length > 0) || hasOpenAiCredentialSummary(codexAuthSummary)) {
      ready.add(DEFAULT_SUBSCRIPTION_PROVIDER_ID);
    }
    return ready;
  }, [codexAuthSummary, state.threadContextDefaults?.modelProvider, oauthAuthMethod]);

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

  const openAutomationsPanel = useCallback(() => {
    closeFilePreviewPanel();
    closeBackgroundAgentPanel();
    void refreshAutomationsPanel();
  }, [closeBackgroundAgentPanel, closeFilePreviewPanel, refreshAutomationsPanel]);

  const composerPlaceholder = composerPlaceholderText({
    hasConversation: conversation.units.length > 0,
    hasBackgroundAgentsPanel: backgroundAgentPanel != null,
  });
  const rightRailSections = useMemo(
    () => projectRightRailSections({
      progress: conversation.progress,
      branchDetails,
      artifacts: conversation.artifacts,
      showOutputs: !branchDetails.hasData,
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
   * Codex Desktop `cp` (byte 153908): `shouldShow = !isHiddenByRightPanel && (isPinned && displayMode !== "overlay")`.
   * `isHiddenByRightPanel` is true when a non-overlay rail is forced down by
   * the big AppShell RightPanel (`rp` byte 153666). HiCodex's RightPanel
   * equivalent is the file-preview side panel — `hasFilePreviewSelection`
   * drives the same auto-hide rule. Empty sections collapse, matching the
   * `rightRailSections.length > 0` term.
   */
  const showRightRail = rightRailPinned
    && rightRailSections.length > 0
    && rightRailShouldRender(rightRailLayoutWidthPx)
    && !hasFilePreviewSelection;
  const rightRailMode = rightRailPinned ? rightRailDisplayMode(rightRailLayoutWidthPx) : "overlay";
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
        appListRefreshMessageRef.current = `${appName} OAuth failed.`;
        invalidateAppList("app-connect-oauth-callback");
        setAppListChangedNonce((current) => current + 1);
        dispatch({
          type: "log",
          text: `${appName} OAuth failed: ${detail}. Refreshing app and plugin state.`,
          level: "error",
        });
        return;
      }
      appListRefreshMessageRef.current = `${appName} OAuth callback received.`;
      invalidateAppList("app-connect-oauth-callback");
      setAppListChangedNonce((current) => current + 1);
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

  const getFileSearchSession = useCallback(async (roots: string[]): Promise<WorkspaceFuzzyFileSearchSession> => {
    const rootsKey = roots.join("\0");
    if (fileSearchSessionRef.current && fileSearchSessionRootsKeyRef.current === rootsKey) {
      return fileSearchSessionRef.current;
    }
    const previousSession = fileSearchSessionRef.current;
    fileSearchSessionRef.current = null;
    fileSearchSessionRootsKeyRef.current = "";
    if (previousSession) {
      await previousSession.stop().catch((error) => {
        dispatch({ type: "log", text: `Failed to close fuzzy file search session: ${formatError(error)}`, level: "warn" });
      });
    }
    const controller = fileSearchControllerRef.current;
    if (!controller) throw new Error("Fuzzy file search is unavailable.");
    const session = await controller.createSession({
      roots,
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
    });
    fileSearchSessionRef.current = session;
    fileSearchSessionRootsKeyRef.current = rootsKey;
    return session;
  }, []);

  const getCommandMenuFileSearchSession = useCallback(async (roots: string[]): Promise<WorkspaceFuzzyFileSearchSession> => {
    const rootsKey = roots.join("\0");
    if (commandMenuFileSearchSessionRef.current && commandMenuFileSearchSessionRootsKeyRef.current === rootsKey) {
      return commandMenuFileSearchSessionRef.current;
    }
    const previousSession = commandMenuFileSearchSessionRef.current;
    commandMenuFileSearchSessionRef.current = null;
    commandMenuFileSearchSessionRootsKeyRef.current = "";
    if (previousSession) {
      await previousSession.stop().catch((error) => {
        dispatch({ type: "log", text: `Failed to close command menu file search session: ${formatError(error)}`, level: "warn" });
      });
    }
    const controller = fileSearchControllerRef.current;
    if (!controller) throw new Error("Fuzzy file search is unavailable.");
    const session = await controller.createSession({
      roots,
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
    });
    commandMenuFileSearchSessionRef.current = session;
    commandMenuFileSearchSessionRootsKeyRef.current = rootsKey;
    return session;
  }, []);

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
      notificationPreferences,
      openSettingsPanelContent,
      panel,
      pendingWorktree,
      setSettingsPanelState,
      state,
      uiLocale,
      uiTheme: uiThemeSnapshot,
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
    workspace,
  ]);

  const refreshActiveSettingsPanel = useCallback(() => {
    if (!activeSettingsPanel) return;
    void loadSettingsPanel(activeSettingsPanel, { forceReload: true });
  }, [activeSettingsPanel, loadSettingsPanel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (focusComposerFromPlainTextKey(event)) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "f" && key !== "b") return;
      event.preventDefault();
      if (key === "f") openThreadFindBar();
      else if (key === "b") toggleSidebar();
      else openCommandMenu();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openCommandMenu, openThreadFindBar, toggleSidebar]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listenNativeShellEvents((event) => {
      switch (event.action) {
        case "newChat":
          void createWorkbenchThread();
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
  }, [createWorkbenchThread, loadSettingsPanel, openCommandMenu, openDeepLinkUrl]);

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
    const commandAppsOpen = commandPanel?.panel === "apps";
    const commandPluginsOpen = commandPanel?.panel === "plugins";
    const settingsAppsOpen = activeSettingsPanel === "apps";
    const settingsPluginsOpen = activeSettingsPanel === "plugins";
    const hasOpenAppBackedPanel = commandAppsOpen || commandPluginsOpen || settingsAppsOpen || settingsPluginsOpen;
    if (appListChangedNonce === 0 || !hasOpenAppBackedPanel) return;
    if (appListChangedHandledRef.current === appListChangedNonce) return;
    appListChangedHandledRef.current = appListChangedNonce;
    const refreshMessage = appListRefreshMessageRef.current;
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
    appListChangedNonce,
    client,
    commandPanel?.panel,
    ensureConnected,
    state.activeThreadId,
    workspace,
  ]);

  useEffect(() => {
    if (mcpServerStatusNonce === 0 || activeSettingsPanel !== "mcp") return;
    if (mcpStartupStatusPanelHandledRef.current === mcpServerStatusNonce) return;
    mcpStartupStatusPanelHandledRef.current = mcpServerStatusNonce;
    let disposed = false;
    const refreshMessage = mcpServerStatusRefreshMessageRef.current;
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

  const setThreadPinnedById = useCallback((threadId: string, pinned: boolean) => {
    setPinnedThreadIds((current) => {
      const next = updatePinnedThreadIds(current, threadId, pinned);
      savePinnedThreadIds(browserStorage(), next);
      return next;
    });
  }, []);

  const toggleThreadPinned = useCallback((thread: Thread, pinned: boolean) => {
    setThreadPinnedById(thread.id, pinned);
  }, [setThreadPinnedById]);

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

  // CODEX-REF: app-main-DZOIl7aU.pretty.js:34020 — `JI`/`YI` open path: any
  // file/source/artifact open triggers `Fe(e, !0)` and flips the right panel
  // visibility atom (`ea = A(P, !1)`). In Codex Desktop opening a file/source/
  // artifact tab triggers `setRightPanelOpen(true)`, which `cp` (`rp` predicate)
  // turns into `isHiddenByRightPanel = true` — the Summary Rail auto-hides.
  // HiCodex's RightPanel analogue is the file-preview side panel; the auto-
  // hide rule is encoded in `showRightRail` above (`!hasFilePreviewSelection`),
  // so the preview-open handlers no longer need to manually toggle the rail.
  // The wrappers stay as a forwarding layer for symmetry with how Codex
  // funnels these through the RightPanel atom dispatcher.
  const previewConversationFileReferenceAndOpenRail = useCallback<
    typeof previewConversationFileReference
  >((reference) => {
    return previewConversationFileReference(reference);
  }, [previewConversationFileReference]);
  const previewRailArtifactAndOpenRail = useCallback<typeof previewRailArtifact>((entry) => {
    return previewRailArtifact(entry);
  }, [previewRailArtifact]);
  const previewRailFileReferenceAndOpenRail = useCallback<typeof previewRailFileReference>(
    (reference) => {
      return previewRailFileReference(reference);
    },
    [previewRailFileReference],
  );
  const openRailUrlAndOpenRail = useCallback<typeof openRailUrl>((url) => {
    return openRailUrl(url);
  }, [openRailUrl]);

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
    startingConversation,
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
      accountState,
      setAccountState: setAccountProjectionState,
      uiTheme: uiThemeSnapshot,
      logs: state.logs,
      rpcDebugEvents,
      buildInfo,
    })
  ), [
    accountState,
    activeThread,
    activeTurnId,
    buildInfo,
    client,
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
      case "log":
        dispatch({ type: "log", text: action.message, level: action.level });
    }
  }, [composerMode, createWorkbenchThread, enableComposerPlanMode, loadSettingsPanel, openCommandMenu, runSlashRequest, setActiveComposerMode]);

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
    setUiLocale,
    setUiThemeMode,
    notificationPreferences,
    setNotificationPreferences,
    runSlashCommand: runSlashCommandFromPanel,
    openFileSearchPanel,
    setThreadPinnedById,
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
        const params = request.params as { threadId?: unknown; turnId?: unknown } | undefined;
        const threadId = typeof params?.threadId === "string" ? params.threadId : state.activeThreadId;
        const turnId = typeof params?.turnId === "string" ? params.turnId : activeTurnId;
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
  }, [activeTurnId, client, imageGenerationSettings, modelDraft, state.activeThreadId, state.hostStatus?.codexHome]);

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
  const sidebarVisible = workbenchVisible && sidebarOpen;
  const appClassName = workbenchVisible && showRightRail ? "hc-app hc-app--with-right-rail" : "hc-app";

  return (
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

      {sidebarVisible && (
        <Sidebar
          threads={projectSidebarThreads(state.threads, { sortKey: sidebarPreferences.sortKey })}
          activeThreadId={state.activeThreadId}
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
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          /*
           * Codex Desktop header carries `Toggle pinned summary` button
           * (local-conversation-page-Bt6RhPKI.js byte ~3500, actionId
           * `local-thread-summary-panel-toggle`). HiCodex shows it only when
           * the active thread has rail content AND the viewport isn't in
           * overlay mode — matching Codex `an` gating where the pin variant
           * is only used for `displayMode !== "overlay"`.
           */
          rightRailToggleAvailable={rightRailSections.length > 0}
          rightRailPinned={rightRailPinned}
          canPinRightRail={rightRailShouldRender(rightRailLayoutWidthPx)}
          onToggleRightRailPinned={() => setRightRailPinned(!rightRailPinned)}
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
              >
                <AboveComposerPlanSuggestion
                  composerText={input}
                  conversationId={state.activeThreadId}
                  hasPlanMode={hasPlanComposerMode}
                  mode={composerMode}
                  onPlanSelected={selectComposerPlan}
                />
              </div>

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
                workMode={composerWorkMode}
                workModeOptions={composerWorkModeOptions}
                workspaceRoots={workspaceRootOptions}
                onWorkspaceRootSelected={selectWorkspaceRoot}
                onUseExistingFolder={useExistingWorkspaceFolder}
                onWorkModeChange={setComposerWorkMode}
                approvalPolicy={effectiveThreadContextDefaults?.approvalPolicy ?? state.threadContextDefaults?.approvalPolicy}
                approvalsReviewer={effectiveThreadContextDefaults?.approvalsReviewer ?? state.threadContextDefaults?.approvalsReviewer}
                reasoningEffort={effectiveThreadContextDefaults?.reasoningEffort ?? state.threadContextDefaults?.reasoningEffort}
                reasoningSummary={effectiveThreadContextDefaults?.reasoningSummary ?? state.threadContextDefaults?.reasoningSummary}
                sandboxMode={effectiveThreadContextDefaults?.sandbox ?? state.threadContextDefaults?.sandbox}
                onOpenPermissions={() => void loadSettingsPanel("permissions")}
                onOpenModelPicker={toggleModelPickerAnchor}
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
              onOpenAssistantArtifact={openAssistantArtifact}
              onOpenDiff={openActiveDiffPanel}
              onForkTurn={forkActiveThreadFromTurn}
              onOpenFileReference={previewConversationFileReferenceAndOpenRail}
              onOpenThreadId={openBackgroundAgentThread}
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
            onOpenThreadId={openBackgroundAgentThread}
            onReadMcpResource={readMcpResource}
            onSendMessage={sendBackgroundAgentPanelMessage}
          />
        )}

        {automationsPanelOpen && (
          <AutomationsPreviewPanel
            model={automationsModel}
            onClose={() => setAutomationsPanelOpen(false)}
            onRefresh={refreshAutomationsPanel}
          />
        )}

        {showRightRail && (
          <RightRail
            sections={rightRailSections}
            displayMode={rightRailMode}
            isPinned={rightRailPinned}
            onOpenArtifactPreview={previewRailArtifactAndOpenRail}
            onOpenFileReference={previewRailFileReferenceAndOpenRail}
            onOpenUrl={openRailUrlAndOpenRail}
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
          onOpenUrl={openRailUrlAndOpenRail}
        />
      </main>
      ) : (
        <KnowledgeBaseView />
      )}

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
          onClose={closeCommandPanel}
          onSelectAction={(action) => selectCommandPanelAction(action)}
          onSelectEntry={selectCommandPanelEntry}
          onSearchQueryChange={commandPanel.panel === "files"
            ? searchFilesFromCommandPanel
            : isCommandMenuPanel(commandPanel)
              ? searchCommandMenuFromPanel
              : undefined}
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
      {patchFailure && (
        <UnifiedDiffFailureDialog
          failure={patchFailure}
          onClose={() => setPatchFailure(null)}
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
        <AppToastViewport logs={state.logs} />
      </div>
    </HiCodexIntlProvider>
  );
}

function KnowledgeBaseView() {
  return (
    <main className="hc-main hc-knowledge-main" aria-label="知识库">
      <header className="hc-topbar">
        <div className="hc-topbar-main">
          <div className="hc-top-title">知识库</div>
        </div>
      </header>
      <section className="hc-knowledge-empty" aria-label="知识库内容">
        <div className="hc-knowledge-empty-content">
          <div className="hc-knowledge-empty-title">知识库</div>
          <div className="hc-knowledge-empty-subtitle">暂无内容</div>
        </div>
      </section>
    </main>
  );
}

function PreConversationLoadingShell({
  connected,
  connecting,
  startingConversation,
}: {
  connected: boolean;
  connecting: boolean;
  startingConversation: boolean;
}) {
  const { formatMessage } = useHiCodexIntl();
  const appName = formatMessage({ id: "hc.app.name", defaultMessage: "HiCodex" });
  const label = startingConversation
    ? "Starting chat..."
    : connecting
      ? "Connecting runtime..."
      : !connected
        ? "Runtime offline"
        : null;
  if (!label) return null;
  return (
    <div className="hc-preconversation-shell" role="status" aria-live="polite" aria-label={`${appName}: ${label}`}>
      <div className="hc-preconversation-logo">
        <Loader2 className={startingConversation || connecting ? "hc-spin" : undefined} size={18} />
      </div>
      <span>{label}</span>
    </div>
  );
}

function isAppBackedPanel(panel: CommandPanelKind | null | undefined): panel is "apps" | "plugins" {
  return panel === "apps" || panel === "plugins";
}

function isCommandMenuPanel(panel: CommandPanelState | null | undefined): panel is CommandPanelState & { panel: "generic" } {
  return panel?.panel === "generic" && panel.title === "Search commands and chats";
}

function focusComposerFromPlainTextKey(event: KeyboardEvent): boolean {
  if (!isPlainTextComposerKey(event)) return false;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (isEditableKeyboardTarget(target)) return false;
  if (target?.closest("[data-codex-terminal]")) return false;
  if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')) return false;
  const composer = document.querySelector<HTMLElement>("[data-codex-composer]");
  if (!composer) return false;
  event.preventDefault();
  insertPromptEditorText(composer, event.key);
  return true;
}

function isPlainTextComposerKey(event: KeyboardEvent): boolean {
  return !event.defaultPrevented
    && !event.isComposing
    && !event.metaKey
    && !event.ctrlKey
    && event.key !== " "
    && event.key !== "\u00a0"
    && event.key.length === 1;
}

function isEditableKeyboardTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || target.closest("[contenteditable='true']") != null;
}

function isAppBackedPanelState(
  state: CommandPanelState | null | undefined,
): state is CommandPanelState & { panel: "apps" | "plugins" } {
  return isAppBackedPanel(state?.panel);
}

function appListRefreshMessage(reason: AppListInvalidationReason): string {
  if (reason === "app-connect-oauth-callback") return "Connector OAuth callback received.";
  if (reason === "mcp-oauth-login-completed") return "MCP OAuth login completed.";
  return "App list changed.";
}

function mcpOauthLoginRefreshMessage(params: unknown): string {
  const payload = recordObject(params);
  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : "MCP server";
  if (payload.success === false) return `${name} OAuth login completed with an error.`;
  if (payload.success === true) return `${name} OAuth login completed.`;
  return "MCP OAuth login completed.";
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeWorkspaceRoot(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/[\\/]+$/, "") || trimmed;
}

function heartbeatPendingRequestType(
  requests: PendingServerRequest[],
): "userInput" | "approval" | "mcpServerElicitation" | "other" | null {
  const request = requests[0];
  if (!request) return null;
  switch (request.method) {
    case "item/tool/requestUserInput":
      return "userInput";
    case "item/commandExecution/requestApproval":
    case "item/fileChange/requestApproval":
    case "item/permissions/requestApproval":
      return "approval";
    case "mcpServer/elicitation/request":
      return "mcpServerElicitation";
    default:
      return "other";
  }
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
