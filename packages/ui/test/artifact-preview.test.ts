import {
  artifactPreviewTabId,
  clipArtifactPreviewText,
  formatArtifactFileSize,
  isArtifactPreviewTooLarge,
  projectArtifactPreview,
  shouldOpenArtifactPreview,
} from "../src/state/artifact-preview";
import type { RailEntry } from "../src/state/render-groups";

export default function runArtifactPreviewTests(): void {
  projectsRemoteImagesForInlinePreview();
  projectsMarkdownFilesForTextPreview();
  projectsPdfFilesForPdfPreview();
  projectsOfficeArtifactsAsTypedFilePreviews();
  projectsLegacyDocFilesAsDocuments();
  keepsSpreadsheetArtifactsTypedWhilePreservingTextPreview();
  projectsOrdinaryUrlsWithoutImagePreview();
  separatesPreviewArtifactsFromBrowserUrls();
  buildsStableNonCollidingPreviewTabIds();
  clipsLongPreviewText();
  detectsDesktopPreviewSizeLimit();
}

function projectsRemoteImagesForInlinePreview(): void {
  const preview = projectArtifactPreview({
    id: "image:remote",
    title: "generated image.png",
    meta: "https://example.com/output/generated%20image.png",
    status: "completed",
    action: { kind: "url", url: "https://example.com/output/generated%20image.png" },
  });

  assertDeepEqual(
    {
      kind: preview.kind,
      url: preview.url,
      imageSource: preview.imageSource,
    },
    {
      kind: "image",
      url: "https://example.com/output/generated%20image.png",
      imageSource: { kind: "url", src: "https://example.com/output/generated%20image.png" },
    },
    "remote image artifact should become an inline image preview",
  );
}

function projectsMarkdownFilesForTextPreview(): void {
  const entry: RailEntry = {
    id: "docs/DEVELOPMENT.md",
    title: "DEVELOPMENT.md",
    meta: "docs/DEVELOPMENT.md",
    reference: { path: "docs/DEVELOPMENT.md", lineStart: 1 },
  };
  const preview = projectArtifactPreview(entry);

  assertDeepEqual(
    {
      kind: preview.kind,
      reference: preview.reference,
      textPath: preview.textPath,
    },
    {
      kind: "markdown",
      reference: { path: "docs/DEVELOPMENT.md", lineStart: 1 },
      textPath: "docs/DEVELOPMENT.md",
    },
    "markdown file artifacts should expose a text preview target",
  );
}

function projectsPdfFilesForPdfPreview(): void {
  const entry: RailEntry = {
    id: "report.pdf",
    title: "report.pdf",
    meta: "report.pdf",
    reference: { path: "report.pdf", lineStart: 1 },
  };
  const preview = projectArtifactPreview(entry);

  assertDeepEqual(
    {
      kind: preview.kind,
      artifactTypeLabel: preview.artifactTypeLabel,
      reference: preview.reference,
      pdfPath: preview.pdfPath,
    },
    {
      kind: "pdf",
      artifactTypeLabel: "PDF",
      reference: { path: "report.pdf", lineStart: 1 },
      pdfPath: "report.pdf",
    },
    "PDF file artifacts should use the artifact preview path",
  );
}

function projectsOfficeArtifactsAsTypedFilePreviews(): void {
  const preview = projectArtifactPreview({
    id: "slides.pptx",
    title: "slides.pptx",
    meta: "slides.pptx",
    reference: { path: "slides.pptx", lineStart: 1 },
  });

  assertDeepEqual(
    {
      kind: preview.kind,
      artifactTypeLabel: preview.artifactTypeLabel,
      shouldPreview: shouldOpenArtifactPreview({
        id: "slides.pptx",
        title: "slides.pptx",
        reference: { path: "slides.pptx", lineStart: 1 },
      }),
    },
    {
      kind: "presentation",
      artifactTypeLabel: "Presentation",
      shouldPreview: true,
    },
    "Office artifacts should be classified as artifact-tab files, not browser URLs",
  );
}

function projectsLegacyDocFilesAsDocuments(): void {
  const preview = projectArtifactPreview({
    id: "proposal.doc",
    title: "proposal.doc",
    meta: "proposal.doc",
    reference: { path: "proposal.doc", lineStart: 1 },
  });

  assertDeepEqual(
    {
      kind: preview.kind,
      artifactTypeLabel: preview.artifactTypeLabel,
      textPath: preview.textPath ?? null,
    },
    {
      kind: "document",
      artifactTypeLabel: "Document",
      textPath: null,
    },
    ".doc artifacts should use document preview instead of text preview",
  );
}

