import type { ComponentProps, CSSProperties, Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react";
import type { Thread } from "@forge/codex-protocol";
import { Maximize2, Minimize2, Plus, X } from "lucide-react";
import { AutomationsPreviewPanel } from "./components/automations-preview-panel";
import { BackgroundAgentPanel } from "./components/background-agent-panel";
import { ConversationChrome } from "./components/conversation-chrome";
import { ConversationView } from "./components/conversation-view";
import { FilePreviewPanel } from "./components/file-preview-panel";
import { RightRail } from "./components/right-rail";
import { SidePanelHost } from "./components/side-panel-host";
import {
  SidePanelNewTabPage,
  SidePanelSuggestedArtifacts,
  type SidePanelNewTabAction,
} from "./components/side-panel-new-tab-page";
import { ThreadFindBar } from "./components/thread-find-bar";
import { ThreadScrollLayout } from "./components/thread-scroll-layout";
import type { useArtifactPreviewActions } from "./hooks/use-artifact-preview-actions";
import type { useBackgroundAgentPanel } from "./hooks/use-background-agent-panel";
import type { useFilePreviewPanelLayout } from "./hooks/use-file-preview-panel-layout";
import type { useSidePanelTabHost } from "./hooks/use-side-panel-tab-host";
import type { useAppShellState } from "./hooks/use-app-shell-state";
import type { useThreadFind } from "./hooks/use-thread-find";
import type { useUiPreferences } from "./hooks/use-ui-preferences";
import type { useWorktreeGitAndPrStatus } from "./hooks/use-worktree-status";
import type { CodexUiState, PendingServerRequest } from "./state/codex-reducer";
import type { FileReferenceSelection } from "./state/file-references";
import type { projectConversation, RailEntry } from "./state/render-groups";
import { canNavigateBackInHistory, canNavigateForwardInHistory } from "./state/thread-history";
import type { ThreadWorkflowDispatch } from "./state/thread-workflow";
import { threadTitle } from "./state/thread-workflow";

/*
 * Mechanical extraction from ForgeAppBody's return JSX (the workbench
 * <main> element). Plain render helper — NOT a React component — so calling
 * it inline keeps the produced element tree byte-identical to the previous
 * inline JSX. The composer-region footer is produced by
 * renderForgeAppComposerRegion at the call site and threaded through `footer`.
 */
export interface ForgeAppMainArgs {
  activeDiff: string;
  activePendingRequests: PendingServerRequest[];
  activeQueuedFollowUps: readonly unknown[];
  activeThread: Thread | null;
  activeThreadFindMatches: readonly unknown[];
  activeThreadRunning: boolean;
  activeThreadScrollKey: string;
  artifactPreview: RailEntry | null;
  artifactPreviewNonce: number;
  automationsModel: ComponentProps<typeof AutomationsPreviewPanel>["model"];
  automationsPanelOpen: boolean;
  backgroundAgentCanInterrupt: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentCanInterrupt"];
  backgroundAgentConversation: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentConversation"];
  backgroundAgentInterrupting: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentInterrupting"];
  backgroundAgentMessageDraft: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentMessageDraft"];
  backgroundAgentMessageError: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentMessageError"];
  backgroundAgentMessageSending: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentMessageSending"];
  backgroundAgentPanel: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentPanel"];
  backgroundAgentStatus: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentStatus"];
  backgroundAgentSubtitle: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentSubtitle"];
  backgroundAgentTitle: ReturnType<typeof useBackgroundAgentPanel>["backgroundAgentTitle"];
  backgroundTerminalCleanupPending: boolean;
  cleanBackgroundTerminals: () => Promise<void>;
  closeBackgroundAgentPanel: ReturnType<typeof useBackgroundAgentPanel>["closeBackgroundAgentPanel"];
  closeFilePreviewPanel: () => void;
  closeThreadFindBar: ReturnType<typeof useThreadFind>["closeThreadFindBar"];
  conversation: ReturnType<typeof projectConversation>;
  conversationEmptyState: ReactNode;
  dispatch: ThreadWorkflowDispatch;
  editLastUserTurn: ComponentProps<typeof ConversationView>["onEditLastUserMessage"];
  filePreviewPanelLayout: ReturnType<typeof useFilePreviewPanelLayout>;
  fileReference: FileReferenceSelection | null;
  fixedContent?: ReactNode;
  footer: ReactNode;
  forkActiveThreadFromTurn: ComponentProps<typeof ConversationView>["onForkTurn"];
  formatUiMessage: ReturnType<typeof useUiPreferences>["formatUiMessage"];
  goToThreadFindMatch: ReturnType<typeof useThreadFind>["goToThreadFindMatch"];
  handleMcpAppHostCall: ComponentProps<typeof ConversationView>["onMcpAppHostCall"];
  handlePatchAction: ComponentProps<typeof ConversationView>["onPatchAction"];
  hasFilePreviewSelection: boolean;
  initialThreadScrollOffset: number;
  interruptBackgroundAgentPanelTurn: ReturnType<typeof useBackgroundAgentPanel>["interruptBackgroundAgentPanelTurn"];
  mainLayoutStyle: CSSProperties;
  mainRef: MutableRefObject<HTMLElement | null>;
  memoryCitationRoot: ComponentProps<typeof ConversationView>["memoryCitationRoot"];
  openActiveDiffPanel: (filePath?: string) => void;
  openAssistantArtifactInSidePanel: ComponentProps<typeof ConversationView>["onOpenAssistantArtifact"];
  openAutomationFromConversation: ComponentProps<typeof ConversationView>["onOpenAutomation"];
  openAutomationsPanel: (automationId?: string | null) => void;
  openBackgroundAgentThread: ReturnType<typeof useBackgroundAgentPanel>["openBackgroundAgentThread"];
  openBrowserSurface: (tabId?: string | null) => void;
  openFileReferenceExternal: ComponentProps<typeof FilePreviewPanel>["onOpenFileReferenceExternal"];
  openRailArtifactFileExternal: ComponentProps<typeof FilePreviewPanel>["onOpenArtifactFileExternal"];
  openRailPlan: ComponentProps<typeof RightRail>["onOpenPlan"];
  openRailUrl: ComponentProps<typeof FilePreviewPanel>["onOpenUrl"];
  openRemoteTask: ComponentProps<typeof ConversationView>["onOpenRemoteTask"];
  patchActionInFlight: ComponentProps<typeof ConversationView>["patchActionInFlight"];
  patchActionState: ComponentProps<typeof ConversationView>["patchActionState"];
  previewConversationFileReferenceAndOpenRail: ComponentProps<typeof ConversationView>["onOpenFileReference"];
  previewPathContext: ReturnType<typeof useArtifactPreviewActions>["previewPathContext"];
  previewRailArtifact: ComponentProps<typeof RightRail>["onOpenArtifactPreview"];
  previewRailFileReferenceAndOpenRail: ComponentProps<typeof RightRail>["onOpenFileReference"];
  readMcpResource: ComponentProps<typeof ConversationView>["onReadMcpResource"];
  refreshAutomationsPanel: () => Promise<void>;
  rememberThreadScrollOffset: (distanceFromBottomPx: number) => void;
  revealAssistantEndResource: ComponentProps<typeof ConversationView>["onRevealAssistantEndResource"];
  rightRailMode: ComponentProps<typeof RightRail>["displayMode"];
  rightRailPinned: boolean;
  rightRailSections: ComponentProps<typeof RightRail>["sections"];
  selectThreadById: (threadId: string) => void;
  sendBackgroundAgentPanelMessage: ReturnType<typeof useBackgroundAgentPanel>["sendBackgroundAgentPanelMessage"];
  setArtifactPreview: (entry: RailEntry | null) => void;
  setAutomationsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setBackgroundAgentMessageDraft: ReturnType<typeof useBackgroundAgentPanel>["setBackgroundAgentMessageDraft"];
  setFileReference: Dispatch<SetStateAction<FileReferenceSelection | null>>;
  setFocusedAutomationId: Dispatch<SetStateAction<string | null>>;
  setRightRailPinned: ReturnType<typeof useAppShellState>["setRightRailPinned"];
  setRightRailPopoverOpen: ReturnType<typeof useAppShellState>["setRightRailPopoverOpen"];
  setThreadFindQuery: ReturnType<typeof useThreadFind>["setThreadFindQuery"];
  showLiveTurnFixedContent: boolean;
  showRightRail: boolean;
  showRightRailPopover: boolean;
  sidebarOpen: boolean;
  sidePanel: ReturnType<typeof useSidePanelTabHost>;
  sidePanelNewTabActions: readonly SidePanelNewTabAction[];
  state: CodexUiState;
  threadFindFocusToken: ReturnType<typeof useThreadFind>["threadFindFocusToken"];
  threadFindOpen: boolean;
  threadFindQuery: string;
  threadFindScrollToUnitRef: MutableRefObject<((unitKey: string) => boolean) | null>;
  threadInlineEndInset: ComponentProps<typeof ThreadScrollLayout>["inlineEndInset"];
  toggleSidebar: () => void;
  visibleThreadFindIndex: ReturnType<typeof useThreadFind>["visibleThreadFindIndex"];
  worktreeHostGitStatus: ReturnType<typeof useWorktreeGitAndPrStatus>["worktreeHostGitStatus"];
}

export function renderForgeAppMain(args: ForgeAppMainArgs): ReactNode {
  const {
    activeDiff,
    activePendingRequests,
    activeQueuedFollowUps,
    activeThread,
    activeThreadFindMatches,
    activeThreadRunning,
    activeThreadScrollKey,
    artifactPreview,
    artifactPreviewNonce,
    automationsModel,
    automationsPanelOpen,
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
    backgroundTerminalCleanupPending,
    cleanBackgroundTerminals,
    closeBackgroundAgentPanel,
    closeFilePreviewPanel,
    closeThreadFindBar,
    conversation,
    conversationEmptyState,
    dispatch,
    editLastUserTurn,
    filePreviewPanelLayout,
    fileReference,
    fixedContent,
    footer,
    forkActiveThreadFromTurn,
    formatUiMessage,
    goToThreadFindMatch,
    handleMcpAppHostCall,
    handlePatchAction,
    hasFilePreviewSelection,
    initialThreadScrollOffset,
    interruptBackgroundAgentPanelTurn,
    mainLayoutStyle,
    mainRef,
    memoryCitationRoot,
    openActiveDiffPanel,
    openAssistantArtifactInSidePanel,
    openAutomationFromConversation,
    openAutomationsPanel,
    openBackgroundAgentThread,
    openBrowserSurface,
    openFileReferenceExternal,
    openRailArtifactFileExternal,
    openRailPlan,
    openRailUrl,
    openRemoteTask,
    patchActionInFlight,
    patchActionState,
    previewConversationFileReferenceAndOpenRail,
    previewPathContext,
    previewRailArtifact,
    previewRailFileReferenceAndOpenRail,
    readMcpResource,
    refreshAutomationsPanel,
    rememberThreadScrollOffset,
    revealAssistantEndResource,
    rightRailMode,
    rightRailPinned,
    rightRailSections,
    selectThreadById,
    sendBackgroundAgentPanelMessage,
    setArtifactPreview,
    setAutomationsPanelOpen,
    setBackgroundAgentMessageDraft,
    setFileReference,
    setFocusedAutomationId,
    setRightRailPinned,
    setRightRailPopoverOpen,
    setThreadFindQuery,
    showLiveTurnFixedContent,
    showRightRail,
    showRightRailPopover,
    sidebarOpen,
    sidePanel,
    sidePanelNewTabActions,
    state,
    threadFindFocusToken,
    threadFindOpen,
    threadFindQuery,
    threadFindScrollToUnitRef,
    threadInlineEndInset,
    toggleSidebar,
    visibleThreadFindIndex,
    worktreeHostGitStatus,
  } = args;
  return (
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
           * `local-thread-summary-panel-toggle`). Forge shows it only when
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
          contentVersion={`${conversation.units.length}:${activeThreadRunning}:${activePendingRequests.length}:${activeQueuedFollowUps.length}:${showLiveTurnFixedContent}:${activeDiff.length}`}
          fixedContent={fixedContent}
          footer={footer}
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
            onOpenPlan={openRailPlan}
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
            // ?automationId=…). Forge threads the rail row's id through
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
          * outlet + tabs + sticky "+" + close button. Forge consolidates
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
            widthPx={filePreviewPanelLayout.widthPx}
            fullWidth={filePreviewPanelLayout.fullWidth}
            resize={{
              isResizing: filePreviewPanelLayout.isResizing,
              // Below-minimum drags must close THIS host (Codex right-panel
              // semantics), not the file-preview selection the shared hook
              // defaults to — that closed a different panel behind the host.
              onResizeStart: (event, asideElement) => filePreviewPanelLayout.startResize(
                event,
                asideElement,
                { onShouldClose: () => sidePanel.setPanelOpen(false) },
              ),
              onResetWidth: filePreviewPanelLayout.resetWidth,
            }}
            emptyState={(
              <SidePanelNewTabPage
                actions={sidePanelNewTabActions}
                suggestedSlot={conversation.artifacts.length > 0 && openAssistantArtifactInSidePanel ? (
                  <SidePanelSuggestedArtifacts
                    artifacts={conversation.artifacts}
                    onOpenArtifact={openAssistantArtifactInSidePanel}
                  />
                ) : null}
              />
            )}
            afterTabsStickySlot={
              <>
                {/*
                  * codex: rightPanel expand/restore (`U` atom + `Q()` helper)
                  * — full-width toggle. Same Maximize2/Minimize2 pair and ICU
                  * ids as the Codex right-panel header action.
                  */}
                <button
                  type="button"
                  className="hc-side-panel-tab-bar-button"
                  aria-pressed={filePreviewPanelLayout.fullWidth}
                  aria-label={filePreviewPanelLayout.fullWidth
                    ? formatUiMessage({ id: "codex.rightPanel.restoreWidth", defaultMessage: "Restore panel width" })
                    : formatUiMessage({ id: "codex.rightPanel.expandFullWidth", defaultMessage: "Expand panel" })}
                  title={filePreviewPanelLayout.fullWidth
                    ? formatUiMessage({ id: "codex.rightPanel.restoreWidth", defaultMessage: "Restore panel width" })
                    : formatUiMessage({ id: "codex.rightPanel.expandFullWidth", defaultMessage: "Expand panel" })}
                  onClick={filePreviewPanelLayout.toggleFullWidth}
                >
                  {filePreviewPanelLayout.fullWidth
                    ? <Minimize2 size={16} aria-hidden="true" />
                    : <Maximize2 size={16} aria-hidden="true" />}
                </button>
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
                  * itself is the same — the close-panel handler. Forge
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
          * `<FilePreviewPanel>` is Forge's analogue: resizable (default
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
  );
}
