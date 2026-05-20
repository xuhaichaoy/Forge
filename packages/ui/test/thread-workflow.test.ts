import type { Thread, UserInput } from "@hicodex/codex-protocol";
import {
  buildTurnStartParams,
  archiveThread,
  buildThreadListParams,
  buildThreadContextParams,
  editLastUserTurn,
  ensureThreadReadyForTurn,
  forkThread,
  forkThreadFromTurn,
  IMAGE_TOOL_RESUME_FALLBACK_MESSAGE,
  interruptThreadTurn,
  isThreadNotFound,
  isThreadNotMaterialized,
  isThreadNeedsResume,
  isThreadStatusNotLoaded,
  mergeThreadListPage,
  projectThreadContextDefaults,
  readWorkspaceDeveloperInstructions,
  readThread,
  readThreadForDisplay,
  refreshThreadMetadata,
  renameThread,
  resumeSelectedThreadAndStartTurn,
  resumeThread,
  resumeThreadWithMetadataRead,
  sendPanelThreadMessage,
  SIDE_CONVERSATION_BOUNDARY_MESSAGE,
  SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS,
  startThread,
  startSideConversation,
  startTurn,
  steerTurn,
  threadStatusLabel,
  threadTitle,
  unarchiveThread,
  withWorkspaceDeveloperInstructions,
} from "../src/state/thread-workflow";
import { HICODEX_IMAGE_DYNAMIC_TOOL_SPEC } from "../src/state/image-generation-tool";

interface RecordedRequest {
  method: string;
  params: unknown;
  timeout?: number | null;
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

function assertRequest(
  requests: RecordedRequest[],
  index: number,
  method: string,
  params: unknown,
  message: string,
): void {
  const request = requests[index];
  if (!request) {
    throw new Error(`${message}: expected request at index ${index}`);
  }
  assertEqual(request.method, method, `${message} method`);
  assertDeepEqual(request.params, params, `${message} params`);
}

function createClientRecorder(result: unknown = {}) {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    client: {
      request(method: string, params: unknown, timeout?: number | null) {
        requests.push({ method, params, timeout });
        return result;
      },
    } as Parameters<typeof startThread>[0],
  };
}

function createClientSequenceRecorder(results: unknown[]) {
  const requests: RecordedRequest[] = [];
  let resultIndex = 0;
  return {
    requests,
    client: {
      request(method: string, params: unknown, timeout?: number | null) {
        requests.push({ method, params, timeout });
        const result = results[resultIndex++] ?? {};
        if (result instanceof Error) throw result;
        return result;
      },
    } as Parameters<typeof startThread>[0],
  };
}

export default async function runThreadWorkflowTests(): Promise<void> {
  buildsThreadTitlesFromNamePreviewAndId();
  formatsThreadStatusLabelsSafely();
  detectsNotLoadedThreadStatus();
  detectsRecoverableThreadErrors();
  projectsThreadContextFromCodexConfig();
  await loadsWorkspaceDeveloperInstructionsFromAncestors();
  await prefersOverrideAgentsAndStopsAtProjectRoot();
  mergesWorkspaceDeveloperInstructionsIntoContext();
  buildsPaginatedThreadListParams();
  buildsStartThreadRequestsWithoutHardcodedWorkspace();
  buildsThreadLifecycleRequests();
  await readsThreadDisplayMetadataBeforeHydratingTurns();
  await resumesThreadAfterMetadataRead();
  await forksThreadFromTurnUsingDesktopSequence();
  await startsEphemeralSideConversationByInjectingDesktopBoundary();
  await editsLastUserTurnUsingDesktopRollbackThenStartSequence();
  await recoversThreadNotFoundOnEditByResumingFirst();
  await recoversThreadNotFoundOnEditRollbackByResumingFirst();
  await restoresOriginalEditInputWhenEditedTurnStartFails();
  await reportsEditFailureWhenOriginalInputRestoreAlsoFails();
  await buildsReadyThreadRequestsForTurns();
  await refreshesThreadMetadataWithoutChangingSelection();
  await resumesSelectedHistoricalThreadBeforeRetryingTurn();
  buildsTurnStartAndSteerRequests();
  sendsPanelThreadMessagesWithoutChangingMainThreadSelection();
  interruptsPanelThreadTurnsWithoutChangingMainThreadSelection();
}

function buildsPaginatedThreadListParams(): void {
  assertDeepEqual(
    buildThreadListParams(),
    {
      archived: false,
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
    },
    "first thread list page should request recent non-archived history",
  );
  assertDeepEqual(
    buildThreadListParams("cursor-2"),
    {
      archived: false,
      cursor: "cursor-2",
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
    },
    "subsequent thread list pages should pass the opaque cursor",
  );
  assertDeepEqual(
    mergeThreadListPage(
      [threadFixture({ id: "thread-1", preview: "first" }), threadFixture({ id: "thread-2", preview: "second" })],
      [threadFixture({ id: "thread-2", preview: "duplicate" }), threadFixture({ id: "thread-3", preview: "third" })],
    ).map((thread) => [thread.id, thread.preview]),
    [["thread-1", "first"], ["thread-2", "second"], ["thread-3", "third"]],
    "thread list pages should preserve server order and skip duplicate ids",
  );
}

function buildsThreadTitlesFromNamePreviewAndId(): void {
  assertEqual(
    threadTitle(threadFixture({ id: "thread-with-name", name: "  Named thread  ", preview: "Preview" })),
    "Named thread",
    "threadTitle should prefer trimmed name",
  );
  assertEqual(
    threadTitle(threadFixture({ id: "thread-with-preview", preview: "  Preview title  " })),
    "Preview title",
    "threadTitle should fall back to trimmed preview",
  );
  assertEqual(
    threadTitle(threadFixture({ id: "short-thread" })),
    "short-thread",
    "threadTitle should keep short ids intact",
  );
  assertEqual(
    threadTitle(threadFixture({ id: "1234567890abcdef" })),
    "12345678...cdef",
    "threadTitle should shorten long ids",
  );
}

function threadFixture(overrides: Partial<Thread> & { id: string }): Thread {
  const { id, ...rest } = overrides;
  return {
    id,
    sessionId: id,
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
    ...rest,
  };
}

function turnFixture(id: string, overrides: Partial<Thread["turns"][number]> = {}): Thread["turns"][number] {
  return {
    id,
    items: [],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 0,
    completedAt: 1,
    durationMs: 1000,
    ...overrides,
  };
}

