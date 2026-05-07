import type { JsonRpcNotification, Thread, ThreadItem } from "@hicodex/codex-protocol";
import {
  codexUiReducer,
  initialCodexUiState,
  type CodexUiState,
} from "../src/state/codex-reducer";
import { projectConversation } from "../src/state/render-groups";

export default function runCodexReducerRightRailTests(): void {
  storesLatestTurnPlanAsProjectionFact();
  preservesArtifactFilePathFactsFromItemNotifications();
  storesTurnDiffsAndClearsThemWhenThreadsAreRemoved();
  ignoresUnknownNotifications();
}

function storesLatestTurnPlanAsProjectionFact(): void {
  let state = stateWithThread("thread-plan");

  state = reduceNotification(state, {
    method: "turn/plan/updated",
    params: {
      threadId: "thread-plan",
      turnId: "turn-1",
      explanation: null,
      plan: [
        { step: "Read reducer", status: "completed" },
        { step: "Add initial assertion", status: "inProgress" },
      ],
    },
  });

  state = reduceNotification(state, {
    method: "turn/plan/updated",
    params: {
      threadId: "thread-plan",
      turnId: "turn-1",
      explanation: "latest plan wins",
      plan: [
        { step: "Write right rail reducer tests", status: "inProgress" },
        { step: "Hand production gaps to main thread", status: "pending" },
      ],
    },
  });

  const items = state.itemsByThread["thread-plan"] ?? [];
  assertEqual(
    items.some((item) => item.type === "todo-list"),
    false,
    "turn/plan/updated should not add synthetic todo-list items to server item facts",
  );
  assertDeepEqual(
    state.turnPlansByThread["thread-plan"]?.plan,
    [
      { step: "Write right rail reducer tests", status: "inProgress" },
      { step: "Hand production gaps to main thread", status: "pending" },
    ],
    "turn/plan/updated should store the latest plan as projection facts",
  );

  const projection = projectConversation(items, { progressPlan: state.turnPlansByThread["thread-plan"] });
  assertDeepEqual(
    projection.progress.map((entry) => ({ title: entry.title, status: entry.status })),
    [
      { title: "Write right rail reducer tests", status: "inProgress" },
      { title: "Hand production gaps to main thread", status: "pending" },
    ],
    "progress should read the latest turn plan from reducer-managed projection facts",
  );
}

function preservesArtifactFilePathFactsFromItemNotifications(): void {
  let state = stateWithThread("thread-artifacts");

  state = reduceNotification(state, {
    method: "item/completed",
    params: {
      threadId: "thread-artifacts",
      turnId: "turn-1",
      completedAtMs: 1,
      item: {
        type: "agentMessage",
        id: "agent-artifact",
        text:
          "Referenced `packages/ui/src/state/codex-reducer.ts` and " +
          "[right rail test](packages/ui/test/codex-reducer-right-rail.test.ts).",
        phase: null,
        memoryCitation: null,
      } satisfies ThreadItem,
    },
  });

  state = reduceNotification(state, {
    method: "item/completed",
    params: {
      threadId: "thread-artifacts",
      turnId: "turn-1",
      completedAtMs: 2,
      item: {
        type: "fileChange",
        id: "file-change-artifact",
        status: "completed",
        changes: [
          { path: "packages/ui/src/state/codex-reducer.ts", kind: { type: "update", move_path: null }, diff: "" },
          { path: "packages/ui/test/codex-reducer-right-rail.test.ts", kind: { type: "add" }, diff: "" },
        ],
      } satisfies ThreadItem,
    },
  });

  const projection = projectConversation(state.itemsByThread["thread-artifacts"] ?? []);
  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [
      "packages/ui/src/state/codex-reducer.ts",
      "packages/ui/test/codex-reducer-right-rail.test.ts",
    ],
    "artifact projection should keep referenced and edited file paths from reducer notifications",
  );
}

function storesTurnDiffsAndClearsThemWhenThreadsAreRemoved(): void {
  let state = stateWithThread("thread-diff", "thread-keep");
  state = reduceNotification(state, {
    method: "turn/plan/updated",
    params: {
      threadId: "thread-diff",
      turnId: "turn-1",
      plan: [{ step: "Plan before removal", status: "inProgress" }],
    },
  });

  state = reduceNotification(state, {
    method: "turn/diff/updated",
    params: {
      threadId: "thread-diff",
      turnId: "turn-1",
      diff: "diff --git a/packages/ui/src/state/codex-reducer.ts b/packages/ui/src/state/codex-reducer.ts",
    },
  });
  assertEqual(
    state.turnDiffsByThread["thread-diff"],
    "diff --git a/packages/ui/src/state/codex-reducer.ts b/packages/ui/src/state/codex-reducer.ts",
    "turn/diff/updated should store the latest diff by thread",
  );

  const removed = codexUiReducer(state, { type: "removeThread", threadId: "thread-diff" });
  assertEqual(
    removed.turnDiffsByThread["thread-diff"],
    undefined,
    "removeThread should clear diff cache for that thread",
  );
  assertEqual(
    removed.turnPlansByThread["thread-diff"],
    undefined,
    "removeThread should clear turn plan cache for that thread",
  );

  state = reduceNotification(state, {
    method: "thread/archived",
    params: { threadId: "thread-diff" },
  });
  assertEqual(
    state.turnDiffsByThread["thread-diff"],
    undefined,
    "thread/archived should clear diff cache for that thread",
  );
  assertEqual(
    state.turnPlansByThread["thread-diff"],
    undefined,
    "thread/archived should clear turn plan cache for that thread",
  );
}

function ignoresUnknownNotifications(): void {
  const state = {
    ...stateWithThread("thread-unknown"),
    turnDiffsByThread: { "thread-unknown": "existing diff" },
  };
  const next = reduceNotification(state, {
    method: "rightRail/doesNotExist",
    params: { threadId: "thread-unknown", value: true },
  });

  assertEqual(next, state, "unknown notifications should preserve reducer state identity");
}

function stateWithThread(...threadIds: string[]): CodexUiState {
  const threads = threadIds.map((id) => threadFixture(id, { status: { type: "active", activeFlags: [] } }));
  return {
    ...initialCodexUiState,
    threads,
    activeThreadId: threadIds[0] ?? null,
    itemsByThread: Object.fromEntries(threadIds.map((id) => [id, []])),
  };
}

function threadFixture(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    forkedFromId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: { type: "idle" },
    path: null,
    cwd: "",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...overrides,
  };
}

function reduceNotification(state: CodexUiState, message: JsonRpcNotification): CodexUiState {
  return codexUiReducer(state, { type: "notification", message });
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
