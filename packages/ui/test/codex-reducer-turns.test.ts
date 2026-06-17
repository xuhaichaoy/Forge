import type { JsonRpcNotification, Thread, ThreadItem, UserInput } from "@forge/codex-protocol";
import {
  codexUiReducer,
  initialCodexUiState,
  selectThreadComposerMode,
  selectThreadRuntime,
  type CodexUiState,
  type ThreadRuntimeSlice,
} from "../src/state/codex-reducer";
import type { AccumulatedThreadItem } from "../src/state/render-groups";
import { formatDuration } from "../src/state/thread-item-fields";

export default function runCodexReducerTurnsTests(): void {
  formatsDurationWithDaysTierAndHoursModulo();
  refreshThreadListPreservesDraftNewThreadState();
  refreshThreadListDoesNotKeepMissingActiveThread();
  marksKnownThreadsNotLoadedAfterReconnect();
  dedupesServerRequestsByRequestId();
  tracksLatestCollaborationModeByThread();
  tracksComposerModeDraftsInReducer();
  threadSettingsUpdatedRefreshesActiveThreadContextAndComposerMode();
  startsThreadWithCollectedTurnItemsAndActiveTurn();
  startsThreadWithRunningOrActiveTurnStatuses();
  threadStartedStaleSnapshotDoesNotOverwriteCompletedLiveItems();
  threadStartedWithoutVisibleItemsPreservesOptimisticFirstPrompt();
  projectsTurnTimingAsWorkedForItems();
  suppressesWorkedForForPureTextTurns();
  delaysWorkedForProjectionUntilTurnItemsExist();
  repositionsExplicitWorkedForItemsFromThreadSnapshots();
  startsTurnByMergingInitialItemsWithoutOverwritingExistingUserMessage();
  upsertsExistingThreadWithoutMovingItToTheTop();
  renameThreadPatchesNameWithoutTouchingOtherState();
  streamingDeltaFastPathMatchesFullProjection();
  upsertingRunningThreadSnapshotPreservesStreamingItems();
  appendsStreamingDeltasToAgentReasoningAndCommandItems();
  commandExecutionTerminalInteractionParsesStdinIntoCommandActions();
  turnScopesDeltaCreatedAssistantAndReasoningItems();
  preservesItemLifecycleTimestampsFromProtocolNotifications();
  synthesizesAutoApprovalReviewItemFromLiveNotifications();
  completingTurnProjectsTurnTimingAsWorkedForItem();
  worksForCapsAtAnswerStartWhenSegmentCarriesItemTimestamps();
  completingTurnPreservesLongerAccumulatedAgentText();
  normalizesThreadStatusChangedNotifications();
  threadCompactedNotificationAddsCompletedContextCompactionEvent();
  threadGoalNotificationsProjectOntoUserMessages();
  fsChangedNotificationsAreLogged();
  notificationsBumpInvalidationCounters();
  accountNotificationsUpdateReducerAccount();
  hookNotificationsAreLoggedWithoutSyntheticTranscriptItems();
  surfacesTerminalErrorNotificationsInTheTranscript();
  projectsReconnectErrorsAsStreamErrorRows();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes();
  synthesizesPlanImplementationItemWhenPlanTurnCompletes();
  doesNotSynthesizePlanImplementationWithoutAPlanItemOrOnFailure();
  synthesizesTurnDiffItemWhenCodeEditTurnCompletes();
  synthesizesTurnDiffForHistoricalTurnOnThreadSnapshot();
  doesNotSynthesizeTurnDiffWithoutChangesOrOnPatchFailure();
  synthesizesTurnDiffForFailedTurnWithAppliedChanges();
  turnDiffCarriesPatchBatchesAndTracksCommandCwd();
  prefersLiveTurnDiffNotificationOverPatchRebuild();
  synthesizesWorkedForWhenTurnCompletedArrivesWithEmptyItems();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails();
  turnsFailedTurnErrorsIntoStreamErrorItems();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsCancelled();
  keepsLateUserMessageInsideItsOriginatingTurnSegment();
  optimisticUserMessageStaysAboveErrorAndIsReconciledByItemCompleted();
  itemCompletedReconcilesSameTurnOptimisticUserMessageWhenContentShapeDiffers();
  itemStartedReconcilesTextOnlyUserMessageAndKeepsLocalFileMention();
  bindOptimisticTurnRewritesItemsAndDropsPendingPlaceholder();
  optimisticUserMessageWithThreeFailingTurnsKeepsExpectedOrder();
  completingTurnDropsSameTurnOptimisticUserMessageWhenContentShapeDiffers();
  upsertingMetadataOnlyThreadPreservesOptimisticPrompt();
  upsertingThreadSnapshotDropsDuplicateOptimisticUserMessage();
  upsertingLiveSnapshotDropsUnboundOptimisticFileMention();
  upsertingLiveSnapshotAfterSwitchDropsBoundOptimisticUserMessage();
  upsertingLiveSnapshotPreservesBoundOptimisticFileMention();
  upsertingLiveSnapshotWithRolloutReplayUserMessageDoesNotDuplicateConfirmed();
  upsertingLiveSnapshotWithRolloutReplayAgentMessageDoesNotDuplicateConfirmed();
  upsertingLiveSnapshotWithRolloutReplayReasoningDoesNotDuplicateConfirmed();
  upsertingLiveSnapshotWithCompletedCollabToolCallReplacesStartedTwin();
  setThreadsHydratesCollabReceiverThreadMetadata();
  finishingTurnWithRolloutReplayUserMessageDoesNotDuplicateConfirmed();
  finishingTurnDoesNotDedupeSamePromptAcrossTurns();
  lateInProgressThreadSnapshotDoesNotReactivateCompletedTurn();
  lateInProgressThreadSnapshotDoesNotReactivateCancelledTurn();
  redispatchingTheSameOptimisticUserMessageIsIdempotent();
  setActiveThreadPushesThreadHistoryStack();
  navigateBackAndForwardInHistoryMovesCursorWithoutPushing();
  navigateBackAtHeadIsNoOpAndForwardBranchIsTruncatedOnNewSwitch();
}

function refreshThreadListPreservesDraftNewThreadState(): void {
  const state = {
    ...initialCodexUiState,
    activeThreadId: null,
  };

  const next = codexUiReducer(state, {
    type: "setThreads",
    threads: [threadWithTurns("thread-existing", [])],
  });

  assertEqual(
    next.activeThreadId,
    null,
    "setThreads should not select a history row while the new-thread draft is open",
  );
}

function refreshThreadListDoesNotKeepMissingActiveThread(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-old", [])],
    activeThreadId: "thread-old",
  };

  const next = codexUiReducer(state, {
    type: "setThreads",
    threads: [threadWithTurns("thread-next", [])],
  });

  assertEqual(
    next.activeThreadId,
    "thread-next",
    "setThreads should select the first refreshed thread when the active thread is missing",
  );

  const empty = codexUiReducer(next, { type: "setThreads", threads: [] });
  assertEqual(empty.activeThreadId, null, "setThreads should clear active thread when the refreshed list is empty");
}

function marksKnownThreadsNotLoadedAfterReconnect(): void {
  const state = {
    ...initialCodexUiState,
    threads: [
      threadWithTurns("thread-active", [{ id: "turn-1", status: "in_progress", items: [] }]),
      threadWithTurns("thread-idle", []),
    ],
    activeThreadId: "thread-active",
    threadsRuntime: {
      "thread-active": {
        activeTurnId: "turn-1",
        items: [],
        turnOrder: ["optimistic-turn:1"],
        pendingOptimisticTurns: ["optimistic-turn:1"],
        latestCollaborationMode: null,
        turnPlan: null,
        turnDiff: "",
        turnDiffTurnId: null,
        composerMode: null,
        threadGoal: null,
        threadGoalTurnId: null,
        terminalTurnIds: [],
      },
    },
  };

  const next = codexUiReducer(state, { type: "markThreadsNeedResumeAfterReconnect" });

  assertDeepEqual(
    next.threads.map((thread) => thread.status),
    [{ type: "notLoaded" }, { type: "notLoaded" }],
    "reconnect recovery should mark all known threads as needing resume",
  );
  assertEqual(
    next.activeThreadId,
    "thread-active",
    "reconnect recovery should not change the selected thread",
  );
  assertEqual(
    runtime(next, "thread-active").activeTurnId,
    null,
    "reconnect recovery should clear stale active turn ids until metadata resume completes",
  );
  assertDeepEqual(
    runtime(next, "thread-active").pendingOptimisticTurns,
    [],
    "reconnect recovery should clear optimistic turn bindings that can no longer be matched",
  );
}

function dedupesServerRequestsByRequestId(): void {
  const state = codexUiReducer(initialCodexUiState, {
    type: "serverRequest",
    request: {
      id: "request-1",
      method: "item/tool/requestUserInput",
      params: { threadId: "thread-1", question: "Old" },
    },
  });

  const next = codexUiReducer(state, {
    type: "serverRequest",
    request: {
      id: "request-1",
      method: "item/tool/requestUserInput",
      params: { threadId: "thread-1", question: "New" },
    },
  });

  assertEqual(next.pendingRequests.length, 1, "server requests with the same id should replace the pending card");
  assertDeepEqual(
    next.pendingRequests[0]?.params,
    { threadId: "thread-1", question: "New" },
    "server request replacement should keep the newest params",
  );
}

function tracksLatestCollaborationModeByThread(): void {
  const planMode = {
    mode: "plan",
    settings: {
      model: "gpt-5.4",
      reasoning_effort: "medium",
      developer_instructions: null,
    },
  } as const;
  const state = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
    },
    {
      type: "setLatestCollaborationMode",
      threadId: "thread-1",
      collaborationMode: planMode,
    },
  );

  assertDeepEqual(
    runtime(state, "thread-1").latestCollaborationMode,
    planMode,
    "latest collaboration mode should be stored per thread",
  );

  const removedThread = codexUiReducer(state, { type: "removeThread", threadId: "thread-1" });
  assertDeepEqual(
    removedThread.threadsRuntime["thread-1"],
    undefined,
    "removing a thread should clear its latest collaboration mode",
  );

  const cleared = codexUiReducer(state, {
    type: "setLatestCollaborationMode",
    threadId: "thread-1",
    collaborationMode: null,
  });
  assertDeepEqual(
    runtime(cleared, "thread-1").latestCollaborationMode,
    null,
    "default collaboration mode should clear the per-thread latest override",
  );
}

function tracksComposerModeDraftsInReducer(): void {
  const planMode = {
    mode: "plan",
    settings: {
      model: "gpt-5.4",
      reasoning_effort: "medium",
      developer_instructions: null,
    },
  } as const;
  let state = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-a", []), threadWithTurns("thread-b", [])],
      activeThreadId: "thread-a",
    },
    { type: "setActiveComposerMode", mode: "plan" },
  );

  assertEqual(state.composerMode, "plan", "active composer mode should update in reducer state");
  assertEqual(runtime(state, "thread-a").composerMode, "plan", "active thread draft composer mode should be stored");

  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-b" });
  assertEqual(state.composerMode, "default", "switching to a thread without draft should use default mode");

  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-a" });
  assertEqual(state.composerMode, "plan", "switching back should restore thread draft composer mode");

  state = codexUiReducer(state, {
    type: "resetThreadComposerMode",
    threadId: "thread-a",
  });
  assertEqual(state.composerMode, "default", "reset should update active composer mode");
  assertEqual(runtime(state, "thread-a").composerMode, "default", "reset should store a default override");

  const latestOnly = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-latest", [])],
      activeThreadId: "thread-latest",
    },
    {
      type: "setLatestCollaborationMode",
      threadId: "thread-latest",
      collaborationMode: planMode,
    },
  );
  assertEqual(
    selectThreadComposerMode(latestOnly, "thread-latest"),
    "plan",
    "composer selector should fall back to latest collaboration mode when no draft exists",
  );
  assertEqual(
    latestOnly.composerMode,
    "plan",
    "active composer mode should follow latest collaboration mode when no draft exists",
  );
}

function threadSettingsUpdatedRefreshesActiveThreadContextAndComposerMode(): void {
  const state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
    threadContextDefaults: {
      model: "old-model",
      modelProvider: "old-provider",
      serviceTier: "old-tier",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: "read-only",
      permissions: ":old",
      reasoningEffort: "minimal",
      reasoningSummary: "none",
      personality: "friendly",
      baseInstructions: "base instructions",
      memories: { useMemories: true, generateMemories: false },
    },
    threadsRuntime: {
      "thread-1": runtimeSlice({
        latestCollaborationMode: null,
        composerMode: null,
      }),
    },
  };

  const next = reduceNotification(state, {
    method: "thread/settings/updated",
    params: {
      threadId: "thread-1",
      threadSettings: {
        cwd: "/workspace/updated",
        approvalPolicy: "never",
        approvalsReviewer: "auto_review",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: ["/workspace/updated"],
          networkAccess: true,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
        activePermissionProfile: { id: ":workspace", extends: null },
        model: "gpt-5.2-codex",
        modelProvider: "openai",
        serviceTier: "priority",
        effort: "high",
        summary: "detailed",
        collaborationMode: {
          mode: "plan",
          settings: {
            model: "gpt-5.2-codex",
            reasoning_effort: "high",
            developer_instructions: null,
          },
        },
        personality: "pragmatic",
      },
    },
  });

  assertEqual(next.threads[0]?.cwd, "/workspace/updated", "thread/settings/updated should refresh thread cwd metadata");
  assertEqual(next.threads[0]?.modelProvider, "openai", "thread/settings/updated should refresh thread model provider metadata");
  assertDeepEqual(
    next.threadContextDefaults,
    {
      baseInstructions: "base instructions",
      memories: { useMemories: true, generateMemories: false },
      model: "gpt-5.2-codex",
      modelProvider: "openai",
      serviceTier: "priority",
      approvalPolicy: "never",
      approvalsReviewer: "auto_review",
      sandbox: "workspace-write",
      // codex Jd/$d: this fixture's policy sets networkAccess:true, a non-default
      // workspace-write detail, so the projected context flags it (→ custom mode).
      sandboxIsNonDefault: true,
      permissions: ":workspace",
      reasoningEffort: "high",
      reasoningSummary: "detailed",
      personality: "pragmatic",
    },
    "thread/settings/updated should refresh active-thread defaults without leaking stale values",
  );
  assertEqual(
    selectThreadComposerMode(next, "thread-1"),
    "plan",
    "thread/settings/updated should update the thread collaboration-derived composer mode",
  );
  assertEqual(next.composerMode, "plan", "active thread settings should update the global composer mode");
}

