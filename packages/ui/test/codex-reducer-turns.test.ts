import type { JsonRpcNotification, Thread, ThreadItem, UserInput } from "@hicodex/codex-protocol";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
} from "../src/state/codex-reducer";
import type { AccumulatedThreadItem } from "../src/state/render-groups";

export default function runCodexReducerTurnsTests(): void {
  refreshThreadListPreservesDraftNewThreadState();
  refreshThreadListDoesNotKeepMissingActiveThread();
  dedupesServerRequestsByRequestId();
  tracksLatestCollaborationModeByThread();
  startsThreadWithCollectedTurnItemsAndActiveTurn();
  threadStartedWithoutVisibleItemsPreservesOptimisticFirstPrompt();
  projectsTurnTimingAsWorkedForItems();
  delaysWorkedForProjectionUntilTurnItemsExist();
  repositionsExplicitWorkedForItemsFromThreadSnapshots();
  startsTurnByMergingInitialItemsWithoutOverwritingExistingUserMessage();
  upsertsExistingThreadWithoutMovingItToTheTop();
  upsertingRunningThreadSnapshotPreservesStreamingItems();
  appendsStreamingDeltasToAgentReasoningAndCommandItems();
  preservesItemLifecycleTimestampsFromProtocolNotifications();
  completingTurnProjectsTurnTimingAsWorkedForItem();
  completingTurnPreservesLongerAccumulatedAgentText();
  normalizesThreadStatusChangedNotifications();
  surfacesTerminalErrorNotificationsInTheTranscript();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails();
  turnsFailedTurnErrorsIntoStreamErrorItems();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted();
  keepsLateUserMessageInsideItsOriginatingTurnSegment();
  optimisticUserMessageStaysAboveErrorAndIsReconciledByItemCompleted();
  bindOptimisticTurnRewritesItemsAndDropsPendingPlaceholder();
  optimisticUserMessageWithThreeFailingTurnsKeepsExpectedOrder();
  upsertingThreadSnapshotDropsDuplicateOptimisticUserMessage();
  redispatchingTheSameOptimisticUserMessageIsIdempotent();
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
    state.latestCollaborationModesByThread,
    { "thread-1": planMode },
    "latest collaboration mode should be stored per thread",
  );

  const removedThread = codexUiReducer(state, { type: "removeThread", threadId: "thread-1" });
  assertDeepEqual(
    removedThread.latestCollaborationModesByThread,
    {},
    "removing a thread should clear its latest collaboration mode",
  );

  const cleared = codexUiReducer(state, {
    type: "setLatestCollaborationMode",
    threadId: "thread-1",
    collaborationMode: null,
  });
  assertDeepEqual(
    cleared.latestCollaborationModesByThread,
    {},
    "default collaboration mode should clear the per-thread latest override",
  );
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
    activeTurnIdsByThread: { "thread-1": "turn-1" },
    itemsByThread: {
      "thread-1": [localUser, streamedAgent],
    },
  };

  const staleSnapshot = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "inProgress",
      startedAt: 1,
      items: [
        userMessage("user-1", "Server replay"),
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
  assertDeepEqual(
    (next.itemsByThread["thread-1"] ?? []).map((item) => item.id),
    ["user-1", "worked-for:turn-1", "agent-1"],
    "reading a running thread snapshot should keep worked-for before the assistant message like Codex Desktop",
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
    state.activeTurnIdsByThread["thread-1"],
    "turn-2",
    "thread/started should track the in-progress turn id",
  );
  assertDeepEqual(
    state.itemsByThread["thread-1"]?.map((item) => item.id),
    ["user-1", "agent-1", "reasoning-1"],
    "thread/started should collect items from all thread turns in order",
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
    state.itemsByThread["thread-1"]?.map((item) => item.id),
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
    started.itemsByThread["thread-1"]?.map((item) => item.id),
    ["optimistic-user:first"],
    "the first optimistic prompt should remain visible after the real turn starts",
  );
  assertEqual(
    (started.itemsByThread["thread-1"]?.[0] as Record<string, unknown>)?._turnId,
    "turn-1",
    "the preserved optimistic prompt should bind to the real first turn",
  );
}

