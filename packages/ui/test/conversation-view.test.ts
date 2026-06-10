import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConversationUnitView,
  codeBlockTitle,
  formatTurnDiffFileCount,
  highlightCodeSegments,
  initialToolActivityExpanded,
  isToolActivityExpandable,
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  memoryCitationEntries,
  memoryCitationFileReference,
  parseMarkdownBlocks,
  parseMarkdownInline,
  reasoningActivityBody,
  sanitizeMermaidCode,
  shouldShowToolActivityInlineDetail,
  shouldRenderMermaidPreview,
  shouldRenderSvgCodePreview,
  stripReasoningActivityHeading,
  svgCodePreviewDataUrl,
  turnKeysForGroups,
  userImageSrc,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
  workedForExpandedDetailItems,
  initialToolActivityViewState,
  toolActivityDetailItems,
  turnDiffHeaderStatsVisible,
  turnDiffViewModel,
  workedForAggregateRows,
} from "../src/components/conversation-view";
import { GeneratedImageGallery } from "../src/components/generated-image-gallery";
import { HiCodexIntlProvider } from "../src/components/i18n-provider";
import { formatMessage, setActiveI18nLocale, HICODEX_DEFAULT_LOCALE } from "../src/state/i18n";

// Mirror event-unit's worked-for aggregate render: leading descriptor for the
// first row (capitalized verb), compact for the rest, resolved via formatMessage.
function renderWorkedForAggregate(
  rows: ReturnType<typeof workedForAggregateRows>,
): string[] {
  // worked-for aggregate asserts Codex EN copy, but this file also renders zh-CN provider
  // subtests that flip the process-level i18n locale via setActiveI18nLocale. Pin the default
  // (en-US) here so the module-level formatMessage resolves English regardless of subtest order.
  setActiveI18nLocale(HICODEX_DEFAULT_LOCALE);
  return rows.map((row, index) => {
    const descriptor = index === 0 ? row.leading : row.compact;
    return formatMessage({ id: descriptor.id, defaultMessage: descriptor.defaultMessage }, descriptor.values);
  });
}

export default function runConversationViewTests(): void {
  parsesMarkdownBlocksForModelOutput();
  parsesIndentedBlocksLikeDesktopMarked();
  parsesSetextHeadingsLikeDesktopMarkdown();
  parsesTildeFencedCodeLikeDesktopMarkdown();
  preservesOrderedListStartLikeDesktopMarkdown();
  parsesNestedListsLikeDesktopMarkdown();
  parsesLooseAndMultilineListsLikeDesktopMarkdown();
  parsesBlockquoteChildrenLikeDesktopMarkdown();
  parsesInlineCodeAndLinks();
  parsesNestedLinksAndEscapesLikeDesktopMarkdown();
  parsesInlineEmphasisLikeAssistantMarkdown();
  parsesSanitizedBasicInlineHtmlLikeDesktopMarkdown();
  parsesMathBlocksAndInlineMathLikeDesktopMarkdown();
  parsesDetailsBlocksLikeDesktopMarkdown();
  parsesFileCitationMarkers();
  parsesPipeTablesLikeAssistantMarkdown();
  parsesGfmTaskListRuleAndImageBlocks();
  groupsConsecutiveMarkdownImagesLikeDesktopMediaGrid();
  normalizesMemoryCitationEntries();
  resolvesMemoryCitationFilesFromCodexMemoriesRoot();
  rendersMemoryCitationsBeforeArtifactExtrasLikeDesktop();
  rendersPluralMemoryCitationSummaryLikeDesktop();
  localizesMemoryCitationLabelsLikeDesktop();
  preservesFullMemoryCitationPathLikeDesktop();
  rendersMemoryCitationSourcesAsButtonsLikeDesktop();
  rendersMemoryCitationsOnCommentaryAssistantRowsLikeDesktop();
  localizesReviewCommentLabelsLikeDesktop();
  rendersTrailingAutomationCitationsInlineLikeDesktop();
  rendersItemAutomationCitationsInlineLikeDesktop();
  rendersItemAutomationCitationsAsOpenableButtonsLikeDesktop();
  rendersAutomationCitationsInFallbackRowWhenLastBlockIsNotParagraph();
  rendersParentThreadAttachmentOnUserMessagesLikeDesktop();
  normalizesLocalUserImageSources();
  formatsCodeBlockTitlesLikeCodexSnippetHeaders();
  highlightsCodeBlocksWithDesktopScopes();
  previewsSvgCodeBlocksLikeCodexDesktop();
  previewsCommonMermaidFlowchartsLikeCodexDesktop();
  keepsOnlyDesktopActiveRowsExpandedByDefault();
  keepsDesktopToolActivityViewStates();
  rendersMultiAgentActionWithDesktopHeader();
  rendersPendingMcpCallsWithDesktopCompactHeader();
  keepsActiveSkillDefinitionReadDetailsHiddenLikeDesktop();
  rendersSteeredEventsAsDesktopStatusRows();
  rendersContextCompactionAsDesktopDividerStatusRows();
  rendersSyntheticDividerStatusIconsLikeDesktop();
  rendersAutomationUpdatesAsDesktopCompactRows();
  rendersUserInputResponsesAsDesktopSummaryRows();
  rendersErrorEventsAsDesktopLightweightRows();
  keepsActiveWebSearchSummarySingleLineLikeDesktop();
  keepsMcpAppToolRowsExpandedLikeDesktop();
  projectsTurnDiffSummaryLikeCodexDesktop();
  projectsReasoningBodiesLikeCodexDesktop();
  keepsWorkedForRowsCompact();
  summarizesRunningWorkedForCommandsSeparately();
  summarizesWorkedForWebSearchCommandsSeparately();
  rendersStandaloneGeneratedImageActionRowLikeCodexDesktop();
  rendersGeneratedImagePlaceholderSpinnerLikeCodexDesktop();
  rendersGeneratedImageLocalSourcesThroughTauriAssetProtocol();
  omitsReasoningRowsFromExplorationDetailsLikeDesktop();
  rendersWorkedForExpansionThroughToolDetails();
  keepsVirtualTurnKeysUniqueWhenTurnSegmentsRepeat();
  computesDesktopVirtualTurnRangeWithMeasuredHeights();
  computesDesktopVirtualTurnRangeFromBottomDistance();
}

