import {
  codeBlockTitle,
  initialToolActivityExpanded,
  isToolActivityExpandable,
  memoryCitationEntries,
  parseMarkdownBlocks,
  parseMarkdownInline,
  userImageSrc,
} from "../src/components/conversation-view";

export default function runConversationViewTests(): void {
  parsesMarkdownBlocksForModelOutput();
  parsesInlineCodeAndLinks();
  parsesInlineEmphasisLikeAssistantMarkdown();
  parsesFileCitationMarkers();
  parsesPipeTablesLikeAssistantMarkdown();
  parsesGfmTaskListRuleAndImageBlocks();
  normalizesMemoryCitationEntries();
  normalizesLocalUserImageSources();
  formatsCodeBlockTitlesLikeCodexSnippetHeaders();
  keepsOnlyDesktopActiveRowsExpandedByDefault();
  keepsWorkedForRowsCompact();
}

function parsesMarkdownBlocksForModelOutput(): void {
  const blocks = parseMarkdownBlocks([
    "## Result",
    "",
    "Updated the renderer:",
    "- Added code support",
    "- Added diff support",
    "",
    "```diff",
    "+new line",
    "-old line",
    "```",
    "",
    "> quoted note",
  ].join("\n"));

  assertEqual(blocks.length, 5, "markdown block count");
  assertDeepEqual(blocks[0], { kind: "heading", level: 2, text: "Result" }, "heading block");
  assertDeepEqual(blocks[1], { kind: "paragraph", text: "Updated the renderer:" }, "paragraph block");
  assertDeepEqual(blocks[2], { kind: "list", ordered: false, items: ["Added code support", "Added diff support"] }, "list block");
  assertDeepEqual(blocks[3], { kind: "code", language: "diff", text: "+new line\n-old line" }, "diff code block");
  assertDeepEqual(blocks[4], { kind: "blockquote", text: "quoted note" }, "blockquote block");
}

function parsesInlineCodeAndLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("Open [file](</tmp/example file.ts:3>) and `run tests`."),
    [
      { kind: "text", text: "Open " },
      { kind: "link", text: "file", href: "/tmp/example file.ts:3" },
      { kind: "text", text: " and " },
      { kind: "code", text: "run tests" },
      { kind: "text", text: "." },
    ],
    "inline markdown segments",
  );
}

function parsesInlineEmphasisLikeAssistantMarkdown(): void {
  assertDeepEqual(
    parseMarkdownInline("Use **bold**, *emphasis*, __strong__, _em_, ~~removed~~, and snake_case."),
    [
      { kind: "text", text: "Use " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: ", " },
      { kind: "em", text: "emphasis" },
      { kind: "text", text: ", " },
      { kind: "strong", text: "strong" },
      { kind: "text", text: ", " },
      { kind: "em", text: "em" },
      { kind: "text", text: ", " },
      { kind: "del", text: "removed" },
      { kind: "text", text: ", and snake_case." },
    ],
    "inline emphasis segments",
  );
}

function parsesFileCitationMarkers(): void {
  assertDeepEqual(
    parseMarkdownInline("See \u3010F:packages/ui/src/app.ts\u2020L3-L5\u3011 and \u3010README.md\u2020L8\u3011."),
    [
      { kind: "text", text: "See " },
      { kind: "fileCitation", path: "packages/ui/src/app.ts", lineStart: 3, lineEnd: 5 },
      { kind: "text", text: " and " },
      { kind: "fileCitation", path: "README.md", lineStart: 8, lineEnd: 8 },
      { kind: "text", text: "." },
    ],
    "file citation marker segments",
  );
}

function parsesPipeTablesLikeAssistantMarkdown(): void {
  const blocks = parseMarkdownBlocks([
    "| File | Status |",
    "| --- | --- |",
    "| `app.ts` | **updated** |",
    "| test.ts | pass |",
    "",
    "Done.",
  ].join("\n"));

  assertDeepEqual(
    blocks,
    [
      {
        kind: "table",
        headers: ["File", "Status"],
        rows: [["`app.ts`", "**updated**"], ["test.ts", "pass"]],
      },
      { kind: "paragraph", text: "Done." },
    ],
    "pipe table block",
  );
}

function parsesGfmTaskListRuleAndImageBlocks(): void {
  const blocks = parseMarkdownBlocks([
    "- [x] Read Desktop Markdown",
    "- [ ] Patch renderer",
    "",
    "---",
    "",
    "![Diagram](</tmp/render flow.png> \"Flow\")",
  ].join("\n"));

  assertDeepEqual(
    blocks,
    [
      {
        kind: "taskList",
        items: [
          { checked: true, text: "Read Desktop Markdown" },
          { checked: false, text: "Patch renderer" },
        ],
      },
      { kind: "hr" },
      { kind: "image", alt: "Diagram", src: "/tmp/render flow.png", title: "Flow" },
    ],
    "GFM task list, rule, and image blocks",
  );
}

