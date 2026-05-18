import {
  codeBlockTitle,
  formatTurnDiffFileCount,
  highlightCodeSegments,
  initialToolActivityExpanded,
  isToolActivityExpandable,
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  memoryCitationEntries,
  parseMarkdownBlocks,
  parseMarkdownInline,
  reasoningActivityBody,
  sanitizeMermaidCode,
  shouldRenderMermaidPreview,
  shouldRenderSvgCodePreview,
  stripReasoningActivityHeading,
  svgCodePreviewDataUrl,
  userImageSrc,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
  workedForExpandedDetailItems,
  initialToolActivityViewState,
  toolActivityDetailItems,
  turnDiffHeaderStatsVisible,
  turnDiffViewModel,
} from "../src/components/conversation-view";

export default function runConversationViewTests(): void {
  parsesMarkdownBlocksForModelOutput();
  preservesOrderedListStartLikeDesktopMarkdown();
  parsesInlineCodeAndLinks();
  parsesInlineEmphasisLikeAssistantMarkdown();
  parsesSanitizedBasicInlineHtmlLikeDesktopMarkdown();
  parsesMathBlocksAndInlineMathLikeDesktopMarkdown();
  parsesDetailsBlocksLikeDesktopMarkdown();
  parsesFileCitationMarkers();
  parsesPipeTablesLikeAssistantMarkdown();
  parsesGfmTaskListRuleAndImageBlocks();
  groupsConsecutiveMarkdownImagesLikeDesktopMediaGrid();
  normalizesMemoryCitationEntries();
  normalizesLocalUserImageSources();
  formatsCodeBlockTitlesLikeCodexSnippetHeaders();
  highlightsCodeBlocksWithDesktopScopes();
  previewsSvgCodeBlocksLikeCodexDesktop();
  previewsCommonMermaidFlowchartsLikeCodexDesktop();
  keepsOnlyDesktopActiveRowsExpandedByDefault();
  keepsDesktopToolActivityViewStates();
  keepsMcpAppToolRowsExpandedLikeDesktop();
  projectsTurnDiffSummaryLikeCodexDesktop();
  projectsReasoningBodiesLikeCodexDesktop();
  keepsWorkedForRowsCompact();
  omitsReasoningRowsFromExplorationDetailsLikeDesktop();
  rendersWorkedForExpansionThroughToolDetails();
  computesDesktopVirtualTurnRangeWithMeasuredHeights();
  computesDesktopVirtualTurnRangeFromBottomDistance();
}