function keepsVirtualTurnKeysUniqueWhenTurnSegmentsRepeat(): void {
  const groups = [
    { turnId: "turn-1", units: [] },
    { turnId: null, units: [] },
    { turnId: "turn-1", units: [] },
    { turnId: "turn-2", units: [] },
    { turnId: "turn-1", units: [] },
  ];
  assertDeepEqual(
    turnKeysForGroups(groups),
    ["turn-1", "untracked:1", "turn-1:1", "turn-2", "turn-1:2"],
    "virtual turn rows should keep stable unique keys when a turn is split by untracked units",
  );
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
        { path: "packages/ui/src/a.ts", linesAdded: 2, linesRemoved: 1, renderedLineEstimate: 5 },
        { path: "packages/ui/src/b.ts", linesAdded: 0, linesRemoved: 1, renderedLineEstimate: 2 },
      ],
    },
    "turn diff summary should match Desktop's file count and +/- row",
  );
  // codex: local-conversation-thread `Pv` header i18n
  //   codex.unifiedDiff.editedFiles plural { one: "Edited 1 file", other: "Edited {count} files" }
  //   codex.unifiedDiff.editedFile = "Edited {filename}"
  assertEqual(formatTurnDiffFileCount(1), "Edited 1 file", "single file diff label");
  assertEqual(formatTurnDiffFileCount(2), "Edited 2 files", "multi file diff label");
  assertEqual(
    formatTurnDiffFileCount(1, "packages/ui/src/a.ts"),
    "Edited a.ts",
    "single file diff label with filename",
  );
  assertEqual(
    turnDiffHeaderStatsVisible(1, true),
    true,
    "in-progress Desktop turn diff summary should show +/- totals for a single changed file",
  );
  assertEqual(
    turnDiffHeaderStatsVisible(1, false),
    true,
    "completed Desktop turn diff header should keep +/- totals for a single changed file",
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
    [{ path: "packages/ui/src/file with spaces.ts", linesAdded: 1, linesRemoved: 1, renderedLineEstimate: 3 }],
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
    [{ path: "src/fallback.ts", linesAdded: 1, linesRemoved: 1, renderedLineEstimate: 3 }],
    "turn diff parser should fall back to non-git unified diff headers like Desktop",
  );

  const repeatedPathDiff = [
    "diff --git a/src/repeated.ts b/src/repeated.ts",
    "index 111..222 100644",
    "--- a/src/repeated.ts",
    "+++ b/src/repeated.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/src/repeated.ts b/src/repeated.ts",
    "index 222..333 100644",
    "--- a/src/repeated.ts",
    "+++ b/src/repeated.ts",
    "@@ -4 +4 @@",
    "-older",
    "+newer",
  ].join("\n");
  assertDeepEqual(
    turnDiffViewModel(repeatedPathDiff).files,
    [{ path: "src/repeated.ts", linesAdded: 2, linesRemoved: 2, renderedLineEstimate: 6 }],
    "turn diff parser should merge repeated file sections like Codex Desktop",
  );

  const singleFileHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "turn-diff-single",
      item: { id: "turn-diff-single", type: "turn-diff" },
      label: "Diff",
      text: fallbackDiff,
      format: "diff",
    },
    onOpenDiff: () => undefined,
  }));
  assertEqual(singleFileHtml.includes("Edited fallback.ts"), true, "single-file turn diff title should use Desktop filename label");
  assertEqual(singleFileHtml.includes("Details"), true, "single-file turn diff detail row should use Desktop Details label");
  assertEqual(
    singleFileHtml.includes("<span class=\"hc-turn-diff-file-path\">src/fallback.ts</span>"),
    false,
    "single-file turn diff detail row should not repeat the file path",
  );
  assertEqual(
    (singleFileHtml.match(/hc-turn-diff-stats/g) ?? []).length,
    1,
    "single-file turn diff should only render header +/- stats, not duplicate them in the Details row",
  );
}

function rendersStandaloneGeneratedImageActionRowLikeCodexDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "generatedImageGallery",
      key: "gallery:turn-image",
      turnId: "turn-image",
      hasPending: false,
      images: [
        {
          id: "image-1",
          type: "generated-image",
          src: "data:image/png;base64,AAAA",
          status: "completed",
        },
      ],
    },
    threadId: "thread-image",
    onForkTurn: () => undefined,
  }));

  assertEqual(
    html.includes("hc-generated-image-output"),
    true,
    "standalone generated-image output should use the Desktop tool-outputs wrapper",
  );
  assertEqual(
    html.includes("Artifacts available"),
    false,
    "Desktop's tool-outputs action row receives hasArtifacts for turn rating, not a standalone artifacts status",
  );
  assertEqual(
    html.includes("Fork from this point"),
    true,
    "completed standalone generated-image output should expose the Desktop fork action",
  );
  assertEqual(
    html.includes("Good response"),
    false,
    "turn rating thumbs are removed from all model replies, including generated-image output",
  );
}

function rendersGeneratedImagePlaceholderSpinnerLikeCodexDesktop(): void {
  const html = renderToStaticMarkup(createElement(GeneratedImageGallery, {
    images: [
      {
        id: "image-without-preview",
        type: "generated-image",
        status: "completed",
      },
    ],
    hasPending: false,
  }));

  assertEqual(
    html.includes("hc-generated-image-gallery-thumb--empty"),
    true,
    "generated-image item without preview src should render the Desktop empty thumbnail",
  );
  assertEqual(
    html.includes("hc-spin"),
    true,
    "Desktop empty generated-image thumbnail should use a loading spinner",
  );
  assertEqual(
    html.includes('aria-hidden="false"'),
    false,
    "Desktop empty generated-image thumbnail should not emit a false aria-hidden attribute",
  );
}

