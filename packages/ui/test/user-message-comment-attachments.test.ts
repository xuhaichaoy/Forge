import { userMessageMetaChips } from "../src/components/user-message-meta";
import { userMessageCommentAttachmentPreviews } from "../src/state/user-message-comment-attachments";

export default function runUserMessageCommentAttachmentTests(): void {
  parsesRealCommentAttachmentPayloads();
  parsesDiffLineRangeIntoClickableSourceReference();
  parsesNestedDesktopPositionPayloads();
  treatsBrowserPseudoPathsAsStaticAnnotationLabels();
  parsesDesktopPdfAndArtifactContentPreviewFallbacks();
  ignoresSummaryOnlyCommentCountsForAttachmentPreviews();
}

function parsesRealCommentAttachmentPayloads(): void {
  const item = {
    type: "userMessage",
    commentAttachments: [{
      origin: "diff",
      path: "/workspace/src/app.ts",
      lineStart: 3,
      lineEnd: 5,
      side: "right",
      body: "Please align this button with the current source tab.",
      localBrowserScreenshot: { dataUrl: "data:image/png;base64,abc" },
    }],
  };
  const previews = userMessageCommentAttachmentPreviews(item);
  assertEqual(previews.length, 1, "one attachment preview should be parsed");
  assertEqual(previews[0]?.reference?.path, "/workspace/src/app.ts", "path should become a file reference");
  assertEqual(previews[0]?.reference?.lineStart, 3, "lineStart should be preserved");
  assertEqual(previews[0]?.reference?.lineEnd, 5, "lineEnd should be preserved");
  assertEqual(previews[0]?.kind, "comment", "diff-origin attachments should be classified as comments");
  assertEqual(previews[0]?.side, "right", "diff side should be preserved");
  assertEqual(previews[0]?.previewSrc, "data:image/png;base64,abc", "screenshot thumbnail should be preserved");

  const chips = userMessageMetaChips(item);
  assertEqual(chips.some((chip) => chip.id === "codex.userMessage.commentCount"), true, "real attachments should create a comment chip");
  assertEqual(chips.find((chip) => chip.id === "codex.userMessage.commentCount")?.values?.count, 1, "chip count should come from real attachments");
}

function parsesDiffLineRangeIntoClickableSourceReference(): void {
  const rightLine = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    comments: [{
      origin: "diff",
      path: "src/app.ts",
      side: "right",
      lineRange: "R16",
      body: "Right-side line comment",
    }],
  });
  assertEqual(rightLine[0]?.reference?.lineStart, 16, "right diff comments should parse the R-prefixed line number");
  assertEqual(rightLine[0]?.reference?.lineEnd, 16, "single-line right diff comments should preserve lineEnd");

  const leftRange = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    comments: [{
      origin: "diff",
      path: "src/app.ts",
      side: "left",
      lineRange: "L3-L5",
      body: "Left-side line comment",
    }],
  });
  assertEqual(leftRange[0]?.reference?.lineStart, 3, "left diff comments should parse the L-prefixed start line");
  assertEqual(leftRange[0]?.reference?.lineEnd, 5, "left diff comments should parse the L-prefixed end line");

  const numericRange = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    commentAttachments: [{
      origin: "artifact_annotation",
      artifactAnnotationFilePath: "/workspace/report.md",
      lineRange: "7-9",
      body: "Artifact range comment",
    }],
  });
  assertEqual(numericRange[0]?.reference?.lineStart, 7, "numeric ranges should parse the start line");
  assertEqual(numericRange[0]?.reference?.lineEnd, 9, "numeric ranges should parse the end line");
}

function parsesNestedDesktopPositionPayloads(): void {
  const previews = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    commentAttachments: [{
      origin: "diff",
      position: {
        path: "pages/pro-certification.vue",
        pathLabel: "[id].vue",
        side: "right",
        lineRange: "R480-R482",
      },
      body: "不是这个图片啊 应该是这里面的图片",
    }],
  });

  assertEqual(previews[0]?.reference?.path, "pages/pro-certification.vue", "nested Desktop position path should become the source reference");
  assertEqual(previews[0]?.reference?.lineStart, 480, "nested right-side range should parse start line");
  assertEqual(previews[0]?.reference?.lineEnd, 482, "nested right-side range should parse end line");
  assertEqual(previews[0]?.label, "[id].vue", "Desktop pathLabel should be used as the visible file label");
  assertEqual(previews[0]?.lineRange, "R480-R482", "raw Desktop lineRange should stay visible separately");
}

function treatsBrowserPseudoPathsAsStaticAnnotationLabels(): void {
  const previews = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    commentAttachments: [{
      origin: "browser",
      path: "browser:Selected browser region",
      attachedBrowserRegion: true,
      localBrowserScreenshot: { dataUrl: "data:image/png;base64,browser-region" },
      body: "这里的区域不对",
    }],
  });

  assertEqual(previews.length, 1, "browser region attachment should be parsed");
  assertEqual(previews[0]?.reference, null, "browser pseudo paths must not become side-panel file references");
  assertEqual(previews[0]?.label, "Selected region attached", "browser region should use the Desktop region label");
  assertEqual(
    previews[0]?.previewSrc,
    "data:image/png;base64,browser-region",
    "browser region screenshot should be preserved as the hover thumbnail",
  );
}

function parsesDesktopPdfAndArtifactContentPreviewFallbacks(): void {
  const pdfPreview = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    commentAttachments: [{
      origin: "pdf",
      path: "pdf:Proposal.pdf",
      pdfAnnotationFilePath: "/workspace/Proposal.pdf",
      localPdfCommentMetadata: {
        kind: "region",
        selectedText: "Total implementation timeline",
      },
      body: "PDF 这里要展开",
    }],
  });
  assertEqual(pdfPreview[0]?.reference?.path, "/workspace/Proposal.pdf", "PDF annotation file path should open the real file");
  assertEqual(pdfPreview[0]?.label, "Proposal.pdf", "PDF pseudo path prefix should be stripped from the visible label");
  assertEqual(
    pdfPreview[0]?.contentPreviewText,
    "Total implementation timeline",
    "PDF region selectedText should be used before falling back to screenshots",
  );

  const artifactPreview = userMessageCommentAttachmentPreviews({
    type: "userMessage",
    commentAttachments: [{
      origin: "artifact_annotation",
      path: "artifact:Report",
      artifactAnnotationFilePath: "/workspace/report.xlsx",
      localArtifactAnnotationMetadata: {
        target: {
          type: "document-element-selection",
          nearbyText: "Q3 revenue table",
        },
      },
      body: "表格这里需要改",
    }],
  });
  assertEqual(
    artifactPreview[0]?.reference?.path,
    "/workspace/report.xlsx",
    "artifact annotation should open the real artifact source path",
  );
  assertEqual(
    artifactPreview[0]?.contentPreviewText,
    "Q3 revenue table",
    "artifact document-element selection should expose nearbyText in the hover preview",
  );
}

function ignoresSummaryOnlyCommentCountsForAttachmentPreviews(): void {
  const item = {
    type: "userMessage",
    commentCount: 2,
  };
  assertEqual(
    userMessageCommentAttachmentPreviews(item).length,
    0,
    "commentCount alone must not fabricate attachment previews",
  );
  assertEqual(
    userMessageMetaChips(item).find((chip) => chip.id === "codex.userMessage.commentCount")?.values?.count,
    2,
    "summary count chip should still render without a popover payload",
  );
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
