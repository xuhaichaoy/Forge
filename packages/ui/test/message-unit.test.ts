import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { assistantResourceCardViewModels } from "../src/components/assistant-resource-cards";
import { AssistantEndResourceCards, assistantEndResourceCardViewModels } from "../src/components/assistant-end-resource-cards";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "../src/components/assistant-message-artifacts";
import {
  shouldRenderMessageActionRow,
} from "../src/components/message-action-row";
import { extractAssistantReviewComments } from "../src/state/assistant-review-comments";
import {
  DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN,
  MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS,
  MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE,
  assistantAutoReviewSummary,
  assistantCompletedThreadGoal,
  assistantHookStatsSummary,
  desktopAssistantCopyText,
  markdownFadeTextSegments,
  markdownImagePreviewAdjacentIndexes,
  markdownIndexedFadeSegmentCount,
  markdownPromptLinkFromHref,
  desktopMarkdownCodeBlockWrapMode,
  parseMarkdownInline,
  parseMarkdownBlocks,
  parseMarkdownDocument,
  parseMarkdownPromptLink,
  safeMarkdownHref,
  shouldRenderUserMessageActionStrip,
  MessageUnitView,
} from "../src/components/message-unit";

export default function runMessageUnitTests(): void {
  hidesFinalOutputChromeForCommentaryRows();
  hidesTimestampOnlyActionRows();
  rendersRowsWithCopyableText();
  rendersRowsWithSecondaryActions();
  rendersUserActionStripForMetadataOnlyRows();
  formatsAssistantSpreadsheetResourceCards();
  formatsAssistantWebsiteAndGoogleDriveEndResources();
  limitsAssistantEndResourceCardsLikeCodexDesktop();
  rendersAssistantEndResourceOpenInDropdownLikeCodexDesktop();
  doesNotInventAssistantArtifactActionForEndResources();
  formatsAssistantImageResourceCards();
  parsesInlineMarkdownImagesBeforeLinks();
  rejectsUnsafeMarkdownLinks();
  parsesAssistantPromptLinksLikeDesktop();
  summarizesAssistantAutoReviewStats();
  // codex: local-conversation-thread-CecHj6JI.js#uh — coverage for the new
  // assistant action row slots (hookStats `zs`, completedThreadGoal `dh`).
  // Note: sentAtMs trailing slot 已删除（Codex 对齐 — action row 无 timestamp）。
  rendersAssistantTurnRatingWhenSubmitterAvailable();
  hidesUserEditAffordanceUnlessMostRecentTurn();
  rendersThreadGoalUserStatusLikeCodexDesktop();
  rendersHookUserStatusLikeCodexDesktop();
  rendersAssistantTimestampFromCompletedAtMs();
  summarizesAssistantHookStatsLikeCodexDesktop();
  rendersCompletedThreadGoalChipLikeCodexDesktop();
  parsesStandaloneImagesWithSpacesInTargets();
  resolvesAssistantImageSourcesWithLooseFilenameSpacing();
  hidesResourceCardsForWorkedCommentaryRows();
  indexesStreamingMarkdownFadeSegmentsLikeDesktop();
  rendersSoftAndHardLineBreaksLikeDesktopMarkdown();
  rendersNestedListsLikeDesktopMarkdown();
  rendersLooseListsLikeDesktopMarkdown();
  rendersMixedTaskListsLikeDesktopMarkdown();
  rendersBlockquoteChildrenLikeDesktopMarkdown();
  rendersTableAlignmentLikeDesktopMarkdown();
  rendersBareLinksLikeDesktopMarkdown();
  rendersReferenceLinksLikeDesktopMarkdown();
  demotesPriorityBadgeSubscriptLikeDesktopMarkdown();
  limitsMarkdownCodeWrapToggleToDesktopTextLanguages();
  usesDesktopLazyCodeBlockViewportMargin();
  computesDesktopImagePreviewNavigation();
  usesScopedMarkdownImagePreviewClass();
  formatsAssistantCopyTextLikeDesktop();
  extractsAssistantReviewCommentDirectivesLikeDesktop();
  routesMermaidCodeBlocksToTheDiagramRenderer();
  parsesKatexBlockAndInlineMathLikeDesktop();
}

function hidesFinalOutputChromeForCommentaryRows(): void {
  assertEqual(
    shouldRenderAssistantMessageChrome("commentary"),
    false,
    "worked commentary rows should not render final assistant chrome",
  );
  assertEqual(
    shouldRenderAssistantMessageChrome("final_answer"),
    true,
    "final assistant output should keep its chrome",
  );
  assertEqual(
    shouldRenderAssistantMessageChrome("unknown"),
    true,
    "legacy assistant outputs should keep the existing final-output chrome",
  );
}

function hidesTimestampOnlyActionRows(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "", hasActionChildren: false }),
    false,
    "message actions should not render when only a timestamp is available",
  );
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "   ", hasActionChildren: false }),
    false,
    "whitespace-only copy text should not render a Desktop action row",
  );
}

function rendersRowsWithCopyableText(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "hello", hasActionChildren: false }),
    true,
    "copyable text should render a Desktop action row",
  );
}

function rendersRowsWithSecondaryActions(): void {
  assertEqual(
    shouldRenderMessageActionRow({ copyText: "", hasActionChildren: true }),
    true,
    "artifact, fork, edit, or review actions should render a Desktop action row",
  );
}