function upsertsExistingThreadWithoutMovingItToTheTop(): void {
  const state = {
    ...initialCodexUiState,
    threads: [
      threadWithTurns("thread-first", []),
      threadWithTurns("thread-selected", []),
    ],
    activeThreadId: "thread-first",
  };

  const next = codexUiReducer(state, {
    type: "upsertThread",
    thread: { ...threadWithTurns("thread-selected", []), name: "Selected thread" },
    select: true,
  });

  assertDeepEqual(
    next.threads.map((thread) => thread.id),
    ["thread-first", "thread-selected"],
    "selecting an existing thread should not reorder the sidebar list",
  );
  assertEqual(next.activeThreadId, "thread-selected", "upsertThread should still select the requested thread");
}

function renameThreadPatchesNameWithoutTouchingOtherState(): void {
  const concurrentlyUpdated = { ...threadWithTurns("thread-renamed", []), status: { type: "active", activeFlags: [] } as Thread["status"] };
  const state = {
    ...initialCodexUiState,
    threads: [
      threadWithTurns("thread-first", []),
      concurrentlyUpdated,
    ],
    activeThreadId: "thread-first",
  };

  const next = codexUiReducer(state, {
    type: "renameThread",
    threadId: "thread-renamed",
    name: "Fresh name",
  });

  assertDeepEqual(
    next.threads.map((thread) => thread.id),
    ["thread-first", "thread-renamed"],
    "renameThread should not reorder the sidebar list",
  );
  assertEqual(next.threads[1]?.name, "Fresh name", "renameThread should patch the thread name");
  assertDeepEqual(
    next.threads[1]?.status,
    { type: "active", activeFlags: [] },
    "renameThread must not roll back fields that changed while the rename RPC was in flight",
  );
  assertEqual(next.activeThreadId, "thread-first", "renameThread should not change the selection");
  assertEqual(
    codexUiReducer(state, { type: "renameThread", threadId: "thread-missing", name: "x" }).threads[1]?.name,
    state.threads[1]?.name,
    "renameThread for an unknown thread id should be a no-op on existing threads",
  );
}

/*
 * Streaming text deltas skip the goal/hook projection pipeline (a per-token
 * full-transcript pass) once the item is created. This pins the safety
 * invariant: forcing the full pipeline afterwards must change nothing.
 */
function streamingDeltaFastPathMatchesFullProjection(): void {
  let state = codexUiReducer(initialCodexUiState, {
    type: "upsertThread",
    thread: threadWithTurns("thread-stream", [
      { id: "turn-1", status: "inProgress", items: [userMessage("user-1", "Pursue the goal")] },
    ]),
  });
  state = reduceNotification(state, {
    method: "thread/goal/updated",
    params: {
      threadId: "thread-stream",
      turnId: "turn-1",
      goal: goalFixture({ threadId: "thread-stream", objective: "Stream safely" }),
    },
  });
  // First delta creates the item → full projection path stamps it.
  state = reduceNotification(state, {
    method: "item/agentMessage/delta",
    params: { threadId: "thread-stream", turnId: "turn-1", itemId: "agent-1", delta: "Hello" },
  });
  // Subsequent deltas take the projection-reuse fast path.
  state = reduceNotification(state, {
    method: "item/agentMessage/delta",
    params: { threadId: "thread-stream", turnId: "turn-1", itemId: "agent-1", delta: ", world" },
  });

  const assistant = itemById(state, "thread-stream", "agent-1") as Record<string, unknown>;
  assertEqual(assistant.text, "Hello, world", "deltas should accumulate text on the fast path");
  const user = itemById(state, "thread-stream", "user-1") as Record<string, unknown>;
  assertEqual(
    (user._threadGoal as Record<string, unknown> | undefined)?.objective,
    "Stream safely",
    "goal projection stamps must survive the fast path",
  );

  const reprojected = reduceNotification(state, {
    method: "thread/goal/updated",
    params: {
      threadId: "thread-stream",
      turnId: "turn-1",
      goal: goalFixture({ threadId: "thread-stream", objective: "Stream safely" }),
    },
  });
  assertDeepEqual(
    items(reprojected, "thread-stream"),
    items(state, "thread-stream"),
    "forcing the full projection after streamed deltas must be a no-op (fast path skipped nothing)",
  );
}

function upsertingRunningThreadSnapshotPreservesStreamingItems(): void {
  const localUser = userMessage("user-1", "Local prompt");
  const streamedAgent = agentMessage("agent-1", "Live streamed answer");
  const state = {
    ...initialCodexUiState,
    threads: [
      threadWithTurns("thread-other", []),
      threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }]),
    ],
    activeThreadId: "thread-other",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        activeTurnId: "turn-1",
        items: [localUser, streamedAgent],
      }),
    },
  };

  const staleSnapshot = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "inProgress",
      startedAt: 1,
      items: [
        userMessage("user-1", "Server replay"),
        execActivity("exec-1", "ls"),
        agentMessage("agent-1", "Live"),
      ],
    },
  ]);

  const next = codexUiReducer(state, {
    type: "upsertThread",
    thread: staleSnapshot,
    select: true,
  });

  assertEqual(
    agentText(next, "thread-1", "agent-1"),
    "Live streamed answer",
    "reading a running thread snapshot should not discard accumulated streaming text",
  );
  assertDeepEqual(
    (itemById(next, "thread-1", "user-1") as Record<string, unknown>).content,
    (localUser as Record<string, unknown>).content,
    "reading a running thread snapshot should preserve local user message content",
  );
  // Codex Desktop `Yw` renders worked-for as the agent-body HEADER (above
  // activity rows + assistant message). Forge `insertWorkedForAfterLastUserMessage`
  // inserts it immediately after the last user message so the snapshot replay
  // preserves the same divider-on-top layout.
  assertDeepEqual(
    items(next, "thread-1").map((item) => item.id),
    ["user-1", "worked-for:turn-1", "exec-1", "agent-1"],
    "reading a running thread snapshot should keep worked-for above activities like Codex Desktop",
  );
}

function startsThreadWithCollectedTurnItemsAndActiveTurn(): void {
  const firstUser = userMessage("user-1", "Build turn tests");
  const firstAgent = agentMessage("agent-1", "Working on it.");
  const secondReasoning: ThreadItem = {
    type: "reasoning",
    id: "reasoning-1",
    summary: ["Checking reducer state"],
    content: ["Inspect active turn"],
  };
  const thread = threadWithTurns("thread-1", [
    { id: "turn-1", status: "completed", items: [firstUser, firstAgent] },
    { id: "turn-2", status: "inProgress", items: [secondReasoning] },
  ]);

  const state = reduceNotification(initialCodexUiState, {
    method: "thread/started",
    params: { thread },
  });

  assertEqual(state.activeThreadId, "thread-1", "thread/started should select the started thread");
  assertEqual(
    runtime(state, "thread-1").activeTurnId,
    "turn-2",
    "thread/started should track the in-progress turn id",
  );
  assertDeepEqual(
    items(state, "thread-1").map((item) => item.id),
    ["user-1", "agent-1", "reasoning-1"],
    "thread/started should collect items from all thread turns in order",
  );
}

function startsThreadWithRunningOrActiveTurnStatuses(): void {
  for (const status of ["running", "active", { type: "running" }, { status: "active" }]) {
    const state = reduceNotification(initialCodexUiState, {
      method: "thread/started",
      params: {
        thread: threadWithTurns("thread-1", [
          { id: "turn-1", status: "completed", items: [userMessage("user-1", "Done")] },
          { id: "turn-2", status, items: [agentMessage("agent-1", "Still working")] },
        ]),
      },
    });

    assertEqual(
      runtime(state, "thread-1").activeTurnId,
      "turn-2",
      `thread/started should treat ${JSON.stringify(status)} turn status as active`,
    );
  }
}

function threadStartedStaleSnapshotDoesNotOverwriteCompletedLiveItems(): void {
  const completedAgent = agentMessage("agent-late", "Final answer streamed completely.");
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        activeTurnId: null,
        terminalTurnIds: ["turn-late"],
        items: [
          { ...userMessage("user-late", "finish it"), _turnId: "turn-late", _turnStatus: "completed" },
          { ...completedAgent, _turnId: "turn-late", _turnStatus: "completed" },
        ] as AccumulatedThreadItem[],
      }),
    },
  };

  state = reduceNotification(state, {
    method: "thread/started",
    params: {
      thread: threadWithTurns("thread-1", [
        {
          id: "turn-late",
          status: "inProgress",
          items: [
            userMessage("user-late", "finish it"),
            agentMessage("agent-late", "Final"),
          ],
        },
      ]),
    },
  });

  assertEqual(runtime(state, "thread-1").activeTurnId, null, "stale thread/started must not reactivate a completed turn");
  assertEqual(
    agentText(state, "thread-1", "agent-late"),
    "Final answer streamed completely.",
    "stale thread/started must merge with live completed items instead of replacing them",
  );
}

function threadStartedWithoutVisibleItemsPreservesOptimisticFirstPrompt(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  state = codexUiReducer(state, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:first",
    localId: "optimistic-user:first",
    content: [textInput("First prompt")],
  });

  state = reduceNotification(state, {
    method: "thread/started",
    params: { thread: threadWithTurns("thread-1", []) },
  });

  assertDeepEqual(
    items(state, "thread-1").map((item) => item.id),
    ["optimistic-user:first"],
    "an empty thread/started snapshot for a new thread must not erase the first optimistic prompt",
  );

  const started = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "inProgress",
        items: [],
        startedAt: 1,
      },
    },
  });

  assertDeepEqual(
    items(started, "thread-1").map((item) => item.id),
    ["optimistic-user:first"],
    "the first optimistic prompt should remain visible after the real turn starts",
  );
  assertEqual(
    (items(started, "thread-1")[0] as Record<string, unknown>)?._turnId,
    "turn-1",
    "the preserved optimistic prompt should bind to the real first turn",
  );
}

function projectsTurnTimingAsWorkedForItems(): void {
  /*
   * Codex `xt = vt.length > 0` gate (`local-conversation-thread-BX7YNcUw.js`
   * byte ~539133): worked-for is synthesized only when the turn produced
   * agent-activity items. Include an exec to satisfy the gate so this test
   * keeps validating timing→worked-for projection. A separate test below
   * (`suppressesWorkedForForPureTextTurns`) asserts the suppression branch.
   */
  const thread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      startedAt: 1,
      completedAt: 66,
      durationMs: 65_000,
      items: [execActivity("exec-1", "cat README.md"), agentMessage("agent-1", "Done.")],
    },
  ]);

  const state = reduceNotification(initialCodexUiState, {
    method: "thread/started",
    params: { thread },
  });
  const workedFor = itemById(state, "thread-1", "worked-for:turn-1") as Record<string, unknown>;

  assertEqual(workedFor.type, "worked-for", "turn timing should project a worked-for item");
  assertEqual(workedFor.status, "completed", "completed turn timing should produce a completed worked-for item");
  assertEqual(workedFor.startedAtMs, 1_000, "turn startedAt seconds should be converted to milliseconds");
  assertEqual(workedFor.completedAtMs, 66_000, "turn completedAt seconds should be converted to milliseconds");
  assertEqual(workedFor.durationMs, 65_000, "turn duration should be preserved on the worked-for item");
}

function suppressesWorkedForForPureTextTurns(): void {
  /*
   * Codex Desktop `xt = vt.length > 0` gating (`local-conversation-thread-BX7YNcUw.js`
   * byte ~539133): pure-text turns (user → assistant, no exec/patch/web-search/…)
   * mount no `Yw` agent-body-collapsible and therefore no worked-for divider.
   * Recording 2026-05-21 at 07.57.04 t=12s showed Forge spuriously emitting
   * "Worked for 5s" for plain Q&A turns; this test pins the post-fix behavior.
   */
  const thread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      startedAt: 1,
      completedAt: 6,
      durationMs: 5_000,
      items: [userMessage("user-1", "Hello"), agentMessage("agent-1", "Hi there.")],
    },
  ]);

  const state = reduceNotification(initialCodexUiState, {
    method: "thread/started",
    params: { thread },
  });
  const workedFor = items(state, "thread-1").find((item) => item.id === "worked-for:turn-1");

  assertEqual(workedFor, undefined, "pure-text turns should not synthesize a worked-for divider (Codex alignment)");
}

function delaysWorkedForProjectionUntilTurnItemsExist(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  const started = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "inProgress",
        items: [],
        startedAt: 1,
      },
    },
  });

  assertDeepEqual(
    items(started, "thread-1").map((item) => item.id),
    [],
    "turn/started should not put an empty worked-for row before user and assistant items",
  );

  // Activity item (exec) satisfies the agent-activity gate so worked-for is
  // synthesized; this test still validates positional insertion between
  // user and assistant items.
  const withItems = [
    ["item/started", { threadId: "thread-1", turnId: "turn-1", item: userMessage("user-1", "Hello") }],
    ["item/started", { threadId: "thread-1", turnId: "turn-1", item: execActivity("exec-1", "cat foo.md") }],
    ["item/started", { threadId: "thread-1", turnId: "turn-1", item: agentMessage("agent-1", "Hi") }],
  ].reduce(
    (current, [method, params]) =>
      reduceNotification(current, { method: method as string, params }),
    started,
  );
  const completed = reduceNotification(withItems, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Server replay"),
          execActivity("exec-1", "cat foo.md"),
          agentMessage("agent-1", "Hi"),
        ],
        startedAt: 1,
        completedAt: 6,
        durationMs: 5_000,
      },
    },
  });

  // `insertWorkedForBeforeAssistant` (codex-reducer.ts) targets the last
  // assistant message; the activity item flows into the agent body below
  // the worked-for header, which is how Codex's `Yw` agent-body-collapsible
  // wraps `vt` entries (collapsibleEntries) underneath the divider line.
  assertDeepEqual(
    items(completed, "thread-1").map((item) => item.id),
    ["user-1", "worked-for:turn-1", "exec-1", "agent-1"],
    "terminal turn snapshot should place worked-for before activity and assistant items",
  );
}