function rendersGeneratedImageLocalSourcesThroughTauriAssetProtocol(): void {
  const globalRecord = globalThis as unknown as Record<string, unknown>;
  const previousWindow = globalRecord.window;
  const convertedPaths: string[] = [];
  globalRecord.window = {
    __TAURI_INTERNALS__: {
      convertFileSrc: (path: string, protocol: string) => {
        convertedPaths.push(`${protocol}:${path}`);
        return `asset://localhost/${encodeURIComponent(path)}`;
      },
    },
  };

  try {
    const html = renderToStaticMarkup(createElement(GeneratedImageGallery, {
      images: [
        {
          id: "file-url-image",
          type: "generated-image",
          src: "file:///tmp/hicodex-home/generated_images/thread%201/ig_generated.png",
          status: "completed",
        },
        {
          id: "absolute-path-image",
          type: "generated-image",
          savedPath: "/tmp/hicodex-home/generated_images/thread 1/ig_saved.png",
          status: "completed",
        },
      ],
      hasPending: false,
    }));

    assertDeepEqual(
      convertedPaths,
      [
        "asset:/tmp/hicodex-home/generated_images/thread 1/ig_generated.png",
        "asset:/tmp/hicodex-home/generated_images/thread 1/ig_saved.png",
      ],
      "generated image local sources should be handed to Tauri as decoded file paths",
    );
    assertEqual(
      html.includes("asset://localhost/%2Ftmp%2Fhicodex-home%2Fgenerated_images%2Fthread%201%2Fig_generated.png"),
      true,
      "generated image file URLs should render through Tauri's asset protocol",
    );
    assertEqual(
      html.includes("file:///tmp/hicodex-home/generated_images"),
      false,
      "generated image local sources should not render raw file URLs in Tauri",
    );
  } finally {
    if (previousWindow === undefined) {
      delete globalRecord.window;
    } else {
      globalRecord.window = previousWindow;
    }
  }
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

function parsesIndentedBlocksLikeDesktopMarked(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "   ### Result ###",
      "",
      "   > quoted note",
      "",
      "   ```json",
      "{\"ok\":true}",
      "   ```",
      "",
      "    - not a list",
    ].join("\n")),
    [
      { kind: "heading", level: 3, text: "Result" },
      { kind: "blockquote", text: "quoted note" },
      { kind: "code", language: "json", text: "{\"ok\":true}" },
      { kind: "code", language: "", text: "- not a list" },
    ],
    "CommonMark block indentation and ATX closing hashes should match Desktop marked output",
  );
}

function parsesSetextHeadingsLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "Result title",
      "============",
      "",
      "Next section",
      "------------",
      "",
      "---",
    ].join("\n")),
    [
      { kind: "heading", level: 1, text: "Result title" },
      { kind: "heading", level: 2, text: "Next section" },
      { kind: "hr" },
    ],
    "setext headings should match Desktop marked output instead of rendering paragraph plus rule",
  );
}

function parsesTildeFencedCodeLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "~~~ts",
      "const ok = true;",
      "~~~",
    ].join("\n")),
    [{ kind: "code", language: "ts", text: "const ok = true;" }],
    "tilde fenced code blocks should match Desktop marked output",
  );
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

function parsesNestedListsLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "- parent",
      "  - child",
      "    1. grand",
      "- next",
    ].join("\n")),
    [
      {
        kind: "list",
        ordered: false,
        items: [
          {
            text: "parent",
            children: [
              {
                kind: "list",
                ordered: false,
                items: [
                  {
                    text: "child",
                    children: [
                      {
                        kind: "list",
                        ordered: true,
                        items: ["grand"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          "next",
        ],
      },
    ],
    "nested lists should preserve Desktop marked hierarchy instead of flattening child bullets",
  );
}

function parsesLooseAndMultilineListsLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "- first line",
      "  continuation line",
      "- second",
    ].join("\n")),
    [
      {
        kind: "list",
        ordered: false,
        items: ["first line\ncontinuation line", "second"],
      },
    ],
    "tight list item continuation should stay inside the item like Desktop marked",
  );
  assertDeepEqual(
    parseMarkdownBlocks([
      "- first",
      "",
      "  continued paragraph",
      "  - nested",
      "- second",
    ].join("\n")),
    [
      {
        kind: "list",
        ordered: false,
        items: [
          {
            text: "first",
            children: [
              { kind: "paragraph", text: "continued paragraph" },
              { kind: "list", ordered: false, items: ["nested"] },
            ],
          },
          "second",
        ],
        loose: true,
      },
    ],
    "loose list item paragraphs and nested children should match Desktop marked hierarchy",
  );
  assertDeepEqual(
    parseMarkdownBlocks([
      "- first",
      "",
      "- second",
    ].join("\n")),
    [
      {
        kind: "list",
        ordered: false,
        items: ["first", "second"],
        loose: true,
      },
    ],
    "blank lines between list items should make the whole list loose like Desktop marked",
  );
  assertDeepEqual(
    parseMarkdownBlocks([
      "- first",
      "# heading",
    ].join("\n")),
    [
      { kind: "list", ordered: false, items: ["first"] },
      { kind: "heading", level: 1, text: "heading" },
    ],
    "unindented block starts should terminate list items like Desktop marked",
  );
}

function parsesBlockquoteChildrenLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownBlocks([
      "> ## Note",
      "> - item",
      ">   - child",
    ].join("\n")),
    [
      {
        kind: "blockquote",
        text: "## Note\n- item\n  - child",
        children: [
          { kind: "heading", level: 2, text: "Note" },
          {
            kind: "list",
            ordered: false,
            items: [
              {
                text: "item",
                children: [
                  { kind: "list", ordered: false, items: ["child"] },
                ],
              },
            ],
          },
        ],
      },
    ],
    "blockquote contents should keep Desktop marked block children instead of plain inline text",
  );
  assertDeepEqual(
    parseMarkdownBlocks([
      "> quote",
      "continued",
      "",
      "- outside",
    ].join("\n")),
    [
      { kind: "blockquote", text: "quote\ncontinued" },
      { kind: "list", ordered: false, items: ["outside"] },
    ],
    "blockquote lazy paragraph continuation should match Desktop marked without absorbing following blocks",
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
  assertDeepEqual(
    parseMarkdownInline("Use ``code ` tick`` and ` code ` plus `a\nb`."),
    [
      { kind: "text", text: "Use " },
      { kind: "code", text: "code ` tick" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: " plus " },
      { kind: "code", text: "a b" },
      { kind: "text", text: "." },
    ],
    "inline code spans should match Desktop marked backtick-run and whitespace normalization",
  );
  assertDeepEqual(
    parseMarkdownInline("Open [Docs](https://example.com (Docs title))."),
    [
      { kind: "text", text: "Open " },
      { kind: "link", text: "Docs", href: "https://example.com", title: "Docs title" },
      { kind: "text", text: "." },
    ],
    "inline links should support Desktop marked parenthesized titles",
  );
  assertDeepEqual(
    parseMarkdownInline("Visit https://example.com/a_(b). See www.example.org/docs and dev@example.com."),
    [
      { kind: "text", text: "Visit " },
      { kind: "link", text: "https://example.com/a_(b)", href: "https://example.com/a_(b)" },
      { kind: "text", text: ". See " },
      { kind: "link", text: "www.example.org/docs", href: "http://www.example.org/docs" },
      { kind: "text", text: " and " },
      { kind: "link", text: "dev@example.com", href: "mailto:dev@example.com" },
      { kind: "text", text: "." },
    ],
    "GFM bare URLs, www links, and email addresses should match Desktop marked output",
  );
  assertDeepEqual(
    parseMarkdownInline("Close https://example.com/path)."),
    [
      { kind: "text", text: "Close " },
      { kind: "link", text: "https://example.com/path", href: "https://example.com/path" },
      { kind: "text", text: ")." },
    ],
    "GFM bare URLs should trim unmatched trailing right parens like Desktop marked",
  );
}

function parsesNestedLinksAndEscapesLikeDesktopMarkdown(): void {
  assertDeepEqual(
    parseMarkdownInline("Escaped \\*not em\\* and [a [b]](https://example.com/a_(b)) plus [local](</tmp/a b.md> \"Doc\")."),
    [
      { kind: "text", text: "Escaped *not em* and " },
      { kind: "link", text: "a [b]", href: "https://example.com/a_(b)" },
      { kind: "text", text: " plus " },
      { kind: "link", text: "local", href: "/tmp/a b.md", title: "Doc" },
      { kind: "text", text: "." },
    ],
    "nested labels, destination parentheses, angle destinations, titles, and escaped emphasis should match Desktop marked output",
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
  assertDeepEqual(
    parseMarkdownBlocks([
      "| A | B | C |",
      "| :-- | --: | :-: |",
      "| l | r | c |",
    ].join("\n")),
    [
      {
        kind: "table",
        headers: ["A", "B", "C"],
        rows: [["l", "r", "c"]],
        aligns: ["left", "right", "center"],
      },
    ],
    "pipe table alignment should match Desktop marked output",
  );
  assertDeepEqual(
    parseMarkdownBlocks([
      "| A\\|B | C |",
      "| --- | --- |",
      "| x\\|y | z |",
    ].join("\n")),
    [
      {
        kind: "table",
        headers: ["A|B", "C"],
        rows: [["x|y", "z"]],
      },
    ],
    "escaped table pipes should stay inside cells like Desktop marked",
  );
}

function parsesGfmTaskListRuleAndImageBlocks(): void {
  const blocks = parseMarkdownBlocks([
    "- [x] Read Desktop Markdown",
    "- [ ] Patch renderer",
    "- Keep plain item",
    "  - [ ] Nested task",
    "",
    "---",
    "",
    "![Diagram](</tmp/render flow.png> \"Flow\")",
    "![Small](small.png (Small title))",
  ].join("\n"));

  assertDeepEqual(
    blocks,
    [
      {
        kind: "list",
        ordered: false,
        items: [
          { text: "Read Desktop Markdown", checked: true, task: true },
          { text: "Patch renderer", checked: false, task: true },
          {
            text: "Keep plain item",
            children: [
              {
                kind: "list",
                ordered: false,
                items: [{ text: "Nested task", checked: false, task: true }],
              },
            ],
          },
        ],
      },
      { kind: "hr" },
      {
        kind: "imageGrid",
        images: [
          { kind: "image", alt: "Diagram", src: "/tmp/render flow.png", title: "Flow" },
          { kind: "image", alt: "Small", src: "small.png", title: "Small title" },
        ],
      },
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

function resolvesMemoryCitationFilesFromCodexMemoriesRoot(): void {
  assertDeepEqual(
    memoryCitationFileReference(
      { path: "MEMORY.md", lineStart: 3, lineEnd: 5, note: "used context" },
      "/Users/me/.codex/memories/",
    ),
    { path: "/Users/me/.codex/memories/MEMORY.md", lineStart: 3, lineEnd: 5 },
    "relative memory citations should resolve from the Codex memories root",
  );
  assertDeepEqual(
    memoryCitationFileReference(
      { path: "/tmp/MEMORY.md", lineStart: 1, lineEnd: 1, note: "" },
      "/Users/me/.codex/memories",
    ),
    { path: "/tmp/MEMORY.md", lineStart: 1, lineEnd: 1 },
    "absolute memory citations should not be re-rooted",
  );
}

function rendersMemoryCitationsBeforeArtifactExtrasLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-memory-citation-and-artifact",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-1",
        text: "Done.",
        phase: "final_answer",
        memoryCitation: {
          entries: [
            {
              path: "MEMORY.md",
              lineStart: 2,
              lineEnd: 4,
              note: "memory note",
            },
          ],
        },
      },
      artifacts: [
        {
          id: "artifact-1",
          title: "artifact-output.md",
          meta: "/tmp/artifact-output.md",
          reference: { path: "/tmp/artifact-output.md", lineStart: 1 },
        },
      ],
    },
    memoryCitationRoot: "/Users/me/.codex/memories",
  }));

  const memoryIndex = html.indexOf("1 memory citation");
  const artifactIndex = html.indexOf("artifact-output.md");
  assertEqual(memoryIndex >= 0, true, "fixture should render memory citations");
  assertEqual(artifactIndex >= 0, true, "fixture should render artifact extras");
  assertEqual(
    memoryIndex < artifactIndex,
    true,
    "assistant memory citations should render before artifact extras like Codex Desktop",
  );
}

function rendersPluralMemoryCitationSummaryLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-two-memory-citations",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-two-memory-citations",
        text: "Done.",
        phase: "final_answer",
        memoryCitation: {
          entries: [
            { path: "MEMORY.md", lineStart: 2, lineEnd: 4, note: "" },
            { path: "rollout_summaries/run.jsonl", lineStart: 7, lineEnd: 7, note: "" },
          ],
        },
      },
    },
  }));

  assertEqual(
    html.includes("2 memory citations"),
    true,
    "memory citation summary should use Desktop's plural label",
  );
}

function localizesMemoryCitationLabelsLikeDesktop(): void {
  const unit = createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-zh-memory-citations",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-zh-memory-citations",
        text: "Done.",
        phase: "final_answer",
        memoryCitation: {
          entries: [
            { path: "MEMORY.md", lineStart: 2, lineEnd: 4, note: "" },
            { path: "rollout_summaries/run.jsonl", lineStart: 7, lineEnd: 7, note: "" },
          ],
        },
      },
    },
  });
  const html = renderToStaticMarkup(createElement(
    HiCodexIntlProvider,
    { locale: "zh-CN", children: unit },
  ));

  assertEqual(html.includes("2 条记忆引用"), true, "Desktop zh-CN memory citation summary should localize");
  assertEqual(html.includes("2-4 行"), true, "Desktop zh-CN memory citation range label should localize");
  assertEqual(html.includes("第 7 行"), true, "Desktop zh-CN single memory citation line label should localize");
  assertEqual(html.includes("Open MEMORY.md"), false, "memory citation aria label should not stay hard-coded English");
}

