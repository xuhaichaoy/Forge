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
  startsThreadWithCollectedTurnItemsAndActiveTurn();
  startsTurnByMergingInitialItemsWithoutOverwritingExistingUserMessage();
  upsertsExistingThreadWithoutMovingItToTheTop();
  upsertingRunningThreadSnapshotPreservesStreamingItems();
  appendsStreamingDeltasToAgentReasoningAndCommandItems();
  normalizesThreadStatusChangedNotifications();
  surfacesTerminalErrorNotificationsInTheTranscript();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails();
  turnsFailedTurnErrorsIntoStreamErrorItems();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted();
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

function reduceNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  return codexUiReducer(state, { type: "notification", message });
}

function threadWithTurns(
  id: string,
  turns: Array<{ id: string; status: unknown; items: ThreadItem[] }>,
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

function turnFixture(turn: { id: string; status: unknown; items: ThreadItem[] }): Thread["turns"][number] {
  return {
    id: turn.id,
    items: turn.items as Thread["turns"][number]["items"],
    itemsView: "full",
    status: turnStatusFixture(turn.status),
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
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