function repositionsExplicitWorkedForItemsFromThreadSnapshots(): void {
  const thread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      items: [
        {
          id: "worked-for-1",
          type: "worked-for",
          status: "completed",
          startedAtMs: 1_000,
          completedAtMs: 6_000,
        } as unknown as ThreadItem,
        userMessage("user-1", "Hello"),
        agentMessage("agent-1", "Hi"),
      ],
    },
  ]);

  const state = reduceNotification(initialCodexUiState, {
    method: "thread/started",
    params: { thread },
  });

  assertDeepEqual(
    items(state, "thread-1").map((item) => item.id),
    ["user-1", "worked-for-1", "agent-1"],
    "thread snapshots should move explicit worked-for between the user and assistant message",
  );
}

function startsTurnByMergingInitialItemsWithoutOverwritingExistingUserMessage(): void {
  const existingUser = userMessage("user-1", "Original prompt");
  const incomingUser = userMessage("user-1", "Server replay should not replace this");
  const incomingAgent = agentMessage("agent-1", "Initial assistant text");
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ items: [existingUser] }),
    },
  };

  const next = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        items: [incomingUser, incomingAgent],
      },
    },
  });

  assertEqual(
    itemById(next, "thread-1", "user-1"),
    existingUser,
    "turn/started should preserve the existing user message object for replayed item ids",
  );
  assertEqual(
    agentText(next, "thread-1", "agent-1"),
    "Initial assistant text",
    "turn/started should merge new initial assistant items",
  );
  assertEqual(
    runtime(next, "thread-1").activeTurnId,
    "turn-1",
    "turn/started should set the active turn id",
  );
}

function turnScopesDeltaCreatedAssistantAndReasoningItems(): void {
  const baseState = {
    ...initialCodexUiState,
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        turnOrder: ["turn-1", "turn-2"],
        items: [
          { ...userMessage("user-1", "First turn"), _turnId: "turn-1" },
          { ...userMessage("user-2", "Second turn"), _turnId: "turn-2" },
        ] as AccumulatedThreadItem[],
      }),
    },
  } as CodexUiState;

  const state = [
    ["item/agentMessage/delta", { threadId: "thread-1", turnId: "turn-1", itemId: "agent-delta", delta: "Hello" }],
    ["item/reasoning/textDelta", { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-delta", delta: "Thinking" }],
  ].reduce(
    (current, [method, params]) =>
      reduceNotification(current, { method: method as string, params }),
    baseState,
  );

  assertDeepEqual(
    items(state, "thread-1").map((item) => item.id),
    ["user-1", "agent-delta", "reasoning-delta", "user-2"],
    "delta-created assistant and reasoning items should stay inside the Desktop turn segment",
  );
  assertEqual(
    (itemById(state, "thread-1", "agent-delta") as Record<string, unknown>)._turnId,
    "turn-1",
    "agent message delta-created items should keep the protocol turn id",
  );
  assertEqual(
    (itemById(state, "thread-1", "reasoning-delta") as Record<string, unknown>)._turnId,
    "turn-1",
    "reasoning delta-created items should keep the protocol turn id",
  );
}

function appendsStreamingDeltasToAgentReasoningAndCommandItems(): void {
  const baseState = {
    ...initialCodexUiState,
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        items: [
        agentMessage("agent-1", "Hello"),
        { type: "reasoning", id: "reasoning-1", summary: [], content: ["Think"] },
        {
          type: "commandExecution",
          id: "command-1",
          command: "npm test",
          aggregatedOutput: "first",
        },
      ] satisfies AccumulatedThreadItem[],
      }),
    },
  };

  const state = [
    ["item/agentMessage/delta", { threadId: "thread-1", turnId: "turn-1", itemId: "agent-1", delta: " world" }],
    ["item/reasoning/textDelta", { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1", delta: " again" }],
    [
      "item/commandExecution/outputDelta",
      { threadId: "thread-1", turnId: "turn-1", itemId: "command-1", delta: "\nsecond" },
    ],
  ].reduce(
    (current, [method, params]) =>
      reduceNotification(current, { method: method as string, params }),
    baseState as CodexUiState,
  );

  assertEqual(agentText(state, "thread-1", "agent-1"), "Hello world", "agent message delta should append text");
  assertEqual(
    (itemById(state, "thread-1", "agent-1") as Record<string, unknown>).completed,
    false,
    "agent message delta should mark the assistant item as still streaming",
  );
  assertDeepEqual(
    reasoningContent(state, "thread-1", "reasoning-1"),
    ["Think again"],
    "reasoning text delta should append to the latest content part",
  );
  assertEqual(
    commandOutput(state, "thread-1", "command-1"),
    "first\nsecond",
    "command output delta should append aggregated output",
  );
}

function commandExecutionTerminalInteractionParsesStdinIntoCommandActions(): void {
  const baseState = {
    ...initialCodexUiState,
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        items: [
          {
            type: "commandExecution",
            id: "command-1",
            command: "bash",
            status: "inProgress",
          } as unknown as AccumulatedThreadItem,
        ],
      }),
    },
  } as CodexUiState;

  let state = reduceNotification(baseState, {
    method: "item/commandExecution/terminalInteraction",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      processId: "process-1",
      stdin: "echo he",
    },
  });
  assertDeepEqual(
    commandActions(state, "thread-1", "command-1"),
    [],
    "partial terminal stdin should buffer until a newline arrives",
  );
  assertDeepEqual(
    state.terminalInputBuffers,
    { "thread-1:command-1": "echo he" },
    "partial terminal stdin should be buffered by thread and item",
  );

  state = reduceNotification(state, {
    method: "item/commandExecution/terminalInteraction",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      processId: "process-1",
      stdin: "llo\b!\n",
    },
  });
  assertDeepEqual(
    commandActions(state, "thread-1", "command-1"),
    [{ type: "unknown", command: "echo hell!" }],
    "terminal stdin newline should append Desktop-style unknown commandActions",
  );
  assertDeepEqual(state.terminalInputBuffers, {}, "newline should clear the terminal input buffer");

  state = reduceNotification(state, {
    method: "item/commandExecution/terminalInteraction",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      processId: "process-1",
      stdin: "partial\u0003\n",
    },
  });
  assertDeepEqual(
    commandActions(state, "thread-1", "command-1"),
    [{ type: "unknown", command: "echo hell!" }],
    "Ctrl-C should clear the buffered terminal input without appending an empty command",
  );

  state = reduceNotification(state, {
    method: "item/commandExecution/terminalInteraction",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      processId: "process-1",
      stdin: "  pwd  \r",
    },
  });
  assertDeepEqual(
    commandActions(state, "thread-1", "command-1"),
    [
      { type: "unknown", command: "echo hell!" },
      { type: "unknown", command: "pwd" },
    ],
    "carriage return should finish a trimmed terminal command like Codex Desktop",
  );
}

function preservesItemLifecycleTimestampsFromProtocolNotifications(): void {
  const command = {
    type: "commandExecution",
    id: "command-1",
    command: "npm test",
    status: "inProgress",
  } as ThreadItem;
  const started = reduceNotification(initialCodexUiState, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: command,
      startedAtMs: 1_000,
    },
  });
  const completed = reduceNotification(started, {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { ...command, status: "completed", exitCode: 0 },
      completedAtMs: 66_000,
    },
  });
  const item = itemById(completed, "thread-1", "command-1") as Record<string, unknown>;

  assertEqual(item.startedAtMs, 1_000, "item/started should preserve protocol startedAtMs on the item");
  assertEqual(item.completedAtMs, 66_000, "item/completed should preserve protocol completedAtMs on the item");
  assertEqual(item.status, "completed", "item/completed should still merge the terminal item fields");
}

function formatsDurationWithDaysTierAndHoursModulo(): void {
  // codex composer md formatter: days tier + hours modulo 24, zero units trimmed.
  // Sub-24h output is unchanged from the prior hours-tier formatter.
  assertEqual(formatDuration(90_000_000), "1d 1h", "25h should roll into a days tier with hours modulo 24");
  assertEqual(formatDuration(86_400_000), "1d", "exactly 24h should read 1d with zero units trimmed");
  assertEqual(formatDuration(180_000_000), "2d 2h", "50h should read 2d 2h");
  assertEqual(formatDuration(3_661_000), "1h 1m 1s", "sub-24h durations keep the existing hours tier");
  assertEqual(formatDuration(90_000), "1m 30s", "sub-hour durations are unchanged");
}

function synthesizesAutoApprovalReviewItemFromLiveNotifications(): void {
  // Codex Desktop synthesizes a client-side automatic-approval-review timeline
  // item from item/autoApprovalReview/started|completed (the payload IS the
  // review — there is no params.item). Forge used to route these through the
  // generic item-lifecycle handler, whose params.item?.id guard dropped every
  // one, so the Auto-review entry never appeared mid-turn.
  const started = reduceNotification(initialCodexUiState, {
    method: "item/autoApprovalReview/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      reviewId: "review-9",
      targetItemId: "command-1",
      startedAtMs: 5_000,
      action: { type: "command", command: "rm -rf build", cwd: "/repo" },
      review: { status: "inProgress", riskLevel: null, userAuthorization: null, rationale: null },
    },
  });
  const pending = itemById(started, "thread-1", "automatic-approval-review:review-9") as Record<string, unknown>;
  assertEqual(pending.type, "automatic-approval-review", "started auto-review should synthesize a client-side item (not be dropped)");
  assertEqual(pending.status, "inProgress", "started auto-review should carry the review status");
  assertEqual(pending.startedAtMs, 5_000, "started auto-review should keep the protocol startedAtMs");
  assertEqual(pending.completedAtMs, null, "in-progress auto-review should have no completedAtMs");

  const completed = reduceNotification(started, {
    method: "item/autoApprovalReview/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      reviewId: "review-9",
      targetItemId: "command-1",
      startedAtMs: 5_000,
      completedAtMs: 9_000,
      action: { type: "command", command: "rm -rf build", cwd: "/repo" },
      review: { status: "denied", riskLevel: "high", userAuthorization: null, rationale: "Destructive command" },
    },
  });
  const resolved = itemById(completed, "thread-1", "automatic-approval-review:review-9") as Record<string, unknown>;
  assertEqual(resolved.status, "denied", "completed auto-review should update the status in place");
  assertEqual(resolved.riskLevel, "high", "completed auto-review should carry the review riskLevel");
  assertEqual(resolved.rationale, "Destructive command", "completed auto-review should carry the review rationale");
  assertEqual(resolved.startedAtMs, 5_000, "completed auto-review should preserve the original startedAtMs");
  assertEqual(resolved.completedAtMs, 9_000, "completed auto-review should record completedAtMs");
}

function completingTurnProjectsTurnTimingAsWorkedForItem(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1" }),
    },
  };

  const next = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        // Include an activity item — pure-text turns do not synthesize
        // worked-for per Codex gate (codex-reducer.ts hasAgentActivityItem).
        items: [execActivity("exec-1", "ls"), agentMessage("agent-1", "Done.")],
        startedAt: 1,
        completedAt: 66,
        durationMs: 65_000,
      },
    },
  });
  const workedFor = itemById(next, "thread-1", "worked-for:turn-1") as Record<string, unknown>;

  assertEqual(workedFor.type, "worked-for", "turn/completed should add worked-for item from turn timing");
  assertEqual(workedFor.status, "completed", "turn/completed worked-for item should be completed");
  assertEqual(workedFor.durationMs, 65_000, "turn/completed worked-for item should keep duration");
}

function worksForCapsAtAnswerStartWhenSegmentCarriesItemTimestamps(): void {
  // Codex caps "Worked for {time}" at the answer's start (the exploration/tool
  // phase), not the whole turn (app-server-manager-signals qx/LS). When the
  // segment carries item timestamps, Forge reconstructs that span: first work
  // item start → answer start, dropping the answer-streaming time the old
  // whole-turn span wrongly counted.
  const withAnswerStamp = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      startedAt: 1, // 1_000 ms
      completedAt: 40, // 40_000 ms — whole-turn end (answer streamed to here)
      durationMs: 39_000,
      items: [
        {
          type: "exec",
          id: "exec-1",
          command: "ls",
          completed: true,
          output: { exitCode: 0 },
          parsedCmd: { type: "read", path: "ls" },
          startedAtMs: 2_000,
          completedAtMs: 5_000,
        } as unknown as ThreadItem,
        { type: "agentMessage", id: "agent-1", text: "Done.", phase: null, memoryCitation: null, startedAtMs: 6_000 } as unknown as ThreadItem,
      ],
    },
  ]);
  const state = reduceNotification(initialCodexUiState, { method: "thread/started", params: { thread: withAnswerStamp } });
  const workedFor = itemById(state, "thread-1", "worked-for:turn-1") as Record<string, unknown>;
  assertEqual(workedFor.startedAtMs, 2_000, "worked-for should start at the first work item, not the server turn start");
  assertEqual(workedFor.completedAtMs, 6_000, "worked-for should cap at the assistant answer start, not the whole-turn end");
  assertEqual(workedFor.durationMs, 4_000, "worked-for duration should be the pre-answer work span (6000-2000), not the whole turn (39000)");

  // Fallback: when the answer item carries no start stamp, cap at the last work
  // item's completion (the work phase ends when the last tool finishes).
  const withoutAnswerStamp = threadWithTurns("thread-2", [
    {
      id: "turn-2",
      status: "completed",
      startedAt: 1,
      completedAt: 40,
      durationMs: 39_000,
      items: [
        {
          type: "exec",
          id: "exec-2",
          command: "ls",
          completed: true,
          output: { exitCode: 0 },
          parsedCmd: { type: "read", path: "ls" },
          startedAtMs: 2_000,
          completedAtMs: 5_000,
        } as unknown as ThreadItem,
        agentMessage("agent-2", "Done."),
      ],
    },
  ]);
  const state2 = reduceNotification(initialCodexUiState, { method: "thread/started", params: { thread: withoutAnswerStamp } });
  const workedFor2 = itemById(state2, "thread-2", "worked-for:turn-2") as Record<string, unknown>;
  assertEqual(workedFor2.completedAtMs, 5_000, "without an answer stamp, worked-for caps at the last work item completion");
  assertEqual(workedFor2.durationMs, 3_000, "fallback duration should be first-work-start (2000) to last-work-completion (5000)");
}