function rendersUserActionStripForMetadataOnlyRows(): void {
  assertEqual(
    shouldRenderUserMessageActionStrip({ copyText: "", hasEditAction: false, metaCount: 1 }),
    true,
    "Desktop user status chips should keep the below-message strip visible without copy/edit actions",
  );
  assertEqual(
    shouldRenderUserMessageActionStrip({ copyText: "   ", hasEditAction: false, metaCount: 0 }),
    false,
    "empty user messages without metadata should not render the below-message strip",
  );
}

function formatsAssistantSpreadsheetResourceCards(): void {
  assertDeepEqual(
    assistantResourceCardViewModels([
      {
        id: "artifact:weather",
        title: "beijing_weather_next_7_days.csv",
        meta: "beijing_weather_next_7_days.csv",
        status: "referenced",
        reference: { path: "beijing_weather_next_7_days.csv", lineStart: 1 },
        action: { kind: "file", reference: { path: "beijing_weather_next_7_days.csv", lineStart: 1 } },
      },
    ]).map((card) => ({ title: card.title, typeLabel: card.typeLabel })),
    [{ title: "beijing_weather_next_7_days.csv", typeLabel: "Spreadsheet · csv" }],
    "assistant file resources should use Desktop-style spreadsheet labels",
  );
}

function formatsAssistantWebsiteAndGoogleDriveEndResources(): void {
  assertDeepEqual(
    assistantEndResourceCardViewModels([
      { type: "file", path: "docs/report.pdf" },
      { type: "website", target: "http://localhost:3000/report" },
      {
        type: "google-drive",
        url: "https://docs.google.com/spreadsheets/d/example/edit",
        title: "Revenue model",
        resourceKind: "spreadsheet",
      },
    ]).map((card) => ({ title: card.title, typeLabel: card.typeLabel, meta: card.meta })),
    [
      { title: "report.pdf", typeLabel: "Document · PDF", meta: "docs/report.pdf" },
      { title: "Web preview", typeLabel: "Website", meta: "http://localhost:3000/report" },
      { title: "Revenue model", typeLabel: "Sheets", meta: "https://docs.google.com/spreadsheets/d/example/edit" },
    ],
    "Desktop end resources should render website and Google Drive cards in the assistant after-content surface",
  );
}

function limitsAssistantEndResourceCardsLikeCodexDesktop(): void {
  const html = renderToStaticMarkup(createElement(AssistantEndResourceCards, {
    resources: [
      { type: "file", path: "one.csv" },
      { type: "file", path: "two.pdf" },
      { type: "file", path: "three.pptx" },
      { type: "file", path: "four.xlsx" },
    ],
  }));

  assertEqual(html.includes("one.csv"), true, "first end resource should render");
  assertEqual(html.includes("three.pptx"), true, "third end resource should render");
  assertEqual(html.includes("four.xlsx"), false, "fourth end resource should be hidden until expanded");
  assertEqual(html.includes("Show 1 more"), true, "Desktop end resources should expose the show-more footer after three rows");
  assertEqual(html.includes("Open preview"), true, "file end resource rows should expose Desktop's hover subtitle");
  assertEqual(html.includes("Open in"), true, "file end resource rows should expose Desktop's open-in affordance label");
}

function rendersAssistantEndResourceOpenInDropdownLikeCodexDesktop(): void {
  const html = renderToStaticMarkup(createElement(AssistantEndResourceCards, {
    resources: [{ type: "file", path: "docs/report.pdf" }],
    onOpenArtifact: () => undefined,
    onRevealResource: () => undefined,
  }));

  assertEqual(html.includes("hc-assistant-end-resource-preview-button"), true, "end resource card should render a separate preview overlay button");
  assertEqual(html.includes("aria-haspopup=\"menu\""), true, "file end resource should expose a distinct Open in dropdown trigger");
  assertEqual(html.includes("aria-label=\"Open report.pdf\""), true, "preview overlay should own the open-preview accessible label");
}

function doesNotInventAssistantArtifactActionForEndResources(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-resource-action",
      role: "assistant",
      item: {
        id: "assistant-resource-action",
        type: "agentMessage",
        _turnId: "turn-resource-action",
        completed: true,
      },
      text: "",
      assistantPhase: "final_answer",
      assistantAfter: [
        {
          kind: "assistantEndResources",
          key: "end-resources:assistant-resource-action",
          cwd: "/workspace/project",
          turnId: "turn-resource-action",
          resources: [{ type: "website", target: "http://localhost:3000/report" }],
        },
      ],
    },
  }));

  assertEqual(
    html.includes("Web preview"),
    true,
    "assistant end resources should still render in the assistant after-content surface",
  );
  assertEqual(
    html.includes("Artifacts available"),
    false,
    "Desktop action row does not expose a standalone artifacts button",
  );
  assertEqual(
    html.includes("hc-message-actions"),
    false,
    "artifact presence alone should not create a HiCodex-only action row",
  );
  assertEqual(
    html.includes("Copy message"),
    false,
    "empty assistant text should not add a copy button just because resources exist",
  );
}

