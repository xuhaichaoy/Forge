import { multiAgentAgentColor, toolActivityDetailViewModel } from "../src/components/tool-activity-detail";

export default function runToolActivityDetailTests(): void {
  buildsExecDetails();
  buildsDesktopLightweightExecRows();
  buildsPatchDetails();
  buildsMcpDetails();
  buildsDynamicToolDetails();
  buildsAutoReviewDetails();
  buildsHookDetails();
  buildsWebSearchDetails();
  buildsMultiAgentDetails();
}

function buildsDesktopLightweightExecRows(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "read-1",
      command: "sed -n '1,20p' src/app.ts",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "read", path: "src/app.ts", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "read-1",
      running: false,
      label: "Read src/app.ts",
    },
    "read commands should render as Desktop lightweight command rows",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "search-1",
      command: "rg Codex packages/ui",
      cwd: "/workspace",
      status: "completed",
      parsedCmd: { type: "search", query: "Codex", path: "packages/ui", isFinished: true },
    }),
    {
      kind: "execSummary",
      id: "search-1",
      running: false,
      label: "Searched for Codex in packages/ui",
    },
    "search commands should render as Desktop lightweight command rows",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "commandExecution",
      id: "list-1",
      command: "ls packages/ui",
      cwd: "/workspace",
      status: "running",
      parsedCmd: { type: "list_files", path: "packages/ui", isFinished: false },
    }),
    {
      kind: "execSummary",
      id: "list-1",
      running: true,
      label: "Listing files in packages/ui",
    },
    "running list commands should render as Desktop lightweight command rows",
  );
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
      footer: "",
    },
    "successful exec detail should expose command and output without an extra Desktop footer",
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
      id: "mcp-pending-1",
      invocation: { server: "github", tool: "list_prs", arguments: { state: "open" } },
      status: "inProgress",
      result: null,
      error: null,
    }),
    {
      kind: "pendingTool",
      id: "mcp-pending-1",
      running: true,
      name: "github:list_prs",
      source: "GitHub",
      label: "Calling list_prs",
      status: "inProgress",
    },
    "pending MCP rows should expose Desktop-style source and active tool label",
  );
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

function buildsAutoReviewDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "automatic-approval-review",
      id: "auto-review-1",
      status: "approved",
      riskLevel: "low",
      rationale: "Command matches policy",
    }),
    {
      kind: "text",
      id: "auto-review-1",
      running: false,
      title: "Auto-review",
      text: "Status: approved\nRisk: low\nRationale: Command matches policy",
    },
    "auto-review detail should preserve status, risk, and rationale",
  );
}

function buildsHookDetails(): void {
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "hook",
      id: "hook-1",
      key: "post-command",
      run: { status: "completed", command: "echo ok" },
    }),
    {
      kind: "text",
      id: "hook-1",
      running: false,
      title: "Hook",
      text: "Status: completed\nKey: post-command\nCommand: echo ok",
    },
    "hook detail should preserve run status, key, and command",
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
      faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    },
    "web search detail should use Desktop action detail before query fallback",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-2",
      query: "Codex Desktop site:platform.openai.com OR site:developers.openai.com",
      action: { type: "search", query: "Codex Desktop site:platform.openai.com OR site:developers.openai.com" },
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-2",
      running: false,
      detail: "Codex Desktop | platform.openai.com · developers.openai.com",
      faviconUrl: "https://www.google.com/s2/favicons?domain=openai.com&sz=32",
    },
    "web search detail should expose Desktop-style site suffix and favicon",
  );
  assertDeepEqual(
    toolActivityDetailViewModel({
      type: "webSearch",
      id: "web-3",
      query: "latest from https://docs.github.com/en/actions",
      completed: true,
    }),
    {
      kind: "webSearch",
      id: "web-3",
      running: false,
      detail: "latest from https://docs.github.com/en/actions",
      faviconUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    },
    "web search fallback query should infer URL favicons like Codex Desktop",
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
              model: null,
              role: null,
            },
            { kind: "text", text: ": " },
            { kind: "prompt", text: "Continue" },
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
              model: null,
              role: null,
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
              model: null,
              role: null,
            },
          ],
          text: "Closed agent-fe...4321",
        },
        {
          key: "meta-prompt-agent-3",
          parts: [
            { kind: "text", text: "Input: " },
            { kind: "prompt", text: "Close it" },
          ],
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
              model: "gpt-5.4",
              role: "explorer",
            },
            { kind: "text", text: " with the instructions: " },
            { kind: "prompt", text: "Inspect UI" },
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