function preservesFullMemoryCitationPathLikeDesktop(): void {
  const longPath = "rollout_summaries/2026-05-23T10-20-30-very-long-memory-citation-path-that-should-not-be-shortened-in-markup.jsonl";
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-long-memory-citation-path",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-long-memory-citation",
        text: "Done.",
        phase: "final_answer",
        memoryCitation: {
          entries: [
            { path: longPath, lineStart: 12, lineEnd: 15, note: "" },
          ],
        },
      },
    },
  }));

  assertEqual(
    html.includes(longPath),
    true,
    "Desktop memory citations keep the full source path in markup and rely on CSS truncation",
  );
  assertEqual(
    html.includes("...citation-path"),
    false,
    "memory citation path should not be string-shortened before render",
  );
}

function rendersMemoryCitationSourcesAsButtonsLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-button-memory-citation",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-button-memory-citation",
        text: "Done.",
        phase: "final_answer",
        memoryCitation: {
          entries: [
            { path: "MEMORY.md", lineStart: 2, lineEnd: 4, note: "" },
          ],
        },
      },
    },
  }));

  assertEqual(
    html.includes("<button"),
    true,
    "Desktop memory citation sources render through the inline file-reference button path",
  );
  assertEqual(
    html.includes('href="MEMORY.md:2"'),
    false,
    "memory citation sources should not render as href anchors",
  );
}

function rendersMemoryCitationsOnCommentaryAssistantRowsLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-commentary-with-memory-citation",
      role: "assistant",
      assistantPhase: "commentary",
      text: "I checked prior context.",
      item: {
        type: "agentMessage",
        id: "assistant-commentary-memory",
        text: "I checked prior context.",
        phase: "commentary",
        memoryCitation: {
          entries: [
            { path: "MEMORY.md", lineStart: 2, lineEnd: 4, note: "" },
            { path: "rollout_summaries/run.jsonl", lineStart: 7, lineEnd: 7, note: "" },
          ],
        },
      },
    },
  }));

  assertEqual(
    html.includes("2 memory citations"),
    true,
    "Desktop renders memory citations from assistant-message rows independently of final-output chrome",
  );
}

function localizesReviewCommentLabelsLikeDesktop(): void {
  const comments = [
    { title: "Guard branch", body: "Handle the missing value.", path: "src/app.ts", line: 4, priority: "P1" },
    { title: "Null check", body: "Avoid crash.", path: "src/app.ts", line: 8, priority: "P2" },
    { title: "Return path", body: "Keep result stable.", path: "src/result.ts", line: 12 },
    { title: "Cleanup", body: "Remove stale branch.", path: "src/cleanup.ts", line: 16 },
  ];
  const html = renderToStaticMarkup(createElement(
    HiCodexIntlProvider,
    {
      locale: "zh-CN",
      children: createElement(ConversationUnitView, {
        unit: {
          kind: "message",
          key: "assistant-with-review-comments",
          role: "assistant",
          assistantPhase: "final_answer",
          text: "Review complete.",
          item: {
            type: "agentMessage",
            id: "assistant-review-comments",
            text: "Review complete.",
            phase: "final_answer",
          },
          assistantAfter: [
            {
              kind: "assistantReviewComments",
              key: "review-comments:assistant-review-comments",
              comments,
            },
          ],
        },
        onOpenFileReference: () => undefined,
      }),
    },
  ));

  assertEqual(html.includes("4 comments"), true, "Desktop zh-CN review comment count currently keeps the English count label");
  assertEqual(html.includes("再显示 1 条评论"), true, "Desktop zh-CN review comment show-more label should localize");
  assertEqual(
    html.includes("在src/app.ts:4中查看Guard branch"),
    true,
    "Desktop zh-CN review comment open aria label should localize",
  );
  assertEqual(
    html.includes('role="tooltip"'),
    true,
    "review comment rows should expose Desktop-style tooltip content",
  );
  assertEqual(
    html.includes("Handle the missing value."),
    true,
    "review comment tooltip should render the model-authored body text",
  );
  assertEqual(
    html.includes("Show 1 more comment"),
    false,
    "review comment show-more label should not stay hard-coded English",
  );
}

function rendersTrailingAutomationCitationsInlineLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-inline-automation-citation",
      role: "assistant",
      assistantPhase: "final_answer",
      text: 'Done. :citation{id=auto-1 title="Morning run" url="https://example.com/run"}',
      item: {
        type: "agentMessage",
        id: "assistant-inline-automation",
        text: 'Done. :citation{id=auto-1 title="Morning run" url="https://example.com/run"}',
        phase: "final_answer",
      },
    },
  }));

  const paragraphIndex = html.indexOf("<p>Done.");
  const inlineIndex = html.indexOf("hc-automation-citation-inline-list");
  assertEqual(html.includes("Morning run"), true, "fixture should render the automation citation chip");
  assertEqual(inlineIndex >= 0, true, "trailing paragraph citations should render inline");
  assertEqual(
    html.includes("hc-automation-citation-row"),
    false,
    "trailing paragraph citations should not also render in the fallback row",
  );
  assertEqual(
    paragraphIndex >= 0 && paragraphIndex < inlineIndex,
    true,
    "inline automation citations should remain inside the rendered paragraph flow",
  );
}

function rendersItemAutomationCitationsInlineLikeDesktop(): void {
  // automationScheduleSummary now localizes via formatMessage; this assertion
  // checks the English schedule copy, so pin the default locale (a prior subtest
  // may have flipped it to zh-CN).
  setActiveI18nLocale(HICODEX_DEFAULT_LOCALE);
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-item-automation-citation",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-item-automation",
        text: "Done.",
        phase: "final_answer",
        completed: true,
        automationCitations: [
          {
            type: "automation-update",
            id: "automation-update-1",
            callId: "automation-call-1",
            arguments: {
              id: "automation-123",
              mode: "create",
              name: "Morning run",
              rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
            },
            result: {
              mode: "create",
              automationId: "automation-123",
            },
          },
        ],
      },
    },
  }));

  assertEqual(html.includes("Created"), true, "assistant item automationCitations should render the action label");
  assertEqual(html.includes("Morning run"), true, "assistant item automationCitations should render the automation name");
  assertEqual(html.includes("Daily at"), true, "assistant item automationCitations should render Desktop's readable schedule");
  assertEqual(html.includes("lucide-clock"), true, "automation citations should use Desktop's clock icon");
  assertEqual(html.includes("lucide-sparkles"), false, "automation citations should not use a decorative sparkle icon");
  assertEqual(
    html.includes("hc-automation-citation-chip-separator"),
    true,
    "Desktop automation citation cards separate the action label from the automation title",
  );
  assertEqual(
    html.includes("Created Morning run"),
    false,
    "automation citation action and title should not be collapsed into one flat label",
  );
  assertEqual(
    html.includes("hc-automation-citation-inline-list"),
    true,
    "item automation citations should use Desktop's trailing paragraph inline path",
  );
  assertEqual(
    html.includes("hc-automation-citation-row"),
    false,
    "item automation citations should not also render in the fallback row when inline fits",
  );
}

