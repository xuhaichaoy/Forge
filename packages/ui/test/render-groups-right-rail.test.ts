import { projectConversation, type AccumulatedThreadItem as ThreadItem } from "../src/state/render-groups";

export default function runRenderGroupsRightRailTests(): void {
  usesLatestTodoListPlanForProgress();
  usesReducerPlanFactsForProgress();
  dedupesArtifactsAcrossFileChangesAndAssistantText();
  projectsGeneratedImageSourcesIntoArtifacts();
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

function usesReducerPlanFactsForProgress(): void {
  const projection = projectConversation([], {
    progressPlan: {
      id: "turn-plan:latest",
      plan: [
        { step: "Read Desktop bundle", status: "completed" },
        { step: "Move plan out of ThreadItem", status: "inProgress" },
      ],
    },
  });

  assertDeepEqual(
    projection.progress.map((entry) => ({ id: entry.id, title: entry.title, status: entry.status })),
    [
      { id: "turn-plan:latest:0", title: "Read Desktop bundle", status: "completed" },
      { id: "turn-plan:latest:1", title: "Move plan out of ThreadItem", status: "inProgress" },
    ],
    "explicit plan facts should drive Progress without synthetic ThreadItems",
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
  assertDeepEqual(
    projection.artifacts[0]?.reference,
    { path: "packages/ui/src/state/render-groups.ts", lineStart: 1 },
    "file artifacts should carry a reference target for the preview panel",
  );
  assertDeepEqual(
    projection.artifacts.map((entry) => entry.action),
    [
      { kind: "file", reference: { path: "packages/ui/src/state/render-groups.ts", lineStart: 1 } },
      { kind: "file", reference: { path: "packages/ui/test/render-groups-right-rail.test.ts", lineStart: 1 } },
      { kind: "url", url: "http://localhost:5178/" },
    ],
    "artifact entries should expose click targets from the projection layer",
  );
}

function projectsGeneratedImageSourcesIntoArtifacts(): void {
  const projection = projectConversation([
    {
      type: "generated-image",
      id: "generated-image-1",
      status: "completed",
      src: "https://example.com/output/generated%20image.png",
    } as unknown as ThreadItem,
    {
      type: "imageGeneration",
      id: "generated-image-2",
      status: "completed",
      savedPath: "/tmp/local-render.png",
    } as unknown as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => ({ title: entry.title, meta: entry.meta, status: entry.status, action: entry.action })),
    [
      {
        title: "generated image.png",
        meta: "https://example.com/output/generated%20image.png",
        status: "completed",
        action: { kind: "url", url: "https://example.com/output/generated%20image.png" },
      },
      {
        title: "local-render.png",
        meta: "/tmp/local-render.png",
        status: "completed",
        action: { kind: "file", reference: { path: "/tmp/local-render.png", lineStart: 1 } },
      },
    ],
    "generated images should surface remote src and local saved paths as Artifacts",
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
  assertDeepEqual(
    projection.sources.map((entry) => entry.action),
    [
      { kind: "source", itemId: "github-1" },
      { kind: "source", itemId: "web-search-1" },
    ],
    "sources should carry source item targets for conversation navigation",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