function keepsSpreadsheetArtifactsTypedWhilePreservingTextPreview(): void {
  const preview = projectArtifactPreview({
    id: "weather.csv",
    title: "weather.csv",
    meta: "weather.csv",
    reference: { path: "weather.csv", lineStart: 1 },
  });

  assertDeepEqual(
    {
      kind: preview.kind,
      artifactTypeLabel: preview.artifactTypeLabel,
      textPath: preview.textPath,
    },
    {
      kind: "spreadsheet",
      artifactTypeLabel: "Spreadsheet",
      textPath: "weather.csv",
    },
    "CSV artifacts should keep spreadsheet typing while still exposing a text preview target",
  );
}

function projectsOrdinaryUrlsWithoutImagePreview(): void {
  const preview = projectArtifactPreview({
    id: "website:https://example.com/docs",
    title: "example.com",
    meta: "https://example.com/docs",
    action: { kind: "url", url: "https://example.com/docs" },
  });

  assertDeepEqual(
    {
      kind: preview.kind,
      url: preview.url,
      imageSource: preview.imageSource ?? null,
    },
    {
      kind: "url",
      url: "https://example.com/docs",
      imageSource: null,
    },
    "ordinary URL artifacts should remain link previews",
  );
}

function separatesPreviewArtifactsFromBrowserUrls(): void {
  assertEqual(
    shouldOpenArtifactPreview({
      id: "file",
      title: "artifact-preview.ts",
      action: {
        kind: "file",
        reference: { path: "packages/ui/src/state/artifact-preview.ts", lineStart: 12 },
      },
    }),
    true,
    "file artifacts should open the artifact preview panel",
  );

  assertEqual(
    shouldOpenArtifactPreview({
      id: "website:https://example.com/docs",
      title: "example.com",
      action: { kind: "url", url: "https://example.com/docs" },
    }),
    false,
    "ordinary website URL artifacts should open outside the preview panel",
  );

  assertEqual(
    shouldOpenArtifactPreview({
      id: "image:https://example.com/render.png",
      title: "render.png",
      action: { kind: "url", url: "https://example.com/render.png" },
    }),
    true,
    "image URL artifacts should remain previewable artifacts",
  );
}

function buildsStableNonCollidingPreviewTabIds(): void {
  assertEqual(
    artifactPreviewTabId({
      id: "resource:file-a",
      title: "report",
      reference: { path: "reports/report.md", lineStart: 1 },
    }),
    "artifact:local:reports/report.md",
    "file artifact preview tabs should use Desktop's artifact:host:path id",
  );

  assertEqual(
    artifactPreviewTabId({
      id: "resource:file-a",
      title: "report",
      reference: { path: "reports/report.md", lineStart: 1, hostId: "host-1" },
    }, "local"),
    "artifact:host-1:reports/report.md",
    "file artifact preview tabs should prefer the reference host id",
  );

  assertEqual(
    artifactPreviewTabId({
      id: "website:https://example.com/report",
      title: "report",
      action: { kind: "url", url: "https://example.com/report" },
    }),
    "artifact:url:https%3A%2F%2Fexample.com%2Freport",
    "URL artifact preview tabs should keep a URL scope",
  );

  const first = artifactPreviewTabId({ id: "artifact:one", title: "report" });
  const second = artifactPreviewTabId({ id: "artifact:two", title: "report" });
  assertEqual(
    first === second,
    false,
    "same-title artifacts without file or URL references should not collide",
  );
}

function clipsLongPreviewText(): void {
  const text = Array.from({ length: 5 }, (_, index) => `line ${index + 1}`).join("\n");
  const preview = clipArtifactPreviewText(text, 3, 100);

  assertDeepEqual(
    preview,
    {
      text: "line 1\nline 2\nline 3",
      truncatedLineCount: 2,
      truncatedCharCount: 0,
    },
    "long artifact preview text should be line-clipped",
  );
}

function detectsDesktopPreviewSizeLimit(): void {
  assertEqual(
    isArtifactPreviewTooLarge({ isFile: true, sizeBytes: 40 * 1024 * 1024 + 1 }),
    true,
    "artifact metadata should apply the desktop 40 MB side-panel preview limit",
  );
  assertEqual(
    isArtifactPreviewTooLarge({ isFile: true, sizeBytes: 40 * 1024 * 1024 }),
    false,
    "artifact metadata should allow files at the desktop preview limit",
  );
  assertEqual(
    formatArtifactFileSize(40 * 1024 * 1024),
    "40 MB",
    "artifact file sizes should be formatted for preview status copy",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