function formatsAssistantImageResourceCards(): void {
  assertDeepEqual(
    assistantResourceCardViewModels([
      {
        id: "artifact:image",
        title: "UA-image2.png",
        meta: "/Users/haichao/Downloads/Day2-UA-图片/UA-image2.png",
        status: "referenced",
        reference: { path: "/Users/haichao/Downloads/Day2-UA-图片/UA-image2.png", lineStart: 1 },
        action: { kind: "file", reference: { path: "/Users/haichao/Downloads/Day2-UA-图片/UA-image2.png", lineStart: 1 } },
      },
    ]).map((card) => ({ title: card.title, typeLabel: card.typeLabel, kind: card.kind })),
    [{ title: "UA-image2.png", typeLabel: "Image · png", kind: "image" }],
    "assistant image resources should render as image resources instead of being filtered out",
  );
}

function limitsMarkdownCodeWrapToggleToDesktopTextLanguages(): void {
  assertEqual(
    desktopMarkdownCodeBlockWrapMode(""),
    "user-controlled",
    "markdown code blocks without a language should keep Desktop's user-controlled wrap toggle",
  );
  assertEqual(
    desktopMarkdownCodeBlockWrapMode("markdown"),
    "user-controlled",
    "markdown code blocks should keep Desktop's user-controlled wrap toggle",
  );
  assertEqual(
    desktopMarkdownCodeBlockWrapMode("typescript"),
    "off",
    "typed code blocks should not expose Desktop's wrap toggle",
  );
  assertEqual(
    desktopMarkdownCodeBlockWrapMode("mermaid"),
    "off",
    "mermaid blocks should not expose Desktop's wrap toggle",
  );
}

function usesDesktopLazyCodeBlockViewportMargin(): void {
  assertEqual(
    DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN,
    "600px 0px",
    "markdown code blocks should lazy-render with Desktop's 600px vertical root margin",
  );
}

function computesDesktopImagePreviewNavigation(): void {
  assertEqual(
    MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE,
    "data-markdown-image-preview-trigger",
    "markdown image preview triggers should expose Desktop's root query attribute",
  );
  assertDeepEqual(
    markdownImagePreviewAdjacentIndexes({
      index: 1,
      items: [
        { alt: "first", src: "first.png", title: null },
        { alt: "second", src: "second.png", title: null },
        { alt: "third", src: "third.png", title: null },
      ],
    }),
    { previous: 0, next: 2 },
    "markdown image preview should compute previous and next images from Desktop-style indexed preview state",
  );
  assertDeepEqual(
    markdownImagePreviewAdjacentIndexes({
      index: 0,
      items: [{ alt: "only", src: "only.png", title: null }],
    }),
    { previous: null, next: null },
    "markdown image preview should hide navigation at the collection edges",
  );
}

function usesScopedMarkdownImagePreviewClass(): void {
  assertEqual(
    MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS,
    "hc-markdown-image-preview-dialog",
    "markdown image preview should not share composer attachment preview classes",
  );
}

function formatsAssistantCopyTextLikeDesktop(): void {
  const content = [
    "Done 【/workspace/src/app.ts†L1】 and 【F:relative%20note.md†L4-L6】.",
    "",
    ':code-comment{title="Keep" body="Desktop copy keeps raw review directives." file="src/app.ts"}',
    ':citation{automation_id="web" index="0"}',
  ].join("\n");

  assertEqual(
    desktopAssistantCopyText(content),
    [
      "Done /workspace/src/app.ts and relative note.md:4-6.",
      "",
      ':code-comment{title="Keep" body="Desktop copy keeps raw review directives." file="src/app.ts"}',
      ':citation{automation_id="web" index="0"}',
    ].join("\n"),
    "assistant copy text should mirror Desktop raw content plus file-line citation normalization",
  );
  assertEqual(
    desktopAssistantCopyText("See 【relative.md†L2】"),
    "See 【relative.md†L2】",
    "Desktop leaves non-forced relative file-line citations unchanged in copy text",
  );
}

function extractsAssistantReviewCommentDirectivesLikeDesktop(): void {
  const extraction = extractAssistantReviewComments(
    [
      "Review complete.",
      "",
      ":code-comment{title=\"Guard branch\" body=\"Handle the missing value.\" file=\"src/app.ts\" priority=2 start=4 end=6}",
      "",
      "Next item.",
    ].join("\n"),
    "/workspace/project",
  );

  assertEqual(
    extraction.cleanedContent,
    ["Review complete.", "", "Next item."].join("\n"),
    "code-comment directives should be stripped before assistant markdown renders",
  );
  assertDeepEqual(
    extraction.comments,
    [
      {
        title: "Guard branch",
        body: "Handle the missing value.",
        path: "/workspace/project/src/app.ts",
        line: 6,
        startLine: 4,
        priority: "P2",
      },
    ],
    "code-comment directives should become Desktop-style review comment metadata",
  );

  const inlineExtraction = extractAssistantReviewComments(
    'Review inline :code-comment{title="Inline" body="Ignored." file="src/app.ts" priority=1}',
    "/workspace/project",
  );
  assertEqual(
    inlineExtraction.cleanedContent,
    'Review inline :code-comment{title="Inline" body="Ignored." file="src/app.ts" priority=1}',
    "Desktop only extracts code-comment directives that start a line",
  );
  assertDeepEqual(
    inlineExtraction.comments,
    [],
    "inline code-comment text should not become a model-authored review comment",
  );
}

function parsesInlineMarkdownImagesBeforeLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("![UA-image2.png](UA-image2.png)").map((segment) => segment.kind === "image"
      ? { kind: segment.kind, alt: segment.alt, src: segment.src }
      : { kind: segment.kind }),
    [{ kind: "image", alt: "UA-image2.png", src: "UA-image2.png" }],
    "inline markdown images in list items should not degrade into a literal bang plus link",
  );
}

function rejectsUnsafeMarkdownLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("No <javascript:alert(1)> and no [x](javascript:alert(1)).").map(promptSegmentSummary),
    [{ kind: "text", text: "No <javascript:alert(1)> and no [x](javascript:alert(1))." }],
    "unsafe URL schemes should remain plain text",
  );
  assertDeepEqual(
    parseMarkdownInline("Keep <https://example.com/docs>, <dev@example.com>, and [file](</tmp/example file.ts:3>).").map(promptSegmentSummary),
    [
      { kind: "text", text: "Keep " },
      { kind: "link", href: "https://example.com/docs", text: "https://example.com/docs" },
      { kind: "text", text: ", " },
      { kind: "link", href: "mailto:dev@example.com", text: "dev@example.com" },
      { kind: "text", text: ", and " },
      { kind: "link", href: "/tmp/example file.ts:3", text: "file" },
      { kind: "text", text: "." },
    ],
    "safe external and local markdown links should still render",
  );
  assertEqual(safeMarkdownHref("data:text/html,hello"), null, "data URLs should be rejected");
  assertEqual(safeMarkdownHref("//example.com"), null, "protocol-relative URLs should be rejected");
}

function demotesPriorityBadgeSubscriptLikeDesktopMarkdown(): void {
  const plainHtml = renderAssistantMarkdown("<sub>plain</sub>");
  assertEqual(plainHtml.includes("<sub>plain</sub>"), true, "ordinary basic HTML subscript should remain a sub element");

  const badgeHtml = renderAssistantMarkdown("<sub>![P1](https://img.shields.io/badge/P1-high-orange)</sub>");
  assertEqual(
    badgeHtml.includes("<sub"),
    false,
    "Desktop demotes priority-badge image subscripts to a span so the badge keeps normal size",
  );
  assertEqual(
    badgeHtml.includes("https://img.shields.io/badge/P1-high-orange"),
    true,
    "priority badge image should still render after the subscript wrapper is demoted",
  );
}

function parsesAssistantPromptLinksLikeDesktop(): void {
  assertDeepEqual(
    parseMarkdownInline("Use $review and $[deep research].").map(promptSegmentSummary),
    [
      { kind: "text", text: "Use " },
      { kind: "promptLink", href: "skill://review", label: "$review", promptKind: "skill" },
      { kind: "text", text: " and " },
      { kind: "promptLink", href: "skill://deep%20research", label: "$deep research", promptKind: "skill" },
      { kind: "text", text: "." },
    ],
    "assistant markdown should parse Desktop-style $skill prompt links",
  );
  assertDeepEqual(
    parseMarkdownInline("Open [$figma](app://figma) with [@Browser](plugin://browser-use).").map(promptSegmentSummary),
    [
      { kind: "text", text: "Open " },
      { kind: "promptLink", href: "app://figma", label: "$figma", promptKind: "app" },
      { kind: "text", text: " with " },
      { kind: "promptLink", href: "plugin://browser-use", label: "@Browser", promptKind: "plugin" },
      { kind: "text", text: "." },
    ],
    "assistant markdown app/plugin prompt links should not fall through to ordinary links",
  );
  assertDeepEqual(
    parseMarkdownInline("[Docs](https://example.com)").map(promptSegmentSummary),
    [{ kind: "link", href: "https://example.com", text: "Docs" }],
    "ordinary markdown links should keep the existing link path",
  );
  assertDeepEqual(
    parseMarkdownPromptLink("@browser-use/screenshot") && promptSegmentSummary(parseMarkdownPromptLink("@browser-use/screenshot")!),
    { kind: "promptLink", href: "plugin://browser-use/screenshot", label: "@browser-use/screenshot", promptKind: "plugin" },
    "assistant markdown should parse Desktop-style @plugin/path prompt mentions",
  );
  assertDeepEqual(
    markdownPromptLinkFromHref("", "skill://code-review"),
    { kind: "promptLink", href: "skill://code-review", label: "$code-review", promptKind: "skill" },
    "prompt link fallback labels should be derived from Desktop prompt hrefs",
  );
}

function summarizesAssistantAutoReviewStats(): void {
  assertDeepEqual(
    assistantAutoReviewSummary({
      autoReviewStats: {
        status: "completed",
        riskLevel: "low",
        issueCount: 2,
        accepted: 1,
        rejected: 1,
        durationMs: 1530,
        perCommandHistory: [
          { decision: "accepted", command: "npm test" },
          { decision: "rejected", command: "rm -rf /tmp/build" },
        ],
      },
    }),
    {
      label: "2 review notes",
      title: "Auto-review notes",
      rows: [
        { label: "Status", value: "completed" },
        { label: "Risk", value: "low" },
        { label: "Findings", value: "2" },
        { label: "Accepted", value: "1" },
        { label: "Rejected", value: "1" },
        { label: "Duration", value: "1.5 s" },
      ],
      commands: [
        "accepted: npm test",
        "rejected: rm -rf /tmp/build",
      ],
    },
    "assistant auto-review stats should expose popover-ready detail rows",
  );
}

