import { runSlashRequestWorkflow } from "../src/state/slash-request-workflow";
import { initialAccountState, type AccountState } from "../src/state/account-state";
import type { CommandPanelKind, CommandPanelOptions } from "../src/state/command-panel";
import type { RateLimitSnapshot } from "@hicodex/codex-protocol/generated/v2/RateLimitSnapshot";

export default async function runSlashRequestWorkflowTests(): Promise<void> {
  await resumesAndForksThreadsWithContextDefaults();
  await listsAppsThroughDesktopPagingLoader();
  await listsCollaborationModesThroughAppServer();
  await reloadsSkillsThroughAppServer();
  await logsOutThroughAccountStateRefresh();
  await setsReadsAndClearsThreadGoalsThroughAppServer();
  await listsBackgroundTerminalsFromActiveItems();
  await cleansBackgroundTerminalsThroughAppServer();
  await showsPersonalityOptionsFromThreadContext();
  await showsMemoriesOptionsFromThreadContext();
  await showsDebugConfigFromConfigLayers();
  await showsRpcInspectorWithoutRuntimeConnection();
  await searchesMentionsThroughAppServer();
}

async function resumesAndForksThreadsWithContextDefaults(): Promise<void> {
  const workflow = createWorkflowRecorder([
    { thread: { id: "resumed-thread" } },
    { thread: { id: "forked-thread" } },
  ]);
  const threadContextDefaults = {
    model: "gpt-5.2",
    modelProvider: "openai",
    developerInstructions: "Workspace developer instructions.",
    personality: "friendly" as const,
    memories: { useMemories: false, generateMemories: true },
  };

  await runSlashRequestWorkflow("resumeThread", { threadId: "thread-resume" }, {
    ...workflow.context,
    threadContextDefaults,
  });
  await runSlashRequestWorkflow("forkThread", undefined, {
    ...workflow.context,
    activeThread: { id: "thread-1", cwd: "/thread-cwd" } as never,
    threadContextDefaults,
  });

  assertDeepEqual(
    workflow.requests,
    [
      {
        method: "thread/resume",
        params: {
          threadId: "thread-resume",
          cwd: "/workspace",
          model: "gpt-5.2",
          modelProvider: "openai",
          developerInstructions: "Workspace developer instructions.",
          personality: "friendly",
          config: {
            "memories.use_memories": false,
            "memories.generate_memories": true,
          },
        },
        timeoutMs: 120_000,
      },
      {
        method: "thread/fork",
        params: {
          threadId: "thread-1",
          cwd: "/thread-cwd",
          model: "gpt-5.2",
          modelProvider: "openai",
          developerInstructions: "Workspace developer instructions.",
          config: {
            "memories.use_memories": false,
            "memories.generate_memories": true,
          },
          threadSource: "user",
        },
        timeoutMs: 120_000,
      },
    ],
    "slash resume/fork should reuse ThreadContextDefaults instead of bare thread requests",
  );
}

async function listsAppsThroughDesktopPagingLoader(): Promise<void> {
  const workflow = createWorkflowRecorder([{ data: [], nextCursor: null }]);

  await runSlashRequestWorkflow("listApps", undefined, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [{
      method: "app/list",
      params: { cursor: null, forceRefetch: undefined, limit: 1000, threadId: "thread-1" },
      timeoutMs: 120_000,
    }],
    "/apps should use the Desktop paging loader instead of a 50-item single page",
  );
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
          secondaryActions: [
            {
              id: "skill:/workspace/.codex/skills/review/SKILL.md:read",
              label: "View",
              title: "View Review source",
              action: {
                type: "readSkillFile",
                title: "View Review",
                path: "/workspace/.codex/skills/review/SKILL.md",
              },
            },
            {
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
            },
          ],
        }],
        message: "Reloaded skills from disk. Select a skill to attach it to the next message.",
      },
    },
    "skills reload should show Desktop-style skill metadata in the command panel",
  );
}

