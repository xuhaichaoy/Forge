import { runSlashRequestWorkflow } from "../src/state/slash-request-workflow";
import type { CommandPanelKind, CommandPanelOptions } from "../src/state/command-panel";

export default async function runSlashRequestWorkflowTests(): Promise<void> {
  await listsCollaborationModesThroughAppServer();
  await setsReadsAndClearsThreadGoalsThroughAppServer();
  await cleansBackgroundTerminalsThroughAppServer();
}

async function listsCollaborationModesThroughAppServer(): Promise<void> {
  const workflow = createWorkflowRecorder([
    {
        data: [
          { name: "Plan", mode: "plan", model: null, reasoning_effort: "medium" },
        ],
      },
  ]);

  await runSlashRequestWorkflow("showCollaborationModes", undefined, {
    ...workflow.context,
    activeThreadId: null,
  });

  assertDeepEqual(
    workflow.requests,
    [{ method: "collaborationMode/list", params: {}, timeoutMs: 120_000 }],
    "collaboration mode slash request should call app-server with an explicit empty params object",
  );
  assertDeepEqual(
    workflow.panels.map((item) => ({
      panel: item.panel,
      status: item.options?.status,
      entries: item.options?.entries?.map((entry) => ({ id: entry.id, title: entry.title, meta: entry.meta })),
    })),
    [
      { panel: "collaboration", status: "loading", entries: [] },
      {
        panel: "collaboration",
        status: "ready",
        entries: [{ id: "collaboration:Plan", title: "Plan", meta: "plan" }],
      },
    ],
    "collaboration mode slash request should project the returned presets into the command panel",
  );
}

async function setsReadsAndClearsThreadGoalsThroughAppServer(): Promise<void> {
  const workflow = createWorkflowRecorder([
    { goal: goalFixture({ objective: "Finish parity", status: "active" }) },
    { goal: goalFixture({ objective: "Finish parity", status: "active", tokensUsed: 12 }) },
    { cleared: true },
  ]);

  await runSlashRequestWorkflow("showGoal", { objective: "Finish parity" }, workflow.context);
  await runSlashRequestWorkflow("showGoal", undefined, workflow.context);
  await runSlashRequestWorkflow("showGoal", { objective: "clear" }, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [
      { method: "thread/goal/set", params: { threadId: "thread-1", objective: "Finish parity" }, timeoutMs: 120_000 },
      { method: "thread/goal/get", params: { threadId: "thread-1" }, timeoutMs: 120_000 },
      { method: "thread/goal/clear", params: { threadId: "thread-1" }, timeoutMs: 120_000 },
    ],
    "goal slash request should use the app-server goal endpoints",
  );
  assertDeepEqual(
    workflow.panels
      .filter((item) => item.options?.status === "ready")
      .map((item) => ({
        title: item.options?.title,
        entries: item.options?.entries?.map((entry) => ({
          id: entry.id,
          title: entry.title,
          status: entry.status,
          meta: entry.meta,
        })),
      })),
    [
      {
        title: "Goal",
        entries: [{ id: "goal:thread-1", title: "Finish parity", status: "active", meta: "0 tokens" }],
      },
      {
        title: "Goal",
        entries: [{ id: "goal:thread-1", title: "Finish parity", status: "active", meta: "12 tokens" }],
      },
      {
        title: "Goal",
        entries: [{ id: "goal:thread-1:clear", title: "Goal cleared", status: "cleared", meta: "thread thread-1" }],
      },
    ],
    "goal slash request should show app-server goal results in the command panel",
  );
}

async function cleansBackgroundTerminalsThroughAppServer(): Promise<void> {
  const workflow = createWorkflowRecorder([{}]);

  await runSlashRequestWorkflow("cleanBackgroundTerminals", undefined, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [{ method: "thread/backgroundTerminals/clean", params: { threadId: "thread-1" }, timeoutMs: 120_000 }],
    "background terminal cleanup should use the app-server cleanup endpoint",
  );
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "status",
      options: {
        status: "ready",
        title: "Background terminals",
        message: "Background terminal cleanup requested.",
        entries: [{
          id: "background-terminals:thread-1",
          title: "Background terminals",
          kind: "status",
          status: "cleanup requested",
          meta: "thread thread-1",
        }],
      },
    },
    "background terminal cleanup should report an accepted cleanup request",
  );
}

function createWorkflowRecorder(results: unknown[]) {
  const requests: Array<{ method: string; params?: unknown; timeoutMs?: number | null }> = [];
  const panels: Array<{ panel: CommandPanelKind; options?: CommandPanelOptions }> = [];
  let resultIndex = 0;
  const client = {
    request: async <T,>(method: string, params?: unknown, timeoutMs?: number | null): Promise<T> => {
      requests.push({ method, params, timeoutMs });
      return results[resultIndex++] as T;
    },
  };
  return {
    requests,
    panels,
    context: {
      client: client as never,
      dispatch: () => undefined,
      ensureConnected: async () => true,
      openCommandPanel: (panel: CommandPanelKind, options?: CommandPanelOptions) => panels.push({ panel, options }),
      workspace: "/workspace",
      activeThread: null,
      activeThreadId: "thread-1",
      activeTurnId: null,
      connected: true,
      modelCount: 0,
      pendingRequestCount: 0,
      threads: [],
    },
  };
}

function goalFixture(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "thread-1",
    objective: "Finish parity",
    status: "active",
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
