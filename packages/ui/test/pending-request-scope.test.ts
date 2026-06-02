import type { PendingServerRequest } from "../src/state/codex-reducer";
import {
  deriveActivePendingRequests,
  deriveBackgroundPendingRequests,
  deriveComposerPendingRequests,
  pendingRequestOwnerThreadId,
  pendingRequestAwaitingKind,
  pendingRequestScope,
  summarizePendingRequestAwaitingByThread,
} from "../src/state/pending-request-scope";

export default function runPendingRequestScopeTests(): void {
  extractsScopeFromParamsAndPayload();
  filtersActivePendingRequestsByThreadAndTurn();
  matchesItemOnlyRequestsAgainstActiveThreadItems();
  ordersActivePendingRequestsLikeComposerModes();
  surfacesOnlyDesktopChildApprovalBeforeActiveThreadRequests();
  derivesBackgroundPendingRequestsForStopAllTargets();
  classifiesMcpAndDynamicToolRequestsForAwaitingState();
  summarizesAwaitingStateByThread();
  attributesItemOnlyAwaitingStateWhenItemsAreIndexedByThread();
}

function extractsScopeFromParamsAndPayload(): void {
  assertDeepEqual(
    pendingRequestScope(request("param-scope", "item/tool/requestUserInput", {
      thread_id: " thread-1 ",
      turnId: "turn-1",
      item: { id: "item-1" },
    })),
    {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      hasScope: true,
    },
    "scope should read camel, snake, and nested item ids from params",
  );

  assertDeepEqual(
    pendingRequestScope(request("payload-scope", "mcpServer/elicitation/request", {
      message: "Need a choice",
    }, {
      context: { threadId: "thread-2" },
      turn_id: "turn-2",
      item_id: "item-2",
    })),
    {
      threadId: "thread-2",
      turnId: "turn-2",
      itemId: "item-2",
      hasScope: true,
    },
    "scope should fall back to the request payload when params do not carry scope",
  );

  assertDeepEqual(
    pendingRequestScope(request("unscoped", "item/tool/requestUserInput", {
      message: "No thread facts here",
    })),
    {
      threadId: null,
      turnId: null,
      itemId: null,
      hasScope: false,
    },
    "requests without thread, turn, or item ids should stay unscoped",
  );
}

function filtersActivePendingRequestsByThreadAndTurn(): void {
  const requests = [
    request("active-turn", "item/commandExecution/requestApproval", { threadId: "thread-1", turnId: "turn-1" }),
    request("active-thread", "item/tool/requestUserInput", { threadId: "thread-1" }),
    request("wrong-turn", "item/tool/requestUserInput", { threadId: "thread-1", turnId: "turn-2" }),
    request("wrong-thread", "item/tool/requestUserInput", { threadId: "thread-2" }),
    request("unscoped", "mcpServer/elicitation/request", { message: "Global modal" }),
    request("item-only", "item/tool/requestUserInput", { itemId: "item-1" }),
    request("turn-only", "item/tool/requestUserInput", { turnId: "turn-1" }),
  ];

  assertDeepEqual(
    deriveActivePendingRequests(requests, { activeThreadId: "thread-1", activeTurnId: "turn-1" }).map(requestId),
    ["active-turn", "active-thread", "unscoped", "turn-only"],
    "active filtering should keep unscoped requests and requests matching active thread or turn",
  );

  assertDeepEqual(
    deriveActivePendingRequests(requests, { threadId: "thread-1", turnId: null }).map(requestId),
    ["active-thread", "unscoped"],
    "turn-scoped requests should not show when there is no matching active turn",
  );
}

function matchesItemOnlyRequestsAgainstActiveThreadItems(): void {
  const requests = [
    request("active-item", "item/tool/requestUserInput", { itemId: "item-1" }),
    request("wrong-item", "item/tool/requestUserInput", { itemId: "item-2" }),
    request("unscoped", "mcpServer/elicitation/request", { message: "Global modal" }),
  ];

  assertDeepEqual(
    deriveActivePendingRequests(requests, {
      activeThreadId: "thread-1",
      activeTurnId: "turn-1",
      activeItemIds: ["item-1"],
    }).map(requestId),
    ["active-item", "unscoped"],
    "item-only requests should show only when the active transcript contains the scoped item",
  );

  assertDeepEqual(
    deriveActivePendingRequests(requests, {
      activeThreadId: "thread-1",
      activeTurnId: "turn-1",
    }).map(requestId),
    ["unscoped"],
    "item-only requests should stay hidden when the active item index is unavailable",
  );
}