async function logsOutThroughAccountStateRefresh(): Promise<void> {
  const rateLimits: RateLimitSnapshot = {
    limitId: "codex",
    limitName: "Codex",
    primary: { usedPercent: 11, windowDurationMins: 300, resetsAt: null },
    secondary: null,
    credits: { hasCredits: true, unlimited: false, balance: "12.50" },
    planType: "pro",
    rateLimitReachedType: null,
  };
  const workflow = createWorkflowRecorder([
    {},
    { account: null, requiresOpenaiAuth: true },
    { rateLimits, rateLimitsByLimitId: null },
  ]);
  const accountStates: AccountState[] = [];

  await runSlashRequestWorkflow("logout", undefined, {
    ...workflow.context,
    accountState: {
      ...initialAccountState,
      account: { type: "chatgpt", email: "ada@example.com", planType: "pro" },
      requiresOpenaiAuth: false,
      rateLimits,
      rateLimitsByLimitId: { codex: rateLimits },
      status: "ready",
    },
    setAccountState: (state) => accountStates.push(state),
  });

  assertDeepEqual(
    workflow.requests,
    [
      { method: "account/logout", params: undefined, timeoutMs: 120_000 },
      { method: "account/read", params: { refreshToken: false }, timeoutMs: 120_000 },
      { method: "account/rateLimits/read", params: undefined, timeoutMs: 120_000 },
    ],
    "logout slash request should refresh account projection after account/logout",
  );
  assertDeepEqual(
    accountStates.map((state) => ({ account: state.account, buckets: state.rateLimitsByLimitId })),
    [{ account: null, buckets: {} }],
    "logout slash request should publish the refreshed signed-out account state",
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

async function showsMemoriesOptionsFromThreadContext(): Promise<void> {
  const workflow = createWorkflowRecorder([]);

  await runSlashRequestWorkflow("showMemories", undefined, {
    ...workflow.context,
    threadContextDefaults: {
      memories: {
        useMemories: false,
        generateMemories: true,
      },
    },
  });

  assertDeepEqual(workflow.requests, [], "memories slash request should project local config without polling app-server");
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "generic",
      options: {
        status: "ready",
        title: "Memories",
        message: "Configure memory defaults, or update whether the current chat can generate future memories.",
        entries: [
          {
            id: "memories:defaults",
            title: "New chats",
            kind: "status",
            status: "use off · generate on",
            meta: "Applies to chats started from this composer",
            details: [
              "Use memories: let Codex bring existing memories into the chat context.",
              "Generate memories: allow Codex to use this chat when creating new memories later.",
            ],
            secondaryActions: [
              {
                id: "memories:defaults:use:on",
                label: "Turn on",
                title: "Enable use memories",
                tone: "success",
                action: {
                  type: "writeConfig",
                  title: "Memories",
                  message: "Use memories enabled for new chats.",
                  edits: [{ keyPath: "memories.use_memories", value: true, mergeStrategy: "upsert" }],
                  reloadUserConfig: true,
                },
              },
              {
                id: "memories:defaults:generate:off",
                label: "Turn off",
                title: "Disable generate memories",
                tone: "danger",
                action: {
                  type: "writeConfig",
                  title: "Memories",
                  message: "Generate memories disabled for new chats.",
                  edits: [{ keyPath: "memories.generate_memories", value: false, mergeStrategy: "upsert" }],
                  reloadUserConfig: true,
                },
              },
            ],
          },
          {
            id: "memories:thread:thread-1",
            title: "Current chat memory generation",
            kind: "status",
            status: "thread mode",
            meta: "thread thread-1",
            details: [
              "Use memories cannot be changed after a chat has started.",
              "Generate memories controls whether this chat remains eligible for future memory generation.",
            ],
            secondaryActions: [
              {
                id: "memories:thread:thread-1:enable",
                label: "Enable",
                title: "Enable memory generation for this chat",
                tone: "success",
                action: {
                  type: "setThreadMemoryMode",
                  title: "Memories",
                  threadId: "thread-1",
                  mode: "enabled",
                },
              },
              {
                id: "memories:thread:thread-1:disable",
                label: "Disable",
                title: "Disable memory generation for this chat",
                tone: "danger",
                action: {
                  type: "setThreadMemoryMode",
                  title: "Memories",
                  threadId: "thread-1",
                  mode: "disabled",
                },
              },
            ],
          },
        ],
      },
    },
    "memories slash request should expose default config writes and thread/memoryMode actions",
  );
}

