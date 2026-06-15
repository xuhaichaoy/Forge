// Re-export hub of the thread-workflow module family. The logic lives in the
// thread-workflow-{shared,params,lifecycle,fork,turns,workspace,list,title}
// domain modules (mechanical extraction — logic moved verbatim); this module
// keeps re-exporting the complete original public API so the existing
// importers of "./thread-workflow" stay untouched.
export {
  isThreadStatusNotLoaded,
  threadStatusLabel,
} from "./thread-status";

export type {
  ThreadCreationOptions,
  ThreadRuntimeContextResponse,
  ThreadWorkflowDispatch,
  TurnStartOptions,
} from "./thread-workflow-shared";
export {
  isThreadNeedsResume,
  isThreadNotFound,
  isThreadNotMaterialized,
} from "./thread-workflow-shared";

export {
  buildThreadContextParams,
  buildTurnStartParams,
  DEFAULT_THREAD_MEMORY_PREFERENCES,
  effectiveThreadMemoryPreferences,
  projectThreadContextDefaults,
  refreshThreadContextDefaults,
} from "./thread-workflow-params";

export type {
  EnsureThreadReadyForTurnInput,
  ReadyThreadForTurn,
  ReadyThreadForTurnSource,
} from "./thread-workflow-lifecycle";
export {
  assertThreadProviderSwitchApplied,
  createAndSelectThreadForTurn,
  dispatchThreadContextDefaultsFromRuntimeResponse,
  dispatchThreadResolvedModelFromRuntimeResponse,
  ensureThreadReadyForTurn,
  hydrateThreadResolvedModelFromRollout,
  IMAGE_TOOL_RESUME_FALLBACK_MESSAGE,
  isThreadProviderSwitchMismatchError,
  isThreadToolHistoryHydrated,
  readThread,
  readThreadForDisplay,
  refreshThreadMetadata,
  resumeThread,
  resumeThreadWithMetadataRead,
  shouldCreateImageCapableThreadInsteadOfResume,
  startThread,
  threadContextDefaultsFromRuntimeResponse,
  ThreadProviderSwitchMismatchError,
  threadResolvedModelFromRolloutText,
  unsubscribeThread,
} from "./thread-workflow-lifecycle";

export {
  forkThread,
  forkThreadFromTurn,
  forkThreadIntoWorktree,
  SIDE_CONVERSATION_BOUNDARY_MESSAGE,
  SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS,
  sideConversationDeveloperInstructions,
  startSideConversation,
} from "./thread-workflow-fork";

export type { OptimisticUserMessageHandle } from "./thread-workflow-turns";
export {
  dispatchOptimisticUserMessage,
  dropOptimisticUserMessage,
  editLastUserTurn,
  interruptThreadTurn,
  readInProgressTurnId,
  resumeSelectedThreadAndStartTurn,
  sendPanelThreadMessage,
  startTurn,
  steerTurn,
} from "./thread-workflow-turns";

export type { ReadWorkspaceDeveloperInstructionsOptions } from "./thread-workflow-workspace";
export {
  isProjectlessThreadCwd,
  isProjectlessWorkspace,
  projectlessThreadInstructions,
  readWorkspaceDeveloperInstructions,
  withWorkspaceDeveloperInstructions,
} from "./thread-workflow-workspace";

export {
  archiveThread,
  buildThreadListParams,
  cleanBackgroundTerminalsForThread,
  mergeThreadListPage,
  refreshThreads,
  renameThread,
  THREAD_LIST_MAX_PAGES,
  THREAD_LIST_PAGE_SIZE,
  unarchiveThread,
} from "./thread-workflow-list";

export { threadTitle } from "./thread-workflow-title";