function projectsTurnTimingAsWorkedForItems(): void {
  const thread = threadWithTurns("thread-1", [
    {
      id: "turn-1",
      status: "completed",
      startedAt: 1,
      completedAt: 66,
      durationMs: 65_000,
      items: [agentMessage("agent-1", "Done.")],
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
    started.itemsByThread["thread-1"]?.map((item) => item.id),
    [],
    "turn/started should not put an empty worked-for row before user and assistant items",
  );

  const withItems = [
    ["item/started", { threadId: "thread-1", turnId: "turn-1", item: userMessage("user-1", "Hello") }],
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
        items: [userMessage("user-1", "Server replay"), agentMessage("agent-1", "Hi")],
        startedAt: 1,
        completedAt: 6,
        durationMs: 5_000,
      },
    },
  });

  assertDeepEqual(
    completed.itemsByThread["thread-1"]?.map((item) => item.id),
    ["user-1", "worked-for:turn-1", "agent-1"],
    "terminal turn snapshot should place worked-for between the user and assistant items",
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
    state.itemsByThread["thread-1"]?.map((item) => item.id),
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
    itemsByThread: { "thread-1": [existingUser] },
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
    next.activeTurnIdsByThread["thread-1"],
    "turn-1",
    "turn/started should set the active turn id",
  );
}