function detectsNotLoadedThreadStatus(): void {
  assertEqual(isThreadStatusNotLoaded("notLoaded"), true, "string notLoaded status");
  assertEqual(isThreadStatusNotLoaded({ type: "notLoaded" }), true, "typed notLoaded status");
  assertEqual(isThreadStatusNotLoaded({ status: "notLoaded" }), true, "legacy notLoaded status field");
  assertEqual(isThreadStatusNotLoaded({ type: "idle" }), false, "idle status should not require resume");
  assertEqual(isThreadStatusNotLoaded(undefined), false, "missing status should not force resume");
}

function formatsThreadStatusLabelsSafely(): void {
  assertEqual(threadStatusLabel(undefined), "ready", "undefined status label");
  assertEqual(threadStatusLabel(null), "ready", "null status label");
  assertEqual(threadStatusLabel("running"), "running", "string status label");
  assertEqual(threadStatusLabel(2), "2", "number status label");
  assertEqual(threadStatusLabel(false), "false", "boolean status label");
  assertEqual(
    threadStatusLabel({ type: "queued", status: "running" }),
    "queued",
    "object status should prefer type",
  );
  assertEqual(
    threadStatusLabel({ status: "archived" }),
    "archived",
    "object status should fall back to status",
  );
  assertEqual(
    threadStatusLabel({ nested: { active: true } }),
    "{\"nested\":{\"active\":true}}",
    "unknown object status should format safely",
  );
}

function detectsRecoverableThreadErrors(): void {
  assertEqual(
    isThreadNotFound(new Error("Thread not found: thread-1")),
    true,
    "thread not found errors should be detected",
  );
  assertEqual(
    isThreadNotFound(new Error("permission denied")),
    false,
    "unrelated errors should not be thread not found",
  );
  assertEqual(
    isThreadNeedsResume(new Error("Conversation thread-history is not being streamed.")),
    true,
    "not-streaming selected thread errors should be detected as resumeable",
  );
  assertEqual(
    isThreadNeedsResume({ message: "conversation resume_state is needs_resume" }),
    true,
    "needs_resume selected thread errors should be detected as resumeable",
  );
  assertEqual(
    isThreadNeedsResume(new Error("thread not found")),
    false,
    "missing thread errors should stay separate from resume-state errors",
  );
  assertEqual(
    isThreadNotMaterialized(new Error("Thread is not materialized yet")),
    true,
    "not materialized errors should be detected",
  );
  assertEqual(
    isThreadNotMaterialized({ message: "includeTurns is unavailable before first turn" }),
    true,
    "includeTurns unavailable errors should be detected",
  );
  assertEqual(
    isThreadNotMaterialized("thread not found"),
    false,
    "thread not found is not a materialization error",
  );
}

function projectsThreadContextFromCodexConfig(): void {
  assertDeepEqual(
    projectThreadContextDefaults({
      model: " gpt-5.2 ",
      model_provider: " hicodex_local ",
      service_tier: "flex",
      approval_policy: "on-request",
      approvals_reviewer: "auto_review",
      sandbox_mode: "workspace-write",
      default_permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      instructions: " Base ",
      developer_instructions: " Dev ",
      personality: "pragmatic",
      model_reasoning_effort: "high",
      model_reasoning_summary: "none",
      model_context_window: 262144,
      memories: {
        use_memories: false,
        generate_memories: true,
      },
    }),
    {
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      serviceTier: "flex",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      sandbox: "workspace-write",
      permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      baseInstructions: "Base",
      developerInstructions: "Dev",
      personality: "pragmatic",
      reasoningEffort: "high",
      reasoningSummary: "none",
      memories: {
        useMemories: false,
        generateMemories: true,
      },
    },
    "thread context should project protocol config fields to request overrides",
  );

  assertDeepEqual(
    projectThreadContextDefaults({ model: "", model_provider: null }),
    null,
    "empty config context should not force overrides",
  );
  assertDeepEqual(
    projectThreadContextDefaults({ model: " gpt-local " }),
    { model: "gpt-local", personality: "friendly" },
    "thread context should default to Desktop's friendly personality when config/read omits it",
  );

  assertDeepEqual(
    buildThreadContextParams(" /workspace ", {
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      serviceTier: null,
      approvalPolicy: undefined,
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      reasoningEffort: "high",
      personality: "pragmatic",
      memories: {
        useMemories: false,
        generateMemories: true,
      },
    }),
    {
      cwd: "/workspace",
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      approvalsReviewer: "user",
      permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      personality: "pragmatic",
      config: {
        "memories.use_memories": false,
        "memories.generate_memories": true,
      },
    },
    "thread context params should keep thread-level overrides and drop turn-only values",
  );
  assertDeepEqual(
    buildThreadContextParams(" /workspace ", null, { includeDynamicTools: true }),
    {
      cwd: "/workspace",
      dynamicTools: [HICODEX_IMAGE_DYNAMIC_TOOL_SPEC],
    },
    "thread start context params should opt into dynamic tools",
  );

  assertDeepEqual(
    buildTurnStartParams("thread-ctx", [], " /workspace ", {
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      serviceTier: "flex",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      sandbox: "workspace-write",
      baseInstructions: "Base",
      developerInstructions: "Dev",
      personality: "pragmatic",
      reasoningEffort: "high",
      reasoningSummary: "none",
    }),
    {
      threadId: "thread-ctx",
      input: [],
      cwd: "/workspace",
      model: "gpt-5.2",
      serviceTier: "flex",
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
      effort: "high",
      summary: "none",
      personality: "pragmatic",
    },
    "turn context params should map to TurnStartParams fields only",
  );

  assertDeepEqual(
    buildTurnStartParams(
      "thread-plan",
      [],
      "/workspace",
      {
        model: "gpt-5.2",
        reasoningEffort: "high",
      },
      {
        collaborationMode: {
          mode: "plan",
          settings: {
            model: "gpt-5.2",
            reasoning_effort: "high",
            developer_instructions: null,
          },
        },
      },
    ),
    {
      threadId: "thread-plan",
      input: [],
      cwd: "/workspace",
      model: "gpt-5.2",
      effort: "high",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.2",
          reasoning_effort: "high",
          developer_instructions: null,
        },
      },
    },
    "plan mode should use app-server collaborationMode instead of prompt rewriting",
  );

  assertDeepEqual(
    buildTurnStartParams("thread-permissions", [], "/workspace", {
      permissions: "dev",
      sandbox: "workspace-write",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    }),
    {
      threadId: "thread-permissions",
      input: [],
      cwd: "/workspace",
      permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    },
    "turn context params should send v2 permissions and environments without a legacy sandboxPolicy conflict",
  );
}

