import { assistantResourceCardViewModels } from "../src/components/assistant-resource-cards";
import {
  assistantArtifactMediaSources,
  assistantResourceCardEntriesForMessage,
  resolveAssistantMarkdownMediaSource,
  shouldRenderAssistantMessageChrome,
} from "../src/components/assistant-message-artifacts";
import {
  shouldRenderMessageActionRow,
} from "../src/components/message-action-row";
import {
  DESKTOP_MARKDOWN_CODE_BLOCK_ROOT_MARGIN,
  MARKDOWN_IMAGE_PREVIEW_DIALOG_CLASS,
  MARKDOWN_IMAGE_PREVIEW_TRIGGER_ATTRIBUTE,
  markdownFadeTextSegments,
  markdownImagePreviewAdjacentIndexes,
  markdownIndexedFadeSegmentCount,
  markdownPromptLinkFromHref,
  desktopMarkdownCodeBlockWrapMode,
  parseMarkdownInline,
  parseMarkdownBlocks,
  parseMarkdownPromptLink,
  shouldRenderUserMessageActionStrip,
} from "../src/components/message-unit";

export default function runMessageUnitTests(): void {
  hidesFinalOutputChromeForCommentaryRows();
  hidesTimestampOnlyActionRows();
  rendersRowsWithCopyableText();
  rendersRowsWithSecondaryActions();
  rendersUserActionStripForMetadataOnlyRows();
  formatsAssistantSpreadsheetResourceCards();
  formatsAssistantImageResourceCards();
  parsesInlineMarkdownImagesBeforeLinks();
  parsesAssistantPromptLinksLikeDesktop();
  parsesStandaloneImagesWithSpacesInTargets();
  resolvesAssistantImageSourcesWithLooseFilenameSpacing();
  hidesResourceCardsForWorkedCommentaryRows();
  indexesStreamingMarkdownFadeSegmentsLikeDesktop();
  limitsMarkdownCodeWrapToggleToDesktopTextLanguages();
  usesDesktopLazyCodeBlockViewportMargin();
  computesDesktopImagePreviewNavigation();
  usesScopedMarkdownImagePreviewClass();
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

function parsesInlineMarkdownImagesBeforeLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("![UA-image2.png](UA-image2.png)").map((segment) => segment.kind === "image"
      ? { kind: segment.kind, alt: segment.alt, src: segment.src }
      : { kind: segment.kind }),
    [{ kind: "image", alt: "UA-image2.png", src: "UA-image2.png" }],
    "inline markdown images in list items should not degrade into a literal bang plus link",
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