function ordersActivePendingRequestsLikeComposerModes(): void {
  const requests = [
    request("input-newer", "item/tool/requestUserInput", { threadId: "thread-1" }, undefined, 30),
    request("approval", "item/permissions/requestApproval", { threadId: "thread-1" }, undefined, 40),
    request("tool-call", "item/tool/call", { threadId: "thread-1" }, undefined, 10),
    request("input-older", "mcpServer/elicitation/request", { threadId: "thread-1" }, undefined, 20),
    request("approval", "item/commandExecution/requestApproval", { threadId: "thread-1" }, undefined, 50),
  ];

  assertDeepEqual(
    deriveActivePendingRequests(requests, { activeThreadId: "thread-1" }).map(requestId),
    ["approval", "input-older", "input-newer", "tool-call"],
    "active pending requests should dedupe by id, show approval first, then user response requests by age",
  );
}

function surfacesOnlyDesktopChildApprovalBeforeActiveThreadRequests(): void {
  const requests = [
    request("active-approval", "item/permissions/requestApproval", { threadId: "thread-1" }, undefined, 40),
    request("child-input-newer", "item/tool/requestUserInput", { threadId: "child-1" }, undefined, 30),
    request("child-item-only", "mcpServer/elicitation/request", { itemId: "child-item" }, undefined, 20),
    request("second-child-approval", "item/commandExecution/requestApproval", { threadId: "child-2" }, undefined, 10),
    request("wrong-child", "item/tool/requestUserInput", { threadId: "child-3" }, undefined, 5),
    request("unscoped", "item/tool/requestUserInput", { message: "Global" }, undefined, 50),
  ];

  assertDeepEqual(
    deriveComposerPendingRequests(requests, {
      activeThreadId: "thread-1",
      backgroundThreadIds: ["child-1", "child-2"],
      itemsByThread: {
        "child-1": [{ id: "child-item" }],
      },
    }).map(requestId),
    ["second-child-approval", "active-approval", "unscoped"],
    "composer pending requests should promote only Desktop child approvals before active-thread request panels",
  );
}

function derivesBackgroundPendingRequestsForStopAllTargets(): void {
  const requests = [
    request("active-thread", "item/tool/requestUserInput", { threadId: "thread-1" }, undefined, 50),
    request("child-2-approval", "item/permissions/requestApproval", { threadId: "child-2" }, undefined, 40),
    request("child-1-item", "item/tool/requestUserInput", { itemId: "child-item" }, undefined, 10),
    request("child-1-input", "mcpServer/elicitation/request", { threadId: "child-1" }, undefined, 20),
    request("wrong-child", "item/tool/requestUserInput", { threadId: "child-3" }, undefined, 30),
    request("unscoped", "item/tool/requestUserInput", { message: "Global" }, undefined, 60),
    request("child-1-input", "item/commandExecution/requestApproval", { threadId: "child-1" }, undefined, 70),
  ];

  const backgroundRequests = deriveBackgroundPendingRequests(requests, {
    activeThreadId: "thread-1",
    backgroundThreadIds: ["child-1", "child-2", "thread-1"],
    itemsByThread: {
      "child-1": [{ id: "child-item" }],
    },
  });

  assertDeepEqual(
    backgroundRequests.map(requestId),
    ["child-1-input", "child-1-item", "child-2-approval"],
    "background pending requests should dedupe and sort by background thread order before Stop all handles them",
  );
  assertDeepEqual(
    backgroundRequests.map((pendingRequest) => pendingRequestOwnerThreadId(pendingRequest, {
      itemsByThread: { "child-1": [{ id: "child-item" }] },
    })),
    ["child-1", "child-1", "child-2"],
    "background pending requests should keep item-only ownership for child threads",
  );
}