function buildsStartThreadRequestsWithoutHardcodedWorkspace(): void {
  const first = createClientRecorder({ thread: { id: "thread-started" } });
  void startThread(first.client, "  /workspace/project  ");
  assertRequest(
    first.requests,
    0,
    "thread/start",
    { cwd: "/workspace/project", threadSource: "user" },
    "startThread should trim workspace cwd",
  );

  const withDynamicTool = createClientRecorder();
  void startThread(withDynamicTool.client, " /workspace/project ", null, { includeDynamicTools: true });
  assertRequest(
    withDynamicTool.requests,
    0,
    "thread/start",
    { cwd: "/workspace/project", threadSource: "user", dynamicTools: [HICODEX_IMAGE_DYNAMIC_TOOL_SPEC] },
    "startThread should opt into the HiCodex image dynamic tool",
  );

  const second = createClientRecorder();
  void startThread(second.client, "   ");
  assertRequest(
    second.requests,
    0,
    "thread/start",
    { cwd: null, threadSource: "user" },
    "startThread should use null cwd for empty workspace",
  );

  const withContext = createClientRecorder();
  void startThread(withContext.client, "/workspace/project", {
    model: "gpt-5.2",
    modelProvider: "hicodex_local",
    serviceTier: "flex",
    permissions: "dev",
    environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
  });
  assertRequest(
    withContext.requests,
    0,
    "thread/start",
    {
      cwd: "/workspace/project",
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      serviceTier: "flex",
      permissions: "dev",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      threadSource: "user",
    },
    "startThread should include protocol-supported config overrides",
  );
}

async function loadsWorkspaceDeveloperInstructionsFromAncestors(): Promise<void> {
  const files = new Map<string, string>([
    ["/repo/AGENTS.md", "Root agent rule."],
    ["/repo/app/CLAUDE.md", "Claude importer rule."],
    ["/repo/app/workspace/AGENTS.md", "Workspace agent rule."],
  ]);
  const loaded = await readWorkspaceDeveloperInstructions(" /repo/app/workspace ", {
    isRuntimeAvailable: () => true,
    readFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    },
  });

  assertEqual(
    loaded,
    `Workspace developer instructions:

Instructions from /repo/AGENTS.md:
Root agent rule.

Instructions from /repo/app/CLAUDE.md:
Claude importer rule.

Instructions from /repo/app/workspace/AGENTS.md:
Workspace agent rule.`,
    "workspace developer instructions should load AGENTS/CLAUDE files from ancestors in stable order",
  );
  assertEqual(
    await readWorkspaceDeveloperInstructions(" /repo/app/workspace ", { isRuntimeAvailable: () => false }),
    null,
    "workspace developer instructions should be skipped outside the Tauri host",
  );
}

