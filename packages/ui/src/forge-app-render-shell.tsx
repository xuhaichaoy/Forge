import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from "react";
import type { ModelConfig, Thread } from "@forge/codex-protocol";
import { AppOverlays } from "./components/app-overlays";
import { McpDialogs } from "./components/mcp-dialogs";
import { PanelOverlays } from "./components/panel-overlays";
import { Sidebar } from "./components/sidebar";
import { ThreadDialogs } from "./components/thread-dialogs";
import { normalizeReasoningEffortValue } from "./components/reasoning-picker-menu";
import type { McpServerFormAction, McpToolFormAction, useCommandPanelActions } from "./hooks/use-command-panel-actions";
import type { useAppOverlayState } from "./hooks/use-app-overlay-state";
import type { useAppUpdater } from "./hooks/use-app-updater";
import type { useMcpAppHostBridge } from "./hooks/use-mcp-app-host-bridge";
import type { useSidebarPreferences } from "./hooks/use-sidebar-preferences";
import type { useSidebarResizeController } from "./hooks/use-sidebar-resize-controller";
import type { useTurnPatchAction } from "./hooks/use-turn-patch-action";
import type { useUiPreferences } from "./hooks/use-ui-preferences";
import type { useWorktreeGitAndPrStatus } from "./hooks/use-worktree-status";
import type { CodexUiState } from "./state/codex-reducer";
import type { CommandPanelState } from "./state/command-panel";
import type { SettingsPanelId } from "./state/composer-workflow";
import { permissionModeFromThreadContext } from "./state/permissions-mode";
import {
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
} from "./state/sidebar-preferences";
import { projectSidebarThreads } from "./state/sidebar-projection";
import type { runSlashRequestWorkflow } from "./state/slash-request-workflow";
import { threadTitle } from "./state/thread-workflow";

/*
 * Mechanical extractions from ForgeAppBody's return JSX. Plain render
 * helpers — NOT React components — each returns exactly ONE element (no
 * wrapping fragment), so calling them inline keeps the produced element tree
 * byte-identical to the previous inline JSX:
 *   - renderForgeAppSidebar: the workbench <Sidebar> element.
 *   - renderForgeAppSidebarResizeHandle: the sidebar resize separator.
 *   - renderForgeAppPanelOverlays / renderForgeAppMcpDialogs /
 *     renderForgeAppThreadDialogs / renderForgeAppAppOverlays: the four
 *     trailing overlay siblings of the app root <div>.
 */
export interface ForgeAppSidebarArgs {
  accountViewModel: ComponentProps<typeof Sidebar>["accountView"];
  activeThread: Thread | null;
  archiveSelectedThread: ComponentProps<typeof Sidebar>["onArchiveThread"];
  connect: () => Promise<boolean>;
  copyThreadDeeplink: ComponentProps<typeof Sidebar>["onCopyDeeplink"];
  copyThreadSessionId: ComponentProps<typeof Sidebar>["onCopySessionId"];
  copyThreadWorkingDirectory: ComponentProps<typeof Sidebar>["onCopyWorkingDirectory"];
  createWorkbenchThread: () => Promise<void>;
  forkSelectedThread: ComponentProps<typeof Sidebar>["onForkThread"];
  forkSelectedThreadIntoWorktree: ComponentProps<typeof Sidebar>["onForkThreadIntoWorktree"];
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  markThreadUnread: ComponentProps<typeof Sidebar>["onMarkThreadUnread"];
  openAutomationsPanel: ComponentProps<typeof Sidebar>["onOpenAutomations"];
  openChatSearchPanel: ComponentProps<typeof Sidebar>["onOpenSearch"];
  openExistingWorkspaceFolder: ComponentProps<typeof Sidebar>["onUseExistingFolder"];
  openRenameThreadDialog: ComponentProps<typeof Sidebar>["onRenameThread"];
  openThreadFolder: ComponentProps<typeof Sidebar>["onOpenThreadFolder"];
  openThreadInNewWindow: ComponentProps<typeof Sidebar>["onOpenThreadWindow"];
  pinnedThreadIds: ComponentProps<typeof Sidebar>["pinnedThreadIds"];
  resolvedUiTheme: ComponentProps<typeof Sidebar>["resolvedUiTheme"];
  runUpdate: ReturnType<typeof useAppUpdater>["runUpdate"];
  selectedWorkspaceRoots: string[];
  selectWorkbenchThread: ComponentProps<typeof Sidebar>["onSelectThread"];
  setSidebarCollapsedGroupKeys: ComponentProps<typeof Sidebar>["onCollapsedGroupKeysChange"];
  setSidebarOrganizeMode: ComponentProps<typeof Sidebar>["onOrganizeModeChange"];
  setSidebarSortKey: ComponentProps<typeof Sidebar>["onSortKeyChange"];
  sidebarCollapsedGroupKeys: ComponentProps<typeof Sidebar>["collapsedGroupKeys"];
  sidebarPreferences: ReturnType<typeof useSidebarPreferences>["sidebarPreferences"];
  signOutAccount: ComponentProps<typeof Sidebar>["onSignOut"];
  state: CodexUiState;
  toggleThreadPinned: ComponentProps<typeof Sidebar>["onToggleThreadPinned"];
  updateBadge: ReturnType<typeof useAppUpdater>["updateBadge"];
  workspace: string;
  worktreeHostGitStatus: ReturnType<typeof useWorktreeGitAndPrStatus>["worktreeHostGitStatus"];
}

