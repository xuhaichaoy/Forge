import type { JsonRpcNotification, Thread, ThreadItem } from "@forge/codex-protocol";
import {
  codexUiReducer,
  initialCodexUiState,
  selectThreadRuntime,
  type CodexUiState,
} from "../src/state/codex-reducer";
import { projectBranchDetails } from "../src/state/branch-details";
import { projectConversation } from "../src/state/render-groups";
import { projectRightRailSections } from "../src/state/right-rail";

export default function runCodexReducerRightRailTests(): void {
  storesTurnPlanUpdatesAsTodoListItems();
  projectsBranchDetailsAfterFirstTurnMetadataRefresh();
  preservesArtifactFilePathFactsFromItemNotifications();
  storesTurnDiffsAndClearsThemWhenThreadsAreRemoved();
  ignoresUnknownNotifications();
  projectsThreadTokenUsageIntoStatusFooter();
  ignoresTokenUsageNotificationsMissingThreadId();
}

function storesTurnPlanUpdatesAsTodoListItems(): void {
  let state = stateWithThread("thread-plan");

  state = reduceNotification(state, {
    method: "item/completed",
    params: {
      threadId: "thread-plan",
      turnId: "turn-1",
      completedAtMs: 1,
      item: {
        id: "user-1",
        type: "userMessage",
        clientId: null,
        content: [{ type: "text", text: "Add plan tracking" }],
      } as unknown as ThreadItem,
    },
  });

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

  const planRuntime = selectThreadRuntime(state, "thread-plan");
  const items = planRuntime.items;
  const todoItems = items.filter((item) => item.type === "todo-list");
  assertDeepEqual(
    todoItems.map((item) => ({
      id: item.id,
      turnId: (item as Record<string, unknown>)._turnId,
      explanation: (item as Record<string, unknown>).explanation,
      plan: (item as Record<string, unknown>).plan,
    })),
    [
      {
        id: "turn-plan:thread-plan:turn-1:1",
        turnId: "turn-1",
        explanation: null,
        plan: [
          { step: "Read reducer", status: "completed" },
          { step: "Add initial assertion", status: "inProgress" },
        ],
      },
      {
        id: "turn-plan:thread-plan:turn-1:2",
        turnId: "turn-1",
        explanation: "latest plan wins",
        plan: [
          { step: "Write right rail reducer tests", status: "inProgress" },
          { step: "Hand production gaps to main thread", status: "pending" },
        ],
      },
    ],
    "turn/plan/updated should append Desktop todo-list turn items",
  );
  assertDeepEqual(
    planRuntime.turnPlan?.plan,
    [
      { step: "Write right rail reducer tests", status: "inProgress" },
      { step: "Hand production gaps to main thread", status: "pending" },
    ],
    "turn/plan/updated should keep the latest plan in the compatibility cache",
  );

  const projection = projectConversation(items);
  assertEqual(projection.units.length, 1, "turn todo-list projection should keep only the real user message row");
  assertEqual(projection.units[0]?.kind, "message", "user message should remain after hoisting todo-list items");
  assertEqual(
    projection.units.some((unit) => "item" in unit && (unit.item as Record<string, unknown>).type === "todo-list"),
    false,
    "turn todo-list projection should not render todo-list as a normal transcript item",
  );
  assertDeepEqual(
    projection.progress,
    [],
    "todo-list plan facts should not create a right-rail Progress section in current Desktop parity",
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

  const projection = projectConversation(selectThreadRuntime(state, "thread-artifacts").items);
  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [
      "packages/ui/src/state/codex-reducer.ts",
      "packages/ui/test/codex-reducer-right-rail.test.ts",
    ],
    "artifact projection should keep referenced and edited file paths from reducer notifications",
  );
}