function completingTurnPreservesLongerAccumulatedAgentText(): void {
  const accumulatedText = "让我更广泛地搜索 latest-turn-preview，不在 src-tauri 限制内：";
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        activeTurnId: "turn-1",
        items: [agentMessage("agent-1", accumulatedText)],
      }),
    },
  };

  const next = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [agentMessage("agent-1", "让")],
      },
    },
  });

  assertEqual(
    agentText(next, "thread-1", "agent-1"),
    accumulatedText,
    "turn/completed should not replace accumulated streaming text with a shorter terminal snapshot",
  );
  assertEqual(runtime(next, "thread-1").activeTurnId, null, "turn/completed should still clear the active turn");
}

function normalizesThreadStatusChangedNotifications(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
  };

  const active = reduceNotification(state, {
    method: "thread/status/changed",
    params: {
      threadId: "thread-1",
      status: {
        type: "active",
        activeFlags: ["waitingOnApproval", "unknown"],
      },
    },
  });
  assertDeepEqual(
    rawThreadStatus(active, "thread-1"),
    { type: "active", activeFlags: ["waitingOnApproval"] },
    "thread/status/changed should normalize active flags to protocol values",
  );

  const invalid = reduceNotification(active, {
    method: "thread/status/changed",
    params: {
      threadId: "thread-1",
      status: { type: "not-a-status" },
    },
  });
  assertDeepEqual(
    rawThreadStatus(invalid, "thread-1"),
    { type: "active", activeFlags: ["waitingOnApproval"] },
    "thread/status/changed should preserve previous status for invalid payloads",
  );
}

function surfacesTerminalErrorNotificationsInTheTranscript(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1" }),
    },
  };

  const next = reduceNotification(state, {
    method: "error",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      willRetry: false,
      error: {
        message: "Prompt too long: 38658 tokens exceeds max context window of 32768 tokens",
        codexErrorInfo: null,
        additionalDetails: "Start a shorter thread.",
      },
    },
  });

  assertEqual(
    threadStatus(next, "thread-1"),
    "systemError",
    "terminal error notifications should put the thread into systemError",
  );
  assertEqual(
    eventContent(next, "thread-1", "stream-error:turn-1"),
    "Prompt too long: 38658 tokens exceeds max context window of 32768 tokens",
    "terminal error notifications should add a stream-error item to the transcript",
  );
  assertEqual(
    eventAdditionalDetails(next, "thread-1", "stream-error:turn-1"),
    "Start a shorter thread.",
    "stream-error items should preserve additional details",
  );
}

function projectsReconnectErrorsAsStreamErrorRows(): void {
  // codex projects a retrying (willRetry:true) error to a low-key `stream-error`
  // row with a "Reconnecting N/M" progress, and does NOT terminalize the turn.
  // Forge previously dropped these entirely (log-only), so reconnect attempts
  // were invisible in the transcript.
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1" }),
    },
  };

  const next = reduceNotification(state, {
    method: "error",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      willRetry: true,
      error: { message: "Reconnecting 2/5", codexErrorInfo: null, additionalDetails: null },
    },
  });

  const item = itemById(next, "thread-1", "stream-error:turn-1") as Record<string, unknown>;
  assertEqual(item.type, "stream-error", "reconnect errors should add a stream-error row, not be dropped");
  assertEqual(item.content, "Reconnecting 2/5", "reconnect stream-error content should show the Reconnecting progress");
  assertEqual(item.reconnectAttempt, 2, "reconnect stream-error should parse the attempt number");
  assertEqual(item.reconnectMaxAttempts, 5, "reconnect stream-error should parse the max attempts");
  assertEqual(
    threadStatus(next, "thread-1"),
    "active",
    "a retrying error must not terminalize the turn into systemError",
  );
}

function threadCompactedNotificationAddsCompletedContextCompactionEvent(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1", turnOrder: ["turn-1"] }),
    },
  };

  const next = reduceNotification(state, {
    method: "thread/compacted",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
    },
  });
  const replayed = itemById(next, "thread-1", "context-compaction:turn-1") as Record<string, unknown>;

  assertEqual(replayed.type, "contextCompaction", "thread/compacted should create a contextCompaction transcript item");
  assertEqual(replayed.completed, true, "thread/compacted fallback should mark the context compaction completed");
  assertEqual(replayed._turnId, "turn-1", "thread/compacted fallback should stay inside the compact turn");

  const repeated = reduceNotification(next, {
    method: "thread/compacted",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
    },
  });
  assertEqual(
    items(repeated, "thread-1").filter((item) => item.id === "context-compaction:turn-1").length,
    1,
    "repeated thread/compacted notifications should replace the same fallback item",
  );
}

function threadGoalNotificationsProjectOntoUserMessages(): void {
  let state = codexUiReducer(initialCodexUiState, {
    type: "upsertThread",
    thread: threadWithTurns("thread-goal", [
      {
        id: "turn-1",
        status: "completed",
        items: [userMessage("user-1", "Ship parity"), agentMessage("agent-1", "Done.")],
      },
    ]),
  });

  state = reduceNotification(state, {
    method: "thread/goal/updated",
    params: {
      threadId: "thread-goal",
      turnId: "turn-1",
      goal: goalFixture({ threadId: "thread-goal", objective: "Close Desktop parity" }),
    },
  });

  let user = itemById(state, "thread-goal", "user-1") as Record<string, unknown>;
  let assistant = itemById(state, "thread-goal", "agent-1") as Record<string, unknown>;
  const projectedGoal = user._threadGoal as Record<string, unknown>;
  assertEqual(projectedGoal.objective, "Close Desktop parity", "thread goal update should project onto the user message");
  assertEqual(user._threadGoalTurnId, "turn-1", "thread goal projection should preserve the source turn id");
  assertEqual(
    assistant._completedThreadGoal,
    undefined,
    "active thread goal update should not project a completed-goal chip onto the assistant message",
  );

  state = reduceNotification(state, {
    method: "thread/goal/updated",
    params: {
      threadId: "thread-goal",
      turnId: "turn-1",
      goal: goalFixture({
        threadId: "thread-goal",
        objective: "Close Desktop parity",
        status: "complete",
        timeUsedSeconds: 42,
        updatedAt: 2,
      }),
    },
  });

  assistant = itemById(state, "thread-goal", "agent-1") as Record<string, unknown>;
  const completedGoal = assistant._completedThreadGoal as Record<string, unknown>;
  assertEqual(completedGoal.objective, "Close Desktop parity", "completed thread goal should project onto the assistant message");
  assertEqual(assistant._completedThreadGoalTurnId, "turn-1", "completed thread goal projection should preserve the source turn id");

  state = reduceNotification(state, {
    method: "thread/goal/cleared",
    params: { threadId: "thread-goal" },
  });

  user = itemById(state, "thread-goal", "user-1") as Record<string, unknown>;
  assistant = itemById(state, "thread-goal", "agent-1") as Record<string, unknown>;
  assertEqual(user._threadGoal, undefined, "thread goal clear should remove the projected goal");
  assertEqual(user._threadGoalTurnId, undefined, "thread goal clear should remove the projected goal turn id");
  assertEqual(
    (assistant._completedThreadGoal as Record<string, unknown>).objective,
    "Close Desktop parity",
    "thread goal clear should preserve Desktop's assistant completed-goal projection",
  );
  assertEqual(
    assistant._completedThreadGoalTurnId,
    "turn-1",
    "thread goal clear should preserve the completed-goal turn id",
  );
}

function fsChangedNotificationsAreLogged(): void {
  const state = reduceNotification(initialCodexUiState, {
    method: "fs/changed",
    params: {
      watchId: "watch-1",
      changedPaths: ["/workspace/a.ts", "/workspace/b.ts", "/workspace/c.ts", "/workspace/d.ts"],
    },
  });

  assertEqual(
    state.logs[0]?.text,
    "filesystem changed for watch watch-1: /workspace/a.ts, /workspace/b.ts, /workspace/c.ts (+1 more)",
    "fs/changed should leave an observable log entry",
  );
}

function notificationsBumpInvalidationCounters(): void {
  const afterSkills = reduceNotification(initialCodexUiState, { method: "skills/changed", params: {} });
  assertEqual(afterSkills.invalidation.skills, 1, "skills/changed should bump invalidation.skills");
  assertEqual(afterSkills.invalidation.hooks, 0, "skills/changed should not bump hooks");
  const afterHook = reduceNotification(afterSkills, { method: "hook/completed", params: {} });
  assertEqual(afterHook.invalidation.hooks, 1, "hook/completed should bump invalidation.hooks");
  assertEqual(afterHook.invalidation.skills, 1, "hook/completed should preserve the skills counter");
  const afterMcp = reduceNotification(afterHook, { method: "mcpServer/startupStatus/updated", params: {} });
  assertEqual(afterMcp.invalidation.mcpStatus, 1, "mcpServer/startupStatus/updated should bump invalidation.mcpStatus");
  assertEqual(afterMcp.invalidation.mcpStatusMessage, "MCP startup status changed.", "mcpStatus carries the default refresh message");
  const afterWarning = reduceNotification(afterMcp, { method: "warning", params: { message: "x" } });
  assertEqual(afterWarning.invalidation, afterMcp.invalidation, "an unrelated notification keeps the invalidation slice identity");
  const afterAppListUpdated = reduceNotification(afterWarning, { method: "app/list/updated", params: { data: [] } });
  assertEqual(
    afterAppListUpdated.invalidation,
    afterWarning.invalidation,
    "app/list/updated should not force another app/list refresh",
  );
  const afterOAuth = codexUiReducer(initialCodexUiState, { type: "invalidateAppList", message: "Acme OAuth failed." });
  assertEqual(afterOAuth.invalidation.appList, 1, "invalidateAppList action should bump invalidation.appList");
  assertEqual(afterOAuth.invalidation.appListMessage, "Acme OAuth failed.", "invalidateAppList action carries its custom refresh message");
  // mcpServer/oauthLogin/completed must bump BOTH appList AND mcpStatus (mirrors the
  // original onNotification independent if-blocks; the early-return bug dropped mcpStatus).
  const afterMcpOAuth = reduceNotification(initialCodexUiState, {
    method: "mcpServer/oauthLogin/completed",
    params: { name: "my-server", success: true },
  });
  assertEqual(afterMcpOAuth.invalidation.appList, 1, "mcpServer/oauthLogin/completed should bump appList");
  assertEqual(afterMcpOAuth.invalidation.mcpStatus, 1, "mcpServer/oauthLogin/completed should ALSO bump mcpStatus");
  assertEqual(
    afterMcpOAuth.invalidation.mcpStatusMessage.includes("my-server"),
    true,
    "mcpStatusMessage should carry the per-server message from mcpOauthLoginRefreshMessage",
  );
}

function accountNotificationsUpdateReducerAccount(): void {
  const afterUpdate = reduceNotification(initialCodexUiState, { method: "account/updated", params: { authMode: "chatgpt" } });
  assertEqual(afterUpdate.account.invalidated, true, "account/updated should mark the reducer account slice invalidated");
  const replaced = codexUiReducer(initialCodexUiState, {
    type: "setAccount",
    account: { ...initialCodexUiState.account, invalidated: true },
  });
  assertEqual(replaced.account.invalidated, true, "setAccount action should replace the reducer account slice");
}

