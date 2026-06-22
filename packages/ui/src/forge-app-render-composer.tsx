import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from "react";
import type { Thread } from "@forge/codex-protocol";
import type { ThreadGoalStatus } from "@forge/codex-protocol/generated/v2/ThreadGoalStatus";
import { AboveComposerPanelContainer } from "./components/above-composer-panel";
import { BackgroundSubagentsStack } from "./components/background-subagents-stack";
import { Composer } from "./components/composer";
import { ComposerExternalFooter, ComposerSettingsChips } from "./components/composer-external-footer";
import { ComposerQuotaBanner } from "./components/composer-quota-banner";
import { ComposerStatusPanel } from "./components/composer-status-panel";
import { HooksReviewBanner } from "./components/hooks-review-banner";
import { PendingRequestStack } from "./components/pending-request-stack";
import { QueuedFollowUpStack } from "./components/queued-follow-up-stack";
import { StatusTextPanel } from "./components/status-text-panel";
import {
  PausedQueueSubmitConfirm,
  ThreadGoalBanner,
  ThreadGoalReplaceConfirm,
  ThreadGoalResumeConfirm,
} from "./components/thread-goal-banner";
import type { useHooksReview } from "./hooks/use-hooks-review";
import type { useThreadGoalActions } from "./hooks/use-thread-goal-actions";
import type { useModelPickerViewModel } from "./hooks/use-model-picker-view-model";
import type { PausedQueueSubmitDecision, useTurnSubmission } from "./hooks/use-turn-submission";
import { threadGitBranch } from "./state/app-shell-helpers";
import type { CodexUiState, PendingServerRequest } from "./state/codex-reducer";
import type { ComposerAttachment, ComposerMode, SettingsPanelId } from "./state/composer-workflow";
import type { ThreadWorkflowDispatch } from "./state/thread-workflow";
import type { ComposerWorkMode } from "./state/worktrees";

/*
 * Mechanical extraction from ForgeAppBody's return JSX (the
 * `hc-thread-composer-region` footer passed to <ThreadScrollLayout>). Plain
 * render helper — NOT a React component — so calling it inline keeps the
 * produced element tree byte-identical to the previous inline JSX.
 */