function projectsTurnDiffSummaryLikeCodexDesktop(): void {
  const diff = [
    "diff --git a/packages/ui/src/a.ts b/packages/ui/src/a.ts",
    "index 111..222 100644",
    "--- a/packages/ui/src/a.ts",
    "+++ b/packages/ui/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " unchanged",
    "-old",
    "+new",
    "+extra",
    "diff --git a/packages/ui/src/b.ts b/packages/ui/src/b.ts",
    "index 333..444 100644",
    "--- a/packages/ui/src/b.ts",
    "+++ b/packages/ui/src/b.ts",
    "@@ -1 +1 @@",
    "-removed",
  ].join("\n");

  assertDeepEqual(
    turnDiffViewModel(diff),
    {
      hasChanges: true,
      fileCount: 2,
      linesAdded: 2,
      linesRemoved: 2,
      files: [
        { path: "packages/ui/src/a.ts", linesAdded: 2, linesRemoved: 1 },
        { path: "packages/ui/src/b.ts", linesAdded: 0, linesRemoved: 1 },
      ],
    },
    "turn diff summary should match Desktop's file count and +/- row",
  );
  assertEqual(formatTurnDiffFileCount(1), "1 file changed", "single file diff label");
  assertEqual(formatTurnDiffFileCount(2), "2 files changed", "multi file diff label");
  assertEqual(
    turnDiffHeaderStatsVisible(1, true),
    true,
    "in-progress Desktop turn diff summary should show +/- totals for a single changed file",
  );
  assertEqual(
    turnDiffHeaderStatsVisible(1, false),
    false,
    "completed Desktop turn diff header should omit totals for a single changed file",
  );
  assertEqual(
    turnDiffHeaderStatsVisible(2, false),
    true,
    "completed Desktop turn diff header should show totals for multiple changed files",
  );

  const quotedPathDiff = [
    'diff --git "a/packages/ui/src/file with spaces.ts" "b/packages/ui/src/file with spaces.ts"',
    "index 111..222 100644",
    '--- "a/packages/ui/src/file with spaces.ts"',
    '+++ "b/packages/ui/src/file with spaces.ts"',
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
  assertDeepEqual(
    turnDiffViewModel(quotedPathDiff).files,
    [{ path: "packages/ui/src/file with spaces.ts", linesAdded: 1, linesRemoved: 1 }],
    "turn diff parser should match Desktop's quoted diff path support",
  );

  const fallbackDiff = [
    "--- a/src/fallback.ts",
    "+++ b/src/fallback.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
  assertDeepEqual(
    turnDiffViewModel(fallbackDiff).files,
    [{ path: "src/fallback.ts", linesAdded: 1, linesRemoved: 1 }],
    "turn diff parser should fall back to non-git unified diff headers like Desktop",
  );
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

function preservesOrderedListStartLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks(["3. third", "4. fourth"].join("\n")),
    [{ kind: "list", ordered: true, items: ["third", "fourth"], start: 3 }],
    "ordered markdown lists should preserve non-default start numbers",
  );
  assertDeepEqual(
    parseMarkdownBlocks(["1. first", "2. second"].join("\n")),
    [{ kind: "list", ordered: true, items: ["first", "second"] }],
    "ordered markdown lists starting at one should not need an explicit start",
  );
}

function parsesInlineCodeAndLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("Open [file](</tmp/example file.ts:3>), <https://example.com/docs>, and `run tests`."),
    [
      { kind: "text", text: "Open " },
      { kind: "link", text: "file", href: "/tmp/example file.ts:3" },
      { kind: "text", text: ", " },
      { kind: "link", text: "https://example.com/docs", href: "https://example.com/docs" },
      { kind: "text", text: ", and " },
      { kind: "code", text: "run tests" },
      { kind: "text", text: "." },
    ],
    "inline markdown segments should include CommonMark autolinks like Desktop markdown",
  );
  assertDeepEqual(
    parseMarkdownInline("Mail <dev@example.com>, not <div>."),
    [
      { kind: "text", text: "Mail " },
      { kind: "link", text: "dev@example.com", href: "mailto:dev@example.com" },
      { kind: "text", text: ", not <div>." },
    ],
    "email autolinks should render while HTML tags stay plain text",
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

function parsesSanitizedBasicInlineHtmlLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownInline("H<sub>2</sub>O<br><sup>*</sup> <u>under</u> <script>x</script>"),
    [
      { kind: "text", text: "H" },
      { kind: "htmlSpan", tag: "sub", text: "2" },
      { kind: "text", text: "O" },
      { kind: "htmlBreak" },
      { kind: "htmlSpan", tag: "sup", text: "*" },
      { kind: "text", text: " " },
      { kind: "htmlSpan", tag: "u", text: "under" },
      { kind: "text", text: " <script>x</script>" },
    ],
    "basic sanitized inline HTML should render while unsupported tags remain text",
  );
}

function parsesMathBlocksAndInlineMathLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "Before",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
      "\\[a^2 + b^2 = c^2\\]",
    ].join("\n")),
    [
      { kind: "paragraph", text: "Before" },
      { kind: "math", text: "E = mc^2" },
      { kind: "math", text: "a^2 + b^2 = c^2" },
    ],
    "display math should parse as its own block like Desktop markdown",
  );
  assertDeepEqual(
    parseMarkdownInline("Use $E=mc^2$ and \\(a+b\\), but keep $5 text."),
    [
      { kind: "text", text: "Use " },
      { kind: "math", text: "E=mc^2" },
      { kind: "text", text: " and " },
      { kind: "math", text: "a+b" },
      { kind: "text", text: ", but keep $5 text." },
    ],
    "inline math should parse while unmatched currency-like text remains plain",
  );
}

function parsesDetailsBlocksLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "<details open>",
      "<summary>Evidence</summary>",
      "",
      "- Checked Desktop chunk",
      "- Patched renderer",
      "</details>",
    ].join("\n")),
    [
      {
        kind: "details",
        open: true,
        summary: "Evidence",
        text: "- Checked Desktop chunk\n- Patched renderer",
      },
    ],
    "HTML details blocks should render as Desktop-style expandable markdown blocks",
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

function groupsConsecutiveMarkdownImagesLikeDesktopMediaGrid(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "![One](https://example.com/one.png)",
      "![Two](data:image/png;base64,aaaa)",
      "![Clip](https://example.com/demo.mp4 \"Demo\")",
    ].join("\n")),
    [
      {
        kind: "imageGrid",
        images: [
          { kind: "image", alt: "One", src: "https://example.com/one.png", title: null },
          { kind: "image", alt: "Two", src: "data:image/png;base64,aaaa", title: null },
          { kind: "image", alt: "Clip", src: "https://example.com/demo.mp4", title: "Demo" },
        ],
      },
    ],
    "consecutive markdown image lines should become a Desktop-style media grid",
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

