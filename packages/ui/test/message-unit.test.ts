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
  parseMarkdownInline,
  parseMarkdownBlocks,
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
  parsesStandaloneImagesWithSpacesInTargets();
  resolvesAssistantImageSourcesWithLooseFilenameSpacing();
  hidesResourceCardsForWorkedCommentaryRows();
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

function parsesInlineMarkdownImagesBeforeLinks(): void {
  assertDeepEqual(
    parseMarkdownInline("![UA-image2.png](UA-image2.png)").map((segment) => segment.kind === "image"
      ? { kind: segment.kind, alt: segment.alt, src: segment.src }
      : { kind: segment.kind }),
    [{ kind: "image", alt: "UA-image2.png", src: "UA-image2.png" }],
    "inline markdown images in list items should not degrade into a literal bang plus link",
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
