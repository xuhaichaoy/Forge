import { parseMarkdownBlocks } from "../src/state/conversation-markdown-engine";

/*
 * Termination regression tests for parseMarkdownBlockLines.
 *
 * `isMarkdownBlockBoundary` recognises `$$` / `\[` / `<details>` / table
 * openers, but the matching block parsers refuse to consume them until the
 * closing line exists. During streaming every delta between the opener and
 * its close hits that state; the paragraph fallback used to make zero
 * progress there and the parser looped on the same line forever (frozen
 * page, unbounded empty-paragraph allocation). These tests fail by hanging
 * the suite if the non-advancing path ever comes back.
 */
export default function runConversationMarkdownEngineTests(): void {
  terminatesOnUnclosedBlockOpeners();
  terminatesOnEveryStreamingPrefix();
  keepsClosedMathBlocksAsMath();
}

function terminatesOnUnclosedBlockOpeners(): void {
  const cases: Array<{ name: string; text: string }> = [
    { name: "unclosed $$ opener mid-stream", text: "推进到公式版：\n\n$$" },
    { name: "partial single-line display math", text: "$$ score = QK^\\top" },
    { name: "single-line math with trailing text", text: "$$E=mc^2$$ 这是质能方程" },
    { name: "unclosed \\[ opener", text: "\\[\nE = mc^2" },
    { name: "unclosed details", text: "<details>\n还在流式输出" },
    { name: "degenerate table header", text: "|\n| --- |" },
  ];
  for (const testCase of cases) {
    const blocks = parseMarkdownBlocks(testCase.text);
    if (blocks.length === 0) {
      throw new Error(`${testCase.name}: expected at least one block`);
    }
  }

  const symptomBlocks = parseMarkdownBlocks("推进到公式版：\n\n$$");
  const tail = symptomBlocks[symptomBlocks.length - 1];
  if (!tail || tail.kind !== "paragraph" || tail.text !== "$$") {
    throw new Error(
      `unclosed $$ opener should surface as a literal paragraph, got ${JSON.stringify(tail)}`,
    );
  }
}

function terminatesOnEveryStreamingPrefix(): void {
  const lecture = [
    "我们现在有了从神经网络到 Transformer 入口的直觉线索。",
    "",
    "推进到公式版：",
    "",
    "$$",
    "\\text{score} = QK^\\top",
    "$$",
    "",
    "其中 \\(Q\\) 是查询矩阵，$K$ 是键矩阵。",
    "",
    "| 概念 | 含义 |",
    "| --- | --- |",
    "| 卷积 | 局部模式 |",
    "",
    "<details>",
    "<summary>展开</summary>",
    "补充说明",
    "</details>",
  ].join("\n");

  for (let end = 1; end <= lecture.length; end += 1) {
    parseMarkdownBlocks(lecture.slice(0, end));
  }

  const blocks = parseMarkdownBlocks(lecture);
  const math = blocks.find((block) => block.kind === "math");
  if (!math || math.kind !== "math" || math.text !== "\\text{score} = QK^\\top") {
    throw new Error(`full lecture should still parse the closed $$ block as math, got ${JSON.stringify(math)}`);
  }
}

function keepsClosedMathBlocksAsMath(): void {
  const cases: Array<{ text: string; expected: string }> = [
    { text: "$$\nE=mc^2\n$$", expected: "E=mc^2" },
    { text: "$$E=mc^2$$", expected: "E=mc^2" },
    { text: "\\[\nE=mc^2\n\\]", expected: "E=mc^2" },
  ];
  for (const testCase of cases) {
    const blocks = parseMarkdownBlocks(testCase.text);
    const block = blocks[0];
    if (!block || block.kind !== "math" || block.text !== testCase.expected) {
      throw new Error(
        `closed math ${JSON.stringify(testCase.text)} should parse as a math block, got ${JSON.stringify(block)}`,
      );
    }
  }
}