function parsesStandaloneImagesWithSpacesInTargets(): void {
  assertDeepEqual(
    parseMarkdownBlocks("![UA-image1](UA-image1-销售跟客户成功的 KPI 视角差异.png)").map((block) =>
      block.kind === "image" ? { kind: block.kind, alt: block.alt, src: block.src } : { kind: block.kind }
    ),
    [{ kind: "image", alt: "UA-image1", src: "UA-image1-销售跟客户成功的 KPI 视角差异.png" }],
    "standalone markdown image targets with spaces should still render as images",
  );
}

function resolvesAssistantImageSourcesWithLooseFilenameSpacing(): void {
  const imagePath = "/Users/haichao/Downloads/Day2-UA-图片/UA- image2.png";
  const sources = assistantArtifactMediaSources([
    {
      id: imagePath,
      title: "UA- image2.png",
      meta: imagePath,
      status: "referenced",
      reference: { path: imagePath, lineStart: 1 },
      action: { kind: "file", reference: { path: imagePath, lineStart: 1 } },
    },
  ]);

  assertEqual(
    resolveAssistantMarkdownMediaSource("UA-image2.png", sources),
    imagePath,
    "assistant markdown images should tolerate small filename spacing differences",
  );
}

function promptSegmentSummary(segment: ReturnType<typeof parseMarkdownInline>[number]) {
  if (segment.kind === "promptLink") {
    return {
      kind: segment.kind,
      href: segment.href,
      label: segment.label,
      promptKind: segment.promptKind,
    };
  }
  if (segment.kind === "link") {
    return { kind: segment.kind, href: segment.href, text: segment.text };
  }
  if (segment.kind === "text") {
    return { kind: segment.kind, text: segment.text };
  }
  return { kind: segment.kind };
}

function hidesResourceCardsForWorkedCommentaryRows(): void {
  const artifacts = [
    {
      id: "docs/DEVELOPMENT.md",
      title: "DEVELOPMENT.md",
      meta: "docs/DEVELOPMENT.md",
      status: "referenced",
      reference: { path: "docs/DEVELOPMENT.md", lineStart: 1 },
      action: { kind: "file" as const, reference: { path: "docs/DEVELOPMENT.md", lineStart: 1 } },
    },
  ];

  assertDeepEqual(
    assistantResourceCardEntriesForMessage({
      phase: "commentary",
      text: "我先按仓库要求读取开发规范。",
      artifacts,
    }),
    [],
    "worked commentary rows should not render repeated file resource cards",
  );
  assertDeepEqual(
    assistantResourceCardEntriesForMessage({
      phase: "final_answer",
      text: "已读取 `docs/DEVELOPMENT.md`。",
      artifacts,
    }).map((entry) => entry.meta),
    ["docs/DEVELOPMENT.md"],
    "final assistant rows should still show file resource cards",
  );
}

function indexesStreamingMarkdownFadeSegmentsLikeDesktop(): void {
  assertDeepEqual(
    markdownFadeTextSegments("Hello, world", null),
    ["Hello, ", "world"],
    "Desktop indexed fade fallback should split text into word-like chunks and preserve punctuation/spacing",
  );
  assertEqual(
    markdownFadeTextSegments("   ", null).join(""),
    "   ",
    "Desktop indexed fade should preserve whitespace-only text segments",
  );
  assertEqual(
    markdownIndexedFadeSegmentCount(parseMarkdownBlocks("Hello **bold text**\n\n- item one\n- item two"), null),
    7,
    "Desktop indexed fade should count markdown text tokens across paragraphs, formatting, and list items",
  );
}

function rendersSoftAndHardLineBreaksLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-line-breaks",
      role: "assistant",
      item: {
        id: "assistant-line-breaks",
        type: "agentMessage",
        _turnId: "turn-line-breaks",
        completed: true,
      },
      text: "soft\nwrap\n\nhard  \nbreak",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(html.includes("soft<br"), false, "Desktop markdown should not turn soft paragraph newlines into hard breaks");
  assertEqual(html.includes("soft\nwrap"), true, "soft paragraph newlines should remain collapsible whitespace");
  assertEqual(html.includes("hard<br/>break"), true, "two trailing spaces should render Desktop-style hard breaks");
}

function rendersNestedListsLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-nested-lists",
      role: "assistant",
      item: {
        id: "assistant-nested-lists",
        type: "agentMessage",
        _turnId: "turn-nested-lists",
        completed: true,
      },
      text: "- parent\n  - child\n    1. grand\n- next",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(
    html.includes("parent<ul><li>child<ol><li>grand</li></ol></li></ul>"),
    true,
    "Desktop markdown should keep nested list hierarchy in rendered assistant content",
  );
  assertEqual(html.includes("<li>next</li>"), true, "sibling list items should remain at the top level");
}

function rendersLooseListsLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-loose-lists",
      role: "assistant",
      item: {
        id: "assistant-loose-lists",
        type: "agentMessage",
        _turnId: "turn-loose-lists",
        completed: true,
      },
      text: "- first\n\n  continued paragraph\n  - nested\n- second",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(
    html.includes("<li><p>first</p><p>continued paragraph</p><ul><li>nested</li></ul></li>"),
    true,
    "loose list items should render Desktop-style paragraphs plus nested children",
  );
  assertEqual(
    html.includes("<li><p>second</p></li>"),
    true,
    "all items in a loose Desktop list should render their text in paragraphs",
  );
}

function rendersMixedTaskListsLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-mixed-task-lists",
      role: "assistant",
      item: {
        id: "assistant-mixed-task-lists",
        type: "agentMessage",
        _turnId: "turn-mixed-task-lists",
        completed: true,
      },
      text: "- [x] done\n- next\n  - [ ] child",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(
    html.includes('<ul class="hc-task-list contains-task-list">'),
    true,
    "Desktop task lists should remain regular lists with a contains-task-list class",
  );
  assertEqual(
    html.includes('<li class="task-list-item"><input aria-label="Completed task" readOnly="" type="checkbox" checked=""/>done</li>'),
    true,
    "checked task items should render a disabled checkbox before the item text",
  );
  assertEqual(
    html.includes('<li>next<ul class="hc-task-list contains-task-list"><li class="task-list-item"><input aria-label="Pending task" readOnly="" type="checkbox"/>child</li></ul></li>'),
    true,
    "plain sibling items and nested task lists should stay inside the same Desktop list hierarchy",
  );
}

function rendersBlockquoteChildrenLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-blockquote-children",
      role: "assistant",
      item: {
        id: "assistant-blockquote-children",
        type: "agentMessage",
        _turnId: "turn-blockquote-children",
        completed: true,
      },
      text: "> ## Note\n> - item\n>   - child",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(html.includes("<blockquote><h2>Note</h2><ul>"), true, "blockquote heading should render as a nested markdown block");
  assertEqual(
    html.includes("item<ul><li>child</li></ul>"),
    true,
    "blockquote list contents should preserve Desktop marked hierarchy",
  );
}

function rendersTableAlignmentLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-table-align",
      role: "assistant",
      item: {
        id: "assistant-table-align",
        type: "agentMessage",
        _turnId: "turn-table-align",
        completed: true,
      },
      text: "| A | B | C |\n| :-- | --: | :-: |\n| l | r | c |",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(html.includes('<th align="left">A</th>'), true, "left table alignment should reach header cells");
  assertEqual(html.includes('<td align="right">r</td>'), true, "right table alignment should reach body cells");
  assertEqual(html.includes('<td align="center">c</td>'), true, "center table alignment should reach body cells");
}

function rendersBareLinksLikeDesktopMarkdown(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-bare-links",
      role: "assistant",
      item: {
        id: "assistant-bare-links",
        type: "agentMessage",
        _turnId: "turn-bare-links",
        completed: true,
      },
      text: "Visit https://example.com/a_(b). See www.example.org/docs and dev@example.com.",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(
    html.includes('href="https://example.com/a_(b)"'),
    true,
    "Desktop markdown should link bare http URLs without trailing punctuation",
  );
  assertEqual(
    html.includes('href="http://www.example.org/docs"'),
    true,
    "Desktop markdown should link bare www URLs with an http href",
  );
  assertEqual(
    html.includes('href="mailto:dev@example.com"'),
    true,
    "Desktop markdown should link bare email addresses",
  );
}

function rendersReferenceLinksLikeDesktopMarkdown(): void {
  const document = parseMarkdownDocument([
    "[ref]: https://example.com \"Example\"",
    "",
    "See [the ref][ref], [ref][], and [REF].",
  ].join("\n"));
  assertDeepEqual(
    document.blocks,
    [{ kind: "paragraph", text: "See [the ref][ref], [ref][], and [REF]." }],
    "Desktop markdown should collect reference definitions without rendering them as blocks",
  );
  assertDeepEqual(
    parseMarkdownInline("See [the ref][ref], [ref][], and [REF].", { references: document.references }),
    [
      { kind: "text", text: "See " },
      { kind: "link", text: "the ref", href: "https://example.com", title: "Example" },
      { kind: "text", text: ", " },
      { kind: "link", text: "ref", href: "https://example.com", title: "Example" },
      { kind: "text", text: ", and " },
      { kind: "link", text: "REF", href: "https://example.com", title: "Example" },
      { kind: "text", text: "." },
    ],
    "full, collapsed, and shortcut reference links should resolve through Desktop's normalized label map",
  );
  assertDeepEqual(
    parseMarkdownDocument([
      "Before",
      "[ref]: https://example.com",
      "After [ref].",
    ].join("\n")).references.size,
    0,
    "Desktop keeps definition-looking lines inside an open paragraph instead of collecting them",
  );

  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-reference-links",
      role: "assistant",
      item: {
        id: "assistant-reference-links",
        type: "agentMessage",
        _turnId: "turn-reference-links",
        completed: true,
      },
      text: [
        "See [ref].",
        "",
        "[ref]: https://example.com \"Example\"",
        "",
        "![alt][img]",
        "",
        "[img]: https://example.com/a.png \"Alt title\"",
      ].join("\n"),
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(html.includes("[ref]: https://example.com"), false, "reference definitions should not render as visible paragraph text");
  assertEqual(html.includes('href="https://example.com"'), true, "shortcut reference links should render with the collected href");
  assertEqual(html.includes('title="Example"'), true, "reference link titles should reach the anchor like Desktop markdown");
  assertEqual(html.includes('src="https://example.com/a.png"'), true, "reference images should render with the collected src");
  assertEqual(html.includes('title="Alt title"'), true, "reference image titles should reach the image element");
}