async function showsDebugConfigFromConfigLayers(): Promise<void> {
  const configReadResult = {
    config: {
      model: "gpt-5.2",
      model_provider: "openai",
      memories: {
        use_memories: true,
        generate_memories: false,
      },
      nested: { ignored: true },
    },
    layers: [
      {
        name: "Defaults",
        path: "/Users/test/.codex/config.toml",
        config: { model: "gpt-5.2" },
      },
      {
        source: "Workspace",
        cwd: "/workspace",
        settings: { approval_policy: "on-request" },
      },
    ],
  };
  const workflow = createWorkflowRecorder([configReadResult]);

  await runSlashRequestWorkflow("showDebugConfig", undefined, workflow.context);

  assertDeepEqual(
    workflow.requests,
    [{
      method: "config/read",
      params: { includeLayers: true, cwd: "/workspace" },
      timeoutMs: 120_000,
    }],
    "debug-config should read effective config layers from app-server",
  );
  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "generic",
      options: {
        status: "ready",
        title: "Debug config",
        message: "Effective config and config layers from app-server.",
        entries: [
          {
            id: "debug-config:effective",
            title: "Effective config",
            kind: "status",
            status: "4 key(s)",
            meta: "/workspace",
            details: [
              "model: gpt-5.2",
              "model_provider: openai",
              "memories.use_memories: true",
              "memories.generate_memories: false",
            ],
            action: {
              type: "copyText",
              title: "Debug config",
              label: "Debug config",
              text: JSON.stringify(configReadResult, null, 2),
            },
          },
          {
            id: "debug-config:layer:0",
            title: "Defaults",
            kind: "status",
            status: undefined,
            meta: "/Users/test/.codex/config.toml",
            details: ["model: gpt-5.2"],
          },
          {
            id: "debug-config:layer:1",
            title: "Workspace",
            kind: "status",
            status: undefined,
            meta: "/workspace",
            details: ["approval_policy: on-request"],
          },
        ],
      },
    },
    "debug-config should show effective config plus individual layers",
  );
}

async function showsRpcInspectorWithoutRuntimeConnection(): Promise<void> {
  const workflow = createWorkflowRecorder([]);

  await runSlashRequestWorkflow("showRpcInspector", undefined, {
    ...workflow.context,
    ensureConnected: async () => {
      throw new Error("RPC inspector should not require a live app-server connection");
    },
    rpcDebugEvents: [
      {
        id: "rpc-1",
        at: 1_700_000_000_000,
        kind: "client-request",
        method: "thread/list",
        requestId: "req-1",
        payload: { limit: 10 },
      },
    ],
  });

  assertDeepEqual(
    workflow.panels.at(-1),
    {
      panel: "generic",
      options: {
        status: "ready",
        title: "RPC inspector",
        message: "1 recent JSON-RPC / host event(s). Select an entry to copy the raw event.",
        entries: [{
          id: "rpc:rpc-1",
          title: "→ request thread/list",
          kind: "status",
          status: "id req-1",
          meta: new Date(1_700_000_000_000).toLocaleTimeString(),
          details: ["{\n  \"limit\": 10\n}"],
          action: {
            type: "copyText",
            title: "Copy RPC event",
            label: "RPC event",
            text: JSON.stringify({
              id: "rpc-1",
              at: 1_700_000_000_000,
              kind: "client-request",
              method: "thread/list",
              requestId: "req-1",
              payload: { limit: 10 },
            }, null, 2),
          },
        }],
      },
    },
    "rpc inspector should show recent RPC events from local UI state",
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
          kind: "file",
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