function highlightsCodeBlocksWithDesktopScopes(): void {
  assertDeepEqual(
    highlightCodeSegments("ts", "const answer = JSON.stringify({ ok: true })")?.filter((segment) => segment.className),
    [
      { text: "const", className: "hljs-keyword" },
      { text: "=", className: "hljs-operator" },
      { text: "JSON", className: "hljs-built_in" },
      { text: ".", className: "hljs-operator" },
      { text: "stringify", className: "hljs-property" },
      { text: "({", className: "hljs-operator" },
      { text: ":", className: "hljs-operator" },
      { text: "true", className: "hljs-literal" },
      { text: "})", className: "hljs-operator" },
    ],
    "common code fences should use Desktop-compatible hljs scopes",
  );
  assertDeepEqual(
    highlightCodeSegments("json", "{ \"status\": true, \"count\": 2 }")?.filter((segment) => segment.className),
    [
      { text: "{", className: "hljs-operator" },
      { text: "\"status\"", className: "hljs-attr" },
      { text: ":", className: "hljs-operator" },
      { text: "true", className: "hljs-literal" },
      { text: ",", className: "hljs-operator" },
      { text: "\"count\"", className: "hljs-attr" },
      { text: ":", className: "hljs-operator" },
      { text: "2", className: "hljs-number" },
      { text: "}", className: "hljs-operator" },
    ],
    "json code fences should distinguish keys, literals, and numbers",
  );
  assertEqual(highlightCodeSegments("", "plain text"), null, "plain code fences should not invent highlighting");
}

function previewsSvgCodeBlocksLikeCodexDesktop(): void {
  const svg = "<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\" /></svg>";
  assertEqual(shouldRenderSvgCodePreview("svg", "not actually svg"), true, "svg fences should use the image preview path");
  assertEqual(shouldRenderSvgCodePreview("xml", `\n${svg}`), true, "xml fences with svg content should preview");
  assertEqual(shouldRenderSvgCodePreview("html", "<div />"), false, "non-svg html fences should stay as code");
  assertEqual(
    svgCodePreviewDataUrl(svg),
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    "svg preview should use a data URL so the raw code can still be copied",
  );
}

function previewsCommonMermaidFlowchartsLikeCodexDesktop(): void {
  const source = [
    "flowchart LR",
    "  A[Start] -->|ok| B{Done?}",
    "  B -- no --> C((Retry))",
  ].join("\n");
  const preview = mermaidFlowchartPreviewModel("mermaid", source);
  assertEqual(shouldRenderMermaidPreview("mermaid", source), true, "mermaid flowchart fences should render a diagram preview");
  assertEqual(shouldRenderMermaidPreview("ts", source), false, "non-mermaid fences should stay as code");
  assertEqual(mermaidDiagramKind(source), "flowchart", "graph and flowchart diagrams should be recognized");
  assertEqual(mermaidDiagramKind("sequenceDiagram\nA->>B: hello"), "sequence", "Desktop mermaid kind aliases should be recognized");
  assertEqual(
    sanitizeMermaidCode("%%{init: {\"theme\":\"base\"}}%%\nflowchart LR\nclick A callback\nA-->B"),
    "flowchart LR\nA-->B",
    "safe Mermaid directives and click bindings should be stripped before rendering",
  );
  assertEqual(
    sanitizeMermaidCode("%%{init: {securityLevel: 'loose'}}%%\nflowchart LR\nA-->B"),
    null,
    "Mermaid security-level overrides should not be rendered",
  );
  assertEqual(preview?.direction, "LR", "flowchart direction should be preserved");
  assertDeepEqual(
    preview?.nodes.map((node) => ({ id: node.id, label: node.label, shape: node.shape })),
    [
      { id: "A", label: "Start", shape: "rect" },
      { id: "B", label: "Done?", shape: "diamond" },
      { id: "C", label: "Retry", shape: "circle" },
    ],
    "common Mermaid node labels and shapes should project into the preview",
  );
  assertDeepEqual(
    preview?.edges,
    [
      { from: "A", to: "B", label: "ok" },
      { from: "B", to: "C", label: "no" },
    ],
    "common Mermaid edge labels should project into the preview",
  );
}

