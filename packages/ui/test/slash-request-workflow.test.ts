import { runSlashRequestWorkflow } from "../src/state/slash-request-workflow";
import type { CommandPanelKind, CommandPanelOptions } from "../src/state/command-panel";

export default async function runSlashRequestWorkflowTests(): Promise<void> {
  await listsCollaborationModesThroughAppServer();
  await reloadsSkillsThroughAppServer();
  await setsReadsAndClearsThreadGoalsThroughAppServer();
  await listsBackgroundTerminalsFromActiveItems();
  await cleansBackgroundTerminalsThroughAppServer();
  await showsPersonalityOptionsFromThreadContext();
  await searchesMentionsThroughAppServer();
}

async function reloadsSkillsThroughAppServer(): Promise<void> {
  const workflow = createWorkflowRecorder([
    {
      data: [
        {
          cwd: "/workspace",
          skills: [
            {
              name: "review",
              path: "/workspace/.codex/skills/review/SKILL.md",
              scope: "repo",
              enabled: true,
              interface: { displayName: "Review", shortDescription: "Review local changes." },
            },
          ],
          errors: [],
        },
      ],
    },
  ]);

  await runSlashRequestWorkflow("listSkills", { detail: "reload" }, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [{
      method: "skills/list",
      params: { cwds: ["/workspace"], forceReload: true },
      timeoutMs: undefined,
    }],
    "skills reload should force app-server to rescan skills from disk",
  );
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "skills",
      options: {
        status: "ready",
        entries: [{
          id: "skill:review",
          title: "Review",
          kind: "skill",
          status: "enabled",
          meta: "Repo · /workspace/.codex/skills/review/SKILL.md",
          details: [
            "Review local changes.",
            "Path: /workspace/.codex/skills/review/SKILL.md",
            "CWD: /workspace",
          ],
          action: {
            type: "attachSkill",
            name: "review",
            path: "/workspace/.codex/skills/review/SKILL.md",
            promptText: "[$review](/workspace/.codex/skills/review/SKILL.md) ",
          },
          secondaryActions: [{
            id: "skill:review:disable",
            label: "Disable",
            title: "Disable Review",
            tone: "danger",
            action: {
              type: "writeSkillConfig",
              title: "Disable Review",
              name: "review",
              path: "/workspace/.codex/skills/review/SKILL.md",
              enabled: false,
            },
          }],
        }],
        message: "Reloaded skills from disk. Select a skill to attach it to the next message.",
      },
    },
    "skills reload should show Desktop-style skill metadata in the command panel",
  );
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

async function listsBackgroundTerminalsFromActiveItems(): Promise<void> {
  const workflow = createWorkflowRecorder([]);

  await runSlashRequestWorkflow("showProcesses", undefined, {
    ...workflow.context,
    activeItems: [
      {
        type: "commandExecution",
        id: "cmd-1",
        command: "npm run dev",
        cwd: "/workspace",
        processId: "proc-1",
        source: "unifiedExecStartup",
        status: "inProgress",
        aggregatedOutput: "ready",
      },
    ],
  });

  assertDeepEqual(workflow.requests, [], "ps should use active ThreadItems without app-server polling");
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "status",
      options: {
        status: "ready",
        title: "Background terminals",
        message: "1 background terminal(s) running.",
        entries: [{
          id: "background-terminal:proc-1",
          title: "npm run dev",
          kind: "status",
          status: "running",
          meta: "/workspace",
          details: ["Process: proc-1", "Output: ready"],
        }],
      },
    },
    "ps should show running background terminals in the command panel",
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

async function showsPersonalityOptionsFromThreadContext(): Promise<void> {
  const workflow = createWorkflowRecorder([]);

  await runSlashRequestWorkflow("showPersonality", undefined, {
    ...workflow.context,
    threadContextDefaults: { personality: "friendly", model: "gpt-5.2" },
  });

  assertDeepEqual(workflow.requests, [], "personality slash request should use local config projection without polling app-server");
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "generic",
      options: {
        status: "ready",
        title: "Personality",
        message: "Choose a default tone for Codex responses.",
        entries: [
          {
            id: "personality:friendly",
            title: "Friendly",
            kind: "status",
            status: "current",
            meta: "Warm, collaborative, and helpful",
            disabled: true,
          },
          {
            id: "personality:pragmatic",
            title: "Pragmatic",
            kind: "status",
            status: "select",
            meta: "Concise, task-focused, and direct",
            disabled: false,
            action: {
              type: "writeConfig",
              title: "Personality",
              message: "Set personality to Pragmatic.",
              edits: [
                { keyPath: "personality", value: "pragmatic", mergeStrategy: "upsert" },
                { keyPath: "model_personality", value: null, mergeStrategy: "replace" },
              ],
              reloadUserConfig: true,
              afterWrite: { type: "addPersonalityChangeSyntheticItem", personality: "pragmatic" },
            },
          },
          {
            id: "personality:current",
            title: "Current personality",
            kind: "status",
            status: "friendly",
            meta: "(Does not apply to current model)",
            details: ["personality: friendly", "model: gpt-5.2"],
          },
        ],
      },
    },
    "personality slash request should expose Desktop-style personality options",
  );
}

async function searchesMentionsThroughAppServer(): Promise<void> {
  const workflow = createWorkflowRecorder([
    {
      files: [
        {
          path: "/workspace/packages/ui/src/HiCodexApp.tsx",
          file_name: "HiCodexApp.tsx",
          score: 91,
          match_type: "fuzzy",
        },
      ],
    },
  ]);

  await runSlashRequestWorkflow("showMentionPicker", { query: "app" }, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [{
      method: "fuzzyFileSearch",
      params: { query: "app", roots: ["/workspace"], cancellationToken: null },
      timeoutMs: 120_000,
    }],
    "mention slash request should use app-server fuzzy file search",
  );
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "generic",
      options: {
        status: "ready",
        title: "Files",
        entries: [{
          id: "file:/workspace/packages/ui/src/HiCodexApp.tsx",
          title: "HiCodexApp.tsx",
          kind: "status",
          status: "fuzzy",
          meta: "/workspace/packages/ui/src/HiCodexApp.tsx",
          details: ["score: 91"],
          action: {
            type: "attachMention",
            name: "HiCodexApp.tsx",
            path: "/workspace/packages/ui/src/HiCodexApp.tsx",
          },
        }],
        message: "1 matching file(s). Select one to attach it.",
      },
    },
    "mention slash request should return attachable mention entries",
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
