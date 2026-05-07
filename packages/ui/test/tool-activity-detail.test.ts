import { multiAgentAgentColor, toolActivityDetailViewModel } from "../src/components/tool-activity-detail";

export default function runToolActivityDetailTests(): void {
  buildsExecDetails();
  buildsPatchDetails();
  buildsMcpDetails();
  buildsDynamicToolDetails();
  buildsWebSearchDetails();
  buildsMultiAgentDetails();
}

function buildsExecDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "exec-1",
      command: "npm run test",
      cwd: "/workspace",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    }),
    {
      kind: "exec",
      id: "exec-1",
      running: false,
      command: "npm run test",
      cwd: "/workspace",
      output: "ok",
      status: "completed",
    },
    "exec detail should expose command and output separately",
  );
}

function buildsPatchDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "fileChange",
      id: "patch-1",
      status: "completed",
      changes: [
        { path: "src/app.ts", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
    }),
    {
      kind: "patch",
      id: "patch-1",
      running: false,
      changes: [
        { action: "Edited", path: "src/app.ts", diff: "@@ -1 +1 @@\n-old\n+new" },
      ],
      status: "completed",
    },
    "patch detail should expose action, path, and diff",
  );
}

function buildsMcpDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "mcpToolCall",
      id: "mcp-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { total: 2 },
      error: null,
    }),
    {
      kind: "tool",
      id: "mcp-1",
      running: false,
      name: "github:list_prs",
      toolKind: "MCP",
      argumentsText: "{\n  \"state\": \"open\"\n}",
      resultText: "{\n  \"total\": 2\n}",
      errorText: "",
      status: "completed",
    },
    "MCP detail should expose name, parameters, and result",
  );
}

function buildsDynamicToolDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "dynamicToolCall",
      id: "dynamic-1",
      namespace: "functions",
      tool: "exec_command",
      status: "running",
      arguments: { cmd: "git status --short" },
      contentItems: [{ text: "M file" }],
    }),
    {
      kind: "tool",
      id: "dynamic-1",
      running: true,
      name: "functions.exec_command",
      toolKind: "Tool",
      argumentsText: "{\n  \"cmd\": \"git status --short\"\n}",
      resultText: "[\n  {\n    \"text\": \"M file\"\n  }\n]",
      errorText: "",
      status: "running",
    },
    "dynamic tool detail should expose namespaced name and content result",
  );
}

function buildsWebSearchDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-1",
      query: "fallback query",
      action: { type: "findInPage", pattern: "Codex", url: "https://example.com" },
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-1",
      running: false,
      detail: "'Codex' in https://example.com",
    },
    "web search detail should use Desktop action detail before query fallback",
  );
}

function buildsMultiAgentDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-1",
      tool: "sendInput",
      status: "failed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-1234567890abcdef"],
      prompt: "Continue",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-1234567890abcdef": { status: "errored", message: "tool failed" },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-1",
      running: false,
      rows: [
        {
          key: "row-agent-1-agent-1234567890abcdef",
          parts: [
            { kind: "text", text: "Failed to message " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-1234567890abcdef"),
              label: "agent-12...cdef",
              threadId: "agent-1234567890abcdef",
              title: null,
            },
            { kind: "text", text: ": Continue" },
          ],
          text: "Failed to message agent-12...cdef: Continue",
        },
      ],
    },
    "multi-agent detail should expose Desktop row text and target thread id",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-2",
      tool: "spawnAgent",
      status: "inProgress",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-fedcba0987654321"],
      prompt: null,
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-fedcba0987654321": { status: "running", message: "reading files" },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-2",
      running: true,
      rows: [
        {
          key: "row-agent-2-agent-fedcba0987654321",
          parts: [
            { kind: "text", text: "Spawning " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-fedcba0987654321"),
              label: "agent-fe...4321",
              threadId: "agent-fedcba0987654321",
              title: null,
            },
            { kind: "text", text: " (running: reading files)" },
          ],
          text: "Spawning agent-fe...4321 (running: reading files)",
        },
      ],
    },
    "multi-agent detail should include state suffix",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-3",
      tool: "closeAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-fedcba0987654321"],
      prompt: "Close it",
      model: null,
      reasoningEffort: null,
      agentsStates: {
        "agent-fedcba0987654321": { status: "shutdown", message: null },
      },
    }),
    {
      kind: "multiAgent",
      id: "agent-3",
      running: false,
      rows: [
        {
          key: "row-agent-3-agent-fedcba0987654321",
          parts: [
            { kind: "text", text: "Closed " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-fedcba0987654321"),
              label: "agent-fe...4321",
              threadId: "agent-fedcba0987654321",
              title: null,
            },
          ],
          text: "Closed agent-fe...4321",
        },
        {
          key: "meta-prompt-agent-3",
          parts: [{ kind: "text", text: "Input: Close it" }],
          text: "Input: Close it",
        },
      ],
    },
    "multi-agent detail should include generic input metadata",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "collabAgentToolCall",
      id: "agent-4",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "parent",
      receiverThreadIds: ["agent-ui-123456"],
      receiverThreads: [
        {
          threadId: "agent-ui-123456",
          thread: {
            agentNickname: "@Explorer",
            agentRole: "explorer",
          },
        },
      ],
      prompt: "Inspect UI",
      model: "gpt-5.4",
      reasoningEffort: null,
      agentsStates: {},
    }),
    {
      kind: "multiAgent",
      id: "agent-4",
      running: false,
      rows: [
        {
          key: "row-agent-4-agent-ui-123456",
          parts: [
            { kind: "text", text: "Created " },
            {
              kind: "agent",
              color: multiAgentAgentColor("agent-ui-123456"),
              label: "Explorer (explorer)",
              threadId: "agent-ui-123456",
              title: "Uses gpt-5.4",
            },
            { kind: "text", text: " with the instructions: Inspect UI" },
          ],
          text: "Created Explorer (explorer) with the instructions: Inspect UI",
        },
      ],
    },
    "multi-agent detail should use receiver thread nickname, role, color, and model title",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