export interface ForgeAppComposerRegionArgs {
  activeModelSupportsImageInput: boolean;
  activePendingRequestActors: Record<string, string>;
  activePendingRequests: PendingServerRequest[];
  activeQueuedFollowUps: ComponentProps<typeof QueuedFollowUpStack>["messages"];
  activeQueuedFollowUpsInterrupted: boolean;
  activeThread: Thread | null;
  activeThreadDisplayModelSelection: ReturnType<typeof useModelPickerViewModel>["activeThreadDisplayModelSelection"];
  activeThreadRuntime: CodexUiState["threadsRuntime"][string];
  backgroundSubagentsStopAllPending: boolean;
  backgroundSubagentStopThreadIds: readonly string[];
  browseComposerFiles: ComponentProps<typeof Composer>["onBrowseFiles"];
  clearActiveThreadGoal: ComponentProps<typeof ThreadGoalBanner>["onClearGoal"];
  composerAttachments: ComposerAttachment[];
  composerGoalMode: boolean;
  composerMode: ComposerMode;
  composerModelProviderHint: string | null;
  composerPlaceholder: string;
  composerQuotaBanner: ComponentProps<typeof ComposerQuotaBanner>["banner"];
  composerStatusPanelOpen: boolean;
  composerSubmitState: ComponentProps<typeof Composer>["submitState"];
  composerWorkMode: ComposerWorkMode;
  composerWorkModeOptions: ComponentProps<typeof ComposerExternalFooter>["workModeOptions"];
  conversation: { backgroundAgents: ComponentProps<typeof BackgroundSubagentsStack>["entries"] };
  deleteQueuedFollowUp: ComponentProps<typeof QueuedFollowUpStack>["onDelete"];
  dispatch: ThreadWorkflowDispatch;
  editActiveThreadGoal: (objective: string) => Promise<void>;
  editQueuedFollowUp: ComponentProps<typeof QueuedFollowUpStack>["onEdit"];
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  executeSlashCommand: ComponentProps<typeof Composer>["onSlashCommand"];
  followUpQueueingEnabled: boolean;
  hasPlanComposerMode: boolean;
  hooksReviewSnapshot: ReturnType<typeof useHooksReview>["hooksReviewSnapshot"];
  input: string;
  interruptActiveTurn: () => Promise<void>;
  loadSettingsPanel: (panel: SettingsPanelId) => Promise<void>;
  onboardingEmptyStateVisible: boolean;
  openBackgroundAgentThread: ComponentProps<typeof BackgroundSubagentsStack>["onOpenThread"];
  openExistingWorkspaceFolder: () => Promise<void>;
  pausedQueueSubmitPrompt: { queuedMessageCount: number } | null;
  pendingGoalReplace: string | null;
  pauseActiveQueuedFollowUps: () => void;
  pursueComposerGoal: () => void;
  reorderQueuedFollowUp: ComponentProps<typeof QueuedFollowUpStack>["onReorder"];
  resolvePausedQueueSubmitPrompt: (decision: PausedQueueSubmitDecision) => void;
  respondToRequest: ComponentProps<typeof PendingRequestStack>["onRespond"];
  resumeInterruptedQueuedFollowUps: () => void;
  resumeGoalPrompt: { threadId: string; objective: string; status: ThreadGoalStatus } | null;
  reviewHooks: ComponentProps<typeof HooksReviewBanner>["onReview"];
  selectComposerPlan: () => void;
  selectProjectlessWorkspace: () => void;
  selectWorkspaceRoot: ComponentProps<typeof ComposerExternalFooter>["onWorkspaceRootSelected"];
  sendQueuedFollowUpNow: ComponentProps<typeof QueuedFollowUpStack>["onSendNow"];
  sendTurn: ReturnType<typeof useTurnSubmission>["sendTurn"];
  setActiveThreadGoalStatus: ReturnType<typeof useThreadGoalActions>["setActiveThreadGoalStatus"];
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setComposerStatusPanelOpen: (open: boolean) => void;
  setComposerWorkMode: ComponentProps<typeof ComposerExternalFooter>["onWorkModeChange"];
  setFollowUpQueueingEnabled: Dispatch<SetStateAction<boolean>>;
  setInput: Dispatch<SetStateAction<string>>;
  setPendingGoalReplace: Dispatch<SetStateAction<string | null>>;
  setResumeGoalPrompt: Dispatch<SetStateAction<{ threadId: string; objective: string; status: ThreadGoalStatus } | null>>;
  showHooksReviewBanner: boolean;
  state: CodexUiState;
  stopBackgroundSubagents: ComponentProps<typeof BackgroundSubagentsStack>["onStopAll"];
  searchComposerMentions: ComponentProps<typeof Composer>["onMentionSearch"];
  threadGoalPendingAction: ComponentProps<typeof ThreadGoalBanner>["pendingAction"];
  toggleModelPickerAnchor: ComponentProps<typeof ComposerSettingsChips>["onOpenModelPicker"];
  togglePermissionsPickerAnchor: ComponentProps<typeof ComposerSettingsChips>["onOpenPermissions"];
  toggleReasoningPickerAnchor: ComponentProps<typeof ComposerSettingsChips>["onOpenReasoningPicker"];
  tokenUsageSnapshot: NonNullable<CodexUiState["threadsRuntime"][string]>["tokenUsage"] | null;
  trustAllHooks: ComponentProps<typeof HooksReviewBanner>["onTrustAll"];
  workspace: string;
  workspaceRootOptions: ComponentProps<typeof ComposerExternalFooter>["workspaceRoots"];
}

