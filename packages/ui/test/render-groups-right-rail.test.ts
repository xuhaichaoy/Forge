import { projectConversation, type AccumulatedThreadItem as ThreadItem } from "../src/state/render-groups";

export default function runRenderGroupsRightRailTests(): void {
  usesLatestTodoListPlanForProgress();
  usesReducerPlanFactsForProgress();
  dedupesArtifactsAcrossFileChangesAndAssistantText();
  ignoresPunctuationOnlyFileArtifacts();
  stripsTrailingCjkPunctuationFromArtifactTargets();
  projectsBareBacktickedFilenamesAsArtifacts();
  projectsSavedAbsolutePathFromAssistantContext();
  skipsMissingAbsolutePathFromAssistantContext();
  skipsUnresolvedAssistantFileMentions();
  skipsFailedToolPathArtifacts();
  doesNotPromoteCommandOutputPathsIntoArtifacts();
  resolvesBareImageLinksAgainstCommandOutputPaths();
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
        "[local preview](http://localhost:5178/review?tab=files) and http://localhost:5178/review?tab=files",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [
      "packages/ui/src/state/render-groups.ts",
      "packages/ui/test/render-groups-right-rail.test.ts",
      "http://localhost:5178/review?tab=files",
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
      { kind: "url", url: "http://localhost:5178/review?tab=files" },
    ],
    "artifact entries should expose click targets from the projection layer",
  );
  assertDeepEqual(
    projection.artifacts.map((entry) => entry.title),
    [
      "render-groups.ts",
      "render-groups-right-rail.test.ts",
      "localhost:5178/review?tab=files",
    ],
    "website artifact labels should match Codex Desktop host/path/search formatting",
  );
}

function ignoresPunctuationOnlyFileArtifacts(): void {
  const projection = projectConversation([
    {
      type: "fileChange",
      id: "file-change-punctuation",
      status: "completed",
      path: "、",
      changes: [
        { path: "、", kind: "update" },
        { newPath: "packages/ui/src/state/rail-projection.ts", kind: "update" },
      ],
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    ["packages/ui/src/state/rail-projection.ts"],
    "punctuation-only fileChange paths should not appear in Artifacts",
  );
}

function stripsTrailingCjkPunctuationFromArtifactTargets(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "assistant-cjk-punctuation",
      text: "已保存 `report.csv`、预览地址是 http://localhost:5173/review、",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    ["report.csv", "http://localhost:5173/review"],
    "artifact targets should drop trailing Chinese punctuation separators",
  );
}

function projectsBareBacktickedFilenamesAsArtifacts(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "assistant-bare-file",
      text: "Created `beijing_weather_next_7_days.csv` for you and ran `web.run` via `multi_tool_use.parallel`.",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => ({
      title: entry.title,
      meta: entry.meta,
      action: entry.action,
    })),
    [
      {
        title: "beijing_weather_next_7_days.csv",
        meta: "beijing_weather_next_7_days.csv",
        action: { kind: "file", reference: { path: "beijing_weather_next_7_days.csv", lineStart: 1 } },
      },
    ],
    "Desktop-style backticked bare filenames should project into Artifacts without misclassifying tool names",
  );
}

function projectsSavedAbsolutePathFromAssistantContext(): void {
  const savedPath = "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri/北京未来7天天气.xlsx";
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "assistant-saved-file",
      text: `已帮你保存为 Excel 文件:\n\n${savedPath}\n\n说明: 文件已经写入本地。`,
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => ({
      title: entry.title,
      meta: entry.meta,
      action: entry.action,
    })),
    [
      {
        title: "北京未来7天天气.xlsx",
        meta: savedPath,
        action: { kind: "file", reference: { path: savedPath, lineStart: 1 } },
      },
    ],
    "assistant-saved absolute paths should inherit nearby save context and project into Artifacts",
  );

  const assistant = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-saved-file"
  );
  assertDeepEqual(
    assistant?.kind === "message" ? assistant.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [savedPath],
    "final assistant rows should show the generated file card when the saved path is explicit",
  );
}

function skipsMissingAbsolutePathFromAssistantContext(): void {
  const missingPath = "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri/missing.xlsx";
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "assistant-missing-absolute-path",
      text: `我没有找到这个文件:\n\n${missingPath}`,
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [],
    "assistant missing absolute paths should keep nearby negative context and not create Artifacts",
  );
}

function skipsUnresolvedAssistantFileMentions(): void {
  const projection = projectConversation([
    {
      type: "agentMessage",
      id: "assistant-missing-file",
      text:
        "我没有在当前目录找到 `docs/DEVELOPMENT.md`，所以还不能开始按该仓库规范做代码修改。\n" +
        "如果你愿意，可以把正确路径发我。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [],
    "assistant missing-file prose should not create clickable Artifacts",
  );
  const assistant = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-missing-file"
  );
  assertDeepEqual(
    assistant?.kind === "message" ? assistant.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [],
    "assistant message units should not carry resource cards for files reported as missing",
  );
}

function skipsFailedToolPathArtifacts(): void {
  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-find-dev-guide",
      content: [{ type: "input_text", text: "你好" }],
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-start",
      text: "你好！我先按要求读取 `docs/DEVELOPMENT.md`，确认这个仓库的开发规范。",
      phase: "commentary",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "dynamicToolCall",
      id: "read-missing-dev-guide",
      tool: "read_file",
      status: "failed",
      path: "docs/DEVELOPMENT.md",
      error: "No such file or directory",
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "failed-search",
      exitCode: 127,
      aggregatedOutput:
        "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri\n" +
        "zsh:1: command not found: rg\n",
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-missing-final",
      text:
        "你好！我在当前目录里没有找到 `docs/DEVELOPMENT.md`，所以还不能开始按该仓库规范做代码修改。\n" +
        "如果你愿意，可以把正确的路径发我。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [],
    "failed tool input paths should not create clickable Artifacts",
  );
  const finalAssistant = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-missing-final"
  );
  assertDeepEqual(
    finalAssistant?.kind === "message" ? finalAssistant.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [],
    "final assistant rows should not inherit resource cards from failed tool paths",
  );
}