// codex: mermaid-diagram-p7A5YYxA.js — verifies fenced ```mermaid blocks are
// preserved with `language === "mermaid"` so `CodeSnippet` swaps in the
// dynamic `MermaidDiagram` instead of the syntax-highlighted code path.
function routesMermaidCodeBlocksToTheDiagramRenderer(): void {
  const blocks = parseMarkdownBlocks("```mermaid\ngraph TD; A-->B\n```");
  assertEqual(blocks.length, 1, "mermaid fence should produce exactly one block");
  const block = blocks[0];
  if (!block || block.kind !== "code") {
    throw new Error("mermaid fence should parse as a code block, got " + (block?.kind ?? "none"));
  }
  assertEqual(block.language, "mermaid", "mermaid fence language must reach CodeSnippet so the diagram renderer activates");
  assertEqual(block.text, "graph TD; A-->B", "mermaid fence body must be preserved verbatim");
}

// codex: katex-7--VtpAh.js — verifies the parser recognises block `$$..$$`
// and inline `$..$` while rejecting currency-style `$5` so KaTeX renders only
// real math expressions.
function parsesKatexBlockAndInlineMathLikeDesktop(): void {
  const blockMath = parseMarkdownBlocks("$$\nE = mc^2\n$$");
  assertEqual(blockMath.length, 1, "$$..$$ should produce a single math block");
  const blockMathBlock = blockMath[0];
  if (!blockMathBlock || blockMathBlock.kind !== "math") {
    throw new Error("$$..$$ should parse as a math block, got " + (blockMathBlock?.kind ?? "none"));
  }
  assertEqual(blockMathBlock.text, "E = mc^2", "math block body should be trimmed and preserved");

  const inline = parseMarkdownInline("inline $a+b$ math");
  const mathSegment = inline.find((segment) => segment.kind === "math");
  if (!mathSegment || mathSegment.kind !== "math") {
    throw new Error("inline `$a+b$` should yield a math segment");
  }
  assertEqual(mathSegment.text, "a+b", "inline math should expose the bare TeX source");

  const currency = parseMarkdownInline("a coffee costs $5 today");
  const currencyHasMath = currency.some((segment) => segment.kind === "math");
  assertEqual(currencyHasMath, false, "bare `$5` currency should not be misread as inline math");
}

function rendersAssistantTurnRatingWhenSubmitterAvailable(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    threadId: "thread-rating",
    onSubmitTurnFeedback: () => undefined,
    onForkTurn: () => undefined,
    unit: {
      kind: "message",
      key: "assistant-rating",
      role: "assistant",
      item: {
        id: "assistant-rating",
        type: "agentMessage",
        _turnId: "turn-rating",
        completed: true,
        text: "Sample reply.",
        completedAtMs: 1716557400000,
      },
      text: "Sample reply.",
      hasArtifacts: true,
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(html.includes("Good response"), true, "Desktop Ec thumbs-up rating should render when a real submit callback is available");
  assertEqual(html.includes("Bad response"), true, "Desktop Ec thumbs-down rating should render when a real submit callback is available");
  assertEqual(
    html.indexOf("Good response") < html.indexOf("Fork from this point"),
    true,
    "Desktop action row orders rating before fork",
  );
}

// codex: local-conversation-thread-Kn0WAsVa.js — the user-message edit
// affordance is gated to the MOST RECENT user turn only. In the thread loop
// `for(let[e,a]of pe.entries()){let o=e===pe.length-1;...onEditMessage:o?S:void 0}`
// the edit handler `S` is passed solely when `o` (the last-index /
// `isMostRecentTurn: S===v.length-1` flag) is true; older turns receive
// `void 0` and expose Fork rather than Edit. This guards
// MessageUnitView's `onEdit = ... && isMostRecentTurn && ...` predicate.
function hidesUserEditAffordanceUnlessMostRecentTurn(): void {
  const userUnit = (isMostRecentTurn: boolean) => ({
    threadId: "thread-edit-gate",
    isMostRecentTurn,
    onEditLastUserMessage: () => undefined,
    unit: {
      kind: "message" as const,
      key: "user-edit-gate",
      role: "user" as const,
      item: {
        id: "user-edit-gate",
        type: "userMessage",
        _turnId: "turn-edit-gate",
        // No `_turnStatus` -> messageTurnStatus() === "" -> not in progress.
      },
      text: "Refine the report copy.",
    },
  });

  const olderTurnHtml = renderToStaticMarkup(createElement(MessageUnitView, userUnit(false)));
  assertEqual(
    olderTurnHtml.includes("Edit message"),
    false,
    "older user turns should not expose the edit affordance (Codex passes onEditMessage `void 0` off the most recent turn)",
  );
  assertEqual(
    olderTurnHtml.includes("Refine the report copy."),
    true,
    "the older user turn should still render its message text without an edit button",
  );

  const recentTurnHtml = renderToStaticMarkup(createElement(MessageUnitView, userUnit(true)));
  assertEqual(
    recentTurnHtml.includes("Edit message"),
    true,
    "the most recent user turn should expose the Desktop edit affordance when a submit callback and turn id are available",
  );
}

function rendersThreadGoalUserStatusLikeCodexDesktop(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "user-goal-status",
      role: "user",
      item: {
        id: "user-goal-status",
        type: "userMessage",
        _turnId: "turn-goal-status",
        _threadGoal: {
          threadId: "thread-goal-status",
          objective: "Keep aligning Desktop parity",
          status: "active",
        },
      },
      text: "Keep aligning Desktop parity",
    },
  }));

  assertEqual(html.includes("Sent as goal"), true, "Desktop user goal rows should render the Sent as goal status");
  assertEqual(html.includes("Goal:"), false, "the user goal status should not expose HiCodex-only objective text");
}