function hookNotificationsAreLoggedWithoutSyntheticTranscriptItems(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-hooks", [])],
    activeThreadId: "thread-hooks",
    threadsRuntime: {
      "thread-hooks": runtimeSlice({
        turnOrder: ["turn-hooks"],
        items: [
          { ...userMessage("user-hooks", "run hooks"), _turnId: "turn-hooks" },
          { ...agentMessage("agent-hooks", "Hooks finished."), _turnId: "turn-hooks" },
        ] as AccumulatedThreadItem[],
      }),
    },
  };

  state = reduceNotification(state, {
    method: "hook/started",
    params: {
      threadId: "thread-hooks",
      turnId: "turn-hooks",
      run: hookRun("hook-1", "preToolUse", "running"),
    },
  });

  assertEqual(
    state.logs[0]?.text.includes("hook started: preToolUse"),
    true,
    "hook/started should leave an observable log entry",
  );
  assertDeepEqual(
    items(state, "thread-hooks").map((item) => item.id),
    ["user-hooks", "agent-hooks"],
    "hook/started must not add a synthetic hook transcript item",
  );
  let assistant = itemById(state, "thread-hooks", "agent-hooks") as Record<string, unknown>;
  let hookStats = assistant.hookStats as Record<string, unknown>;
  assertEqual(hookStats.count, 1, "hook/started should project hook stats onto the assistant message");
  assertEqual(hookStats.errorCount, 0, "running hook should not count as a failed hook");

  state = reduceNotification(state, {
    method: "hook/completed",
    params: {
      threadId: "thread-hooks",
      turnId: "turn-hooks",
      run: hookRun("hook-1", "preToolUse", "failed", "blocked by policy"),
    },
  });

  assertEqual(state.logs[0]?.level, "warn", "failed hook/completed should be surfaced as a warning log");
  assertEqual(
    state.logs[0]?.text.includes("blocked by policy"),
    true,
    "hook/completed should log the hook status message",
  );
  assertDeepEqual(
    items(state, "thread-hooks").map((item) => item.id),
    ["user-hooks", "agent-hooks"],
    "hook/completed must not add a synthetic hook transcript item",
  );
  assistant = itemById(state, "thread-hooks", "agent-hooks") as Record<string, unknown>;
  hookStats = assistant.hookStats as Record<string, unknown>;
  assertEqual(hookStats.count, 1, "hook/completed should update the existing hook run instead of duplicating it");
  assertEqual(hookStats.errorCount, 1, "failed hook/completed should count as an error in assistant hook stats");

  state = reduceNotification(state, {
    method: "hook/completed",
    params: {
      threadId: "thread-hooks",
      turnId: "turn-hooks",
      run: hookRun("hook-2", "userPromptSubmit", "blocked", "blocked by hook"),
    },
  });

  const user = itemById(state, "thread-hooks", "user-hooks") as Record<string, unknown>;
  assertEqual(user.deliveryStatus, "not-sent", "blocked userPromptSubmit hook should mark the user message not sent");
  assertEqual(user.hookBlocked, true, "blocked userPromptSubmit hook should project hook-blocked user status");
  assistant = itemById(state, "thread-hooks", "agent-hooks") as Record<string, unknown>;
  hookStats = assistant.hookStats as Record<string, unknown>;
  assertEqual(hookStats.count, 2, "blocked hook run should be included in assistant hook stats");
  assertEqual(hookStats.blockedCount, 1, "blocked hook run should increment blocked hook count");
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes(): void {
  assertTerminalTurnStatus("turn/completed", "completed", "idle");
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails(): void {
  assertTerminalTurnStatus("turn/failed", "failed", "idle");
}

function turnsFailedTurnErrorsIntoStreamErrorItems(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1" }),
    },
  };

  const next = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "failed",
        items: [],
        error: {
          message: "HTTP 400",
          codexErrorInfo: null,
          additionalDetails: null,
        },
      },
    },
  });

  assertEqual(runtime(next, "thread-1").activeTurnId, null, "failed error turn should clear active turn");
  assertEqual(threadStatus(next, "thread-1"), "systemError", "failed turn error should mark systemError");
  assertEqual(
    eventContent(next, "thread-1", "stream-error:turn-1"),
    "HTTP 400",
    "failed turn error should be projected as a stream-error item",
  );
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted(): void {
  assertTerminalTurnStatus("turn/interrupted", "interrupted", "idle");
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsCancelled(): void {
  assertTerminalTurnStatus("turn/cancelled", "cancelled", "idle");
}

function keepsLateUserMessageInsideItsOriginatingTurnSegment(): void {
  // Reproduces the regression where three consecutive failing turns put the
  // user message at the very bottom because items were appended to a flat,
  // turn-blind array. With per-turn buckets the user message must land inside
  // its own turn even when item/completed arrives last.
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  for (const suffix of ["1", "2", "3"]) {
    state = reduceNotification(state, {
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: {
          id: `turn-${suffix}`,
          threadId: "thread-1",
          status: "inProgress",
          items: [],
          startedAt: 1,
        },
      },
    });
    state = reduceNotification(state, {
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: `turn-${suffix}`,
        willRetry: false,
        error: { message: `HTTP 401 turn-${suffix}` },
      },
    });
    state = reduceNotification(state, {
      method: "turn/failed",
      params: {
        threadId: "thread-1",
        turn: {
          id: `turn-${suffix}`,
          threadId: "thread-1",
          status: "failed",
          items: [],
          startedAt: 1,
          completedAt: 2,
          durationMs: 1_000,
        },
      },
    });
    state = reduceNotification(state, {
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: `turn-${suffix}`,
        item: userMessage(`user-${suffix}`, `Question ${suffix}`),
      },
    });
  }

  // Without an optimistic insert, the user item arrives last from the server,
  // so within each turn it sits after the error item. The regression we are
  // fixing is that user-N must NOT spill out of its turn segment into the
  // global tail. The worked-for divider IS synthesized for these failed turns:
  // Codex's agent body (`vt`) includes the stream-error row, so the divider
  // mounts (same rationale as finishTurn's error-path `hasExtraActivity`), and
  // the post-merge synthesis sees the runtime stream-error item even though the
  // `turn/failed` payload's own items array is empty (`itemsView: "notLoaded"`
  // on the wire).
  // (worked-for sits at the segment head here because the user message only
  // arrives AFTER turn/failed; the renderer extracts worked-for as its own
  // unit, so the raw index inside the segment does not affect placement.)
  const ids = items(state, "thread-1").map((item) => item.id);
  assertDeepEqual(
    ids,
    [
      "worked-for:turn-1",
      "stream-error:turn-1",
      "user-1",
      "worked-for:turn-2",
      "stream-error:turn-2",
      "user-2",
      "worked-for:turn-3",
      "stream-error:turn-3",
      "user-3",
    ],
    "each turn's items must stay grouped together so a late item/completed userMessage cannot sink to the bottom of the transcript",
  );

  for (const suffix of ["1", "2", "3"]) {
    const indexBetweenTurns = ids.indexOf(`user-${suffix}`);
    const nextTurnHead = ids.indexOf(`stream-error:turn-${Number(suffix) + 1}`);
    if (nextTurnHead >= 0) {
      if (!(indexBetweenTurns < nextTurnHead)) {
        throw new Error(`user-${suffix} must appear before turn-${Number(suffix) + 1} starts`);
      }
    }
  }
}

function optimisticUserMessageStaysAboveErrorAndIsReconciledByItemCompleted(): void {
  // Mirrors the asar Codex Desktop flow where the composer pushes the user
  // bubble into the active turn at submit time, then the server-confirmed
  // item/completed userMessage replaces the optimistic placeholder by id.
  const baseState: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  const optimistic = codexUiReducer(baseState, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:abc",
    localId: "optimistic-user:abc",
    content: [textInput("Hi there")],
  });

  assertDeepEqual(
    items(optimistic, "thread-1").map((item) => item.id),
    ["optimistic-user:abc"],
    "optimisticUserMessage should insert a placeholder item immediately",
  );
  assertDeepEqual(
    runtime(optimistic, "thread-1").pendingOptimisticTurns,
    ["optimistic-turn:abc"],
    "optimisticUserMessage should queue the placeholder turn id for binding",
  );

  const turnStarted = reduceNotification(optimistic, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-1", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });

  assertDeepEqual(
    runtime(turnStarted, "thread-1").turnOrder,
    ["turn-1"],
    "turn/started should rewrite the placeholder turn id to the real turn id",
  );
  const placeholderTurnId = (items(turnStarted, "thread-1")[0] as Record<string, unknown>)?._turnId;
  assertEqual(
    placeholderTurnId,
    "turn-1",
    "after binding, the optimistic item should now reference the real turn id",
  );
  assertDeepEqual(
    runtime(turnStarted, "thread-1").pendingOptimisticTurns,
    [],
    "binding should drain the pending optimistic turn queue",
  );

  const errored = reduceNotification(turnStarted, {
    method: "error",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      willRetry: false,
      error: { message: "Stream failed" },
    },
  });
  assertDeepEqual(
    items(errored, "thread-1").map((item) => item.id),
    ["optimistic-user:abc", "stream-error:turn-1"],
    "stream-error should land after the optimistic user message in the same turn segment",
  );

  const completed = reduceNotification(errored, {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: userMessage("real-user-1", "Hi there"),
    },
  });
  const finalIds = items(completed, "thread-1").map((item) => item.id);
  assertDeepEqual(
    finalIds,
    ["real-user-1", "stream-error:turn-1"],
    "item/completed userMessage should replace the optimistic placeholder by content match",
  );
  const reconciledItem = items(completed, "thread-1")[0] as Record<string, unknown> | undefined;
  assertEqual(
    reconciledItem?._localId,
    undefined,
    "reconciliation should clear the _localId placeholder marker",
  );
}

function itemCompletedReconcilesSameTurnOptimisticUserMessageWhenContentShapeDiffers(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  state = codexUiReducer(state, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:shape",
    localId: "optimistic-user:shape",
    content: [textInput("same visible prompt"), skillInput("Review", "/workspace/.codex/skills/review")],
  });
  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-shape", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });

  const completed = reduceNotification(state, {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-shape",
      item: userMessage("real-user-shape", "same visible prompt"),
    },
  });

  assertDeepEqual(
    items(completed, "thread-1").map((item) => item.id),
    ["real-user-shape"],
    "same-turn userMessage completion should replace the optimistic bubble even when structured content differs",
  );
}

function itemStartedReconcilesTextOnlyUserMessageAndKeepsLocalFileMention(): void {
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:file",
      localId: "optimistic-user:file",
      content: [textInput("inspect this file"), mentionInput("report.pdf", "/tmp/report.pdf")],
    },
  );

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-file", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-file",
      item: userMessage("real-user-file", "inspect this file"),
    },
  });

  const userMessages = items(state, "thread-1").filter((item) => item.type === "userMessage");
  assertDeepEqual(
    userMessages.map((item) => item.id),
    ["real-user-file"],
    "server-confirmed userMessage should replace the local optimistic placeholder",
  );
  assertDeepEqual(
    (userMessages[0] as Record<string, unknown>).content,
    [textInput("inspect this file"), mentionInput("report.pdf", "/tmp/report.pdf")],
    "reconciled userMessage should keep the local file mention when the server confirmation only echoes text",
  );
}

function optimisticUserMessageWithThreeFailingTurnsKeepsExpectedOrder(): void {
  // Replays the exact regression the user reported (three submissions in a row,
  // each turn fails with a 401-style error) but now with the optimistic insert
  // path the workflow applies. The user bubble must lead each turn segment.
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  for (const suffix of ["1", "2", "3"]) {
    state = codexUiReducer(state, {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: `optimistic-turn:${suffix}`,
      localId: `optimistic-user:${suffix}`,
      content: [textInput(`Question ${suffix}`)],
    });
    state = reduceNotification(state, {
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: `turn-${suffix}`, threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
      },
    });
    state = reduceNotification(state, {
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: `turn-${suffix}`,
        willRetry: false,
        error: { message: `HTTP 401 turn-${suffix}` },
      },
    });
    state = reduceNotification(state, {
      method: "turn/failed",
      params: {
        threadId: "thread-1",
        turn: {
          id: `turn-${suffix}`,
          threadId: "thread-1",
          status: "failed",
          items: [],
          startedAt: 1,
          completedAt: 2,
          durationMs: 1_000,
        },
      },
    });
    state = reduceNotification(state, {
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: `turn-${suffix}`,
        item: userMessage(`real-user-${suffix}`, `Question ${suffix}`),
      },
    });
  }

  const ids = items(state, "thread-1").map((item) => item.id);
  // The post-merge worked-for synthesis sees the runtime stream-error rows
  // (Codex's agent body `vt` includes stream errors, so the divider mounts for
  // failed turns) and lands between the user bubble and the activity — exactly
  // Codex's divider placement.
  assertDeepEqual(
    ids,
    [
      "real-user-1",
      "worked-for:turn-1",
      "stream-error:turn-1",
      "real-user-2",
      "worked-for:turn-2",
      "stream-error:turn-2",
      "real-user-3",
      "worked-for:turn-3",
      "stream-error:turn-3",
    ],
    "with optimistic insert each user bubble must lead its turn segment, matching Codex Desktop",
  );
  assertDeepEqual(
    runtime(state, "thread-1").pendingOptimisticTurns,
    [],
    "all placeholder turn ids must have been bound by the time the third turn finishes",
  );
}

function bindOptimisticTurnRewritesItemsAndDropsPendingPlaceholder(): void {
  const baseState: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  const optimistic = codexUiReducer(baseState, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:xyz",
    localId: "optimistic-user:xyz",
    content: [textInput("Re-bind me")],
  });

  const bound = codexUiReducer(optimistic, {
    type: "bindOptimisticTurn",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:xyz",
    turnId: "turn-real",
  });

  assertDeepEqual(
    runtime(bound, "thread-1").turnOrder,
    ["turn-real"],
    "bindOptimisticTurn should replace the local turn id in the order list",
  );
  const reboundTurnId = (items(bound, "thread-1")[0] as Record<string, unknown>)?._turnId;
  assertEqual(
    reboundTurnId,
    "turn-real",
    "bindOptimisticTurn should rewrite items _turnId from local to real",
  );
  assertDeepEqual(
    runtime(bound, "thread-1").pendingOptimisticTurns,
    [],
    "bindOptimisticTurn should drain the pending queue",
  );
}

function completingTurnDropsSameTurnOptimisticUserMessageWhenContentShapeDiffers(): void {
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:terminal-shape",
      localId: "optimistic-user:terminal-shape",
      content: [textInput("terminal prompt"), skillInput("Review", "/workspace/.codex/skills/review")],
    },
  );

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-terminal-shape", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-terminal-shape",
      item: agentMessage("agent-terminal-shape", "streamed terminal answer"),
    },
  });

  const completed = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-terminal-shape",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("real-user-terminal-shape", "terminal prompt"),
          agentMessage("agent-terminal-shape", "streamed"),
        ],
      },
    },
  });

  assertDeepEqual(
    items(completed, "thread-1")
      .filter((item) => item.type === "userMessage")
      .map((item) => item.id),
    ["real-user-terminal-shape"],
    "turn/completed should remove the same-turn optimistic user bubble even when the final content shape differs",
  );
  assertEqual(
    agentText(completed, "thread-1", "agent-terminal-shape"),
    "streamed terminal answer",
    "turn/completed should keep the longer accumulated assistant text",
  );
}

function assertTerminalTurnStatus(method: string, turnStatusValue: string, expectedThreadStatus: string): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({ activeTurnId: "turn-1" }),
    },
  };

  const next = reduceNotification(state, {
    method,
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: turnStatusValue,
        items: [agentMessage(`${method}-agent`, `terminal ${turnStatusValue}`)],
      },
    },
  });

  assertEqual(
    runtime(next, "thread-1").activeTurnId,
    null,
    `${method} should clear the active turn id for the thread`,
  );
  assertEqual(
    threadStatus(next, "thread-1"),
    expectedThreadStatus,
    `${method} should update the thread status with the protocol object shape`,
  );
  assertDeepEqual(
    rawThreadStatus(next, "thread-1"),
    { type: expectedThreadStatus },
    `${method} should store Thread.status as a protocol object, not a local string`,
  );
  assertEqual(
    agentText(next, "thread-1", `${method}-agent`),
    `terminal ${turnStatusValue}`,
    `${method} should merge terminal turn items`,
  );
  assertDeepEqual(
    runtime(next, "thread-1").latestTerminalTurn,
    {
      turnId: "turn-1",
      status: turnStatusValue === "failed"
        ? "failed"
        : turnStatusValue === "interrupted" || turnStatusValue === "cancelled" || turnStatusValue === "canceled"
          ? "interrupted"
          : "completed",
    },
    `${method} should expose the latest terminal turn for composer queue gating`,
  );
}

