import type { CSSProperties, Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo } from "react";
import type { Thread } from "@forge/codex-protocol";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { claimAppConnectOAuthCallback } from "../state/app-connect-oauth";
import { invalidateAppList } from "../state/app-list";
import { slashCommandEntries } from "../state/app-shell-helpers";
import type { projectActiveThreadAutomation } from "../state/automations-viewer";
import type { projectBranchDetails } from "../state/branch-details";
import type { CodexUiState } from "../state/codex-reducer";
import {
  createCommandPanelState,
  commandPanelThreadGroup,
  orderCommandPanelThreadsByPinned,
  type CommandPanelEntry,
  type CommandPanelKind,
  type CommandPanelOptions,
  type CommandPanelState,
} from "../state/command-panel";
import {
  composerPlaceholderText,
  type ComposerAttachment,
  type ComposerMode,
  type SettingsPanelId,
} from "../state/composer-workflow";
import { threadIdFromCodexDeepLink } from "../state/deep-links";
import type { WorkspaceFuzzyFileSearchController } from "../state/fuzzy-file-search-session";
import type { HooksSettingsFocus } from "../state/hooks-review";
import type { projectConversation } from "../state/render-groups";
import { projectRightRailSections } from "../state/right-rail";
import { projectAppShellRightRailLayout } from "../state/right-rail-layout";
import { loadSettingsPanelContent } from "../state/settings-panel-loader";
import {
  projectSidebarThreads,
  sidebarThreadRelativeTime,
  threadProjectLabel,
} from "../state/sidebar-projection";
import {
  resumeThreadWithMetadataRead,
  threadTitle,
  type ThreadWorkflowDispatch,
} from "../state/thread-workflow";
import type { PendingWorktree } from "../state/worktrees";
import type { ComposerWorkMode } from "../state/worktrees";
import { useBrowserRuntime } from "./use-browser-runtime";
import { useCommandPanelFileSearch } from "./use-command-panel-file-search";
import { useFilePreviewPanelLayout } from "./use-file-preview-panel-layout";
import { useHooksReview } from "./use-hooks-review";
import { useRemoteTaskActions } from "./use-remote-task-actions";
import type { useAppShellState } from "./use-app-shell-state";
import type { useBackgroundAgentPanel } from "./use-background-agent-panel";
import type { useSidebarPreferences } from "./use-sidebar-preferences";
import type { useThreadPins } from "./use-thread-pins";
import type { useUiPreferences } from "./use-ui-preferences";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (composer placeholder + browser runtime + summary-rail sections/layout +
 * file-preview panel layout + deep links + command panel openers + settings
 * panel loader + hooks review). Hook call order inside the cluster is
 * unchanged, and the cluster is invoked from the exact source position the
 * first extracted hook previously occupied, so React's linear hook sequence
 * is preserved.
 */
export interface ForgeAppRailPanelsArgs {
  activeSettingsPanel: SettingsPanelId | null;
  activeThread: Thread | null;
  activeThreadAutomation: ReturnType<typeof projectActiveThreadAutomation>;
  activeThreadRuntime: CodexUiState["threadsRuntime"][string];
  activeTurnId: string | null;
  automationsPanelOpen: boolean;
  backgroundAgentPanel: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentPanel"];
  branchDetails: ReturnType<typeof projectBranchDetails>;
  changeActiveAppTab: ReturnType<typeof useAppShellState>["changeActiveAppTab"];
  client: CodexJsonRpcClient;
  closeFilePreviewPanel: () => void;
  commandPanel: CommandPanelState | null;
  composerAttachments: ComposerAttachment[];
  composerGoalMode: boolean;
  composerMode: ComposerMode;
  composerWorkMode: ComposerWorkMode;
  conversation: ReturnType<typeof projectConversation>;
  dispatch: ThreadWorkflowDispatch;
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  ensureConnected: () => Promise<boolean>;
  fileSearchControllerRef: MutableRefObject<WorkspaceFuzzyFileSearchController | null>;
  formatUiMessage: ReturnType<typeof useUiPreferences>["formatUiMessage"];
  hasFilePreviewSelection: boolean;
  includeImageDynamicTool: boolean;
  input: string;
  mainWidth: number;
  notificationPreferences: ReturnType<typeof useUiPreferences>["notificationPreferences"];
  openWorkbenchTab: ReturnType<typeof useAppShellState>["openWorkbenchTab"];
  pendingWorktree: PendingWorktree | null;
  pinnedThreadIds: ReturnType<typeof useThreadPins>["pinnedThreadIds"];
  rightRailPinned: boolean;
  rightRailPopoverOpen: boolean;
  selectWorkbenchThread: (thread: Thread) => Promise<void>;
  setActiveRemoteTaskId: ReturnType<typeof useAppShellState>["setActiveRemoteTaskId"];
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  setRightRailPopoverOpen: ReturnType<typeof useAppShellState>["setRightRailPopoverOpen"];
  setSettingsPanelState: Dispatch<SetStateAction<CommandPanelState | null>>;
  sidebarPreferences: ReturnType<typeof useSidebarPreferences>["sidebarPreferences"];
  sideChatRailEntries: ReturnType<typeof useBackgroundAgentPanel>["sideChatRailEntries"];
  state: CodexUiState;
  uiAppearance: ReturnType<typeof useUiPreferences>["uiAppearance"];
  uiLocale: ReturnType<typeof useUiPreferences>["uiLocale"];
  uiThemeSnapshot: ReturnType<typeof useUiPreferences>["uiThemeSnapshot"];
  workspace: string;
}