function rendersItemAutomationCitationsAsOpenableButtonsLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-openable-item-automation-citation",
      role: "assistant",
      assistantPhase: "final_answer",
      text: "Done.",
      item: {
        type: "agentMessage",
        id: "assistant-openable-item-automation",
        text: "Done.",
        phase: "final_answer",
        completed: true,
        automationCitations: [
          {
            type: "automation-update",
            id: "automation-update-1",
            callId: "automation-call-1",
            arguments: {
              id: "automation-123",
              mode: "create",
              name: "Morning run",
              rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
            },
            result: {
              mode: "create",
              automationId: "automation-123",
            },
          },
        ],
      },
    },
    onOpenAutomation: () => undefined,
  }));

  assertEqual(
    html.includes('<button aria-label="Automation: Created · Morning run"'),
    true,
    "Desktop automation citations render as buttons when an automation open route is available",
  );
  assertEqual(
    html.includes('data-citation-id="automation-123"'),
    true,
    "openable automation citations should preserve the automation id on the chip",
  );
}

function rendersAutomationCitationsInFallbackRowWhenLastBlockIsNotParagraph(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "assistant-with-row-automation-citation",
      role: "assistant",
      assistantPhase: "final_answer",
      text: '- Done :citation{id=auto-2 title="List run"}',
      item: {
        type: "agentMessage",
        id: "assistant-row-automation",
        text: '- Done :citation{id=auto-2 title="List run"}',
        phase: "final_answer",
      },
    },
  }));

  assertEqual(html.includes("List run"), true, "fixture should render the fallback citation chip");
  assertEqual(
    html.includes("hc-automation-citation-inline-list"),
    false,
    "non-paragraph terminal blocks should not receive inline automation citations",
  );
  assertEqual(
    html.includes("hc-automation-citation-row"),
    true,
    "non-paragraph terminal blocks should use the Desktop fallback row",
  );
}

function rendersParentThreadAttachmentOnUserMessagesLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "message",
      key: "user-1",
      role: "user",
      item: { id: "user-1", type: "userMessage", content: "Continue from parent" },
      text: "Continue from parent",
      parentThreadAttachment: { sourceConversationId: "parent-thread-1" },
    },
  }));

  assertEqual(html.includes("hc-parent-thread-attachment"), true, "parent thread attachment should render as a user attachment chip");
  assertEqual(html.includes("Parent chat"), true, "parent thread attachment should show Desktop's label");
  assertEqual(html.includes("Continue from parent"), true, "user message text should still render");
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

function rendersMultiAgentActionWithDesktopHeader(): void {
  const base = toolActivity("multi-agent-group", true, 1, "multi-agent-action");
  const unit = {
    ...base,
    items: [
      {
        id: "agent-action-1",
        type: "multi-agent-action",
        action: "spawnAgent",
        status: "inProgress",
        receiverThreadIds: ["agent-1234567890abcdef"],
        agentsStates: {
          "agent-1234567890abcdef": { status: "running", message: "reading files" },
        },
      },
    ],
    summary: {
      ...base.summary,
      label: "Spawning 1 agent",
      details: ["Spawning agent-agent-12"],
      inProgress: true,
    },
  };
  const html = renderToStaticMarkup(createElement(ConversationUnitView, { unit }));

  assertEqual(
    html.includes('data-testid="multi-agent-action-header"'),
    true,
    "multi-agent activity should expose Desktop's dedicated header test id",
  );
  assertEqual(
    html.includes('data-testid="multi-agent-action-rows"'),
    true,
    "running multi-agent activity should render Desktop rows expanded",
  );
  assertEqual(
    html.includes("hc-tool-summary-icon"),
    false,
    "multi-agent header should not use the generic tool summary icon DOM",
  );
  assertEqual(
    html.includes("Spawning 1 agent"),
    true,
    "multi-agent header should show Desktop action/count text",
  );
  assertEqual(
    html.includes("agent-agent-12"),
    true,
    "multi-agent rows should include the target agent label",
  );
}

function rendersPendingMcpCallsWithDesktopCompactHeader(): void {
  const base = toolActivity("pending-mcp-tool-calls", true, 2, "mcpToolCall");
  const unit = {
    ...base,
    items: [
      {
        id: "mcp-pending-1",
        type: "mcpToolCall",
        invocation: { server: "github", tool: "list_prs", arguments: { state: "open" } },
        status: "inProgress",
        result: null,
        error: null,
      },
      {
        id: "mcp-pending-2",
        type: "mcpToolCall",
        invocation: { server: "github", tool: "list_issues", arguments: { state: "open" } },
        status: "inProgress",
        result: null,
        error: null,
      },
    ],
    summary: {
      ...base.summary,
      icon: "mcp" as const,
      label: "Waiting on MCP tool",
      inProgress: true,
    },
  };
  const html = renderToStaticMarkup(createElement(ConversationUnitView, { unit }));

  assertEqual(
    html.includes('data-testid="pending-mcp-tool-calls-body"'),
    true,
    "pending MCP groups should keep Desktop's dedicated collapsed body node",
  );
  assertEqual(
    html.includes("hc-tool-summary-icon"),
    false,
    "pending MCP header should not reuse the generic tool summary icon DOM",
  );
  assertEqual(
    html.includes("Waiting on MCP tool"),
    false,
    "pending MCP header should show the active tool label instead of the local generic summary",
  );
  assertEqual(
    html.includes("List issues"),
    true,
    "pending MCP header should follow the latest active MCP tool (human-readable name)",
  );
  assertEqual(
    html.includes('data-view-state="collapsed"'),
    true,
    "pending MCP groups should start collapsed like Codex Desktop",
  );
}

function keepsActiveSkillDefinitionReadDetailsHiddenLikeDesktop(): void {
  const unit = {
    ...toolActivity("collapsed-tool-activity", true, 0),
    items: [
      {
        id: "skill-active-read",
        type: "commandExecution",
        cwd: "/workspace",
        status: "running",
        parsedCmd: { type: "read", path: "/workspace/.codex/skills/code-review/SKILL.md", isFinished: false },
      },
    ],
  };

  assertDeepEqual(
    toolActivityDetailItems(unit),
    [],
    "Desktop returns null detail content for active skill definition reads in command detail mode",
  );
  assertEqual(
    isToolActivityExpandable(unit),
    false,
    "active skill definition read rows should not expose an empty details expander",
  );
}