export function renderForgeAppSidebar(args: ForgeAppSidebarArgs): ReactNode {
  const {
    accountViewModel,
    activeThread,
    archiveSelectedThread,
    connect,
    copyThreadDeeplink,
    copyThreadSessionId,
    copyThreadWorkingDirectory,
    createWorkbenchThread,
    forkSelectedThread,
    forkSelectedThreadIntoWorktree,
    loadSettingsPanel,
    markThreadUnread,
    openAutomationsPanel,
    openChatSearchPanel,
    openExistingWorkspaceFolder,
    openRenameThreadDialog,
    openThreadFolder,
    openThreadInNewWindow,
    pinnedThreadIds,
    resolvedUiTheme,
    runUpdate,
    selectedWorkspaceRoots,
    selectWorkbenchThread,
    setSidebarCollapsedGroupKeys,
    setSidebarOrganizeMode,
    setSidebarSortKey,
    sidebarCollapsedGroupKeys,
    sidebarPreferences,
    signOutAccount,
    state,
    toggleThreadPinned,
    updateBadge,
    workspace,
    worktreeHostGitStatus,
  } = args;
  return (
        <Sidebar
          threads={projectSidebarThreads(state.threads, { sortKey: sidebarPreferences.sortKey })}
          threadsLoading={state.threadsLoading || state.connecting}
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
          onUseExistingFolder={openExistingWorkspaceFolder}
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
  );
}

export interface ForgeAppSidebarResizeHandleArgs {
  resizeSidebarByKeyboard: ReturnType<typeof useSidebarResizeController>["resizeSidebarByKeyboard"];
  sidebarResizing: boolean;
  sidebarVisible: boolean;
  sidebarWidthPx: number;
  startSidebarResize: ReturnType<typeof useSidebarResizeController>["startSidebarResize"];
}

export function renderForgeAppSidebarResizeHandle(args: ForgeAppSidebarResizeHandleArgs): ReactNode {
  const {
    resizeSidebarByKeyboard,
    sidebarResizing,
    sidebarVisible,
    sidebarWidthPx,
    startSidebarResize,
  } = args;
  return (
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
  );
}

