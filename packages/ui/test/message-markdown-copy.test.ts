import {
  desktopAssistantCopyText,
  markdownRichCopyPayloadFromElement,
  mathCopyReplacementText,
} from "../src/components/message-markdown-copy";
import { setupDomTestEnv } from "./dom-test-env";

export default function runMessageMarkdownCopyTests(): void {
  inlineMathCopiesAsRenderedUnicode();
  displayMathCopiesAsTexBlock();
  citationCopyKeepsExistingBehavior();
  richPayloadKeepsRenderedHtmlAndDesktopPlainText();
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
  // The range end's `L` is optional in the rendered form; the copy rewrite
  // must accept it too (it used to leave the raw 【…】 marker).
  assertEqual(
    desktopAssistantCopyText("see 【/Users/me/app.ts†L12-15】"),
    "see /Users/me/app.ts:12-15",
    "file citations with an L-less range end should rewrite, not stay raw",
  );
}

function richPayloadKeepsRenderedHtmlAndDesktopPlainText(): void {
  const env = setupDomTestEnv();
  try {
    const root = env.document.createElement("div");
    root.innerHTML = [
      "<p>Done <strong>bold</strong>.</p>",
      '<div class="hc-code-actions"><button>Copy code</button></div>',
    ].join("");
    const payload = markdownRichCopyPayloadFromElement(root, "  Done **bold**.  ");
    assertEqual(payload?.plainText, "Done **bold**.", "assistant rich copy should keep the Desktop plain-text payload");
    assertIncludes(payload?.htmlText ?? "", "<strong>bold</strong>", "assistant rich copy should include rendered HTML");
    assertEqual(payload?.htmlText.includes("Copy code"), false, "assistant rich copy should strip copy-only controls from HTML");
  } finally {
    env.teardown();
  }
}

function assertIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