export function renderForgeAppComposerRegion(args: ForgeAppComposerRegionArgs): ReactNode {
  const {
    activeModelSupportsImageInput,
    activePendingRequestActors,
    activePendingRequests,
    activeQueuedFollowUps,
    activeQueuedFollowUpsInterrupted,
    activeThread,
    activeThreadDisplayModelSelection,
    activeThreadRuntime,
    backgroundSubagentsStopAllPending,
    backgroundSubagentStopThreadIds,
    browseComposerFiles,
    clearActiveThreadGoal,
    composerAttachments,
    composerGoalMode,
    composerMode,
    composerModelProviderHint,
    composerPlaceholder,
    composerQuotaBanner,
    composerStatusPanelOpen,
    composerSubmitState,
    composerWorkMode,
    composerWorkModeOptions,
    conversation,
    deleteQueuedFollowUp,
    dispatch,
    editActiveThreadGoal,
    editQueuedFollowUp,
    effectiveThreadContextDefaults,
    executeSlashCommand,
    followUpQueueingEnabled,
    hasPlanComposerMode,
    hooksReviewSnapshot,
    input,
    interruptActiveTurn,
    loadSettingsPanel,
    onboardingEmptyStateVisible,
    openBackgroundAgentThread,
    openExistingWorkspaceFolder,
    pausedQueueSubmitPrompt,
    pendingGoalReplace,
    pauseActiveQueuedFollowUps,
    pursueComposerGoal,
    reorderQueuedFollowUp,
    resolvePausedQueueSubmitPrompt,
    respondToRequest,
    resumeInterruptedQueuedFollowUps,
    resumeGoalPrompt,
    reviewHooks,
    selectComposerPlan,
    selectProjectlessWorkspace,
    selectWorkspaceRoot,
    sendQueuedFollowUpNow,
    sendTurn,
    setActiveThreadGoalStatus,
    setComposerAttachments,
    setComposerStatusPanelOpen,
    setComposerWorkMode,
    setFollowUpQueueingEnabled,
    setInput,
    setPendingGoalReplace,
    setResumeGoalPrompt,
    showHooksReviewBanner,
    state,
    stopBackgroundSubagents,
    searchComposerMentions,
    threadGoalPendingAction,
    toggleModelPickerAnchor,
    togglePermissionsPickerAnchor,
    toggleReasoningPickerAnchor,
    tokenUsageSnapshot,
    trustAllHooks,
    workspace,
    workspaceRootOptions,
  } = args;
  return (
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
                 * Forge wires queued follow-ups, background subagents, hooks
                 * review, and the placeholder StatusText slot through this
                 * shared container. Quota/account banners render as siblings
                 * after this portal in the current Desktop bundle, and the
                 * `/status` panel is composer-local chrome rather than part of
                 * this above-composer stack.
                 */}
                <AboveComposerPanelContainer hasAboveComposerPortalContent={false}>
                  <QueuedFollowUpStack
                    messages={activeQueuedFollowUps}
                    isInterrupted={activeQueuedFollowUpsInterrupted}
                    isQueueingEnabled={followUpQueueingEnabled}
                    onSendNow={sendQueuedFollowUpNow}
                    onEdit={editQueuedFollowUp}
                    onDelete={deleteQueuedFollowUp}
                    onQueueingChange={setFollowUpQueueingEnabled}
                    onReorder={reorderQueuedFollowUp}
                    onResumeInterruptedQueue={resumeInterruptedQueuedFollowUps}
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
                  {pausedQueueSubmitPrompt !== null && (
                    <PausedQueueSubmitConfirm
                      queuedMessageCount={pausedQueueSubmitPrompt.queuedMessageCount}
                      onClearQueue={() => resolvePausedQueueSubmitPrompt("clearQueue")}
                      onSendMessage={() => resolvePausedQueueSubmitPrompt("sendMessage")}
                      onCancel={() => resolvePausedQueueSubmitPrompt("cancel")}
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
                   * slot 7). The inspected Desktop build feeds this from
                   * realtime composer ephemeral transcript state via
                   * `onRealtimeComposerTextChange`; Forge has no equivalent
                   * realtime composer text source wired, so `text` stays
                   * undefined and the panel renders nothing.
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
               * (verified via grep); Forge keeps the anchor for forward
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
                onInterrupt={() => {
                  pauseActiveQueuedFollowUps();
                  void interruptActiveTurn();
                }}
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
                  onUseExistingFolder={openExistingWorkspaceFolder}
                  onSelectProjectless={selectProjectlessWorkspace}
                  onWorkModeChange={setComposerWorkMode}
                />
              ) : null}
            </div>
  );
}
