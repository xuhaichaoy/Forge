import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollaborationModeMask, Thread } from "@forge/codex-protocol";
import type { ThreadGoalStatus } from "@forge/codex-protocol/generated/v2/ThreadGoalStatus";
import { OnboardingEmptyState } from "../components/onboarding-empty-state";
import { PreConversationLoadingShell } from "../components/pre-conversation-loading-shell";
import type { CodexJsonRpcClient } from "../lib/codex-json-rpc-client";
import { formatError } from "../lib/format";
import { browserStorage } from "../state/app-shell-helpers";
import type { CodexUiState, PendingServerRequest } from "../state/codex-reducer";
import type {
  ComposerAttachment,
  ComposerMode,
  projectComposerSubmitState,
} from "../state/composer-workflow";
import {
  completeProjectlessOnboarding,
  dismissFirstNewThreadPromos,
  loadOnboardingSnapshot,
  shouldShowFirstNewThreadPromo,
  shouldShowOnboardingEmptyState,
} from "../state/onboarding";
import type {
  ThreadWorkflowDispatch,
  TurnStartOptions,
} from "../state/thread-workflow";
import { useTurnSubmission } from "./use-turn-submission";

/*
 * Mechanical extraction of a CONTIGUOUS hook cluster from ForgeAppBody
 * (background-terminal cleanup + goal replace/resume confirmations + the turn
 * submission hook + onboarding empty-state derivation). Hook call order
 * inside the cluster is unchanged, and the cluster is invoked from the exact
 * source position the first extracted hook previously occupied, so React's
 * linear hook sequence is preserved.
 */
export interface ForgeAppSubmissionArgs {
  activeModelSupportsImageInput: boolean;
  activePendingRequests: PendingServerRequest[];
  activeThread: Thread | null;
  activeThreadRunning: boolean;
  activeThreadRuntime: CodexUiState["threadsRuntime"][string];
  activeTurnId: string | null;
  backgroundTerminalCleanupPending: boolean;
  client: CodexJsonRpcClient;
  collaborationModes: CollaborationModeMask[];
  collaborationModesForComposerMode: (mode: ComposerMode) => Promise<CollaborationModeMask[]>;
  composerAttachments: ComposerAttachment[];
  composerGoalMode: boolean;
  composerMode: ComposerMode;
  composerSubmitState: ReturnType<typeof projectComposerSubmitState>;
  createWorkbenchThread: () => Promise<void>;
  dispatch: ThreadWorkflowDispatch;
  effectiveThreadContextDefaults: CodexUiState["threadContextDefaults"];
  ensureConnected: () => Promise<boolean>;
  includeImageDynamicTool: boolean;
  input: string;
  onboardingSnapshot: ReturnType<typeof loadOnboardingSnapshot>;
  openExistingWorkspaceFolder: () => Promise<void>;
  restartRuntimeForProviderSwitch: () => Promise<boolean>;
  setActiveComposerMode: (mode: ComposerMode) => void;
  setBackgroundTerminalCleanupPending: Dispatch<SetStateAction<boolean>>;
  setComposerAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
  setComposerGoalMode: Dispatch<SetStateAction<boolean>>;
  setInput: Dispatch<SetStateAction<string>>;
  setOnboardingSnapshot: Dispatch<SetStateAction<ReturnType<typeof loadOnboardingSnapshot>>>;
  state: CodexUiState;
  threadIds: string[];
  workspace: string;
}

export function useForgeAppSubmission(args: ForgeAppSubmissionArgs) {
  const {
    activeModelSupportsImageInput,
    activePendingRequests,
    activeThread,
    activeThreadRunning,
    activeThreadRuntime,
    activeTurnId,
    backgroundTerminalCleanupPending,
    client,
    collaborationModes,
    collaborationModesForComposerMode,
    composerAttachments,
    composerGoalMode,
    composerMode,
    composerSubmitState,
    createWorkbenchThread,
    dispatch,
    effectiveThreadContextDefaults,
    ensureConnected,
    includeImageDynamicTool,
    input,
    onboardingSnapshot,
    openExistingWorkspaceFolder,
    restartRuntimeForProviderSwitch,
    setActiveComposerMode,
    setBackgroundTerminalCleanupPending,
    setComposerAttachments,
    setComposerGoalMode,
    setInput,
    setOnboardingSnapshot,
    state,
    threadIds,
    workspace,
  } = args;
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
  }, [backgroundTerminalCleanupPending, client, dispatch, ensureConnected, setBackgroundTerminalCleanupPending, state.activeThreadId]);

  const rememberLatestCollaborationMode = useCallback((
    threadId: string,
    options: TurnStartOptions | null | undefined,
  ) => {
    dispatch({
      type: "setLatestCollaborationMode",
      threadId,
      collaborationMode: options?.collaborationMode ?? null,
    });
  }, [dispatch]);

  const resetComposerSelectionAfterCreatedThread = useCallback((threadId: string) => {
    dispatch({ type: "resetThreadComposerMode", threadId });
  }, [dispatch]);

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
  }, [setOnboardingSnapshot, state.threads.length]);

  const dismissOnboardingPromo = useCallback((options?: { ambientSuggestionsEnabled?: boolean }) => {
    setOnboardingSnapshot(dismissFirstNewThreadPromos(browserStorage(), options));
  }, [setOnboardingSnapshot]);

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
        onUseExistingFolder={openExistingWorkspaceFolder}
      />
    ) : (
      <PreConversationLoadingShell
        connected={state.connected}
        connecting={state.connecting}
        startingConversation={startingConversation}
      />
    )
  ) : null;
  return {
    activeQueuedFollowUps,
    cleanBackgroundTerminals,
    conversationEmptyState,
    deleteQueuedFollowUp,
    editQueuedFollowUp,
    onboardingEmptyStateVisible,
    pendingGoalReplace,
    reorderQueuedFollowUp,
    resumeGoalPrompt,
    sendQueuedFollowUpNow,
    sendTurn,
    setPendingGoalReplace,
    setResumeGoalPrompt,
  };
}