function rendersSteeredEventsAsDesktopStatusRows(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "steered-1",
      item: { id: "steered-1", type: "steered" },
      label: "Steered conversation",
      text: "Steered conversation",
      format: "status",
    },
  }));

  assertEqual(html.includes("hc-status-event"), true, "steered event should render as Desktop's compact status row");
  assertEqual(html.includes("Steered conversation"), true, "steered event should show Desktop's status label");
  assertEqual(html.includes("hc-tool-label"), false, "steered event should not render the generic tool-card label");
  assertEqual(html.includes("<pre>"), false, "steered event should not render a generic event body");
}

function rendersContextCompactionAsDesktopDividerStatusRows(): void {
  const completedHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "context-1",
      item: { id: "context-1", type: "context-compaction", completed: true },
      label: "Context automatically compacted",
      text: "Context automatically compacted",
      format: "context-status",
    },
  }));

  assertEqual(completedHtml.includes("hc-status-event-divider"), true, "context compaction should render as Desktop's divider row");
  assertEqual(completedHtml.includes("hc-status-event-rule"), true, "context compaction divider should include side rules");
  assertEqual(completedHtml.includes("hc-status-event-icon"), true, "completed context compaction should include Desktop's completed icon");
  assertEqual(completedHtml.includes("Context automatically compacted"), true, "completed context compaction should show Desktop's label");
  assertEqual(completedHtml.includes("hc-tool-label"), false, "context compaction should not render the generic tool-card label");

  const runningHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "context-2",
      item: { id: "context-2", type: "context-compaction", completed: false },
      label: "Automatically compacting context",
      text: "Automatically compacting context",
      format: "context-status",
    },
  }));

  assertEqual(runningHtml.includes('data-running="true"'), true, "running context compaction should expose running state");
  assertEqual(runningHtml.includes("hc-status-event-icon"), false, "running context compaction should not show completed icon");
  assertEqual(runningHtml.includes("hc-thinking-shimmer-text"), true, "running context compaction should use Desktop's thinking-shimmer text affordance");
  assertEqual(runningHtml.includes("Automatically compacting context"), true, "running context compaction should show Desktop's active label");
}

function rendersSyntheticDividerStatusIconsLikeDesktop(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "remote-task-1",
      item: { id: "remote-task-1", type: "remote-task-created", taskId: "task-1" },
      label: "Created task in Codex Cloud",
      text: "Created task in Codex Cloud",
      format: "divider-status",
    },
    onOpenRemoteTask: () => undefined,
  }));

  assertEqual(html.includes("hc-status-event-divider"), true, "remote task rows should render as Desktop divider rows");
  assertEqual(html.includes('data-item-type="remote-task-created"'), true, "remote task rows should expose a type hook for Desktop's stronger divider rule");
  assertEqual(html.includes("hc-status-event-kind-icon"), true, "remote task rows should include Desktop's inline status icon");
  assertEqual(html.includes("hc-status-event-inline-link"), true, "remote task rows should expose Desktop's inline task link");
  assertEqual(html.includes("Created task in Codex Cloud"), true, "remote task row should show Desktop's label");

  const forkedHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "forked-from-conversation-1",
      item: { id: "forked-from-conversation-1", type: "forked-from-conversation", sourceConversationId: "parent-1" },
      label: "Forked from conversation",
      text: "Forked from conversation",
      format: "divider-status",
    },
    onOpenConversationThreadId: () => undefined,
  }));

  assertEqual(forkedHtml.includes("hc-status-event-fork-link"), true, "forked conversation rows should expose Desktop's parent-thread link");

  const autoReviewWarningHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "auto-review-warning-1",
      item: { id: "auto-review-warning-1", type: "auto-review-interruption-warning" },
      label: "Turn ended by Auto-review",
      text: "Turn ended by Auto-review",
      format: "divider-status",
    },
  }));

  assertEqual(autoReviewWarningHtml.includes("hc-status-event-kind-icon"), true, "auto-review interruption rows should keep Desktop's leading warning icon");
  assertEqual(autoReviewWarningHtml.includes("hc-status-event-warning"), true, "auto-review interruption rows should expose Desktop's trailing warning affordance");
  assertEqual(autoReviewWarningHtml.includes('role="tooltip"'), true, "auto-review interruption warning should render Desktop-style tooltip content");
  assertEqual(
    autoReviewWarningHtml.includes("Auto-review stopped this turn after repeated denials."),
    true,
    "auto-review interruption warning should include Desktop's next-step guidance",
  );

  const modelChangedHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "model-changed-1",
      item: { id: "model-changed-1", type: "model-changed", fromModel: "gpt-5.1", toModel: "gpt-5.2" },
      label: "Model changed from GPT-5.1 to GPT-5.2.",
      text: "Model changed from GPT-5.1 to GPT-5.2.",
      format: "divider-status",
    },
  }));

  assertEqual(modelChangedHtml.includes("hc-status-event-warning"), true, "model-changed rows should expose Desktop's trailing warning affordance");
  assertEqual(modelChangedHtml.includes('role="tooltip"'), true, "model-changed warning should render Desktop-style tooltip content");
  assertEqual(modelChangedHtml.includes("Changing models mid-conversation will degrade performance."), true, "model-changed warning should include Desktop's first tooltip line");

  const reroutedHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "model-rerouted-1",
      item: { id: "model-rerouted-1", type: "model-rerouted", reason: "highRiskCyberActivity", toModel: "gpt-5.2" },
      label: "Your request was routed to GPT-5.2.",
      text: "Your request was routed to GPT-5.2.",
      format: "divider-status",
    },
  }));

  assertEqual(reroutedHtml.includes("hc-status-event-kind-icon"), false, "model-rerouted rows should not include a leading status icon");
  assertEqual(reroutedHtml.includes("hc-status-event-warning"), true, "high-risk model reroute rows should expose Desktop's trailing warning affordance");
  assertEqual(reroutedHtml.includes('role="tooltip"'), true, "high-risk model reroute warning should render Desktop-style tooltip content");
  assertEqual(reroutedHtml.includes('href="https://chatgpt.com/cyber"'), true, "high-risk reroute warning should include Desktop's review URL link");
}