function upsertingThreadSnapshotDropsDuplicateOptimisticUserMessage(): void {
  // Reproduces the regression where switching threads and switching back
  // accumulated extra user-message bubbles because the optimistic placeholder
  // stayed alongside the server-confirmed userMessage when `thread/read`
  // brought back a snapshot.
  const optimistic = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:dup",
      localId: "optimistic-user:dup",
      content: [textInput("nihao")],
    },
  );

  const snapshotThread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "inProgress",
      startedAt: 1,
      items: [userMessage("real-user-1", "nihao")],
    },
  ]);
  // upsertThread is dispatched from `readThreadForDisplay` after a thread switch.
  const refreshed = codexUiReducer(
    stateWithRuntime(optimistic, "thread-1", { activeTurnId: "turn-1" }),
    { type: "upsertThread", thread: snapshotThread, select: true },
  );

  const ids = items(refreshed, "thread-1").map((item) => item.id);
  if (ids.includes("optimistic-user:dup")) {
    throw new Error(
      `thread snapshot merge must drop the optimistic placeholder when the server-confirmed userMessage carries the same text: got ${JSON.stringify(ids)}`,
    );
  }
  if (!ids.includes("real-user-1")) {
    throw new Error(`expected the snapshot's real userMessage to be present: got ${JSON.stringify(ids)}`);
  }
}

function upsertingLiveSnapshotDropsUnboundOptimisticFileMention(): void {
  const text = "识别一下文件内容\n/Users/haichao/Downloads/注意保密/广发银行-需求分析及产品运营培训项目/分散采购比选文件-需求分析及产品运营培训项目.docx";
  const optimistic = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:file-unbound",
      localId: "optimistic-user:file-unbound",
      content: [
        textInput(text),
        mentionInput("分散采购比选文件-需求分析及产品运营培训项目.docx", "/Users/haichao/Downloads/注意保密/广发银行-需求分析及产品运营培训项目/分散采购比选文件-需求分析及产品运营培训项目.docx"),
      ],
    },
  );

  const refreshed = codexUiReducer(
    stateWithRuntime(optimistic, "thread-1", { activeTurnId: "turn-file-unbound" }),
    {
      type: "upsertThread",
      thread: threadWithTurns("thread-1", [
        {
          id: "turn-file-unbound",
          status: "inProgress",
          startedAt: 1,
          items: [
            userMessage("real-user-file-unbound", text),
            agentMessage("agent-file-unbound", "Working"),
          ],
        },
      ]),
      select: true,
    },
  );

  const userMessages = items(refreshed, "thread-1").filter((item) => item.type === "userMessage");
  assertDeepEqual(
    userMessages.map((item) => item.id),
    ["real-user-file-unbound"],
    "live snapshot should drop the unbound optimistic file userMessage when confirmed text matches",
  );
  assertDeepEqual(
    (userMessages[0] as Record<string, unknown>).content,
    [
      textInput(text),
      mentionInput("分散采购比选文件-需求分析及产品运营培训项目.docx", "/Users/haichao/Downloads/注意保密/广发银行-需求分析及产品运营培训项目/分散采购比选文件-需求分析及产品运营培训项目.docx"),
    ],
    "confirmed userMessage should keep the local file mention after dropping the optimistic twin",
  );
}

function upsertingLiveSnapshotAfterSwitchDropsBoundOptimisticUserMessage(): void {
  // Replays the user-visible switch-away/switch-back case: the local prompt
  // has already been bound to the real running turn, then `thread/read`
  // returns a live snapshot with the server-confirmed userMessage under a real
  // id. The transcript must not show both bubbles while the assistant is still
  // streaming.
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:switch",
      localId: "optimistic-user:switch",
      content: [textInput("keep this single"), skillInput("Review", "/workspace/.codex/skills/review")],
    },
  );

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-live", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-live",
      item: agentMessage("agent-live", "Live streamed answer so far"),
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-live",
        status: "inProgress",
        startedAt: 1,
        items: [
          userMessage("real-user-live", "keep this single"),
          agentMessage("agent-live", "Live"),
        ],
      },
    ]),
    select: true,
  });

  assertDeepEqual(
    items(refreshed, "thread-1")
      .filter((item) => item.type === "userMessage")
      .map((item) => item.id),
    ["real-user-live"],
    "switching back to a running thread should drop the bound optimistic user bubble immediately",
  );
  assertEqual(
    agentText(refreshed, "thread-1", "agent-live"),
    "Live streamed answer so far",
    "live snapshot merge should still preserve the longer accumulated assistant stream",
  );
  assertDeepEqual(
    runtime(refreshed, "thread-1").turnOrder,
    ["turn-live"],
    "confirmed live snapshot should remove the unused optimistic turn placeholder from order",
  );
  assertDeepEqual(
    runtime(refreshed, "thread-1").pendingOptimisticTurns,
    [],
    "confirmed live snapshot should remove the unused optimistic turn placeholder from pending queue",
  );
}

function upsertingLiveSnapshotPreservesBoundOptimisticFileMention(): void {
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:file-snapshot",
      localId: "optimistic-user:file-snapshot",
      content: [textInput("summarize"), mentionInput("brief.docx", "/tmp/brief.docx")],
    },
  );

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-file-snapshot", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-file-snapshot",
        status: "inProgress",
        startedAt: 1,
        items: [
          userMessage("real-user-file-snapshot", "summarize"),
          agentMessage("agent-file-snapshot", "Working"),
        ],
      },
    ]),
    select: true,
  });

  const userMessages = items(refreshed, "thread-1").filter((item) => item.type === "userMessage");
  assertDeepEqual(
    userMessages.map((item) => item.id),
    ["real-user-file-snapshot"],
    "live thread snapshot should still drop the duplicate optimistic userMessage",
  );
  assertDeepEqual(
    (userMessages[0] as Record<string, unknown>).content,
    [textInput("summarize"), mentionInput("brief.docx", "/tmp/brief.docx")],
    "live thread snapshot should preserve local file mentions that the server snapshot omits",
  );
}

function upsertingLiveSnapshotWithRolloutReplayUserMessageDoesNotDuplicateConfirmed(): void {
  // Replays the real-world bug: the streamed `item/started userMessage` has
  // already reconciled the optimistic placeholder into a confirmed item with
  // the authoritative server id. Then the user switches threads and back, so
  // `readThreadForDisplay` re-fetches the thread. The host crate's rollout
  // reader injects an extra synthesized `history-user:turn:line` userMessage
  // because the server's mid-stream `thread/read` did not yet include the
  // user prompt in `turn.items`. The reducer must not render two bubbles for
  // the same prompt just because the snapshot now carries a different id.
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:rollout",
      localId: "optimistic-user:rollout",
      content: [textInput("read DEVELOPMENT.md")],
    },
  );

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-rollout", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-rollout",
      item: userMessage("server-user-rollout", "read DEVELOPMENT.md"),
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-rollout",
      item: agentMessage("agent-rollout", "Reading the file..."),
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-rollout",
        status: "inProgress",
        startedAt: 1,
        items: [
          // Mid-stream thread/read returns the assistant + tool item but the
          // user prompt is not materialized yet — only the rollout-replay
          // synthesized one (different id) is present.
          userMessage("history-user:turn-rollout:0", "read DEVELOPMENT.md"),
          agentMessage("agent-rollout", "Reading"),
        ],
      },
    ]),
    select: true,
  });

  assertDeepEqual(
    items(refreshed, "thread-1")
      .filter((item) => item.type === "userMessage")
      .map((item) => item.id),
    ["server-user-rollout"],
    "live snapshot merge must dedupe rollout-replay userMessage against the streamed confirmed one",
  );
  assertEqual(
    agentText(refreshed, "thread-1", "agent-rollout"),
    "Reading the file...",
    "live snapshot merge must keep the longer streamed assistant text",
  );
}

function upsertingLiveSnapshotWithRolloutReplayAgentMessageDoesNotDuplicateConfirmed(): void {
  // Mirrors the visible bug where the conversation showed a phantom assistant
  // commentary block above the user prompt: the rollout reader synthesized
  // `history-agent:turn:line` items because the server's mid-stream
  // `thread/read` returned `turn.items` that lacked the assistant commentary
  // already streamed via `item/started agentMessage`.
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:agent-replay",
      localId: "optimistic-user:agent-replay",
      content: [textInput("hi there")],
    },
  );
  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-agent-replay", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-agent-replay",
      item: userMessage("server-user-agent-replay", "hi there"),
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-agent-replay",
      item: agentMessage("server-agent-commentary", "Sure, taking a look."),
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-agent-replay",
        status: "inProgress",
        startedAt: 1,
        items: [
          // Replay duplicate (different id, same text) injected by rollout merge.
          {
            ...agentMessage("history-agent:turn-agent-replay:5", "Sure, taking a look."),
            _historyReplay: true,
          } as unknown as ThreadItem,
        ],
      },
    ]),
    select: true,
  });

  const refreshedItems = items(refreshed, "thread-1");
  assertDeepEqual(
    refreshedItems.filter((item) => item.type === "agentMessage").map((item) => item.id),
    ["server-agent-commentary"],
    "live snapshot merge must drop rollout-replay agentMessage when streamed text is already in state",
  );
  assertEqual(
    refreshedItems.filter((item) => item.type === "userMessage").length,
    1,
    "user prompt must remain a single bubble after rollout-replay merge",
  );
}

function upsertingLiveSnapshotWithRolloutReplayReasoningDoesNotDuplicateConfirmed(): void {
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:reason",
      localId: "optimistic-user:reason",
      content: [textInput("plan it")],
    },
  );
  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-reason", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-reason",
      item: userMessage("server-user-reason", "plan it"),
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-reason",
      item: {
        type: "reasoning",
        id: "server-reasoning-1",
        summary: ["Inspect the workspace"],
        content: ["Reading docs/DEVELOPMENT.md first"],
      } as ThreadItem,
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-reason",
        status: "inProgress",
        startedAt: 1,
        items: [
          {
            type: "reasoning",
            id: "history-reasoning:turn-reason:7",
            summary: ["Inspect the workspace"],
            content: ["Reading docs/DEVELOPMENT.md first"],
            _historyReplay: true,
          } as unknown as ThreadItem,
        ],
      },
    ]),
    select: true,
  });

  assertDeepEqual(
    items(refreshed, "thread-1")
      .filter((item) => item.type === "reasoning")
      .map((item) => item.id),
    ["server-reasoning-1"],
    "live snapshot merge must drop rollout-replay reasoning when streamed summary/content is already in state",
  );
}

function upsertingLiveSnapshotWithCompletedCollabToolCallReplacesStartedTwin(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-collab", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-collab",
      item: collabToolCall("live-spawn", "inProgress", [], "Inspect render groups"),
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-collab",
        status: "inProgress",
        startedAt: 1,
        items: [
          collabToolCall(
            "history-spawn",
            "completed",
            ["agent-1234567890abcdef"],
            "Inspect render groups",
            { "agent-1234567890abcdef": { status: "running", message: null } },
          ),
        ],
      },
    ]),
    select: true,
  });

  const collabItems = items(refreshed, "thread-1").filter((item) => item.type === "collabAgentToolCall");
  assertEqual(collabItems.length, 1, "completed collab snapshot should replace the streamed started twin");
  assertEqual(collabItems[0]?.id, "live-spawn", "snapshot should be realigned to the live item id before merge");
  assertEqual(String((collabItems[0] as Record<string, unknown> | undefined)?.status ?? ""), "completed", "completed status should win after refresh");
  assertDeepEqual(
    (collabItems[0] as Record<string, unknown> | undefined)?.receiverThreadIds,
    ["agent-1234567890abcdef"],
    "completed collab snapshot should carry receiver thread ids after merge",
  );
}

function setThreadsHydratesCollabReceiverThreadMetadata(): void {
  const childThread = {
    ...threadWithTurns("019e57e100006da4", []),
    agentNickname: "@Weather",
    agentRole: "researcher",
  };
  const state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": {
        ...selectThreadRuntime(initialCodexUiState, null),
        items: [
          {
            type: "collabAgentToolCall",
            id: "spawn-1",
            tool: "spawnAgent",
            status: "completed",
            receiverThreadIds: ["019e57e100006da4"],
            prompt: "Check weather",
            agentsStates: {},
          } as unknown as AccumulatedThreadItem,
        ],
      },
    },
  };

  const next = codexUiReducer(state, {
    type: "setThreads",
    threads: [threadWithTurns("thread-1", []), childThread],
  });
  const item = items(next, "thread-1")[0] as Record<string, unknown>;
  const receiverThreads = item.receiverThreads as Array<Record<string, unknown>>;
  const receiverThread = receiverThreads[0]?.thread as Record<string, unknown> | undefined;
  assertEqual(
    receiverThread?.agentNickname,
    "@Weather",
    "thread list refresh should hydrate collab receiver nickname like Desktop threadsById",
  );
  assertEqual(
    receiverThread?.agentRole,
    "researcher",
    "thread list refresh should hydrate collab receiver role like Desktop threadsById",
  );
}

function finishingTurnWithRolloutReplayUserMessageDoesNotDuplicateConfirmed(): void {
  // Same hazard, but at `turn/completed`. After the live merge above, if the
  // duplicate ever crept in, `replaceTurnSegment` must collapse the segment
  // by content key so the user does not need to refresh the page to recover.
  let state: CodexUiState = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:done",
      localId: "optimistic-user:done",
      content: [textInput("read DEVELOPMENT.md")],
    },
  );
  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-done", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-done",
      item: userMessage("server-user-done", "read DEVELOPMENT.md"),
    },
  });
  // Simulate a stale rollout-replay userMessage already leaked into state.
  state = {
    ...state,
    threadsRuntime: {
      ...state.threadsRuntime,
      "thread-1": {
        ...runtime(state, "thread-1"),
        items: [
          ...items(state, "thread-1"),
        {
          id: "history-user:turn-done:0",
          type: "userMessage",
          content: [textInput("read DEVELOPMENT.md")],
          _turnId: "turn-done",
        } as AccumulatedThreadItem,
        ],
      },
    },
  };

  const completed = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-done",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("server-user-done", "read DEVELOPMENT.md"),
          agentMessage("agent-done", "Done"),
        ],
      },
    },
  });

  assertDeepEqual(
    items(completed, "thread-1")
      .filter((item) => item.type === "userMessage")
      .map((item) => item.id),
    ["server-user-done"],
    "turn/completed segment replace must dedupe rollout-replay userMessage by content",
  );
}

