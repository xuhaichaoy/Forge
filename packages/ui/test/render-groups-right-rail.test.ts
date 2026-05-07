import type { ThreadItem } from "@hicodex/codex-protocol";
import { projectConversation } from "../src/state/render-groups";

export default function runRenderGroupsRightRailTests(): void {
  usesLatestTodoListPlanForProgress();
  dedupesArtifactsAcrossFileChangesAndAssistantText();
  excludesNodeReplSourcesButKeepsMcpAndWebSearchSources();
}

function usesLatestTodoListPlanForProgress(): void {
  const projection = projectConversation([
    {
      type: "todo-list",
      id: "todo-old",
      plan: [
        { step: "Read AGENTS.md", status: "completed" },
        { step: "Inspect existing render groups", status: "completed" },
      ],
    } as ThreadItem,
    {
      type: "todo-list",
      id: "todo-new",
      plan: [
        { step: "Add right rail tests", status: "in_progress" },
        { step: "Report documented gaps", status: "pending" },
      ],
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.progress.map((entry) => entry.title),
    ["Add right rail tests", "Report documented gaps"],
    "progress should use only the latest todo-list plan",
  );
  assertDeepEqual(
    projection.progress.map((entry) => entry.status),
    ["in_progress", "pending"],
    "progress should preserve latest todo-list statuses",
  );
}

function dedupesArtifactsAcrossFileChangesAndAssistantText(): void {
  const projection = projectConversation([
    {
      type: "fileChange",
      id: "file-change-1",
      status: "completed",
      path: "packages/ui/src/state/render-groups.ts",
      changes: [
        { path: "packages/ui/src/state/render-groups.ts", kind: "update" },
        { newPath: "packages/ui/test/render-groups-right-rail.test.ts", kind: "add" },
      ],
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-1",
      text:
        "Updated [render groups](packages/ui/src/state/render-groups.ts), " +
        "`packages/ui/test/render-groups-right-rail.test.ts`, " +
        "[local preview](http://localhost:5178/) and http://localhost:5178/",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [
      "packages/ui/src/state/render-groups.ts",
      "packages/ui/test/render-groups-right-rail.test.ts",
      "http://localhost:5178/",
    ],
    "artifacts should dedupe fileChange paths, assistant file references, and repeated URLs",
  );
}

function excludesNodeReplSourcesButKeepsMcpAndWebSearchSources(): void {
  const projection = projectConversation([
    {
      type: "mcpToolCall",
      id: "node-repl-1",
      server: "node_repl",
      tool: "js",
      status: "completed",
      arguments: { code: "1 + 1" },
      result: "2",
      error: null,
    } as ThreadItem,
    {
      type: "mcpToolCall",
      id: "github-1",
      server: "github",
      tool: "list_prs",
      status: "completed",
      arguments: { state: "open" },
      result: { count: 1 },
      error: null,
    } as ThreadItem,
    {
      type: "webSearch",
      id: "web-search-1",
      query: "Codex Desktop right rail sources",
      status: "completed",
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.sources.map((entry) => entry.id),
    ["mcp:github:list_prs", "web:Codex Desktop right rail sources"],
    "sources should exclude node_repl while keeping ordinary MCP and web search sources",
  );
  assertDeepEqual(
    projection.sources.map((entry) => entry.meta),
    ["MCP tool", "Web search"],
    "sources should preserve source kinds",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