function keepsOnlyDesktopActiveRowsExpandedByDefault(): void {
  assertEqual(
    initialToolActivityExpanded(toolActivity("reasoning", true)),
    false,
    "running reasoning should stay as a compact Desktop thought row",
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
    initialToolActivityExpanded(toolActivity("exploration", true)),
    true,
    "active exploration should show a preview like Codex Desktop",
  );
  assertEqual(
    initialToolActivityExpanded(toolActivity("exploration", false)),
    false,
    "completed exploration should start collapsed like Codex Desktop",
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

function keepsDesktopToolActivityViewStates(): void {
  assertEqual(
    initialToolActivityViewState(toolActivity("exploration", true)),
    "preview",
    "active exploration should start in Desktop preview state",
  );
  assertEqual(
    initialToolActivityViewState(toolActivity("exploration", false)),
    "collapsed",
    "completed exploration should start collapsed",
  );
  assertEqual(
    initialToolActivityViewState(toolActivity("web-search-group", false)),
    "expanded",
    "completed web search should start expanded",
  );
  assertEqual(
    initialToolActivityViewState(toolActivity("multi-agent-group", true)),
    "expanded",
    "running multi-agent group should start expanded",
  );
}

function keepsMcpAppToolRowsExpandedLikeDesktop(): void {
  const unit = toolActivity("collapsed-tool-activity", false, 1, "mcpToolCall");
  unit.items = [{
    id: "mcp-app-1",
    type: "mcpToolCall",
    server: "browser-use",
    tool: "open",
    status: "completed",
    arguments: {},
    mcpAppResourceUri: "ui://browser/widget.html",
    result: null,
    error: null,
  }];
  assertEqual(
    initialToolActivityViewState(unit),
    "expanded",
    "completed MCP app tool calls should stay expanded like Codex Desktop app widgets",
  );

  const runningUnit = toolActivity("collapsed-tool-activity", true, 1, "mcpToolCall");
  runningUnit.items = [{
    id: "mcp-app-running-1",
    type: "mcpToolCall",
    server: "browser-use",
    tool: "open",
    status: "inProgress",
    arguments: {},
    mcpAppResourceUri: "ui://browser/widget.html",
    result: null,
    error: null,
  }];
  assertEqual(
    initialToolActivityViewState(runningUnit),
    "expanded",
    "running MCP app tool calls should auto-expand like Desktop shouldAutoExpandMcpApp",
  );
}

function projectsReasoningBodiesLikeCodexDesktop(): void {
  assertEqual(
    stripReasoningActivityHeading("**Checked renderer**\nThe body stays visible."),
    "The body stays visible.",
    "Desktop reasoning body should drop a leading bold heading before rendering details",
  );
  assertEqual(
    stripReasoningActivityHeading("**"),
    "",
    "unterminated heading marker should not render stray markdown",
  );
  assertEqual(
    stripReasoningActivityHeading("## Checked renderer\n\nThe body stays visible."),
    "The body stays visible.",
    "Desktop reasoning body should drop a leading markdown heading before rendering details",
  );
  assertEqual(
    reasoningActivityBody({
      kind: "toolActivity",
      key: "reasoning:1",
      items: [
        {
          id: "reasoning-1",
          type: "reasoning",
          content: "**Checked renderer**\nThe body stays visible.",
        },
      ],
      summary: {
        groupType: "reasoning",
        icon: "reasoning",
        label: "Thought",
        activeDetail: null,
        details: [],
        inProgress: false,
        totalDurationMs: null,
        counts: {
          commands: 0,
          webSearchCommands: 0,
          runningWebSearchCommands: 0,
          runningFolderCreationCommands: 0,
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
          reasoning: 1,
          plans: 0,
          other: 0,
        },
      },
    }),
    "The body stays visible.",
    "reasoning activity should expose Desktop-style collapsible body text",
  );
}

function omitsReasoningRowsFromExplorationDetailsLikeDesktop(): void {
  const details = toolActivityDetailItems({
    kind: "toolActivity",
    key: "exploration:read-1:search-1",
    items: [
      { type: "commandExecution", id: "read-1" },
      { type: "reasoning", id: "reasoning-1" },
      { type: "commandExecution", id: "search-1" },
    ],
    summary: {
      groupType: "exploration",
      icon: "search",
      label: "Explored 1 file, 1 search",
      activeDetail: null,
      details: [],
      inProgress: false,
      totalDurationMs: null,
      counts: {
        commands: 0,
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
        exploredFiles: 1,
        searches: 1,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 0,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: 1,
        plans: 0,
        other: 0,
      },
    },
  });

  assertDeepEqual(
    details.map((item) => item.id),
    ["read-1", "search-1"],
    "exploration details should only render exec rows while retaining reasoning in the source group",
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
    isToolActivityExpandable(toolActivity("exploration", true, 1)),
    false,
    "running exploration previews should not expose an interactive expander",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("exploration", false, 1)),
    true,
    "completed exploration groups should remain expandable",
  );
  assertEqual(
    isToolActivityExpandable(toolActivity("web-search-group", true, 1)),
    false,
    "active web search groups should not expose an interactive expander",
  );
}

function rendersWorkedForExpansionThroughToolDetails(): void {
  const unit = {
    kind: "toolActivity",
    key: "worked-for:command-1:worked-for-1",
    items: [
      {
        type: "commandExecution",
        id: "command-1",
        command: "rg render-groups",
        status: "completed",
        exitCode: 0,
        commandActions: [{ type: "search", command: "rg render-groups", query: "render-groups", path: null }],
      },
      {
        type: "agentMessage",
        id: "assistant-commentary-1",
        text: "I checked the renderer.",
        phase: "commentary",
        memoryCitation: null,
      },
      {
        type: "worked-for",
        id: "worked-for-1",
        status: "completed",
        startedAtMs: 1_000,
        completedAtMs: 2_000,
      },
    ],
    summary: {
      groupType: "worked-for",
      icon: "clock",
      label: "Worked for 1s",
      activeDetail: null,
      details: [],
      inProgress: false,
      totalDurationMs: 1_000,
      counts: {
        commands: 0,
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
        exploredFiles: 0,
        searches: 1,
        lists: 0,
        fileChanges: 0,
        createdFiles: 0,
        editedFiles: 0,
        deletedFiles: 0,
        mcpCalls: 0,
        dynamicCalls: 0,
        webSearches: 0,
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
  } as Parameters<typeof workedForExpandedDetailItems>[0];

  const expanded = workedForExpandedDetailItems(unit);
  assertDeepEqual(
    expanded.map((item) => item.id),
    ["command-1", "assistant-commentary-1"],
    "worked-for expansion should keep only underlying tool/detail items",
  );
  assertEqual(
    expanded[0]?.id ?? null,
    "command-1",
    "single recovered exec rows should render through Desktop-style tool details",
  );
  assertEqual(
    expanded[1]?.id ?? null,
    "assistant-commentary-1",
    "intermediate model output should stay in worked details instead of creating file cards",
  );
}

function computesDesktopVirtualTurnRangeWithMeasuredHeights(): void {
  const range = virtualTurnRange({
    count: 8,
    heights: new Map([[0, 100], [1, 200], [2, 160]]),
    scrollTop: 330,
    viewportHeight: 220,
    estimatedHeight: 280,
    gap: 12,
    overscan: 1,
  });
  assertDeepEqual(
    range,
    {
      startIndex: 1,
      endIndex: 5,
      paddingTop: 112,
      paddingBottom: 864,
      totalHeight: 1944,
    },
    "virtualized turn range should use Desktop estimate, gap, overscan, and measured heights",
  );
}

function computesDesktopVirtualTurnRangeFromBottomDistance(): void {
  const heights = new Map<string, number>([
    ["turn-a", 100],
    ["turn-b", 200],
    ["turn-c", 300],
    ["turn-d", 400],
  ]);
  const range = virtualTurnRangeFromBottom({
    turnKeys: ["turn-a", "turn-b", "turn-c", "turn-d"],
    heights,
    distanceFromBottom: 0,
    viewportHeight: 420,
    gap: 10,
    overscan: 0,
  });

  assertEqual(range.startIndex, 2, "bottom-distance range should start at the first visible row near the bottom");
  assertEqual(range.endIndex, 4, "bottom-distance range should include the latest row");
  assertEqual(range.paddingTop, 320, "bottom-distance range should preserve top padding before rendered rows");
  assertEqual(range.paddingBottom, 0, "bottom-distance range should have no bottom padding at scroll bottom");

  const scrolled = virtualTurnRangeFromBottom({
    turnKeys: ["turn-a", "turn-b", "turn-c", "turn-d"],
    heights,
    distanceFromBottom: 650,
    viewportHeight: 260,
    gap: 10,
    overscan: 0,
  });

  assertEqual(scrolled.startIndex, 1, "scrolled bottom-distance range should move toward older rows");
  assertEqual(scrolled.endIndex, 3, "scrolled bottom-distance range should exclude the latest row when it is below viewport");
  assertEqual(scrolled.paddingBottom, 400, "scrolled bottom-distance range should preserve bottom padding below rendered rows");
}

function toolActivity(
  groupType:
    | "collapsed-tool-activity"
    | "exploration"
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
        webSearchCommands: 0,
        runningWebSearchCommands: 0,
        runningFolderCreationCommands: 0,
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