function finishingTurnDoesNotDedupeSamePromptAcrossTurns(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  for (const turnId of ["turn-a", "turn-b"]) {
    state = reduceNotification(state, {
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: {
          id: turnId,
          threadId: "thread-1",
          status: "inProgress",
          items: [userMessage(`user-${turnId}`, "ok")],
          startedAt: 1,
        },
      },
    });
    state = reduceNotification(state, {
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: turnId,
          threadId: "thread-1",
          status: "completed",
          items: [
            userMessage(`user-${turnId}`, "ok"),
            agentMessage(`agent-${turnId}`, `done ${turnId}`),
          ],
        },
      },
    });
  }

  assertDeepEqual(
    items(state, "thread-1")
      .filter((item) => item.type === "userMessage")
      .map((item) => item.id),
    ["user-turn-a", "user-turn-b"],
    "same user prompt in separate turns should remain as two distinct messages",
  );
}

function lateInProgressThreadSnapshotDoesNotReactivateCompletedTurn(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };

  state = reduceNotification(state, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-late", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
  state = reduceNotification(state, {
    method: "item/started",
    params: {
      threadId: "thread-1",
      turnId: "turn-late",
      item: agentMessage("agent-late", "Final answer streamed completely."),
    },
  });
  state = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-late",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-late", "finish it"),
          agentMessage("agent-late", "Final answer streamed completely."),
        ],
      },
    },
  });

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-late",
        status: "inProgress",
        startedAt: 1,
        items: [
          userMessage("user-late", "finish it"),
          agentMessage("agent-late", "Final"),
        ],
      },
    ]),
    select: true,
  });

  assertEqual(runtime(refreshed, "thread-1").activeTurnId, null, "late stale thread/read must not reactivate a completed turn");
  assertEqual(threadStatus(refreshed, "thread-1"), "idle", "late stale thread/read must not regress the thread status to active");
  assertEqual(
    agentText(refreshed, "thread-1", "agent-late"),
    "Final answer streamed completely.",
    "late stale thread/read must preserve the longer completed assistant output",
  );
}

function lateInProgressThreadSnapshotDoesNotReactivateCancelledTurn(): void {
  const cancelledItems: AccumulatedThreadItem[] = [
    { ...userMessage("user-cancelled", "stop"), _turnId: "turn-cancelled", _turnStatus: "cancelled" },
    { ...agentMessage("agent-cancelled", "Stopped."), _turnId: "turn-cancelled", _turnStatus: "cancelled" },
  ];
  const state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
    threadsRuntime: {
      "thread-1": runtimeSlice({
        activeTurnId: null,
        items: cancelledItems,
      }),
    },
  };

  const refreshed = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadWithTurns("thread-1", [
      {
        id: "turn-cancelled",
        status: "inProgress",
        startedAt: 1,
        items: [
          userMessage("user-cancelled", "stop"),
          agentMessage("agent-cancelled", "Stopping"),
        ],
      },
    ]),
    select: true,
  });

  assertEqual(
    runtime(refreshed, "thread-1").activeTurnId,
    null,
    "late stale thread/read must not reactivate a cancelled turn",
  );
  assertEqual(
    threadStatus(refreshed, "thread-1"),
    "idle",
    "late stale thread/read must not regress a cancelled turn's thread status to active",
  );
  assertEqual(
    agentText(refreshed, "thread-1", "agent-cancelled"),
    "Stopped.",
    "late stale thread/read must preserve the terminal cancelled transcript",
  );
}

function upsertingMetadataOnlyThreadPreservesOptimisticPrompt(): void {
  const optimistic = codexUiReducer(
    {
      ...initialCodexUiState,
      threads: [threadWithTurns("thread-1", [])],
      activeThreadId: "thread-1",
    },
    {
      type: "optimisticUserMessage",
      threadId: "thread-1",
      localTurnId: "optimistic-turn:first",
      localId: "optimistic-user:first",
      content: [textInput("First prompt")],
    },
  );

  const metadataOnlyThread: Thread = {
    ...threadWithTurns("thread-1", []),
    cwd: "/workspace/project",
    gitInfo: {
      branch: "main",
      sha: "abcdef1234567890",
      originUrl: "git@example.com:forge/Forge.git",
    },
  };
  const refreshed = codexUiReducer(optimistic, {
    type: "upsertThread",
    thread: metadataOnlyThread,
  });

  assertDeepEqual(
    items(refreshed, "thread-1").map((item) => item.id),
    ["optimistic-user:first"],
    "metadata-only thread refresh must not erase the first optimistic prompt",
  );
  assertEqual(
    refreshed.threads.find((thread) => thread.id === "thread-1")?.gitInfo?.branch,
    "main",
    "metadata-only thread refresh should still merge branch details",
  );
}

function redispatchingTheSameOptimisticUserMessageIsIdempotent(): void {
  let state: CodexUiState = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [])],
    activeThreadId: "thread-1",
  };
  state = codexUiReducer(state, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:once",
    localId: "optimistic-user:once",
    content: [textInput("hello world")],
  });
  state = codexUiReducer(state, {
    type: "optimisticUserMessage",
    threadId: "thread-1",
    localTurnId: "optimistic-turn:twice",
    localId: "optimistic-user:twice",
    content: [textInput("hello world")],
  });

  const ids = items(state, "thread-1").map((item) => item.id);
  assertDeepEqual(
    ids,
    ["optimistic-user:once"],
    "redispatching the same content while a placeholder is still pending must be a no-op so quick double-clicks cannot multiply user bubbles",
  );
}

function reduceNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  return codexUiReducer(state, { type: "notification", message });
}

function setActiveThreadPushesThreadHistoryStack(): void {
  let state = codexUiReducer(initialCodexUiState, {
    type: "setActiveThread",
    threadId: "thread-a",
  });
  assertDeepEqual(
    state.threadHistoryStack,
    ["thread-a"],
    "first setActiveThread should seed the navigation history stack",
  );
  assertEqual(state.threadHistoryIndex, 0, "history cursor should point at the seeded entry");

  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-b" });
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-c" });
  assertDeepEqual(
    state.threadHistoryStack,
    ["thread-a", "thread-b", "thread-c"],
    "consecutive thread switches should append to the navigation history stack",
  );
  assertEqual(state.threadHistoryIndex, 2, "history cursor should advance to the newest entry");

  // codex: selecting the same thread again should not push a duplicate entry
  // (otherwise Back/Forward would feel stuck).
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-c" });
  assertDeepEqual(
    state.threadHistoryStack,
    ["thread-a", "thread-b", "thread-c"],
    "re-selecting the active thread should coalesce instead of duplicating history",
  );
  assertEqual(state.threadHistoryIndex, 2, "cursor should not move when coalescing duplicates");
}

function navigateBackAndForwardInHistoryMovesCursorWithoutPushing(): void {
  let state = initialCodexUiState;
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-a" });
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-b" });
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-c" });

  state = codexUiReducer(state, { type: "navigateBackInHistory" });
  assertEqual(state.activeThreadId, "thread-b", "navigateBackInHistory should activate the previous entry");
  assertEqual(state.threadHistoryIndex, 1, "navigateBackInHistory should move the cursor left");
  assertDeepEqual(
    state.threadHistoryStack,
    ["thread-a", "thread-b", "thread-c"],
    "navigateBackInHistory must not push a new entry",
  );

  state = codexUiReducer(state, { type: "navigateForwardInHistory" });
  assertEqual(state.activeThreadId, "thread-c", "navigateForwardInHistory should activate the next entry");
  assertEqual(state.threadHistoryIndex, 2, "navigateForwardInHistory should move the cursor right");

  // codex: at the head of the stack, forward is a no-op.
  const afterForwardAtHead = codexUiReducer(state, { type: "navigateForwardInHistory" });
  assertEqual(
    afterForwardAtHead.threadHistoryIndex,
    2,
    "navigateForwardInHistory at the head of the stack should be a no-op",
  );
  assertEqual(
    afterForwardAtHead.activeThreadId,
    "thread-c",
    "navigateForwardInHistory at the head must not change the active thread",
  );
}

function navigateBackAtHeadIsNoOpAndForwardBranchIsTruncatedOnNewSwitch(): void {
  // codex: at the bottom of the stack (single entry), Back is a no-op.
  let state = codexUiReducer(initialCodexUiState, {
    type: "setActiveThread",
    threadId: "thread-a",
  });
  const backAtBottom = codexUiReducer(state, { type: "navigateBackInHistory" });
  assertEqual(
    backAtBottom.threadHistoryIndex,
    0,
    "navigateBackInHistory at the bottom of the stack should be a no-op",
  );
  assertEqual(
    backAtBottom.activeThreadId,
    "thread-a",
    "navigateBackInHistory at the bottom must not change the active thread",
  );

  // codex: setActiveThread while the cursor is in the middle of the stack
  // should truncate any forward branch — matches browser history semantics.
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-b" });
  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-c" });
  state = codexUiReducer(state, { type: "navigateBackInHistory" });
  state = codexUiReducer(state, { type: "navigateBackInHistory" });
  assertEqual(state.activeThreadId, "thread-a", "cursor should be back at thread-a before the branch switch");

  state = codexUiReducer(state, { type: "setActiveThread", threadId: "thread-d" });
  assertDeepEqual(
    state.threadHistoryStack,
    ["thread-a", "thread-d"],
    "switching threads mid-history should truncate the forward branch",
  );
  assertEqual(state.threadHistoryIndex, 1, "cursor should point at the new entry after truncation");
}

function threadWithTurns(
  id: string,
  turns: Array<{
    id: string;
    status: unknown;
    items: ThreadItem[];
    startedAt?: number | null;
    completedAt?: number | null;
    durationMs?: number | null;
  }>,
): Thread {
  const fullTurns = turns.map((turn) => turnFixture(turn));
  return {
    id,
    sessionId: id,
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    recencyAt: null,
    status: turns.some((turn) => isActiveTurnFixtureStatus(turn.status))
      ? { type: "active", activeFlags: [] }
      : { type: "idle" },
    path: null,
    cwd: "",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: fullTurns,
  };
}

function turnFixture(turn: {
  id: string;
  status: unknown;
  items: ThreadItem[];
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}): Thread["turns"][number] {
  return {
    id: turn.id,
    items: turn.items as Thread["turns"][number]["items"],
    itemsView: "full",
    status: turnStatusFixture(turn.status),
    error: null,
    startedAt: turn.startedAt ?? null,
    completedAt: turn.completedAt ?? null,
    durationMs: turn.durationMs ?? null,
  };
}

function turnStatusFixture(status: unknown): Thread["turns"][number]["status"] {
  return status === "completed"
    || status === "interrupted"
    || status === "cancelled"
    || status === "canceled"
    || status === "failed"
    || status === "inProgress"
    || status === "running"
    || status === "active"
    || (Boolean(status) && typeof status === "object")
    ? status as Thread["turns"][number]["status"]
    : "completed";
}

function isActiveTurnFixtureStatus(status: unknown): boolean {
  if (status === "inProgress" || status === "running" || status === "active") return true;
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  return record.type === "inProgress"
    || record.type === "running"
    || record.type === "active"
    || record.status === "inProgress"
    || record.status === "running"
    || record.status === "active";
}

function planItem(id: string, text: string): ThreadItem {
  return { type: "plan", id, text } as unknown as ThreadItem;
}

function fileChangeItem(
  id: string,
  changes: { path: string; kind: { type: string; move_path?: string | null }; diff: string }[],
  status: string = "completed",
): ThreadItem {
  return { type: "fileChange", id, changes, status } as unknown as ThreadItem;
}

function startedPlanTurn(): CodexUiState {
  return reduceNotification(initialCodexUiState, {
    method: "turn/started",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-1", threadId: "thread-1", status: "inProgress", items: [], startedAt: 1 },
    },
  });
}

function synthesizesPlanImplementationItemWhenPlanTurnCompletes(): void {
  // A completed turn that produced a proposed plan (raw wire item `type: "plan"`)
  // must yield a client-synthesized `planImplementation` affordance — without it
  // the composer never surfaces "Implement this plan?" and plan mode stops.
  const completed = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Plan it"),
          planItem("plan-1", "  1. step one\n2. step two  "),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });

  const synthesized = items(completed, "thread-1").find((item) => item.type === "planImplementation");
  assertEqual(Boolean(synthesized), true, "completing a plan turn should synthesize a planImplementation item");
  assertEqual(synthesized?.id, "implement-plan:turn-1", "synthesized planImplementation id should be implement-plan:<turnId>");
  assertEqual(
    synthesized?.planContent as string,
    "1. step one\n2. step two",
    "planContent should be the trimmed text of the proposed-plan item",
  );
  assertEqual(synthesized?.isCompleted as boolean, false, "synthesized planImplementation should start not completed");
  assertEqual(synthesized?.turnId as string, "turn-1", "synthesized planImplementation should carry its turnId");
}

function doesNotSynthesizePlanImplementationWithoutAPlanItemOrOnFailure(): void {
  // No proposed plan in the turn → nothing to implement.
  const noPlan = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [userMessage("user-1", "Just chat"), agentMessage("agent-1", "Hi")],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  assertEqual(
    items(noPlan, "thread-1").some((item) => item.type === "planImplementation"),
    false,
    "a turn without a plan item must not synthesize a planImplementation affordance",
  );

  // A plan was produced but the turn did not complete cleanly → do not propose
  // implementation (mirrors Codex gating on status === "completed").
  const failedWithPlan = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "failed",
        items: [userMessage("user-1", "Plan it"), planItem("plan-1", "1. step one")],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  assertEqual(
    items(failedWithPlan, "thread-1").some((item) => item.type === "planImplementation"),
    false,
    "a failed turn must not synthesize a planImplementation affordance",
  );
}