function rendersHookUserStatusLikeCodexDesktop(): void {
  const blockedHtml = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "user-hook-blocked",
      role: "user",
      item: {
        id: "user-hook-blocked",
        type: "userMessage",
        deliveryStatus: "not-sent",
        hookBlocked: true,
        _threadGoal: {
          threadId: "thread-hook-blocked",
          objective: "Keep aligning Desktop parity",
          status: "active",
        },
      },
      text: "Blocked by hook",
    },
  }));
  assertEqual(blockedHtml.includes("Hook blocked this message"), true, "blocked hook user rows should render Desktop's hook-blocked status");
  assertEqual(blockedHtml.includes("Sent as goal"), true, "hook status should not remove the existing goal status chip");

  const feedbackHtml = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "hook-feedback",
      role: "user",
      item: {
        id: "hook-feedback",
        type: "hookPrompt",
      },
      text: "Hook suggested a safer command.",
    },
  }));
  assertEqual(feedbackHtml.includes("Hook feedback"), true, "hookPrompt rows should render Desktop's hook feedback status");
}

// Codex Desktop's assistant message action row renders a per-message timestamp
// as its trailing hover/focus affordance (re-verified vs Codex Desktop
// v26.519.81530). The earlier "no timestamp" removal was a misread of the
// action row; the timestamp is restored, derived from the item's
// completedAtMs / startedAtMs and revealed alongside the other action buttons.
function rendersAssistantTimestampFromCompletedAtMs(): void {
  const html = renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-timestamp",
      role: "assistant",
      item: {
        id: "assistant-timestamp",
        type: "agentMessage",
        _turnId: "turn-timestamp",
        completed: true,
        text: "Sample reply.",
        completedAtMs: 1716557400000,
      },
      text: "Sample reply.",
      assistantPhase: "final_answer",
    },
  }));

  assertEqual(
    html.includes("hc-message-time"),
    true,
    "assistant action row should render a trailing timestamp span derived from completedAtMs",
  );
}

// codex: local-conversation-thread-CecHj6JI.js#uh — `t[17]===a?...:(0,$.jsx)(zs,{stats:a})`.
// `assistantHookStatsSummary` is the data adapter that converts the protocol
// payload into the chip's popover rows.
function summarizesAssistantHookStatsLikeCodexDesktop(): void {
  const summary = assistantHookStatsSummary({
    hookStats: {
      count: 3,
      blockedCount: 1,
      errorCount: 0,
      entries: [
        { kind: "PreCommand", text: "block dangerous rm" },
        { kind: "PostCommand", text: "" },
      ],
    },
  });
  assertDeepEqual(
    summary,
    {
      label: "3 hooks",
      title: "Hooks summary",
      rows: [
        { label: "Ran", value: "3" },
        { label: "Blocked", value: "1" },
      ],
      entries: [
        { kind: "PreCommand", text: "block dangerous rm" },
        { kind: "PostCommand", text: "" },
      ],
    },
    "assistant hookStats summary should mirror Codex Desktop's chip popover shape",
  );

  assertEqual(
    assistantHookStatsSummary({}),
    null,
    "missing hookStats payload should suppress the chip",
  );
}

// codex: local-conversation-thread-CecHj6JI.js#dh — `n.timeUsedSeconds*1e3` →
// "Goal achieved in {totalTime}". Confirm the chip text mirrors Codex Desktop
// and that in-progress goals do not light the chip up.
function rendersCompletedThreadGoalChipLikeCodexDesktop(): void {
  assertDeepEqual(
    assistantCompletedThreadGoal({
      completedThreadGoal: {
        status: "complete",
        objective: "Ship the assistant action row",
        timeUsedSeconds: 90,
      },
    }),
    {
      label: "Goal achieved in 1 min 30 s",
      objective: "Ship the assistant action row",
      durationLabel: "1 min 30 s",
    },
    "completed thread goal payload should produce Codex Desktop's chip label",
  );

  assertEqual(
    assistantCompletedThreadGoal({
      completedThreadGoal: {
        status: "in_progress",
        objective: "Still working",
        timeUsedSeconds: 30,
      },
    }),
    null,
    "in-progress goals should not surface the completed-goal chip (Codex passes `null` via `W?null:w`)",
  );
}

function renderAssistantMarkdown(text: string): string {
  return renderToStaticMarkup(createElement(MessageUnitView, {
    unit: {
      kind: "message",
      key: "assistant-markdown-test",
      role: "assistant",
      item: {
        id: "assistant-markdown-test",
        type: "agentMessage",
        _turnId: "turn-assistant-markdown-test",
        completed: true,
      },
      text,
      assistantPhase: "final_answer",
    },
  }));
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