function doesNotPromoteCommandOutputPathsIntoArtifacts(): void {
  const projection = projectConversation([
    {
      type: "commandExecution",
      id: "cmd-dev-guide",
      status: "completed",
      aggregatedOutput: [
        "/Users/haichao/Desktop/data/HiCodex/docs/DEVELOPMENT.md",
        "`local-conversation-thread-*.js`",
        "`split-items-into-render-groups-*.js`",
        "`packages/ui/src/components/conversation-view.tsx`",
        "app.asar",
      ].join("\n"),
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-hello",
      text: "你好！我已经读过开发规范了。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => entry.meta),
    [],
    "command stdout should not be promoted into right-rail Artifacts without an explicit assistant artifact reference",
  );
  const assistantUnit = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-hello"
  );
  assertDeepEqual(
    assistantUnit?.kind === "message" ? assistantUnit.artifacts?.map((entry) => entry.meta) ?? [] : null,
    [],
    "assistant message resource cards should not inherit every file-like command output line",
  );
}

function resolvesBareImageLinksAgainstCommandOutputPaths(): void {
  const cwdPath = "/Users/haichao/Desktop/data/HiCodex/apps/desktop/src-tauri";
  const image2Path = "/Users/haichao/Downloads/Day2-UA-图片/UA- image2.png";
  const image3Path = "/Users/haichao/Downloads/Day2-UA-图片/UA-image3.png";
  const discoveredOnlyProjection = projectConversation([
    {
      type: "commandExecution",
      id: "cmd-images",
      status: "completed",
      aggregatedOutput: `${cwdPath}\n${image2Path}\n${image3Path}`,
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-found-images",
      text: "我找到了 2 张图片。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);
  assertDeepEqual(
    discoveredOnlyProjection.artifacts.map((entry) => entry.meta),
    [],
    "discovered stdout image paths should stay hidden until the assistant explicitly references them",
  );

  const projection = projectConversation([
    {
      type: "userMessage",
      id: "user-find-images",
      content: [{ type: "input_text", text: "先找一下图片" }],
    } as unknown as ThreadItem,
    {
      type: "commandExecution",
      id: "cmd-images",
      status: "completed",
      aggregatedOutput: `${cwdPath}\n${image2Path}\n${image3Path}`,
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-found-images",
      text: "我找到了 2 张图片。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "userMessage",
      id: "user-images",
      content: [{ type: "input_text", text: "直接发给我就行" }],
    } as unknown as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-images",
      text: `直接给你看这两张：\n\n1. ![UA-image2.png](UA-image2.png)\n2. ![UA-image3.png](UA-image3.png)`,
      phase: "commentary",
      memoryCitation: null,
    } as ThreadItem,
    {
      type: "agentMessage",
      id: "assistant-final",
      text: "如果你想，我也可以把它们按顺序排成一页。",
      phase: "final",
      memoryCitation: null,
    } as ThreadItem,
  ]);

  assertDeepEqual(
    projection.artifacts.map((entry) => ({ title: entry.title, meta: entry.meta, reference: entry.reference })),
    [
      {
        title: "UA- image2.png",
        meta: image2Path,
        reference: { path: image2Path, lineStart: 1 },
      },
      {
        title: "UA-image3.png",
        meta: image3Path,
        reference: { path: image3Path, lineStart: 1 },
      },
    ],
    "right rail should resolve explicit assistant image links to matching absolute command output paths",
  );

  const assistantUnit = projection.units.find((unit) =>
    unit.kind === "message" && unit.item.id === "assistant-images"
  );
  assertDeepEqual(
    assistantUnit?.kind === "message" ? assistantUnit.artifacts?.map((entry) => entry.meta) : null,
    [image2Path, image3Path],
    "intermediate assistant output resources should resolve image paths from earlier turn artifacts",
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
    {
      type: "imageGeneration",
      id: "generated-image-3",
      status: "completed",
      revisedPrompt: null,
      result: "OFFICIALPNG",
    } as unknown as ThreadItem,
    {
      type: "dynamicToolCall",
      id: "hicodex-image-1",
      tool: "hicodex_generate_image",
      status: "completed",
      contentItems: [{ type: "inputImage", imageUrl: "data:image/png;base64,PNGDATA" }],
      success: true,
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
      {
        title: "Generated image",
        meta: "data:image/png;base64,OFFICIALPNG",
        status: "completed",
        action: { kind: "url", url: "data:image/png;base64,OFFICIALPNG" },
      },
      {
        title: "Generated image",
        meta: "data:image/png;base64,PNGDATA",
        status: "completed",
        action: { kind: "url", url: "data:image/png;base64,PNGDATA" },
      },
    ],
    "generated images should surface native and HiCodex image tool outputs as Artifacts",
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
      type: "mcpToolCall",
      id: "github-2",
      server: "github",
      tool: "get_pr",
      status: "completed",
      arguments: { number: 1 },
      result: { title: "Fix" },
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
    projection.sources.map((entry) => ({
      id: entry.id,
      title: entry.title,
      meta: entry.meta ?? null,
      status: entry.status ?? null,
      action: entry.action ?? null,
    })),
    [
      { id: "mcp-server:github", title: "GitHub", meta: null, status: null, action: null },
      { id: "webSearch", title: "Web search", meta: null, status: null, action: null },
    ],
    "sources should exclude node_repl and dedupe MCP/web sources like Codex Desktop",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