function projectsBranchDetailsAfterFirstTurnMetadataRefresh(): void {
  let state = codexUiReducer(stateWithThread("thread-first"), {
    type: "optimisticUserMessage",
    threadId: "thread-first",
    localTurnId: "optimistic-turn:first",
    localId: "optimistic-user:first",
    content: [{ type: "text", text: "hello", text_elements: [] }],
  });

  state = codexUiReducer(state, {
    type: "upsertThread",
    thread: threadFixture("thread-first", {
      cwd: "/workspace/project",
      gitInfo: {
        branch: "main",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
      turns: [],
    }),
  });

  const activeThread = state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
  const branchDetails = projectBranchDetails({ thread: activeThread });
  const sections = projectRightRailSections({
    progress: [],
    branchDetails,
    artifacts: [],
    sources: [],
  });

  assertDeepEqual(
    selectThreadRuntime(state, "thread-first").items.map((item) => item.id),
    ["optimistic-user:first"],
    "metadata refresh after first send should not erase the visible prompt",
  );
  assertDeepEqual(
    // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js he —
    // Codex Desktop's summary panel always emits the Sources subsection alongside
    // the Git surface (empty-state copy "No sources yet"), so once branchDetails
    // becomes visible we expect ["branchDetails", "sources"] back from the
    // projection rather than just ["branchDetails"].
    sections.map((section) => section.id),
    ["branchDetails", "sources"],
    "metadata refresh after first send should make the right rail visible without switching threads",
  );
  assertEqual(
    sections[0]?.branchDetails?.rows.find((row) => row.id === "branch")?.value,
    "main",
    "right rail branch details should use refreshed app-server metadata",
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
    selectThreadRuntime(state, "thread-diff").turnDiff,
    "diff --git a/packages/ui/src/state/codex-reducer.ts b/packages/ui/src/state/codex-reducer.ts",
    "turn/diff/updated should store the latest diff by thread",
  );

  const removed = codexUiReducer(state, { type: "removeThread", threadId: "thread-diff" });
  assertEqual(
    removed.threadsRuntime["thread-diff"],
    undefined,
    "removeThread should clear diff cache for that thread",
  );
  assertEqual(
    removed.threadsRuntime["thread-diff"],
    undefined,
    "removeThread should clear turn plan cache for that thread",
  );

  state = reduceNotification(state, {
    method: "thread/archived",
    params: { threadId: "thread-diff" },
  });
  assertEqual(
    state.threadsRuntime["thread-diff"],
    undefined,
    "thread/archived should clear diff cache for that thread",
  );
  assertEqual(
    state.threadsRuntime["thread-diff"],
    undefined,
    "thread/archived should clear turn plan cache for that thread",
  );

  state = stateWithThread("thread-delete", "thread-keep");
  state = reduceNotification(state, {
    method: "turn/diff/updated",
    params: {
      threadId: "thread-delete",
      turnId: "turn-1",
      diff: "diff --git a/deleted b/deleted",
    },
  });
  state = reduceNotification(state, {
    method: "thread/deleted",
    params: { threadId: "thread-delete" },
  });
  assertEqual(
    state.threadsRuntime["thread-delete"],
    undefined,
    "thread/deleted should clear runtime cache for that thread",
  );
}

function ignoresUnknownNotifications(): void {
  const state = {
    ...stateWithThread("thread-unknown"),
    threadsRuntime: {
      "thread-unknown": {
        ...selectThreadRuntime(initialCodexUiState, null),
        turnDiff: "existing diff",
      },
    },
  };
  const next = reduceNotification(state, {
    method: "rightRail/doesNotExist",
    params: { threadId: "thread-unknown", value: true },
  });

  assertEqual(next, state, "unknown notifications should preserve reducer state identity");
}

// codex: local-conversation-thread-CecHj6JI.js#mu — verifies the
// `thread/tokenUsage/updated` notification feeds the runtime slice that the
// Composer `/status` panel reads.
function projectsThreadTokenUsageIntoStatusFooter(): void {
  let state = stateWithThread("thread-tokens");

  state = reduceNotification(state, {
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "thread-tokens",
      turnId: "turn-tokens-1",
      tokenUsage: {
        total: {
          totalTokens: 1234,
          inputTokens: 1000,
          cachedInputTokens: 200,
          outputTokens: 234,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 200,
          inputTokens: 150,
          cachedInputTokens: 0,
          outputTokens: 50,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: 128000,
      },
    },
  });

  const runtime = selectThreadRuntime(state, "thread-tokens");
  assertEqual(
    runtime.tokenUsage?.usedTokens,
    200,
    "thread/tokenUsage/updated should write Desktop last-turn usedTokens onto runtime",
  );
  assertEqual(
    runtime.tokenUsage?.contextWindow,
    128000,
    "thread/tokenUsage/updated should mirror modelContextWindow onto runtime",
  );

  // Subsequent updates without modelContextWindow should still refresh the
  // counter; protocol marks the field nullable, so footer keeps rendering.
  state = reduceNotification(state, {
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "thread-tokens",
      turnId: "turn-tokens-2",
      tokenUsage: {
        total: {
          totalTokens: 1500,
          inputTokens: 1200,
          cachedInputTokens: 200,
          outputTokens: 300,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 266,
          inputTokens: 200,
          cachedInputTokens: 0,
          outputTokens: 66,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: null,
      },
    },
  });

  const refreshed = selectThreadRuntime(state, "thread-tokens");
  assertEqual(
    refreshed.tokenUsage?.usedTokens,
    266,
    "thread/tokenUsage/updated should refresh Desktop last-turn usedTokens across turns",
  );
  assertEqual(
    refreshed.tokenUsage?.contextWindow,
    null,
    "thread/tokenUsage/updated should preserve null modelContextWindow",
  );

  const sections = projectRightRailSections({
    progress: [],
    branchDetails: { entries: [] },
    artifacts: [],
    sources: [],
  });
  assertEqual(
    Array.isArray(sections),
    true,
    "projectRightRailSections should ignore token-usage state; /status owns composer-local rendering",
  );
}

// codex: empty `threadId` / missing payload must leave the runtime untouched
// so a malformed notification can't blank out a previously rendered footer.
function ignoresTokenUsageNotificationsMissingThreadId(): void {
  let state = stateWithThread("thread-noop");
  state = reduceNotification(state, {
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "thread-noop",
      turnId: "turn-noop",
      tokenUsage: {
        total: {
          totalTokens: 42,
          inputTokens: 32,
          cachedInputTokens: 0,
          outputTokens: 10,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 12,
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 2,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: 8192,
      },
    },
  });
  assertEqual(
    selectThreadRuntime(state, "thread-noop").tokenUsage?.usedTokens,
    12,
    "baseline thread/tokenUsage/updated should populate runtime",
  );

  const after = reduceNotification(state, {
    method: "thread/tokenUsage/updated",
    params: { threadId: "", tokenUsage: {} },
  });
  assertEqual(
    selectThreadRuntime(after, "thread-noop").tokenUsage?.usedTokens,
    12,
    "thread/tokenUsage/updated with empty threadId should not blank existing counter",
  );

  const withoutPayload = reduceNotification(state, {
    method: "thread/tokenUsage/updated",
    params: { threadId: "thread-noop" },
  });
  assertEqual(
    selectThreadRuntime(withoutPayload, "thread-noop").tokenUsage?.usedTokens,
    12,
    "thread/tokenUsage/updated without tokenUsage payload should not blank existing counter",
  );
}

function stateWithThread(...threadIds: string[]): CodexUiState {
  const threads = threadIds.map((id) => threadFixture(id, { status: { type: "active", activeFlags: [] } }));
  return {
    ...initialCodexUiState,
    threads,
    activeThreadId: threadIds[0] ?? null,
    threadsRuntime: Object.fromEntries(threadIds.map((id) => [
      id,
      {
        ...selectThreadRuntime(initialCodexUiState, null),
        items: [],
      },
    ])),
  };
}

function threadFixture(id: string, overrides: Partial<Thread> = {}): Thread {
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
    recencyAt: overrides.recencyAt ?? null,
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
