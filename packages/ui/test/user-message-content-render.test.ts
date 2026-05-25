import {
  userMessageAttachmentPartsForTest,
  userMessageInlineMarkdownSegmentsForTest,
  userMessageInlinePartsForTest,
} from "../src/components/user-message-content-render";
import { projectUserMessageContent, userMessageCopyText } from "../src/state/user-message-content";
import type { UserMessageContentPart } from "../src/state/render-groups";

export default function runUserMessageContentRenderTests(): void {
  parsesInlineMarkdownTextForStructuredUserMessages();
  rejectsUnsafeInlineUserLinks();
  splitsDesktopStyleAttachmentStripFromInlinePromptContent();
  projectsSkillPromptLinksInlineAndFileLinksAsAttachments();
  copiesOnlyDesktopUserMessageBubbleContent();
}

function parsesInlineMarkdownTextForStructuredUserMessages(): void {
  assertDeepEqual(
    userMessageInlineMarkdownSegmentsForTest("Use `code` and [docs](https://example.com) around chips"),
    [
      { kind: "text", text: "Use " },
      { kind: "code", text: "code" },
      { kind: "text", text: " and " },
      { kind: "link", label: "docs", href: "https://example.com" },
      { kind: "text", text: " around chips" },
    ],
    "structured user-message text parts should keep Desktop inline code/link parsing",
  );
}

function rejectsUnsafeInlineUserLinks(): void {
  assertDeepEqual(
    userMessageInlineMarkdownSegmentsForTest("Do not [run](javascript:alert(1)) this"),
    [{ kind: "text", text: "Do not [run](javascript:alert(1)) this" }],
    "unsafe inline user links should stay literal text",
  );
}

function splitsDesktopStyleAttachmentStripFromInlinePromptContent(): void {
  const parts: UserMessageContentPart[] = [
    { kind: "text", text: "Review with ", textElements: [] },
    { kind: "chip", chipKind: "skill", label: "review", path: "/skills/review/SKILL.md" },
    {
      kind: "chip",
      chipKind: "file",
      label: "inline.ts",
      path: "src/inline.ts",
      presentation: "inline",
      fileExtension: "ts",
    },
    {
      kind: "chip",
      chipKind: "file",
      label: "attached.pdf",
      path: "/tmp/attached.pdf",
      presentation: "attachment",
      fileExtension: "pdf",
    },
    { kind: "image", source: "local", src: "/tmp/screenshot.png", label: "screenshot.png" },
  ];

  assertDeepEqual(
    userMessageAttachmentPartsForTest(parts),
    [parts[3], parts[4]],
    "Desktop-style user attachment strip should contain file attachment pills and images",
  );
  assertDeepEqual(
    userMessageInlinePartsForTest(parts),
    [parts[0], parts[1], parts[2]],
    "user bubble should keep prose plus inline prompt chips only",
  );
}

function projectsSkillPromptLinksInlineAndFileLinksAsAttachments(): void {
  const projected = projectUserMessageContent({
    type: "userMessage",
    id: "user-1",
    content: [{
      type: "text",
      text: [
        "[$code-review](/skills/code-review/SKILL.md)",
        "summarize this",
        "[composer-workflow.ts](packages/ui/src/state/composer-workflow.ts)",
      ].join("\n"),
      text_elements: [],
    }],
  });

  assertDeepEqual(
    projected,
    [
      {
        kind: "chip",
        chipKind: "skill",
        label: "code-review",
        path: "/skills/code-review/SKILL.md",
      },
      { kind: "text", text: "\nsummarize this\n", textElements: [] },
      {
        kind: "chip",
        chipKind: "file",
        label: "composer-workflow.ts",
        path: "packages/ui/src/state/composer-workflow.ts",
        presentation: "attachment",
        fileExtension: "ts",
      },
    ],
    "skill prompt links should stay inline while ordinary local file links become attachment pills",
  );
}

function copiesOnlyDesktopUserMessageBubbleContent(): void {
  const copied = userMessageCopyText({
    type: "userMessage",
    id: "user-copy",
    content: [{
      type: "text",
      text: [
        "[$拆标](</Users/haichao/Library/Application Support/HiCodex/codex-home/skills/拆标/SKILL.md>)",
        "拆一下标",
        "[综合评分表（1）.xlsx](</Users/haichao/Downloads/综合评分表（1）.xlsx>)",
        "[邀请招标文件.docx](/Users/haichao/Downloads/邀请招标文件.docx)",
      ].join("\n"),
      text_elements: [],
    }],
  });

  assertDeepEqual(
    copied,
    [
      "[$拆标](</Users/haichao/Library/Application Support/HiCodex/codex-home/skills/拆标/SKILL.md>)",
      "拆一下标",
    ].join("\n"),
    "Desktop user-message copy should keep bubble skill/text and skip attachment-strip file links",
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
