import {
  userMessageInlineMarkdownSegmentsForTest,
} from "../src/components/user-message-content-render";

export default function runUserMessageContentRenderTests(): void {
  parsesInlineMarkdownTextForStructuredUserMessages();
  rejectsUnsafeInlineUserLinks();
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