function appendsStreamingDeltasToAgentReasoningAndCommandItems(): void {
  const baseState = {
    ...initialCodexUiState,
    activeThreadId: "thread-1",
    itemsByThread: {
      "thread-1": [
        agentMessage("agent-1", "Hello"),
        { type: "reasoning", id: "reasoning-1", summary: [], content: ["Think"] },
        {
          type: "commandExecution",
          id: "command-1",
          command: "npm test",
          aggregatedOutput: "first",
        },
      ] satisfies AccumulatedThreadItem[],
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

function completingTurnProjectsTurnTimingAsWorkedForItem(): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    activeTurnIdsByThread: { "thread-1": "turn-1" },
  };

  const next = reduceNotification(state, {
    method: "turn/completed",
    params: {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        threadId: "thread-1",
        status: "completed",
        items: [agentMessage("agent-1", "Done.")],
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

function completingTurnPreservesLongerAccumulatedAgentText(): void {
  const accumulatedText = "让我更广泛地搜索 latest-turn-preview，不在 src-tauri 限制内：";
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    activeTurnIdsByThread: { "thread-1": "turn-1" },
    itemsByThread: {
      "thread-1": [agentMessage("agent-1", accumulatedText)],
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
  assertEqual(next.activeTurnIdsByThread["thread-1"], undefined, "turn/completed should still clear the active turn");
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
    activeTurnIdsByThread: { "thread-1": "turn-1" },
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
    activeTurnIdsByThread: { "thread-1": "turn-1" },
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

  assertEqual(next.activeTurnIdsByThread["thread-1"], undefined, "failed error turn should clear active turn");
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
  // so within each turn it sits after wf/error. The regression we are fixing
  // is that user-N must NOT spill out of its turn segment into the global tail.
  const ids = (state.itemsByThread["thread-1"] ?? []).map((item) => item.id);
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
    const nextTurnHead = ids.indexOf(`worked-for:turn-${Number(suffix) + 1}`);
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
    (optimistic.itemsByThread["thread-1"] ?? []).map((item) => item.id),
    ["optimistic-user:abc"],
    "optimisticUserMessage should insert a placeholder item immediately",
  );
  assertDeepEqual(
    optimistic.pendingOptimisticTurnsByThread["thread-1"] ?? [],
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
    turnStarted.turnOrderByThread["thread-1"] ?? [],
    ["turn-1"],
    "turn/started should rewrite the placeholder turn id to the real turn id",
  );
  const placeholderTurnId = (turnStarted.itemsByThread["thread-1"]?.[0] as Record<string, unknown>)?._turnId;
  assertEqual(
    placeholderTurnId,
    "turn-1",
    "after binding, the optimistic item should now reference the real turn id",
  );
  assertDeepEqual(
    turnStarted.pendingOptimisticTurnsByThread["thread-1"] ?? [],
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
    (errored.itemsByThread["thread-1"] ?? []).map((item) => item.id),
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
  const finalIds = (completed.itemsByThread["thread-1"] ?? []).map((item) => item.id);
  assertDeepEqual(
    finalIds,
    ["real-user-1", "stream-error:turn-1"],
    "item/completed userMessage should replace the optimistic placeholder by content match",
  );
  const reconciledItem = completed.itemsByThread["thread-1"]?.[0] as Record<string, unknown> | undefined;
  assertEqual(
    reconciledItem?._localId,
    undefined,
    "reconciliation should clear the _localId placeholder marker",
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

  const ids = (state.itemsByThread["thread-1"] ?? []).map((item) => item.id);
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
    state.pendingOptimisticTurnsByThread["thread-1"] ?? [],
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
    bound.turnOrderByThread["thread-1"] ?? [],
    ["turn-real"],
    "bindOptimisticTurn should replace the local turn id in the order list",
  );
  const reboundTurnId = (bound.itemsByThread["thread-1"]?.[0] as Record<string, unknown>)?._turnId;
  assertEqual(
    reboundTurnId,
    "turn-real",
    "bindOptimisticTurn should rewrite items _turnId from local to real",
  );
  assertDeepEqual(
    bound.pendingOptimisticTurnsByThread["thread-1"] ?? [],
    [],
    "bindOptimisticTurn should drain the pending queue",
  );
}

function assertTerminalTurnStatus(method: string, turnStatusValue: string, expectedThreadStatus: string): void {
  const state = {
    ...initialCodexUiState,
    threads: [threadWithTurns("thread-1", [{ id: "turn-1", status: "inProgress", items: [] }])],
    activeThreadId: "thread-1",
    activeTurnIdsByThread: { "thread-1": "turn-1" },
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
    next.activeTurnIdsByThread["thread-1"],
    undefined,
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
    { ...optimistic, activeTurnIdsByThread: { "thread-1": "turn-1" } },
    { type: "upsertThread", thread: snapshotThread, select: true },
  );

  const ids = (refreshed.itemsByThread["thread-1"] ?? []).map((item) => item.id);
  if (ids.includes("optimistic-user:dup")) {
    throw new Error(
      `thread snapshot merge must drop the optimistic placeholder when the server-confirmed userMessage carries the same text: got ${JSON.stringify(ids)}`,
    );
  }
  if (!ids.includes("real-user-1")) {
    throw new Error(`expected the snapshot's real userMessage to be present: got ${JSON.stringify(ids)}`);
  }
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

  const ids = (state.itemsByThread["thread-1"] ?? []).map((item) => item.id);
  assertDeepEqual(
    ids,
    ["optimistic-user:once"],
    "redispatching the same content while a placeholder is still pending must be a no-op so quick double-clicks cannot multiply user bubbles",
  );
}

function reduceNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  return codexUiReducer(state, { type: "notification", message });
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
    forkedFromId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: turns.some((turn) => turn.status === "inProgress")
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
  return status === "completed" || status === "interrupted" || status === "failed" || status === "inProgress"
    ? status
    : "completed";
}

function userMessage(id: string, text: string): ThreadItem {
  return {
    type: "userMessage",
    id,
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

function agentMessage(id: string, text: string): ThreadItem {
  return {
    type: "agentMessage",
    id,
    text,
    phase: null,
    memoryCitation: null,
  };
}

function itemById(state: CodexUiState, threadId: string, itemId: string): AccumulatedThreadItem {
  const item = state.itemsByThread[threadId]?.find((candidate) => candidate.id === itemId);
  assertNotNull(item, `expected item ${itemId}`);
  return item;
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