function classifiesMcpAndDynamicToolRequestsForAwaitingState(): void {
  assertDeepEqual(
    pendingRequestAwaitingKind(request("mcp", "mcpServer/elicitation/request", { threadId: "thread-1" })),
    "userInput",
    "MCP elicitation requests should keep the user-input awaiting lane",
  );
  assertDeepEqual(
    pendingRequestAwaitingKind(request("tool-call", "item/tool/call", { threadId: "thread-1" })),
    "toolCall",
    "ordinary dynamic tool calls should keep the tool-call awaiting lane",
  );
  assertDeepEqual(
    pendingRequestAwaitingKind(request("option-picker", "item/tool/call", {
      threadId: "thread-1",
      tool: "request_option_picker",
      arguments: { question: "Pick", options: [{ label: "A" }] },
    })),
    "userInput",
    "Desktop dynamic request_option_picker should use the user-input awaiting lane",
  );
  assertDeepEqual(
    pendingRequestAwaitingKind(request("setup-picker", "item/tool/call", {
      threadId: "thread-1",
      tool: "setup_codex_context_picker",
      arguments: { canSelectSources: true },
    })),
    "userInput",
    "Desktop dynamic setup_codex_context_picker should use the user-input awaiting lane",
  );
}

function summarizesAwaitingStateByThread(): void {
  const summary = summarizePendingRequestAwaitingByThread([
    request("approval-1", "item/permissions/requestApproval", { threadId: "thread-1" }, undefined, 10),
    request("input-1", "item/tool/requestUserInput", undefined, { thread_id: "thread-1" }, 30),
    request("tool-1", "item/tool/call", { threadId: "thread-2" }, undefined, 20),
    request("other-1", "custom/request", { threadId: "thread-2" }, undefined, 25),
    request("unscoped", "item/tool/requestUserInput", { message: "No owner" }, undefined, 100),
    request("item-only", "item/tool/requestUserInput", { itemId: "item-1" }, undefined, 120),
  ]);

  assertDeepEqual(
    Object.keys(summary).sort(),
    ["thread-1", "thread-2"],
    "thread summary should not attribute unscoped or item-only requests to every thread",
  );
  assertDeepEqual(
    summary["thread-1"],
    {
      threadId: "thread-1",
      requestIds: ["approval-1", "input-1"],
      latestCreatedAt: 30,
      totalCount: 2,
      approvalCount: 1,
      userInputCount: 1,
      toolCallCount: 0,
      requestCount: 0,
      awaiting: true,
      awaitingApproval: true,
      awaitingUserInput: true,
      awaitingToolCall: false,
      awaitingRequest: false,
      flags: ["waitingOnApproval", "waitingOnUserInput"],
    },
    "thread-1 summary should classify approval and user-input requests",
  );
  assertDeepEqual(
    summary["thread-2"],
    {
      threadId: "thread-2",
      requestIds: ["tool-1", "other-1"],
      latestCreatedAt: 25,
      totalCount: 2,
      approvalCount: 0,
      userInputCount: 0,
      toolCallCount: 1,
      requestCount: 1,
      awaiting: true,
      awaitingApproval: false,
      awaitingUserInput: false,
      awaitingToolCall: true,
      awaitingRequest: true,
      flags: ["waitingOnToolCall", "waitingOnRequest"],
    },
    "thread-2 summary should classify tool-call and unknown request families",
  );
}

function attributesItemOnlyAwaitingStateWhenItemsAreIndexedByThread(): void {
  const summary = summarizePendingRequestAwaitingByThread([
    request("item-only", "item/tool/requestUserInput", { itemId: "item-1" }, undefined, 50),
    request("missing-item", "item/tool/requestUserInput", { itemId: "item-2" }, undefined, 60),
  ], {
    itemsByThread: {
      "thread-1": [{ id: "item-1" }],
    },
  });

  assertDeepEqual(
    Object.keys(summary),
    ["thread-1"],
    "item-only pending requests should be attributed to the thread that owns the item",
  );
  assertDeepEqual(
    summary["thread-1"]?.requestIds,
    ["item-only"],
    "only item ids present in the thread index should be attributed",
  );
}

function request(
  id: string,
  method: string,
  params?: unknown,
  payload?: unknown,
  createdAt = 0,
): PendingServerRequest {
  const built: PendingServerRequest & { payload?: unknown } = {
    id,
    method,
    params,
    createdAt,
  };
  if (payload !== undefined) built.payload = payload;
  return built;
}

function requestId(request: PendingServerRequest): string {
  return String(request.id);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