function synthesizesTurnDiffItemWhenCodeEditTurnCompletes(): void {
  // A completed turn that edited files must yield a client-synthesized
  // `turn-diff` item so the static "Edited N files +X -Y / Undo / Review" card
  // survives after the live diff portal (gated on isThreadRunning) disappears.
  // The backend sends no turn/diff/updated here, so the diff is rebuilt from the
  // turn's file-change patches (Codex `_ = e.diff ?? Fx(patchBatches)`).
  const completed = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Edit it"),
          fileChangeItem("fc-1", [
            { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
          ]),
          agentMessage("agent-1", "Done."),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });

  const synthesized = items(completed, "thread-1").find((item) => item.type === "turn-diff");
  assertEqual(Boolean(synthesized), true, "completing a code-edit turn should synthesize a turn-diff item");
  assertEqual(synthesized?.id, "turn-diff:turn-1", "synthesized turn-diff id should be turn-diff:<turnId>");
  assertEqual(synthesized?.turnId as string, "turn-1", "synthesized turn-diff should carry its turnId");
  const rebuiltDiff = (synthesized?.unifiedDiff as string) ?? "";
  assertEqual(
    rebuiltDiff.includes("diff --git a/src/app.ts b/src/app.ts"),
    true,
    "rebuilt diff should carry a git header so turnDiffViewModel counts the file",
  );
  assertEqual(
    rebuiltDiff.includes("+new") && rebuiltDiff.includes("-old"),
    true,
    "rebuilt diff should preserve the added and removed lines",
  );
}

function synthesizesTurnDiffForHistoricalTurnOnThreadSnapshot(): void {
  // The card must also appear when a past code-edit turn is re-loaded from a
  // thread snapshot (re-opening a conversation). That path runs through
  // collectThreadItems, not finishTurn, so the synthesis lives in the shared
  // per-turn builder (turnItemsWithWorkedFor). Without it, historical turns
  // show no diff card even though the live turn did.
  const thread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      items: [
        userMessage("user-1", "Edit it"),
        fileChangeItem("fc-1", [
          { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
        ]),
      ],
    },
  ]);
  const state = reduceNotification(initialCodexUiState, {
    method: "thread/started",
    params: { thread },
  });
  const synthesized = items(state, "thread-1").find((item) => item.type === "turn-diff");
  assertEqual(
    Boolean(synthesized),
    true,
    "re-loading a code-edit turn from a snapshot should synthesize a turn-diff item",
  );
  assertEqual(synthesized?.id, "turn-diff:turn-1", "snapshot-synthesized turn-diff id should be turn-diff:<turnId>");
  assertEqual(
    ((synthesized?.unifiedDiff as string) ?? "").includes("diff --git a/src/app.ts b/src/app.ts"),
    true,
    "snapshot-synthesized diff should carry a git header so the card renders",
  );
}

function doesNotSynthesizeTurnDiffWithoutChangesOrOnPatchFailure(): void {
  // No file changes and no backend diff → nothing to show (codex ES only
  // pushes the item when `_.length > 0`).
  const noChanges = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [userMessage("user-1", "Just chat"), agentMessage("agent-1", "Hi")],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  assertEqual(
    items(noChanges, "thread-1").some((item) => item.type === "turn-diff"),
    false,
    "a turn without file changes must not synthesize a turn-diff item",
  );

  // Patch-level failure: codex jM skips fileChange items whose status is
  // failed/declined (`r.status === `failed` || r.status === `declined` || ...`,
  // app-server-manager-signals-SKi6YePu.js :19615) — nothing applied, no card.
  const patchFailed = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Edit it"),
          fileChangeItem(
            "fc-1",
            [{ path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" }],
            "failed",
          ),
          fileChangeItem(
            "fc-2",
            [{ path: "src/other.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-a\n+b" }],
            "declined",
          ),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  assertEqual(
    items(patchFailed, "thread-1").some((item) => item.type === "turn-diff"),
    false,
    "failed/declined patches must not synthesize a turn-diff item",
  );
}

function synthesizesTurnDiffForFailedTurnWithAppliedChanges(): void {
  // Turn-level status does NOT gate the synthesis: codex ES (:15149) has no
  // status check — `_.length > 0 && o.push({ type: `turn-diff`, ... })` — so a
  // failed/interrupted turn whose patches DID apply still gets the card. The
  // render side hides it only while the turn is `in_progress`
  // (`fn = !G && ...`, local-conversation-thread-CNXrCEaG :28619).
  const failedWithChanges = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "failed",
        items: [
          userMessage("user-1", "Edit it"),
          fileChangeItem("fc-1", [
            { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
          ]),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  assertEqual(
    items(failedWithChanges, "thread-1").some((item) => item.type === "turn-diff"),
    true,
    "a failed turn with applied patches must still synthesize a turn-diff item",
  );
}

function turnDiffCarriesPatchBatchesAndTracksCommandCwd(): void {
  // codex jM tracks the working dir from commandExecution items and stamps it
  // on each batch; ES stores `patchBatches` + `cwd` on the synthesized item
  // (`...(m.length > 0 ? { patchBatches: m } : {}), cwd: m[0]?.cwd ?? ...`).
  const completed = reduceNotification(startedPlanTurn(), {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Edit it"),
          { type: "commandExecution", id: "cmd-1", command: "cd", cwd: "/repo/sub", status: "completed" } as unknown as ThreadItem,
          fileChangeItem("fc-1", [
            { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
          ]),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  const synthesized = items(completed, "thread-1").find((item) => item.type === "turn-diff") as
    | (Record<string, unknown> & { patchBatches?: Array<{ changes: Record<string, unknown>; cwd: string | null }> })
    | undefined;
  assertEqual(Boolean(synthesized), true, "code-edit turn should synthesize a turn-diff item");
  assertEqual(synthesized?.cwd as string, "/repo/sub", "synthesized turn-diff cwd should come from the tracked commandExecution cwd");
  assertEqual(synthesized?.patchBatches?.length, 1, "synthesized turn-diff should carry its patch batches");
  assertEqual(synthesized?.patchBatches?.[0]?.cwd, "/repo/sub", "patch batch should be stamped with the tracked cwd");
  assertEqual(
    Boolean(synthesized?.patchBatches?.[0]?.changes["src/app.ts"]),
    true,
    "patch batch changes should be keyed by path (codex k_ map shape)",
  );
}

function prefersLiveTurnDiffNotificationOverPatchRebuild(): void {
  // codex ES: `_ = e.diff != null && e.diff.length > 0 ? e.diff : lS(m)` —
  // `e.diff` is only filled by the live `turn/diff/updated` notification
  // (:13076 `this.updateTurnState(i, e, (e) => { e.diff = t })`).
  const liveDiff = "diff --git a/live.ts b/live.ts\n--- a/live.ts\n+++ b/live.ts\n@@ -1 +1 @@\n-l\n+L\n";
  const withLiveDiff = reduceNotification(startedPlanTurn(), {
    method: "turn/diff/updated",
    params: { threadId: "thread-1", turnId: "turn-1", diff: liveDiff },
  });
  const completed = reduceNotification(withLiveDiff, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Edit it"),
          fileChangeItem("fc-1", [
            { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
          ]),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  const synthesized = items(completed, "thread-1").find((item) => item.type === "turn-diff");
  assertEqual(
    synthesized?.unifiedDiff as string,
    liveDiff,
    "the live turn/diff/updated payload must win over the patch rebuild (codex ES e.diff priority)",
  );

  // A diff that belongs to a DIFFERENT turn must not leak into this turn's card.
  const staleDiffState = reduceNotification(startedPlanTurn(), {
    method: "turn/diff/updated",
    params: { threadId: "thread-1", turnId: "turn-0", diff: liveDiff },
  });
  const completedOther = reduceNotification(staleDiffState, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [
          userMessage("user-1", "Edit it"),
          fileChangeItem("fc-1", [
            { path: "src/app.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" },
          ]),
        ],
        startedAt: 1,
        completedAt: 2,
      },
    },
  });
  const rebuilt = items(completedOther, "thread-1").find((item) => item.type === "turn-diff");
  assertEqual(
    ((rebuilt?.unifiedDiff as string) ?? "").includes("diff --git a/src/app.ts b/src/app.ts"),
    true,
    "a stale other-turn diff must be ignored in favor of the patch rebuild",
  );
}

function synthesizesWorkedForWhenTurnCompletedArrivesWithEmptyItems(): void {
  // Wire fact (probed against the sidecar app-server, 2026-06-06): the
  // turn/completed notification carries startedAt/completedAt/durationMs but
  // its turn.items is EMPTY (`itemsView: "notLoaded"`) — the activity items
  // only exist as streamed item/* updates. The worked-for divider must gate on
  // the MERGED segment, else the collapse header falls back to "N previous
  // messages" while Codex shows "Worked for {time}" via turn.durationMs
  // (qh branch ②, local-conversation-thread-CNXrCEaG :8381).
  const streamed = reduceNotification(startedPlanTurn(), {
    method: "item/completed",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type: "commandExecution", id: "cmd-1", command: "printf '7' > t.txt", status: "completed", cwd: "/repo" } as unknown as ThreadItem,
    },
  });
  const completed = reduceNotification(streamed, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [],
        startedAt: 100,
        completedAt: 123,
        durationMs: 23_000,
      },
    },
  });
  const workedFor = items(completed, "thread-1").find((item) => item.type === "worked-for") as
    | Record<string, unknown>
    | undefined;
  assertEqual(
    Boolean(workedFor),
    true,
    "a completed turn with streamed activity but an empty completion payload must still synthesize worked-for",
  );
  assertEqual(workedFor?.durationMs, 23_000, "synthesized worked-for should carry the payload durationMs");
  assertEqual(workedFor?.status, "completed", "synthesized worked-for should be in the completed state");

  // Pure-text turns stay suppressed: agentMessage is not agent activity, so the
  // merged-segment gate must NOT resurrect the spurious divider for plain Q&A.
  const textStreamed = reduceNotification(startedPlanTurn(), {
    method: "item/completed",
    params: { threadId: "thread-1", turnId: "turn-1", item: agentMessage("agent-1", "Hi") },
  });
  const textCompleted = reduceNotification(textStreamed, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: { id: "turn-1", threadId: "thread-1", status: "completed", items: [], startedAt: 100, completedAt: 105, durationMs: 5_000 },
    },
  });
  assertEqual(
    items(textCompleted, "thread-1").some((item) => item.type === "worked-for"),
    false,
    "a pure-text turn must not synthesize worked-for even with payload timing",
  );
}

function userMessage(id: string, text: string): ThreadItem {
  return {
    type: "userMessage",
    id,
    clientId: null,
    content: [textInput(text)],
  };
}

function textInput(text: string): UserInput {
  return {
    type: "text",
    text,
    text_elements: [],
  };
}

function skillInput(name: string, path: string): UserInput {
  return {
    type: "skill",
    name,
    path,
  };
}

function mentionInput(name: string, path: string): UserInput {
  return {
    type: "mention",
    name,
    path,
  };
}

function agentMessage(id: string, text: string): ThreadItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase: null,
    memoryCitation: null,
  };
}

/**
 * Minimal exec item that satisfies the agent-activity gate in
 * `workedForItemFromTurn` (codex-reducer.ts) — used in timing/projection
 * tests that need worked-for synthesis. Mirrors Codex's gate where
 * `Yw` agent-body-collapsible only mounts when `vt.length > 0`.
 */
function execActivity(id: string, command: string): ThreadItem {
  return {
    type: "exec",
    id,
    command,
    completed: true,
    output: { exitCode: 0 },
    parsedCmd: { type: "read", path: command },
  } as unknown as ThreadItem;
}

function goalFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    threadId: "thread-1",
    objective: "Finish parity",
    status: "active",
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function hookRun(
  id: string,
  eventName: string,
  status: string,
  statusMessage: string | null = null,
): Record<string, unknown> {
  return {
    id,
    eventName,
    handlerType: "command",
    executionMode: "blocking",
    scope: "project",
    sourcePath: "/workspace/.codex/hooks.json",
    source: "project",
    displayOrder: 0,
    status,
    statusMessage,
    startedAt: 0,
    completedAt: status === "running" ? null : 10,
    durationMs: status === "running" ? null : 10,
    entries: [],
  };
}

function collabToolCall(
  id: string,
  status: "inProgress" | "completed" | "failed",
  receiverThreadIds: string[],
  prompt: string,
  agentsStates: Record<string, unknown> = {},
): ThreadItem {
  return {
    type: "collabAgentToolCall",
    id,
    tool: "spawnAgent",
    status,
    senderThreadId: "thread-1",
    receiverThreadIds,
    prompt,
    model: "gpt-5.5",
    reasoningEffort: "medium",
    agentsStates,
  } as unknown as ThreadItem;
}

function itemById(state: CodexUiState, threadId: string, itemId: string): AccumulatedThreadItem {
  const item = items(state, threadId).find((candidate) => candidate.id === itemId);
  assertNotNull(item, `expected item ${itemId}`);
  return item;
}

function runtime(state: CodexUiState, threadId: string): ThreadRuntimeSlice {
  return selectThreadRuntime(state, threadId);
}

function items(state: CodexUiState, threadId: string): AccumulatedThreadItem[] {
  return runtime(state, threadId).items;
}

function stateWithRuntime(
  state: CodexUiState,
  threadId: string,
  patch: Partial<ThreadRuntimeSlice>,
): CodexUiState {
  return {
    ...state,
    threadsRuntime: {
      ...state.threadsRuntime,
      [threadId]: {
        ...runtime(state, threadId),
        ...patch,
      },
    },
  };
}

function runtimeSlice(patch: Partial<ThreadRuntimeSlice>): ThreadRuntimeSlice {
  return {
    ...selectThreadRuntime(initialCodexUiState, null),
    ...patch,
  };
}

function agentText(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return typeof item.text === "string" ? item.text : "";
}

function reasoningContent(state: CodexUiState, threadId: string, itemId: string): string[] {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return Array.isArray(item.content)
    ? item.content.map((part) => String(part))
    : [];
}

function commandOutput(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "";
}

function commandActions(state: CodexUiState, threadId: string, itemId: string): unknown[] {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return Array.isArray(item.commandActions) ? item.commandActions : [];
}

function eventContent(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return typeof item.content === "string" ? item.content : "";
}

function eventAdditionalDetails(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId) as Record<string, unknown>;
  return typeof item.additionalDetails === "string" ? item.additionalDetails : "";
}

function threadStatus(state: CodexUiState, threadId: string): string {
  const status = rawThreadStatus(state, threadId);
  if (typeof status === "string") return status;
  if (!status || typeof status !== "object") return "";
  const record = status as Record<string, unknown>;
  return typeof record.type === "string"
    ? record.type
    : typeof record.status === "string"
      ? record.status
      : "";
}

function rawThreadStatus(state: CodexUiState, threadId: string): unknown {
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  assertNotNull(thread, `expected thread ${threadId}`);
  return thread.status;
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