export interface ForgeAppPanelOverlaysArgs {
  activeSettingsPanel: SettingsPanelId | null;
  applyImageGenerationDraft: ComponentProps<typeof PanelOverlays>["onSaveImageGeneration"];
  applyModelDraft: ComponentProps<typeof PanelOverlays>["onSaveModel"];
  closeCommandPanel: ComponentProps<typeof PanelOverlays>["onCommandPanelClose"];
  commandPanel: CommandPanelState | null;
  handleSettingsPanelSelectAction: ComponentProps<typeof PanelOverlays>["onSelectAction"];
  handleSettingsPanelSelectEntry: ComponentProps<typeof PanelOverlays>["onSelectEntry"];
  imageGenerationDraft: ComponentProps<typeof PanelOverlays>["imageGenerationDraft"];
  keymapOverrides: ReturnType<typeof useUiPreferences>["keymapOverrides"];
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  modelDraft: ModelConfig;
  refreshActiveSettingsPanel: ComponentProps<typeof PanelOverlays>["onRefreshPanel"];
  resetUiKeyboardShortcut: ComponentProps<typeof PanelOverlays>["onResetKeyboardShortcut"];
  searchChatsFromCommandPanel: ComponentProps<typeof PanelOverlays>["onSearchChats"];
  searchCommandMenuFromPanel: ComponentProps<typeof PanelOverlays>["onSearchCommandMenu"];
  searchFilesFromCommandPanel: ComponentProps<typeof PanelOverlays>["onSearchFiles"];
  selectCommandPanelAction: ReturnType<typeof useCommandPanelActions>["selectCommandPanelAction"];
  selectCommandPanelEntry: ComponentProps<typeof PanelOverlays>["onCommandPanelSelectEntry"];
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  setImageGenerationDraft: ComponentProps<typeof PanelOverlays>["setImageGenerationDraft"];
  setModelDraft: ComponentProps<typeof PanelOverlays>["setModelDraft"];
  settingsPanelState: CommandPanelState | null;
  setUiCodeFontSize: ComponentProps<typeof PanelOverlays>["onSetCodeFontSize"];
  setUiFontSize: ComponentProps<typeof PanelOverlays>["onSetUiFontSize"];
  setUiKeyboardShortcut: ComponentProps<typeof PanelOverlays>["onSetKeyboardShortcut"];
  setUiLocale: ComponentProps<typeof PanelOverlays>["onSetUiLocale"];
  setUiReducedMotion: ComponentProps<typeof PanelOverlays>["onSetReducedMotion"];
  setUiThemeMode: ComponentProps<typeof PanelOverlays>["onSetUiTheme"];
  state: CodexUiState;
  uiAppearance: ComponentProps<typeof PanelOverlays>["uiAppearance"];
  uiLocale: ComponentProps<typeof PanelOverlays>["uiLocale"];
  uiThemeSnapshot: ComponentProps<typeof PanelOverlays>["uiTheme"];
}

export function renderForgeAppPanelOverlays(args: ForgeAppPanelOverlaysArgs): ReactNode {
  const {
    activeSettingsPanel,
    applyImageGenerationDraft,
    applyModelDraft,
    closeCommandPanel,
    commandPanel,
    handleSettingsPanelSelectAction,
    handleSettingsPanelSelectEntry,
    imageGenerationDraft,
    keymapOverrides,
    loadSettingsPanel,
    modelDraft,
    refreshActiveSettingsPanel,
    resetUiKeyboardShortcut,
    searchChatsFromCommandPanel,
    searchCommandMenuFromPanel,
    searchFilesFromCommandPanel,
    selectCommandPanelAction,
    selectCommandPanelEntry,
    setActiveSettingsPanel,
    setImageGenerationDraft,
    setModelDraft,
    settingsPanelState,
    setUiCodeFontSize,
    setUiFontSize,
    setUiKeyboardShortcut,
    setUiLocale,
    setUiReducedMotion,
    setUiThemeMode,
    state,
    uiAppearance,
    uiLocale,
    uiThemeSnapshot,
  } = args;
  return (
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
        onSearchChats={searchChatsFromCommandPanel}
        onSearchFiles={searchFilesFromCommandPanel}
        onSearchCommandMenu={searchCommandMenuFromPanel}
      />
  );
}

export interface ForgeAppMcpDialogsArgs {
  closeMcpFollowUpDialog: ComponentProps<typeof McpDialogs>["onFollowUpClose"];
  confirmMcpFollowUpDialog: ComponentProps<typeof McpDialogs>["onFollowUpSend"];
  handleMcpServerFormSubmit: ComponentProps<typeof McpDialogs>["onServerFormSubmit"];
  handleMcpToolFormSubmit: ComponentProps<typeof McpDialogs>["onToolFormSubmit"];
  mcpFollowUpDialog: ReturnType<typeof useMcpAppHostBridge>["mcpFollowUpDialog"];
  mcpServerForm: McpServerFormAction | null;
  mcpToolForm: McpToolFormAction | null;
  setMcpServerForm: Dispatch<SetStateAction<McpServerFormAction | null>>;
  setMcpToolForm: Dispatch<SetStateAction<McpToolFormAction | null>>;
}

export function renderForgeAppMcpDialogs(args: ForgeAppMcpDialogsArgs): ReactNode {
  const {
    closeMcpFollowUpDialog,
    confirmMcpFollowUpDialog,
    handleMcpServerFormSubmit,
    handleMcpToolFormSubmit,
    mcpFollowUpDialog,
    mcpServerForm,
    mcpToolForm,
    setMcpServerForm,
    setMcpToolForm,
  } = args;
  return (
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
  );
}

