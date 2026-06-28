import {
  SOURCE_FILE_PREVIEW_MAX_BYTES,
  isSourceFilePreviewTooLarge,
  shouldShowSourceWordWrapControl,
  unsupportedFilePreviewType,
} from "../src/components/file-preview-helpers";
import {
  sourceMarkdownFileReference,
  sourceMarkdownMediaSources,
} from "../src/components/file-preview-panel-body";

export default function runFilePreviewHelperTests(): void {
  mapsDesktopUnsupportedPreviewTypes();
  leavesForgeImplementedPreviewTypesSupported();
  matchesDesktopSourcePreviewTooLargeLimit();
  showsWordWrapOnlyForRawSourcePreviews();
  resolvesSourceMarkdownLocalReferencesFromSourcePath();
  buildsSourceMarkdownMediaSourcesFromRelativeImages();
}

function mapsDesktopUnsupportedPreviewTypes(): void {
  assertEqual(unsupportedFilePreviewType("/tmp/archive.tgz"), "archive", "archives should use Desktop's archive unsupported state");
  assertEqual(unsupportedFilePreviewType("/tmp/audio.wav"), "audio", "audio files should use Desktop's audio unsupported state");
  assertEqual(unsupportedFilePreviewType("/tmp/movie.mp4"), "video", "video files should use Desktop's video unsupported state");
  assertEqual(unsupportedFilePreviewType("/tmp/slides.pptx"), "powerpoint-deck", "PowerPoint files should use Desktop's deck unsupported state");
  assertEqual(unsupportedFilePreviewType("/tmp/notes.rtf"), "rich-text-document", "RTF files should use Desktop's rich-text unsupported state");
  assertEqual(unsupportedFilePreviewType("/tmp/sheet.xls"), "excel-spreadsheet", "legacy xls files should use Desktop's spreadsheet unsupported state");
  assertEqual(
    unsupportedFilePreviewType("/tmp/unknown.bin", { mimeType: "application/octet-stream" }),
    "binary",
    "octet-stream files should use Desktop's binary unsupported state",
  );
}

function leavesForgeImplementedPreviewTypesSupported(): void {
  assertEqual(unsupportedFilePreviewType("/tmp/document.docx"), null, "Forge's docx preview should not be downgraded to unsupported");
  assertEqual(unsupportedFilePreviewType("/tmp/sheet.xlsx"), null, "Forge's xlsx preview should not be downgraded to unsupported");
  assertEqual(unsupportedFilePreviewType("/tmp/README.md"), null, "markdown files should remain previewable");
}

function matchesDesktopSourcePreviewTooLargeLimit(): void {
  assertEqual(
    SOURCE_FILE_PREVIEW_MAX_BYTES,
    10 * 1024 * 1024,
    "source preview should use Desktop's 10MiB FileSourcePage cap",
  );
  assertEqual(
    isSourceFilePreviewTooLarge({ sizeBytes: SOURCE_FILE_PREVIEW_MAX_BYTES }),
    false,
    "Desktop source preview cap should be exclusive",
  );
  assertEqual(
    isSourceFilePreviewTooLarge({ sizeBytes: SOURCE_FILE_PREVIEW_MAX_BYTES + 1 }),
    true,
    "Desktop source preview should reject files larger than 10MiB",
  );
}

function showsWordWrapOnlyForRawSourcePreviews(): void {
  assertEqual(shouldShowSourceWordWrapControl("/tmp/src/app.ts", true), true, "code source tabs should expose word wrap");
  assertEqual(shouldShowSourceWordWrapControl("/tmp/README.md", true), false, "markdown rich preview should hide word wrap");
  assertEqual(shouldShowSourceWordWrapControl("/tmp/README.md", false), true, "markdown source view should expose word wrap");
  assertEqual(shouldShowSourceWordWrapControl("/tmp/report.pdf", true), false, "PDF source tabs should hide word wrap");
  assertEqual(shouldShowSourceWordWrapControl("/tmp/sheet.xlsx", true), false, "spreadsheet previews should hide word wrap");
  assertEqual(shouldShowSourceWordWrapControl("/tmp/image.png", true), false, "image previews should hide word wrap");
}

function resolvesSourceMarkdownLocalReferencesFromSourcePath(): void {
  assertDeepEqual(
    sourceMarkdownFileReference("/workspace/docs/README.md", "./images/logo.png#logo"),
    { path: "/workspace/docs/images/logo.png", lineStart: 1 },
    "source markdown relative hrefs should resolve from the markdown file directory",
  );
  assertDeepEqual(
    sourceMarkdownFileReference("/workspace/docs/guides/intro.md", "../src/app.ts?plain=1"),
    { path: "/workspace/docs/src/app.ts", lineStart: 1 },
    "source markdown parent-directory hrefs should normalize path segments",
  );
  assertDeepEqual(
    sourceMarkdownFileReference("C:\\workspace\\docs\\README.md", ".\\images\\logo.png"),
    { path: "C:/workspace/docs/images/logo.png", lineStart: 1 },
    "source markdown Windows paths should normalize separators",
  );
  assertEqual(sourceMarkdownFileReference("/workspace/docs/README.md", "#heading"), null, "anchor-only markdown links are not file references");
  assertEqual(sourceMarkdownFileReference("/workspace/docs/README.md", "https://example.com/image.png"), null, "external markdown links are not source file references");
  assertEqual(sourceMarkdownFileReference("/workspace/docs/README.md", "mailto:test@example.com"), null, "foreign schemes are not source file references");
}

function buildsSourceMarkdownMediaSourcesFromRelativeImages(): void {
  const mediaSources = sourceMarkdownMediaSources([
    "![Logo](./images/logo.png)",
    "",
    "> ![Nested](../shared/nested.svg)",
    "",
    "| asset |",
    "| --- |",
    "| ![Table](./table/chart.webp) |",
  ].join("\n"), "/workspace/docs/README.md");
  assertEndsWith(
    mediaSources.get("./images/logo.png") ?? "",
    "/workspace/docs/images/logo.png",
    "source markdown image media should resolve relative to the source file directory",
  );
  assertEndsWith(
    mediaSources.get("../shared/nested.svg") ?? "",
    "/workspace/shared/nested.svg",
    "source markdown nested image media should normalize parent-directory references",
  );
  assertEndsWith(
    mediaSources.get("./table/chart.webp") ?? "",
    "/workspace/docs/table/chart.webp",
    "source markdown table image media should be collected",
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

function assertEndsWith(actual: string, expectedSuffix: string, message: string): void {
  const decodedActual = decodeURI(actual);
  if (!decodedActual.endsWith(expectedSuffix)) {
    throw new Error(`${message}: expected ${decodedActual} to end with ${expectedSuffix}`);
  }
}