export function useForgeAppRailPanels(args: ForgeAppRailPanelsArgs) {
  const {
    activeSettingsPanel,
    activeThread,
    activeThreadAutomation,
    activeThreadRuntime,
    activeTurnId,
    automationsPanelOpen,
    backgroundAgentPanel,
    branchDetails,
    changeActiveAppTab,
    client,
    closeFilePreviewPanel,
    commandPanel,
    composerAttachments,
    composerGoalMode,
    composerMode,
    composerWorkMode,
    conversation,
    dispatch,
    effectiveThreadContextDefaults,
    ensureConnected,
    fileSearchControllerRef,
    formatUiMessage,
    hasFilePreviewSelection,
    includeImageDynamicTool,
    input,
    mainWidth,
    notificationPreferences,
    openWorkbenchTab,
    pendingWorktree,
    pinnedThreadIds,
    rightRailPinned,
    rightRailPopoverOpen,
    selectWorkbenchThread,
    setActiveRemoteTaskId,
    setActiveSettingsPanel,
    setCommandPanel,
    setRightRailPopoverOpen,
    setSettingsPanelState,
    sidebarPreferences,
    sideChatRailEntries,
    state,
    uiAppearance,
    uiLocale,
    uiThemeSnapshot,
    workspace,
  } = args;
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
  /*
   * Codex Desktop Summary Rail predicate: `shouldShow = !isHiddenByRightPanel && (isPinned && displayMode !== "overlay")`.
   * `isHiddenByRightPanel` is true when a non-overlay rail is forced down by
   * the big AppShell RightPanel. Forge's RightPanel
   * equivalent is the file-preview side panel — `hasFilePreviewSelection`
   * drives the same auto-hide rule. Empty sections collapse, matching the
   * `rightRailSections.length > 0` term.
   *
   * codex: new-thread-panel-page-*.js — the empty/new-chat page
   * renders only `<main>` + composer; the summary rail components (`Lu`/`dS`
   * in local-conversation-thread-*.js) live exclusively inside the
   * conversation page tree. Forge flattens both pages into one app shell,
   * so we additionally gate on `activeThread` to keep the Environment +
   * Sources rail from leaking into the new-chat onboarding view (the host
   * git status is read from the workspace even without a thread, which would
   * otherwise paint the rail with branchDetails the moment a user opens
   * the app in a git workspace).
   */
  const rightRailLayout = projectAppShellRightRailLayout({
    mainWidthPx: mainWidth,
    hasActiveThread: Boolean(activeThread),
    hasRailSections: rightRailSections.length > 0,
    rightRailPinned,
    rightRailPopoverOpen,
    hasFilePreviewSelection,
    filePreviewPanelFullWidth: filePreviewPanelLayout.fullWidth,
    filePreviewPanelWidthPx: filePreviewPanelLayout.widthPx,
    hasBackgroundAgentPanel: backgroundAgentPanel != null,
    automationsPanelOpen,
  });
  const rightRailMode = rightRailLayout.rightRailMode;
  const showRightRail = rightRailLayout.showRightRail;
  const showRightRailPopover = rightRailLayout.showRightRailPopover;
  useEffect(() => {
    if (rightRailLayout.shouldCloseRightRailPopover) {
      setRightRailPopoverOpen(false);
    }
  }, [rightRailLayout.shouldCloseRightRailPopover, setRightRailPopoverOpen]);
  const mainLayoutStyle = {
    "--hc-right-panel-offset": `${rightRailLayout.rightPanelOffsetPx}px`,
  } as CSSProperties;
  // Reserve the conversation's right edge for side panels plus the summary rail.
  // Full-width file preview covers the thread instead of pushing it.
  const threadInlineEndInset = rightRailLayout.threadInlineEndInset;

  const selectThreadById = useCallback((threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      dispatch({ type: "log", text: `thread not found: ${threadId}`, level: "warn" });
      return;
    }
    void selectWorkbenchThread(thread);
  }, [dispatch, selectWorkbenchThread, state.threads]);
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
      const result = await resumeThreadWithMetadataRead(client, threadId, workspace, effectiveThreadContextDefaults, dispatch);
      openWorkbenchTab();
      dispatch({ type: "upsertThread", thread: result.thread, select: true });
      dispatch({ type: "log", text: `Opened thread from deeplink: ${threadId}`, level: "info" });
    } catch (error) {
      dispatch({ type: "log", text: `Failed to open deeplink ${threadId}: ${formatError(error)}`, level: "error" });
    }
  }, [client, dispatch, effectiveThreadContextDefaults, ensureConnected, openWorkbenchTab, selectWorkbenchThread, state.threads, workspace]);

  const openCommandPanel = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setCommandPanel(createCommandPanelState(panel, options));
  }, [setCommandPanel]);

  const openSettingsPanelContent = useCallback((
    panel: CommandPanelKind,
    options?: CommandPanelOptions,
  ) => {
    setSettingsPanelState(createCommandPanelState(panel, options));
  }, [setSettingsPanelState]);

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
    setActiveSettingsPanel,
    setCommandPanel,
    setSettingsPanelState,
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
  return {
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
  };
}