async function prefersOverrideAgentsAndStopsAtProjectRoot(): Promise<void> {
  const files = new Map<string, string>([
    ["/home/.codex/AGENTS.override.md", "Global override rule."],
    ["/home/.codex/AGENTS.md", "Global default rule."],
    ["/repo/AGENTS.md", "Outer repo rule."],
    ["/repo/app/AGENTS.override.md", "Project override rule."],
    ["/repo/app/AGENTS.md", "Project default rule."],
    ["/repo/app/workspace/AGENTS.md", "Workspace agent rule."],
    ["/repo/app/workspace/CLAUDE.md", "Workspace Claude rule."],
  ]);
  const loaded = await readWorkspaceDeveloperInstructions(" /repo/app/workspace ", {
    codexHome: "/home/.codex",
    isRuntimeAvailable: () => true,
    pathExists: async (path) => path === "/repo/app/.git",
    readFile: async (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing ${path}`);
      return value;
    },
  });

  assertEqual(
    loaded,
    `Workspace developer instructions:

Instructions from /home/.codex/AGENTS.override.md:
Global override rule.

Instructions from /repo/app/AGENTS.override.md:
Project override rule.

Instructions from /repo/app/workspace/AGENTS.md:
Workspace agent rule.

Instructions from /repo/app/workspace/CLAUDE.md:
Workspace Claude rule.`,
    "workspace developer instructions should prefer override files, prepend codex home instructions, and stop at the project root",
  );
}

function mergesWorkspaceDeveloperInstructionsIntoContext(): void {
  assertDeepEqual(
    withWorkspaceDeveloperInstructions(
      { model: "gpt-5.2", developerInstructions: "Configured developer rule." },
      "Workspace developer instructions:\n\nInstructions from /repo/AGENTS.md:\nAgent rule.",
    ),
    {
      model: "gpt-5.2",
      developerInstructions: `Configured developer rule.

Workspace developer instructions:

Instructions from /repo/AGENTS.md:
Agent rule.`,
    },
    "workspace developer instructions should append after config developer instructions",
  );
  assertDeepEqual(
    withWorkspaceDeveloperInstructions(null, "Workspace developer instructions:\n\nInstructions from /repo/AGENTS.md:\nAgent rule."),
    {
      developerInstructions: "Workspace developer instructions:\n\nInstructions from /repo/AGENTS.md:\nAgent rule.",
    },
    "workspace developer instructions should create context when config has no developer instructions",
  );
}

function buildsThreadLifecycleRequests(): void {
  const read = createClientRecorder();
  void readThread(read.client, "thread-1", true);
  assertRequest(
    read.requests,
    0,
    "thread/read",
    { threadId: "thread-1", includeTurns: true },
    "readThread should request turns when asked",
  );

  const resume = createClientRecorder();
  void resumeThread(resume.client, "thread-1", " /workspace ", {
    model: "gpt-5.2",
    modelProvider: "hicodex_local",
    sandbox: "workspace-write",
    permissions: "dev",
    environments: [{ environmentId: "remote", cwd: "/workspace" }],
    personality: "pragmatic",
    memories: {
      useMemories: false,
      generateMemories: true,
    },
  });
  assertRequest(
    resume.requests,
    0,
    "thread/resume",
    {
      threadId: "thread-1",
      cwd: "/workspace",
      model: "gpt-5.2",
      modelProvider: "hicodex_local",
      permissions: "dev",
      personality: "pragmatic",
      config: {
        "memories.use_memories": false,
        "memories.generate_memories": true,
      },
    },
    "resumeThread should include resume-supported overrides without fork/start-only environments",
  );
  assertEqual(resume.requests[0]?.timeout, 120_000, "resumeThread should use a long timeout");

  const fork = createClientRecorder();
  void forkThread(fork.client, "thread-1", "", {
    permissions: "read-only",
    environments: [],
    personality: "friendly",
  });
  assertRequest(
    fork.requests,
    0,
    "thread/fork",
    {
      threadId: "thread-1",
      cwd: null,
      permissions: "read-only",
      threadSource: "user",
    },
    "forkThread should include fork-supported user params without unsupported environments or personality",
  );

  const archive = createClientRecorder();
  void archiveThread(archive.client, "thread-1");
  assertRequest(
    archive.requests,
    0,
    "thread/archive",
    { threadId: "thread-1" },
    "archiveThread should call the protocol archive method",
  );

  const unarchive = createClientRecorder();
  void unarchiveThread(unarchive.client, "thread-1");
  assertRequest(
    unarchive.requests,
    0,
    "thread/unarchive",
    { threadId: "thread-1" },
    "unarchiveThread should call the protocol unarchive method",
  );

  const rename = createClientRecorder();
  void renameThread(rename.client, "thread-1", " New name ");
  assertRequest(
    rename.requests,
    0,
    "thread/name/set",
    { threadId: "thread-1", name: "New name" },
    "renameThread should trim thread names",
  );
}

async function resumesThreadAfterMetadataRead(): Promise<void> {
  const metadataThread = threadFixture({ id: "thread-1", status: { type: "notLoaded" } });
  const resumedThread = threadFixture({ id: "thread-1", status: { type: "idle" } });
  const resume = createClientSequenceRecorder([{ thread: metadataThread }, { thread: resumedThread }]);

  const result = await resumeThreadWithMetadataRead(resume.client, "thread-1", " /workspace ", {
    model: "gpt-5.2",
    environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
  });

  assertEqual(result.thread, resumedThread, "resume with metadata read should return the resumed thread");
  assertRequest(
    resume.requests,
    0,
    "thread/read",
    { threadId: "thread-1", includeTurns: false },
    "resume with metadata read should first load thread metadata",
  );
  assertRequest(
    resume.requests,
    1,
    "thread/resume",
    {
      threadId: "thread-1",
      cwd: "/workspace",
      model: "gpt-5.2",
    },
    "resume with metadata read should then call thread/resume without unsupported environment overrides",
  );
  assertEqual(resume.requests[1]?.timeout, 120_000, "resume with metadata read should preserve resume timeout");
}

async function readsThreadDisplayMetadataBeforeHydratingTurns(): Promise<void> {
  const metadataThread = threadFixture({
    id: "thread-history",
    preview: "Historical chat",
    status: { type: "notLoaded" },
  });
  const hydratedThread = threadFixture({
    id: "thread-history",
    preview: "Historical chat",
    status: { type: "notLoaded" },
    turns: [{
      id: "turn-1",
      status: "completed",
      items: [],
      itemsView: "full",
      error: null,
      startedAt: 0,
      completedAt: 1,
      durationMs: 1000,
    }],
  });
  const hydrated = createClientSequenceRecorder([{ thread: metadataThread }, { thread: hydratedThread }]);
  const hydratedActions: unknown[] = [];

  const displayThread = await readThreadForDisplay(
    hydrated.client,
    metadataThread,
    (action: unknown) => hydratedActions.push(action),
  );

  assertEqual(displayThread, hydratedThread, "display read should prefer hydrated thread history when available");
  assertRequest(
    hydrated.requests,
    0,
    "thread/read",
    { threadId: "thread-history", includeTurns: false },
    "display read should first load metadata without turns",
  );
  assertRequest(
    hydrated.requests,
    1,
    "thread/read",
    { threadId: "thread-history", includeTurns: true },
    "display read should then hydrate turns",
  );
  assertEqual(hydratedActions.length, 0, "hydrated display read should not log materialization fallback");

  const unmaterialized = createClientSequenceRecorder([
    { thread: metadataThread },
    new Error("includeTurns is unavailable before first user message"),
  ]);
  const fallbackActions: unknown[] = [];
  const fallbackThread = await readThreadForDisplay(
    unmaterialized.client,
    metadataThread,
    (action: unknown) => fallbackActions.push(action),
  );

  assertEqual(fallbackThread, metadataThread, "unmaterialized display read should keep metadata thread");
  assertEqual(
    unmaterialized.requests.some((request) => request.method === "thread/start"),
    false,
    "unmaterialized display read must not create a replacement thread",
  );
  assertDeepEqual(
    fallbackActions,
    [{
      type: "log",
      text: "thread is not materialized yet; it will load turns after the first user message",
      level: "info",
    }],
    "unmaterialized display read should log the expected fallback",
  );
}

async function buildsReadyThreadRequestsForTurns(): Promise<void> {
  const createdThread = threadFixture({ id: "created-thread", cwd: "/workspace/project", gitInfo: null });
  const createdHydratedThread = threadFixture({
    id: "created-thread",
    cwd: "/workspace/project",
    gitInfo: {
      branch: "main",
      sha: "abcdef1234567890",
      originUrl: "git@example.com:hicodex/HiCodex.git",
    },
  });
  const created = createClientSequenceRecorder([{ thread: createdThread }, { thread: createdHydratedThread }]);
  const createdActions: unknown[] = [];
  const createdReady = await ensureThreadReadyForTurn({
    client: created.client,
    activeThread: null,
    activeThreadId: null,
    workspace: " /workspace/project ",
    dispatch: (action: unknown) => {
      createdActions.push(action);
    },
    context: {
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    },
  });
  assertEqual(createdReady.threadId, "created-thread", "missing active thread should return the created thread id");
  assertEqual(createdReady.source, "created", "missing active thread should report a created source");
  assertRequest(
    created.requests,
    0,
    "thread/start",
    {
      cwd: "/workspace/project",
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      threadSource: "user",
    },
    "missing active thread should create a new thread for the first turn",
  );
  assertRequest(
    created.requests,
    1,
    "thread/read",
    { threadId: "created-thread", includeTurns: false },
    "newly created thread should hydrate metadata before the first turn starts",
  );
  assertDeepEqual(
    createdActions,
    [{ type: "upsertThread", thread: createdHydratedThread, select: true }],
    "newly created thread should select the hydrated app-server metadata snapshot",
  );

  const resumed = createClientRecorder({ thread: threadFixture({ id: "thread-1", status: { type: "idle" } }) });
  await ensureThreadReadyForTurn({
    client: resumed.client,
    activeThread: threadFixture({ id: "thread-1", status: { type: "notLoaded" } }),
    activeThreadId: "thread-1",
    workspace: " /workspace/project ",
    dispatch: () => {},
    context: {
      sandbox: "workspace-write",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    },
  });
  assertRequest(
    resumed.requests,
    0,
    "thread/read",
    { threadId: "thread-1", includeTurns: false },
    "notLoaded historical thread should load metadata before resume",
  );
  assertRequest(
    resumed.requests,
    1,
    "thread/resume",
    {
      threadId: "thread-1",
      cwd: "/workspace/project",
      sandbox: "workspace-write",
    },
    "notLoaded historical thread should resume before starting a turn",
  );

  const imageInput: UserInput[] = [{ type: "text", text: "please generate an image of a glass city", text_elements: [] }];
  const imageFallbackThread = threadFixture({ id: "image-thread", cwd: "/workspace/project", gitInfo: null });
  const imageFallbackHydrated = threadFixture({ id: "image-thread", cwd: "/workspace/project" });
  const imageFallback = createClientSequenceRecorder([{ thread: imageFallbackThread }, { thread: imageFallbackHydrated }]);
  const imageFallbackActions: unknown[] = [];
  const imageFallbackReady = await ensureThreadReadyForTurn({
    client: imageFallback.client,
    activeThread: threadFixture({ id: "old-thread", status: { type: "notLoaded" }, path: "/tmp/old-rollout.jsonl" }),
    activeThreadId: "old-thread",
    input: imageInput,
    workspace: "/workspace/project",
    dispatch: (action: unknown) => {
      imageFallbackActions.push(action);
    },
    threadCreationOptions: { includeDynamicTools: true },
    readRolloutText: async () => JSON.stringify({
      timestamp: "2026-05-18T00:00:00Z",
      type: "session_meta",
      payload: {},
    }),
  });
  assertEqual(imageFallbackReady.threadId, "image-thread", "old image request should move to a dynamic-tool thread");
  assertEqual(imageFallbackReady.source, "created", "old image request fallback should report a created source");
  assertRequest(
    imageFallback.requests,
    0,
    "thread/start",
    { cwd: "/workspace/project", threadSource: "user", dynamicTools: [HICODEX_IMAGE_DYNAMIC_TOOL_SPEC] },
    "old image request fallback should create a thread with dynamic tools",
  );
  assertRequest(
    imageFallback.requests,
    1,
    "thread/read",
    { threadId: "image-thread", includeTurns: false },
    "old image request fallback should hydrate the newly created thread",
  );
  assertEqual(
    imageFallback.requests.some((request) => request.method === "thread/resume"),
    false,
    "old image request fallback must not pass unsupported dynamicTools through thread/resume",
  );
  assertDeepEqual(
    imageFallbackActions,
    [
      { type: "log", text: IMAGE_TOOL_RESUME_FALLBACK_MESSAGE, level: "warn" },
      { type: "upsertThread", thread: imageFallbackHydrated, select: true },
    ],
    "old image request fallback should warn and select the image-capable thread",
  );

  const restorableImage = createClientRecorder({ thread: threadFixture({ id: "restorable-thread", status: { type: "idle" } }) });
  await ensureThreadReadyForTurn({
    client: restorableImage.client,
    activeThread: threadFixture({ id: "restorable-thread", status: { type: "notLoaded" }, path: "/tmp/restorable-rollout.jsonl" }),
    activeThreadId: "restorable-thread",
    input: imageInput,
    workspace: "/workspace/project",
    dispatch: () => {},
    threadCreationOptions: { includeDynamicTools: true },
    readRolloutText: async () => JSON.stringify({
      timestamp: "2026-05-18T00:00:00Z",
      type: "session_meta",
      payload: {
        dynamic_tools: [HICODEX_IMAGE_DYNAMIC_TOOL_SPEC],
      },
    }),
  });
  assertRequest(
    restorableImage.requests,
    0,
    "thread/read",
    { threadId: "restorable-thread", includeTurns: false },
    "restorable image thread should still do the normal metadata read",
  );
  assertRequest(
    restorableImage.requests,
    1,
    "thread/resume",
    {
      threadId: "restorable-thread",
      cwd: "/workspace/project",
    },
    "restorable image thread should resume because app-server can load persisted dynamic tools",
  );

  const selected = createClientRecorder();
  await ensureThreadReadyForTurn({
    client: selected.client,
    activeThread: threadFixture({ id: "thread-1", status: { type: "idle" } }),
    activeThreadId: "thread-1",
    workspace: " /workspace/project ",
    dispatch: () => {},
  });
  assertEqual(selected.requests.length, 0, "loaded selected thread should be reused without lifecycle RPCs");
}

async function resumesSelectedHistoricalThreadBeforeRetryingTurn(): Promise<void> {
  const input: UserInput[] = [{ type: "text", text: "continue here", text_elements: [] }];
  const resumedThread = threadFixture({ id: "thread-history", status: { type: "idle" } });
  const sent = createClientSequenceRecorder([
    { thread: threadFixture({ id: "thread-history", status: { type: "notLoaded" } }) },
    { thread: resumedThread },
    { turn: { id: "turn-1" } },
  ]);
  const actions: unknown[] = [];

  const recovered = await resumeSelectedThreadAndStartTurn(
    sent.client,
    "thread-history",
    input,
    " /workspace/project ",
    (action: unknown) => {
      actions.push(action);
    },
    {
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    },
  );

  assertEqual(recovered, true, "recoverable selected historical thread should resume and send");
  assertRequest(
    sent.requests,
    0,
    "thread/read",
    { threadId: "thread-history", includeTurns: false },
    "selected historical thread recovery should load metadata before resume",
  );
  assertRequest(
    sent.requests,
    1,
    "thread/resume",
    {
      threadId: "thread-history",
      cwd: "/workspace/project",
      model: "gpt-5.2",
    },
    "selected historical thread recovery should resume the same thread without turn-only environments",
  );
  assertRequest(
    sent.requests,
    2,
    "turn/start",
    {
      threadId: "thread-history",
      input,
      cwd: "/workspace/project",
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    },
    "selected historical thread recovery should retry turn/start on the same thread id",
  );
  assertEqual(
    sent.requests.some((request) => request.method === "thread/start"),
    false,
    "selected historical thread recovery must not create a replacement thread",
  );
  assertDeepEqual(
    actions,
    [{ type: "upsertThread", thread: resumedThread, select: true }],
    "selected historical thread recovery should select the resumed thread",
  );

  const missing = createClientSequenceRecorder([new Error("thread not found: thread-history")]);
  const missingActions: unknown[] = [];
  const missingRecovered = await resumeSelectedThreadAndStartTurn(
    missing.client,
    "thread-history",
    input,
    "/workspace/project",
    (action: unknown) => {
      missingActions.push(action);
    },
  );

  assertEqual(missingRecovered, false, "missing selected thread should report unsent instead of throwing");
  assertRequest(
    missing.requests,
    0,
    "thread/read",
    { threadId: "thread-history", includeTurns: false },
    "missing selected thread should stop at metadata read",
  );
  assertEqual(missingActions.length, 0, "missing selected thread should not dispatch a fake resumed thread");
}

async function refreshesThreadMetadataWithoutChangingSelection(): Promise<void> {
  const thread = threadFixture({
    id: "thread-metadata",
    cwd: "/workspace/project",
    gitInfo: {
      branch: "main",
      sha: "abcdef1234567890",
      originUrl: "git@example.com:hicodex/HiCodex.git",
    },
  });
  const refreshed = createClientRecorder({ thread });
  const actions: unknown[] = [];

  await refreshThreadMetadata(refreshed.client, " thread-metadata ", (action: unknown) => {
    actions.push(action);
  });

  assertRequest(
    refreshed.requests,
    0,
    "thread/read",
    { threadId: "thread-metadata", includeTurns: false },
    "thread metadata refresh should read metadata without turn hydration",
  );
  assertDeepEqual(
    actions,
    [{ type: "upsertThread", thread }],
    "thread metadata refresh should merge metadata without selecting the thread",
  );
}

async function forksThreadFromTurnUsingDesktopSequence(): Promise<void> {
  const sourceThread = threadFixture({
    id: "source-thread",
    turns: [
      turnFixture("turn-1"),
      turnFixture("turn-2"),
      turnFixture("turn-3"),
    ],
  });
  const forkedThread = threadFixture({ id: "forked-thread", turns: sourceThread.turns });
  const rolledBackThread = threadFixture({
    id: "forked-thread",
    turns: [
      turnFixture("turn-1"),
      turnFixture("turn-2"),
    ],
  });
  const forked = createClientSequenceRecorder([
    { thread: sourceThread },
    { thread: forkedThread },
    { thread: rolledBackThread },
  ]);

  const result = await forkThreadFromTurn(forked.client, "source-thread", "turn-2", " /workspace ", {
    model: "gpt-5.2",
    environments: [{ environmentId: "remote", cwd: "/workspace" }],
  });

  assertEqual(result.thread, rolledBackThread, "fork from turn should return the rolled back fork");
  assertRequest(
    forked.requests,
    0,
    "thread/read",
    { threadId: "source-thread", includeTurns: true },
    "fork from turn should read the source turns first",
  );
  assertRequest(
    forked.requests,
    1,
    "thread/fork",
    {
      threadId: "source-thread",
      path: null,
      persistExtendedHistory: false,
      cwd: "/workspace",
      model: "gpt-5.2",
      threadSource: "user",
    },
    "fork from turn should fork the complete source thread first",
  );
  assertRequest(
    forked.requests,
    2,
    "thread/rollback",
    { threadId: "forked-thread", numTurns: 1 },
    "fork from turn should roll back later turns on the fork",
  );
}

async function startsEphemeralSideConversationByInjectingDesktopBoundary(): Promise<void> {
  const sideThread = threadFixture({ id: "side-thread", cwd: "/workspace", forkedFromId: "source-thread" });
  const side = createClientSequenceRecorder([
    { thread: sideThread },
    {},
  ]);

  const result = await startSideConversation(
    side.client,
    "source-thread",
    " /workspace ",
    {
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace" }],
      developerInstructions: "Existing developer rule.",
      personality: "friendly",
    },
  );

  assertEqual(result.thread, sideThread, "side conversation should return the ephemeral fork thread");
  assertRequest(
    side.requests,
    0,
    "thread/fork",
    {
      threadId: "source-thread",
      path: null,
      persistExtendedHistory: false,
      cwd: "/workspace",
      model: "gpt-5.2",
      developerInstructions: `Existing developer rule.\n\n${SIDE_CONVERSATION_DEVELOPER_INSTRUCTIONS}`,
      ephemeral: true,
      threadSource: "user",
    },
    "side conversation should fork the source thread as an ephemeral right-panel thread",
  );
  assertRequest(
    side.requests,
    1,
    "thread/inject_items",
    {
      threadId: "side-thread",
      items: [{
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: SIDE_CONVERSATION_BOUNDARY_MESSAGE,
        }],
      }],
    },
    "side conversation should inject Desktop's synthetic boundary message into the fork",
  );
  assertEqual(side.requests[0]?.timeout, 120_000, "side conversation fork should use a long timeout");
  assertEqual(side.requests[1]?.timeout, 120_000, "side conversation injection should use a long timeout");
  assertEqual(side.requests.some((request) => request.method === "turn/start"), false, "side conversation opening should not start a turn");
}

async function editsLastUserTurnUsingDesktopRollbackThenStartSequence(): Promise<void> {
  const latestTurn = turnFixture("turn-2", {
    items: [
      {
        type: "userMessage",
        id: "user-2",
        content: [
          { type: "skill", name: "review", path: "skills/review" },
          { type: "text", text: "old prompt", text_elements: [{ byteRange: { start: 0, end: 3 }, placeholder: "old" }] },
          { type: "localImage", path: "/tmp/screenshot.png" },
        ],
      },
      { type: "agentMessage", id: "agent-2", text: "Done", phase: "final_answer", memoryCitation: null },
    ],
  });
  const sourceThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1"), latestTurn],
  });
  const rolledBackThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1")],
  });
  const edited = createClientSequenceRecorder([
    { thread: sourceThread },
    { thread: rolledBackThread },
    { turn: { id: "turn-edited" } },
  ]);
  const rollbacks: Thread[] = [];

  await editLastUserTurn(
    edited.client,
    "thread-edit",
    "turn-2",
    "new prompt",
    "/workspace/ui",
    { model: "gpt-5.2" },
    (thread) => rollbacks.push(thread),
  );

  assertRequest(
    edited.requests,
    0,
    "thread/read",
    { threadId: "thread-edit", includeTurns: true },
    "edit last turn should first read the source turn input",
  );
  assertRequest(
    edited.requests,
    1,
    "thread/rollback",
    { threadId: "thread-edit", numTurns: 1 },
    "edit last turn should roll back exactly the latest turn",
  );
  assertRequest(
    edited.requests,
    2,
    "turn/start",
    {
      threadId: "thread-edit",
      input: [
        { type: "skill", name: "review", path: "skills/review" },
        { type: "text", text: "new prompt", text_elements: [] },
        { type: "localImage", path: "/tmp/screenshot.png" },
      ],
      cwd: "/workspace/source",
      model: "gpt-5.2",
    },
    "edit last turn should preserve structured inputs and replace the first text part",
  );
  assertDeepEqual(rollbacks, [rolledBackThread], "edit last turn should expose the rollback thread snapshot after restart succeeds");
}

async function recoversThreadNotFoundOnEditByResumingFirst(): Promise<void> {
  // App-server lost the in-memory thread (restart / unloaded) → first
  // `thread/read` rejects with "thread not found". `editLastUserTurn` should
  // call `thread/resume` and retry the read instead of bubbling the error up.
  const latestTurn = turnFixture("turn-2", {
    items: [
      {
        type: "userMessage",
        id: "user-2",
        content: [{ type: "text", text: "old prompt", text_elements: [] }],
      },
      { type: "agentMessage", id: "agent-2", text: "Done", phase: "final_answer", memoryCitation: null },
    ],
  });
  const sourceThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1"), latestTurn],
  });
  const rolledBackThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1")],
  });
  const recorder = createClientSequenceRecorder([
    new Error("thread not found: thread-edit"),
    { thread: sourceThread },                  // thread/resume response
    { thread: sourceThread },                  // retried thread/read response
    { thread: rolledBackThread },              // thread/rollback response
    { turn: { id: "turn-edited" } },           // turn/start response
  ]);
  const rollbacks: Thread[] = [];

  await editLastUserTurn(
    recorder.client,
    "thread-edit",
    "turn-2",
    "new prompt",
    "/workspace/ui",
    { model: "gpt-5.2" },
    (thread) => rollbacks.push(thread),
    "/sessions/2026/05/13/rollout-thread-edit.jsonl",
  );

  assertRequest(
    recorder.requests,
    0,
    "thread/read",
    { threadId: "thread-edit", includeTurns: true },
    "edit should first attempt to read the thread",
  );
  assertRequest(
    recorder.requests,
    1,
    "thread/resume",
    {
      threadId: "thread-edit",
      path: "/sessions/2026/05/13/rollout-thread-edit.jsonl",
      cwd: "/workspace/ui",
      model: "gpt-5.2",
    },
    "edit should resume the thread with the rollout path so a stale session_index doesn't block recovery",
  );
  assertRequest(
    recorder.requests,
    2,
    "thread/read",
    { threadId: "thread-edit", includeTurns: true },
    "edit should retry thread/read after resume",
  );
  assertRequest(
    recorder.requests,
    3,
    "thread/rollback",
    { threadId: "thread-edit", numTurns: 1 },
    "edit should rollback the latest turn after recovery",
  );
  assertEqual(recorder.requests[4]?.method, "turn/start", "edit should still issue turn/start after recovery");
  assertDeepEqual(rollbacks, [rolledBackThread], "edit should expose the rollback snapshot after recovery");
}

async function recoversThreadNotFoundOnEditRollbackByResumingFirst(): Promise<void> {
  // `thread/read` can rebuild the turn list from disk while `thread/rollback`
  // still requires a live thread handle. If rollback reports "thread not found",
  // recover with `thread/resume` and retry the rollback.
  const latestTurn = turnFixture("turn-2", {
    items: [
      {
        type: "userMessage",
        id: "user-2",
        content: [{ type: "text", text: "old prompt", text_elements: [] }],
      },
      { type: "agentMessage", id: "agent-2", text: "Done", phase: "final_answer", memoryCitation: null },
    ],
  });
  const sourceThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    path: "/sessions/2026/05/13/rollout-thread-edit.jsonl",
    turns: [turnFixture("turn-1"), latestTurn],
  });
  const rolledBackThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1")],
  });
  const recorder = createClientSequenceRecorder([
    { thread: sourceThread },
    new Error("thread not found: thread-edit"),
    { thread: sourceThread },
    { thread: rolledBackThread },
    { turn: { id: "turn-edited" } },
  ]);
  const rollbacks: Thread[] = [];

  await editLastUserTurn(
    recorder.client,
    "thread-edit",
    "turn-2",
    "new prompt",
    "/workspace/ui",
    { model: "gpt-5.2" },
    (thread) => rollbacks.push(thread),
  );

  assertRequest(
    recorder.requests,
    0,
    "thread/read",
    { threadId: "thread-edit", includeTurns: true },
    "rollback recovery should still read the source turn first",
  );
  assertRequest(
    recorder.requests,
    1,
    "thread/rollback",
    { threadId: "thread-edit", numTurns: 1 },
    "rollback recovery should attempt rollback before resuming",
  );
  assertRequest(
    recorder.requests,
    2,
    "thread/resume",
    {
      threadId: "thread-edit",
      path: "/sessions/2026/05/13/rollout-thread-edit.jsonl",
      cwd: "/workspace/source",
      model: "gpt-5.2",
    },
    "rollback recovery should resume using the path returned by thread/read",
  );
  assertRequest(
    recorder.requests,
    3,
    "thread/rollback",
    { threadId: "thread-edit", numTurns: 1 },
    "rollback recovery should retry rollback after resume",
  );
  assertEqual(recorder.requests[4]?.method, "turn/start", "rollback recovery should still restart the edited turn");
  assertDeepEqual(rollbacks, [rolledBackThread], "rollback recovery should expose the rollback snapshot");
}

async function restoresOriginalEditInputWhenEditedTurnStartFails(): Promise<void> {
  const originalInput: UserInput[] = [
    { type: "skill", name: "review", path: "skills/review" },
    { type: "text", text: "old prompt", text_elements: [] },
  ];
  const latestTurn = turnFixture("turn-2", {
    items: [
      {
        type: "userMessage",
        id: "user-2",
        content: originalInput,
      },
      { type: "agentMessage", id: "agent-2", text: "Done", phase: "final_answer", memoryCitation: null },
    ],
  });
  const sourceThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1"), latestTurn],
  });
  const rolledBackThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1")],
  });
  const startError = new Error("turn/start failed");
  const recorder = createClientSequenceRecorder([
    { thread: sourceThread },
    { thread: rolledBackThread },
    startError,
    { turn: { id: "turn-restored" } },
  ]);
  const rollbacks: Thread[] = [];
  let thrown: unknown = null;

  try {
    await editLastUserTurn(
      recorder.client,
      "thread-edit",
      "turn-2",
      "new prompt",
      "/workspace/ui",
      { model: "gpt-5.2" },
      (thread) => rollbacks.push(thread),
    );
  } catch (error) {
    thrown = error;
  }

  assertEqual(thrown, startError, "edit should surface the edited turn/start failure after restoring the original input");
  assertRequest(
    recorder.requests,
    2,
    "turn/start",
    {
      threadId: "thread-edit",
      input: [
        { type: "skill", name: "review", path: "skills/review" },
        { type: "text", text: "new prompt", text_elements: [] },
      ],
      cwd: "/workspace/source",
      model: "gpt-5.2",
    },
    "edit should first try to start the edited prompt",
  );
  assertRequest(
    recorder.requests,
    3,
    "turn/start",
    {
      threadId: "thread-edit",
      input: originalInput,
      cwd: "/workspace/source",
      model: "gpt-5.2",
    },
    "edit should restore the original user input if the edited restart fails",
  );
  assertDeepEqual(rollbacks, [], "edit should not publish the rollback snapshot when the edited restart fails");
}

async function reportsEditFailureWhenOriginalInputRestoreAlsoFails(): Promise<void> {
  const originalInput: UserInput[] = [{ type: "text", text: "old prompt", text_elements: [] }];
  const latestTurn = turnFixture("turn-2", {
    items: [
      {
        type: "userMessage",
        id: "user-2",
        content: originalInput,
      },
      { type: "agentMessage", id: "agent-2", text: "Done", phase: "final_answer", memoryCitation: null },
    ],
  });
  const sourceThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1"), latestTurn],
  });
  const rolledBackThread = threadFixture({
    id: "thread-edit",
    cwd: "/workspace/source",
    turns: [turnFixture("turn-1")],
  });
  const recorder = createClientSequenceRecorder([
    { thread: sourceThread },
    { thread: rolledBackThread },
    new Error("edited start failed"),
    new Error("restore start failed"),
  ]);
  const rollbacks: Thread[] = [];
  let thrown: unknown = null;

  try {
    await editLastUserTurn(
      recorder.client,
      "thread-edit",
      "turn-2",
      "new prompt",
      "/workspace/ui",
      { model: "gpt-5.2" },
      (thread) => rollbacks.push(thread),
    );
  } catch (error) {
    thrown = error;
  }

  assertEqual(thrown instanceof Error, true, "double edit failure should throw a descriptive Error");
  assertEqual(
    String((thrown as Error).message).includes("Edited message failed to start after rollback: edited start failed."),
    true,
    "double edit failure should include the edited restart error",
  );
  assertEqual(
    String((thrown as Error).message).includes("Restoring the original message also failed: restore start failed"),
    true,
    "double edit failure should include the original input restore error",
  );
  assertDeepEqual(rollbacks, [], "double edit failure should not publish the rollback snapshot");
}

function buildsTurnStartAndSteerRequests(): void {
  const input: UserInput[] = [{ type: "text", text: "hello", text_elements: [] }];
  const start = createClientRecorder();
  void startTurn(start.client, "thread-1", input, "  /workspace/project  ", {
    model: "gpt-5.2",
    modelProvider: "hicodex_local",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
    baseInstructions: "Base",
    developerInstructions: "Dev",
    personality: "pragmatic",
    reasoningEffort: "medium",
    reasoningSummary: "none",
  });
  assertRequest(
    start.requests,
    0,
    "turn/start",
    {
      threadId: "thread-1",
      input,
      cwd: "/workspace/project",
      model: "gpt-5.2",
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
      environments: [{ environmentId: "remote", cwd: "/workspace/project" }],
      effort: "medium",
      summary: "none",
      personality: "pragmatic",
    },
    "startTurn should build a protocol-shaped turn/start request",
  );

  const emptyWorkspace = createClientRecorder();
  void startTurn(emptyWorkspace.client, "thread-2", input, "");
  assertRequest(
    emptyWorkspace.requests,
    0,
    "turn/start",
    {
      threadId: "thread-2",
      input,
      cwd: null,
    },
    "startTurn should use null cwd for empty workspace",
  );

  const steer = createClientRecorder();
  void steerTurn(steer.client, "thread-1", input, "turn-active");
  assertRequest(
    steer.requests,
    0,
    "turn/steer",
    {
      threadId: "thread-1",
      input,
      expectedTurnId: "turn-active",
    },
    "steerTurn should build a turn/steer request",
  );
  assertEqual(steer.requests[0]?.timeout, null, "steerTurn should not use the short default RPC timeout");
}

function sendsPanelThreadMessagesWithoutChangingMainThreadSelection(): void {
  const input: UserInput[] = [{ type: "text", text: "continue in panel", text_elements: [] }];
  const idle = createClientRecorder();
  void sendPanelThreadMessage(idle.client, "panel-thread", input, " /workspace/panel ", {
    model: "gpt-5.2",
    environments: [{ environmentId: "remote", cwd: "/workspace/panel" }],
    personality: "friendly",
  });
  assertRequest(
    idle.requests,
    0,
    "turn/start",
    {
      threadId: "panel-thread",
      input,
      cwd: "/workspace/panel",
      model: "gpt-5.2",
      environments: [{ environmentId: "remote", cwd: "/workspace/panel" }],
      personality: "friendly",
    },
    "idle panel thread should receive a normal turn/start without selecting the main thread",
  );

  const running = createClientRecorder();
  void sendPanelThreadMessage(running.client, "panel-thread", input, "/workspace/panel", null, "turn-active");
  assertRequest(
    running.requests,
    0,
    "turn/steer",
    {
      threadId: "panel-thread",
      input,
      expectedTurnId: "turn-active",
    },
    "running panel thread should steer the active turn instead of starting a competing turn",
  );
}

function interruptsPanelThreadTurnsWithoutChangingMainThreadSelection(): void {
  const recorder = createClientRecorder();
  void interruptThreadTurn(recorder.client, "panel-thread", "turn-active");
  assertRequest(
    recorder.requests,
    0,
    "turn/interrupt",
    {
      threadId: "panel-thread",
      turnId: "turn-active",
    },
    "panel stop should interrupt the panel thread's active turn directly",
  );
  assertEqual(recorder.requests[0]?.timeout, 120_000, "panel stop should use the interrupt RPC timeout");
}
