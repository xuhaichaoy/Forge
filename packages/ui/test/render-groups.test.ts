import type { ThreadItem } from "@hicodex/codex-protocol";
import { itemText, projectConversation } from "../src/state/render-groups";

export default function runRenderGroupsTests(): void {
  projectsUserAndAssistantMessagesAsStableMessageGroups();
  groupsReasoningSummaryAndContentIntoToolActivity();
  groupsToolActivityItemsAndPreservesSummaries();
  groupsWebSearchIntoActivityAndSources();
  returnsEmptyProjectionForEmptyItems();
}

function projectsUserAndAssistantMessagesAsStableMessageGroups(): void {
  const userMessage: ThreadItem = {
    type: "userMessage",
    id: "user-1",
    content: [
      { type: "text", text: "Add render group tests" },
      { type: "mention", name: "packages/ui/src/state/render-groups.ts" },
    ],
  };
  const assistantMessage: ThreadItem = {
    type: "agentMessage",
    id: "agent-1",
    text: "Done.",
    phase: "final",
    memoryCitation: null,
  };

  const projection = projectConversation([userMessage, assistantMessage]);

  assertEqual(projection.units.length, 2, "message projection should keep two groups");
  const first = projection.units[0];
  const second = projection.units[1];
  assertEqual(first?.kind, "message", "user message should render as a message group");
  if (first?.kind === "message") {
    assertEqual(first.key, "user-1", "user message key should use the item id");
    assertEqual(first.role, "user", "user message role should be stable");
    assertEqual(
      first.text,
      "Add render group tests\n@packages/ui/src/state/render-groups.ts",
      "user message content should be flattened",
    );
  }
  assertEqual(second?.kind, "message", "assistant message should render as a message group");
  if (second?.kind === "message") {
    assertEqual(second.key, "agent-1", "assistant message key should use the item id");
    assertEqual(second.role, "assistant", "assistant message role should be stable");
    assertEqual(second.text, "Done.", "assistant message text should be preserved");
  }
}

function groupsReasoningSummaryAndContentIntoToolActivity(): void {
  const reasoning: ThreadItem = {
    type: "reasoning",
    id: "reasoning-1",
    summary: ["Checked the projection contract"],
    content: ["Reasoning details stay on the item"],
  };

  const projection = projectConversation([reasoning]);
  const unit = projection.units[0];

  assertEqual(projection.units.length, 1, "reasoning should produce one render group");
  assertEqual(unit?.kind, "toolActivity", "reasoning should be grouped as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "tool:reasoning-1:reasoning-1", "reasoning activity key should be stable");
    assertEqual(unit.summary.label, "Reasoned", "reasoning activity label");
    assertEqual(unit.summary.counts.reasoning, 1, "reasoning activity count");
    assertDeepEqual(unit.summary.details, ["Reasoned"], "reasoning activity detail");
    assertEqual(unit.items[0], reasoning, "reasoning item should stay attached to the activity group");
  }
  assertEqual(
    itemText(reasoning),
    "Checked the projection contract\nReasoning details stay on the item",
    "reasoning summary and content should remain readable from the item",
  );
}

function groupsToolActivityItemsAndPreservesSummaries(): void {
  const items: ThreadItem[] = [
    {
      type: "commandExecution",
      id: "command-1",
      command: "npm run test",
      cwd: "/workspace",
      status: "completed",
      aggregatedOutput: "ok",
      exitCode: 0,
    },
    {
      type: "fileChange",
      id: "file-change-1",
      status: "completed",
      changes: [
        { path: "packages/ui/src/state/render-groups.ts", kind: "update" },
        { newPath: "packages/ui/test/render-groups.test.ts", kind: "add" },
      ],
    },
    {
      type: "mcpToolCall",
      id: "mcp-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { count: 2 },
      error: null,
    },
    {
      type: "dynamicToolCall",
      id: "dynamic-1",
      namespace: "functions",
      tool: "exec_command",
      status: "running",
      arguments: { cmd: "git status --short" },
      contentItems: null,
      success: null,
    },
  ];

  const projection = projectConversation(items);
  const unit = projection.units[0];

  assertEqual(projection.units.length, 1, "adjacent tool-like items should collapse into one activity group");
  assertEqual(unit?.kind, "toolActivity", "tool-like items should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.key, "tool:command-1:dynamic-1", "tool activity key should include first and last item id");
    assertEqual(unit.summary.label, "Working", "running tool activity should keep working status");
    assertEqual(unit.summary.inProgress, true, "running dynamic tool call should mark activity in progress");
    assertEqual(unit.summary.counts.commands, 1, "command count");
    assertEqual(unit.summary.counts.fileChanges, 1, "file change count");
    assertEqual(unit.summary.counts.mcpCalls, 1, "mcp tool call count");
    assertEqual(unit.summary.counts.dynamicCalls, 1, "dynamic tool call count");
    assertIncludes(unit.summary.details, "Ran npm run test", "command title should be preserved");
    assertIncludes(unit.summary.details, "Edited 2 files", "file change summary should include file count");
    assertIncludes(unit.summary.details, "Called github:list_prs", "mcp tool title should be preserved");
    assertIncludes(
      unit.summary.details,
      "Called functions.exec_command",
      "dynamic tool title should be preserved",
    );
    assertEqual(unit.items.length, 4, "all activity items should stay attached to the activity group");
  }

  assertEqual(projection.artifacts.length, 2, "file changes should project artifact entries");
  assertEqual(projection.artifacts[0]?.title, "render-groups.ts", "first artifact title");
  assertEqual(projection.artifacts[0]?.status, "completed", "first artifact status");
  assertEqual(projection.artifacts[1]?.title, "render-groups.test.ts", "second artifact title");
  assertEqual(projection.artifacts[1]?.status, "completed", "second artifact status");
  assertEqual(projection.sources.length, 1, "non-node MCP calls should project source entries");
  assertEqual(projection.sources[0]?.title, "github:list_prs", "mcp source title");
  assertEqual(projection.sources[0]?.status, "completed", "mcp source status");
}

function groupsWebSearchIntoActivityAndSources(): void {
  const projection = projectConversation([
    {
      type: "webSearch",
      id: "web-search-1",
      query: "Codex app-server protocol",
      status: "completed",
    } as ThreadItem,
  ]);
  const unit = projection.units[0];

  assertEqual(unit?.kind, "toolActivity", "web search should render as tool activity");
  if (unit?.kind === "toolActivity") {
    assertEqual(unit.summary.label, "Searched web", "web search activity label");
    assertEqual(unit.summary.counts.webSearches, 1, "web search count");
    assertDeepEqual(
      unit.summary.details,
      ["Searched web for Codex app-server protocol"],
      "web search detail should include query",
    );
  }
  assertEqual(projection.sources.length, 1, "web search should project one source");
  assertEqual(projection.sources[0]?.id, "web:Codex app-server protocol", "web source id");
  assertEqual(projection.sources[0]?.meta, "Web search", "web source meta");
}

function returnsEmptyProjectionForEmptyItems(): void {
  const projection = projectConversation([]);

  assertEqual(projection.units.length, 0, "empty items should produce no render units");
  assertEqual(projection.progress.length, 0, "empty items should produce no progress entries");
  assertEqual(projection.artifacts.length, 0, "empty items should produce no artifacts");
  assertEqual(projection.sources.length, 0, "empty items should produce no sources");
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

function assertIncludes(actual: string[], expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
