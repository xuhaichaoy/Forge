import { desktopAssistantCopyText, mathCopyReplacementText } from "../src/components/message-markdown-copy";

export default function runMessageMarkdownCopyTests(): void {
  inlineMathCopiesAsRenderedUnicode();
  displayMathCopiesAsTexBlock();
  citationCopyKeepsExistingBehavior();
}

function inlineMathCopiesAsRenderedUnicode(): void {
  assertEqual(
    mathCopyReplacementText("3×3", "3 \\times 3", false),
    "3×3",
    "inline math should paste as the rendered Unicode the user saw",
  );
  assertEqual(
    mathCopyReplacementText("", "3 \\times 3", false),
    "\\(3 \\times 3\\)",
    "inline math without extractable rendered text should fall back to delimited TeX",
  );
  assertEqual(mathCopyReplacementText("", "", false), "", "inline math with nothing extractable yields empty");
}

function displayMathCopiesAsTexBlock(): void {
  assertEqual(
    mathCopyReplacementText("score=QK⊤", "score = QK^\\top", true),
    "\\[\nscore = QK^\\top\n\\]",
    "display math should keep lossless TeX in \\[ \\] delimiters",
  );
  assertEqual(
    mathCopyReplacementText("score=QK⊤", "", true),
    "score=QK⊤",
    "display math without a TeX annotation should fall back to rendered text",
  );
}

function citationCopyKeepsExistingBehavior(): void {
  assertEqual(
    desktopAssistantCopyText("see 【/Users/me/app.ts†L10-L20】"),
    "see /Users/me/app.ts:10-20",
    "file citations should still rewrite to path:line ranges",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