function normalizesMemoryCitationEntries(): void {
  assertDeepEqual(
    memoryCitationEntries({
      entries: [
        { path: " /tmp/memory.md ", lineStart: 3, lineEnd: 5, note: " used context " },
        { path: "   ", lineStart: 1, lineEnd: 1, note: "ignored" },
        { path: "/tmp/one.md", lineStart: 7, lineEnd: 4, note: "" },
      ],
      threadIds: ["thread"],
    }),
    [
      { path: "/tmp/memory.md", lineStart: 3, lineEnd: 5, note: "used context" },
      { path: "/tmp/one.md", lineStart: 7, lineEnd: 7, note: "" },
    ],
    "memory citation entries",
  );
}

function normalizesLocalUserImageSources(): void {
  assertEqual(
    userImageSrc({ kind: "image", source: "local", src: "/tmp/screenshot 1.png", label: "screenshot 1.png" }),
    "file:///tmp/screenshot%201.png",
    "local image path should become a file URL",
  );
  assertEqual(
    userImageSrc({ kind: "image", source: "url", src: "https://example.com/diagram.png", label: "diagram.png" }),
    "https://example.com/diagram.png",
    "remote image URL should be preserved",
  );
  assertEqual(
    userImageSrc({
      kind: "image",
      source: "url",
      src: "data:image/png;base64,mXlu4jLxTLYBhEGAQVwmLhOY52IAxAMI",
      label: "User attachment",
    }),
    "data:image/png;base64,mXlu4jLxTLYBhEGAQVwmLhOY52IAxAMI",
    "data URL user images should stay renderable without becoming labels",
  );
}

function formatsCodeBlockTitlesLikeCodexSnippetHeaders(): void {
  assertEqual(codeBlockTitle("ts"), "ts", "language should be the snippet title");
  assertEqual(codeBlockTitle(""), "text", "missing language should fall back to text");
}

function keepsOnlyDesktopActiveRowsExpandedByDefault(): void {
  assertEqual(
    initialToolActivityExpanded(toolActivity("reasoning", true)),
    true,
    "running reasoning should start expanded",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("reasoning", false)),
    false,
    "completed reasoning should start collapsed",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("collapsed-tool-activity", true)),
    false,
    "running collapsed tool activity should still start collapsed",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("pending-mcp-tool-calls", true)),
    false,
    "pending MCP compact groups should start collapsed",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("multi-agent-group", true)),
    true,
    "running multi-agent groups should start expanded like Codex Desktop",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("web-search-group", false)),
    true,
    "completed web search groups should start expanded like Codex Desktop",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("web-search-group", true)),
    false,
    "running web search groups should hide rows while active",
  );
}

function keepsWorkedForRowsCompact(): void {
  assertEqual(
    initialToolActivityExpanded(toolActivity("worked-for", false, 2, "commandExecution", true)),
    true,
    "worked-for should start expanded before final assistant output",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("worked-for", false, 2, "commandExecution", false)),
    false,
    "worked-for should start collapsed after final assistant output",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("worked-for", false, 1, "worked-for")),
    false,
    "standalone worked-for rows should stay compact like Codex Desktop",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("worked-for", false, 2, "commandExecution")),
    true,
    "worked-for headers should expand when they summarize tool details",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("collapsed-tool-activity", false, 1)),
    true,
    "ordinary tool activity with details should still expand",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("web-search-group", true, 1)),
    false,
    "active web search groups should not expose an interactive expander",
  );
}

function toolActivity(
  groupType:
    | "collapsed-tool-activity"
    | "pending-mcp-tool-calls"
    | "worked-for"
    | "reasoning"
    | "todo-list"
    | "web-search-group"
    | "multi-agent-group",
  inProgress: boolean,
  itemCount = 0,
  itemType = "commandExecution",
  defaultExpanded?: boolean,
): Parameters<typeof initialToolActivityExpanded>[0] {
  return {
    kind: "toolActivity",
    key: `activity:${groupType}`,
    items: Array.from({ length: itemCount }, (_, index) => ({ id: `item-${index}`, type: itemType })),
    summary: {
      groupType,
      icon: groupType === "reasoning" ? "reasoning" : "activity",
      label: "Activity",
      activeDetail: null,
      ...(typeof defaultExpanded === "boolean" ? { defaultExpanded } : {}),
      details: [],
      inProgress,
      totalDurationMs: null,
      counts: {
        commands: 0,
        exploredFiles: 0,
        searches: 0,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 0,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: groupType === "reasoning" ? 1 : 0,
        plans: 0,
        other: 0,
      },
    },
  };
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