export interface ForgeAppThreadDialogsArgs {
  archiveSelectedThread: ComponentProps<typeof ThreadDialogs>["onArchive"];
  closeThreadActionDialog: ComponentProps<typeof ThreadDialogs>["onThreadActionClose"];
  confirmForkFromOlderTurn: ComponentProps<typeof ThreadDialogs>["onForkConfirm"];
  dismissForkFromOlderTurn: ComponentProps<typeof ThreadDialogs>["onForkClose"];
  forkConfirmOpen: boolean;
  forkConfirmSubmitting: boolean;
  renameSelectedThread: ComponentProps<typeof ThreadDialogs>["onRename"];
  threadActionDialog: ComponentProps<typeof ThreadDialogs>["threadActionDialog"];
}

export function renderForgeAppThreadDialogs(args: ForgeAppThreadDialogsArgs): ReactNode {
  const {
    archiveSelectedThread,
    closeThreadActionDialog,
    confirmForkFromOlderTurn,
    dismissForkFromOlderTurn,
    forkConfirmOpen,
    forkConfirmSubmitting,
    renameSelectedThread,
    threadActionDialog,
  } = args;
  return (
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
  );
}

export interface ForgeAppAppOverlaysArgs {
  activeModelSupportedEfforts: ComponentProps<typeof AppOverlays>["reasoningSupportedEfforts"];
  activeThread: Thread | null;
  applyComposerPermissionMode: ComponentProps<typeof AppOverlays>["onPermissionApplyMode"];
  closeKeyboardShortcuts: ComponentProps<typeof AppOverlays>["onKeyboardShortcutsClose"];
  closeModelPicker: ComponentProps<typeof AppOverlays>["onModelPickerClose"];
  closePermissionsPicker: ComponentProps<typeof AppOverlays>["onPermissionsPickerClose"];
  closeReasoningPicker: ComponentProps<typeof AppOverlays>["onReasoningPickerClose"];
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  handleComposerModelSelect: ComponentProps<typeof AppOverlays>["onModelSelect"];
  handlePatchFailureOpenPath: ComponentProps<typeof AppOverlays>["onPatchFailureOpenPath"];
  handleReasoningSelect: ComponentProps<typeof AppOverlays>["onReasoningSelect"];
  keyboardShortcutsOpen: boolean;
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  modelPickerAnchor: ReturnType<typeof useAppOverlayState>["modelPickerAnchor"];
  modelPickerOverlayDefaultKey: ComponentProps<typeof AppOverlays>["modelPickerDefaultKey"];
  modelPickerOverlaySelectedKey: ComponentProps<typeof AppOverlays>["modelPickerSelectedKey"];
  modelPickerProviders: ComponentProps<typeof AppOverlays>["modelPickerProviders"];
  patchFailure: ComponentProps<typeof AppOverlays>["patchFailure"];
  permissionsPickerAnchor: ReturnType<typeof useAppOverlayState>["permissionsPickerAnchor"];
  permissionsRequirements: ReturnType<typeof useAppOverlayState>["permissionsRequirements"];
  readyProviders: ComponentProps<typeof AppOverlays>["modelPickerReadyProviders"];
  reasoningPickerAnchor: ReturnType<typeof useAppOverlayState>["reasoningPickerAnchor"];
  runSlashRequest: (request: Parameters<typeof runSlashRequestWorkflow>[0]) => unknown;
  setPatchFailure: ReturnType<typeof useTurnPatchAction>["setPatchFailure"];
  state: CodexUiState;
}

export function renderForgeAppAppOverlays(args: ForgeAppAppOverlaysArgs): ReactNode {
  const {
    activeModelSupportedEfforts,
    activeThread,
    applyComposerPermissionMode,
    closeKeyboardShortcuts,
    closeModelPicker,
    closePermissionsPicker,
    closeReasoningPicker,
    effectiveThreadContextDefaults,
    handleComposerModelSelect,
    handlePatchFailureOpenPath,
    handleReasoningSelect,
    keyboardShortcutsOpen,
    loadSettingsPanel,
    modelPickerAnchor,
    modelPickerOverlayDefaultKey,
    modelPickerOverlaySelectedKey,
    modelPickerProviders,
    patchFailure,
    permissionsPickerAnchor,
    permissionsRequirements,
    readyProviders,
    reasoningPickerAnchor,
    runSlashRequest,
    setPatchFailure,
    state,
  } = args;
  return (
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
  );
}