function rendersAutomationUpdatesAsDesktopCompactRows(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "automation-update-1",
      item: { id: "automation-update-1", type: "automation-update" },
      label: "Created · Morning run",
      text: "Created · Morning run",
      format: "automation-update",
    },
  }));

  assertEqual(html.includes("hc-automation-update-event"), true, "automation-update should render as Desktop's compact automation row");
  assertEqual(html.includes("Created · Morning run"), true, "automation-update row should show Desktop's action and title");
  assertEqual(html.includes("lucide-clock"), true, "automation-update should use Desktop's clock icon");
  assertEqual(html.includes("hc-tool-label"), false, "automation-update should not render the generic tool-card label");
  assertEqual(html.includes("<pre>"), false, "automation-update should not render a generic event body");
}

function rendersUserInputResponsesAsDesktopSummaryRows(): void {
  const html = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "user-input-response-1",
      item: { id: "user-input-response-1", type: "user-input-response", completed: true },
      label: "Asked 2 questions",
      text: "Asked 2 questions",
      details: "Proceed?\nYes, Use current thread\n\nScope?\nCurrent file",
      format: "user-input-response",
    },
  }));

  assertEqual(html.includes("hc-user-input-response-event"), true, "user-input-response should render as Desktop's compact summary row");
  assertEqual(html.includes('data-has-details="true"'), true, "completed user-input-response with answers should expose expandable state");
  assertEqual(html.includes('aria-expanded="false"'), true, "user-input-response details should start collapsed");
  assertEqual(html.includes("Asked 2 questions"), true, "user-input-response row should show Desktop's summary");
  assertEqual(html.includes("hc-tool-label"), false, "user-input-response should not render the generic tool-card label");
  assertEqual(html.includes("<pre>"), false, "user-input-response should not render a generic event body");

  const pendingHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "user-input-response-pending-1",
      item: { id: "user-input-response-pending-1", type: "user-input-response", completed: false },
      label: "Asking questions",
      text: "Asking questions",
      format: "user-input-response",
    },
  }));

  assertEqual(pendingHtml.includes('data-running="true"'), true, "pending user-input-response should expose running state");
  assertEqual(pendingHtml.includes("hc-user-input-response-spinner"), true, "pending user-input-response should show Desktop's active wait indicator");
  assertEqual(pendingHtml.includes("Asking questions"), true, "pending user-input-response should show Desktop's active summary");
}

function rendersErrorEventsAsDesktopLightweightRows(): void {
  const streamHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "stream-error-1",
      item: { id: "stream-error-1", type: "stream-error" },
      label: "Stream error",
      text: "Connection dropped",
      details: "Retry the turn.",
      tone: "error",
      format: "stream-error",
    },
  }));

  assertEqual(streamHtml.includes("hc-stream-error-event"), true, "stream-error should render as Desktop's lightweight row");
  assertEqual(streamHtml.includes('data-has-details="true"'), true, "stream-error with additionalDetails should expose expandable state");
  assertEqual(streamHtml.includes('aria-expanded="false"'), true, "stream-error details should start collapsed");
  assertEqual(streamHtml.includes("Connection dropped"), true, "stream-error row should show the Desktop visible content");
  assertEqual(streamHtml.includes("hc-tool-label"), false, "stream-error should not render the generic tool-card label");
  assertEqual(streamHtml.includes("<pre>"), false, "stream-error should not render a generic event body");

  const systemHtml = renderToStaticMarkup(createElement(ConversationUnitView, {
    unit: {
      kind: "event",
      key: "system-error-1",
      item: { id: "system-error-1", type: "system-error" },
      label: "System error",
      text: "Sandbox failed",
      details: "Sandbox raw detail",
      tone: "error",
      format: "system-error",
    },
  }));

  assertEqual(systemHtml.includes("hc-system-error-event"), true, "system-error should render as Desktop's lightweight row");
  assertEqual(systemHtml.includes("Sandbox failed"), true, "system-error row should show the Desktop visible content");
  assertEqual(systemHtml.includes("Sandbox raw detail"), false, "system-error should not render raw detail text");
  assertEqual(systemHtml.includes("hc-tool-label"), false, "system-error should not render the generic tool-card label");
  assertEqual(systemHtml.includes("<pre>"), false, "system-error should not render a generic event body");
}

function keepsActiveWebSearchSummarySingleLineLikeDesktop(): void {
  assertEqual(
    shouldShowToolActivityInlineDetail(toolActivity("web-search-group", true), "Searched web for Codex Desktop"),
    false,
    "active web search should not append a duplicate completed detail beside the Desktop summary line",
  );
  assertEqual(
    shouldShowToolActivityInlineDetail(toolActivity("exploration", true), "Reading src/app.ts"),
    true,
    "other active non-collapsed tool rows may still expose inline detail",
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

function summarizesRunningWorkedForCommandsSeparately(): void {
  const unit = {
    kind: "toolActivity",
    key: "worked-for:running",
    items: [],
    summary: {
      groupType: "worked-for",
      icon: "clock",
      label: "Working",
      activeDetail: null,
      details: [],
      inProgress: true,
      totalDurationMs: null,
      counts: {
        commands: 2,
        runningCommands: 1,
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
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
  } as Parameters<typeof workedForAggregateRows>[0];

  assertDeepEqual(
    renderWorkedForAggregate(workedForAggregateRows(unit)),
    // Codex toolActivitySummary: leading row uses the capitalized verb form
    // (commands.running.leading = "Running # command"), the trailing completed
    // row uses the compact lowercase form (commands = "ran # command").
    ["Running 1 command", "ran 1 command"],
    "worked-for aggregate should not mark a running command as completed",
  );
}

function summarizesWorkedForWebSearchCommandsSeparately(): void {
  const unit = {
    kind: "toolActivity",
    key: "worked-for:web-search",
    items: [],
    summary: {
      groupType: "worked-for",
      icon: "clock",
      label: "Working",
      activeDetail: null,
      details: [],
      inProgress: true,
      totalDurationMs: null,
      counts: {
        commands: 2,
        runningCommands: 1,
        webSearchCommands: 1,
        runningWebSearchCommands: 1,
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
        reasoning: 0,
        plans: 0,
        other: 0,
      },
    },
  } as Parameters<typeof workedForAggregateRows>[0];

  assertDeepEqual(
    renderWorkedForAggregate(workedForAggregateRows(unit)),
    // Leading completed-command row capitalized (commands.leading = "Ran # command"),
    // trailing running web-search row compact (webSearchCommands.searching = "searching the web").
    ["Ran 1 command", "searching the web"],
    "worked-for aggregate should not double-count running web search commands as ordinary commands",
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
