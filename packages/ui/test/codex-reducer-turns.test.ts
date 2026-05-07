import type { JsonRpcNotification, Thread, ThreadItem, UserInput } from "@hicodex/codex-protocol";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
} from "../src/state/codex-reducer";

export default function runCodexReducerTurnsTests(): void {
  startsThreadWithCollectedTurnItemsAndActiveTurn();
  startsTurnByMergingInitialItemsWithoutOverwritingExistingUserMessage();
  appendsStreamingDeltasToAgentReasoningAndCommandItems();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails();
  clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted();
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
      ] satisfies ThreadItem[],
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

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnCompletes(): void {
  assertTerminalTurnStatus("turn/completed", "idle");
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnFails(): void {
  assertTerminalTurnStatus("turn/failed", "failed");
}

function clearsActiveTurnAndUpdatesThreadStatusWhenTurnIsInterrupted(): void {
  assertTerminalTurnStatus("turn/interrupted", "interrupted");
}

function assertTerminalTurnStatus(method: string, expectedStatus: string): void {
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
        status: expectedStatus === "idle" ? "completed" : expectedStatus,
        items: [agentMessage(`${method}-agent`, `terminal ${expectedStatus}`)],
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
    expectedStatus,
    `${method} should update the thread status`,
  );
  assertEqual(
    agentText(next, "thread-1", `${method}-agent`),
    `terminal ${expectedStatus}`,
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
  return {
    id,
    status: turns.some((turn) => turn.status === "inProgress") ? "active" : "idle",
    turns,
  };
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

function itemById(state: CodexUiState, threadId: string, itemId: string): ThreadItem {
  const item = state.itemsByThread[threadId]?.find((candidate) => candidate.id === itemId);
  assertNotNull(item, `expected item ${itemId}`);
  return item;
}

function agentText(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId);
  return typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : "";
}

function reasoningContent(state: CodexUiState, threadId: string, itemId: string): string[] {
  const item = itemById(state, threadId, itemId);
  return Array.isArray((item as { content?: unknown }).content)
    ? ((item as { content: string[] }).content)
    : [];
}

function commandOutput(state: CodexUiState, threadId: string, itemId: string): string {
  const item = itemById(state, threadId, itemId);
  return typeof (item as { aggregatedOutput?: unknown }).aggregatedOutput === "string"
    ? (item as { aggregatedOutput: string }).aggregatedOutput
    : "";
}

function threadStatus(state: CodexUiState, threadId: string): string {
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  assertNotNull(thread, `expected thread ${threadId}`);
  const status = thread.status;
  if (typeof status === "string") return status;
  if (!status || typeof status !== "object") return "";
  const record = status as Record<string, unknown>;
  return typeof record.type === "string"
    ? record.type
    : typeof record.status === "string"
      ? record.status
      : "";
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
