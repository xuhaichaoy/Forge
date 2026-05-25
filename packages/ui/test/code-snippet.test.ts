import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CodeSnippet,
  highlightCodeSegments,
  highlightCodeSegmentsWithShiki,
  mermaidThemeVariables,
  setShikiImporterForTests,
} from "../src/components/code-snippet";

export default async function runCodeSnippetTests(): Promise<void> {
  highlightsDesktopVisibleLanguages();
  await highlightsAdditionalLanguagesWithShiki();
  await fallsBackWhenShikiIsUnavailable();
  keepsMermaidThemeVariablesModeAware();
  rendersCopyButtonInActionBar();
}

function highlightsDesktopVisibleLanguages(): void {
  assertClassedText(
    "rust",
    "pub fn main() { let ok = true; println!(\"ok\"); }",
    [
      ["pub", "hljs-keyword"],
      ["fn", "hljs-keyword"],
      ["main", "hljs-title function_"],
      ["let", "hljs-keyword"],
      ["true", "hljs-literal"],
      ["println", "hljs-built_in"],
      ["\"ok\"", "hljs-string"],
    ],
  );
  assertClassedText(
    "go",
    "package main\nfunc main() { println(nil) }",
    [
      ["package", "hljs-keyword"],
      ["func", "hljs-keyword"],
      ["main", "hljs-title function_"],
      ["println", "hljs-built_in"],
      ["nil", "hljs-literal"],
    ],
  );
  assertClassedText(
    "java",
    "public class App { String name = null; }",
    [
      ["public", "hljs-keyword"],
      ["class", "hljs-keyword"],
      ["String", "hljs-built_in"],
      ["null", "hljs-literal"],
    ],
  );
  assertClassedText(
    "sql",
    "select count(*) from users where active = true -- current",
    [
      ["select", "hljs-keyword"],
      ["count", "hljs-built_in"],
      ["from", "hljs-keyword"],
      ["where", "hljs-keyword"],
      ["true", "hljs-literal"],
      ["-- current", "hljs-comment"],
    ],
  );
  assertClassedText(
    "yml",
    "name: codex\nactive: true\ncount: 2 # total",
    [
      ["name", "hljs-attr"],
      ["active", "hljs-attr"],
      ["true", "hljs-literal"],
      ["count", "hljs-attr"],
      ["2", "hljs-number"],
      ["# total", "hljs-comment"],
    ],
  );
  assertClassedText(
    "css",
    ".panel { color: #fff; margin: 12px; }",
    [
      ["panel", "hljs-title"],
      ["color", "hljs-attr"],
      ["#fff", "hljs-number"],
      ["margin", "hljs-attr"],
      ["12px", "hljs-number"],
    ],
  );
  assertClassedText(
    "markdown",
    "# Title\nUse `code` and [link](https://example.com)",
    [
      ["# Title", "hljs-section"],
      ["`code`", "hljs-code"],
      ["[link](https://example.com)", "hljs-link"],
    ],
  );
}

async function highlightsAdditionalLanguagesWithShiki(): Promise<void> {
  const cases = [
    ["kotlin", "fun main() { println(\"ok\") }"],
    ["swift", "func greet() -> String { return \"hi\" }"],
    ["ruby", "def hello\n  puts 'hi'\nend"],
    ["cpp", "#include <iostream>\nint main() { return 0; }"],
    ["csharp", "public class App { string Name = null; }"],
    ["scala", "object App { def main(args: Array[String]) = println(\"ok\") }"],
    ["dart", "void main() { print('ok'); }"],
    ["nix", "{ pkgs }: pkgs.mkShell { packages = [ pkgs.nodejs ]; }"],
    ["perl", "sub hello { print \"ok\\n\"; }"],
    ["r", "value <- mean(c(1, 2, 3))"],
  ] as const;

  for (const [language, text] of cases) {
    const syncFallback = highlightCodeSegments(language, text);
    const highlighted = await highlightCodeSegmentsWithShiki(language, text);
    assertEqual(syncFallback, null, `${language} should not be covered by the old handwritten fallback`);
    assertEqual(segmentText(highlighted), text, `${language} Shiki output should preserve source text`);
    if (!highlighted?.some((segment) => segment.className || segment.style)) {
      throw new Error(`${language} should emit styled Shiki segments`);
    }
  }

  assertClassedAsyncText(
    await highlightCodeSegmentsWithShiki("kotlin", "fun main() { println(\"ok\") }"),
    [
      ["fun", "hljs-keyword"],
      ["main", "hljs-title function_"],
      ["\"ok\"", "hljs-string"],
    ],
  );
}

async function fallsBackWhenShikiIsUnavailable(): Promise<void> {
  const restore = setShikiImporterForTests(async () => {
    throw new Error("shiki unavailable");
  });
  try {
    assertClassedAsyncText(
      await highlightCodeSegmentsWithShiki("rust", "pub fn main() { let ok = true; }"),
      [
        ["pub", "hljs-keyword"],
        ["fn", "hljs-keyword"],
        ["true", "hljs-literal"],
      ],
    );
    assertEqual(
      await highlightCodeSegmentsWithShiki("kotlin", "fun main() = println(\"ok\")"),
      null,
      "unknown fallback languages should stay plain when Shiki is unavailable",
    );
  } finally {
    restore();
  }
}

// codex: code-snippet-CQ14r_m1.js — copy button in code block toolbar.
// Renders CodeSnippet to static markup and asserts the toolbar Copy button
// surfaces with the upstream Desktop-aligned aria-label so callers (markdown
// fences, tool detail) always expose copy affordance to keyboard users.
function rendersCopyButtonInActionBar(): void {
  const html = renderToStaticMarkup(
    createElement(CodeSnippet, { language: "ts", text: "const value = 1;\n" }),
  );
  if (!html.includes("aria-label=\"Copy code\"")) {
    throw new Error(`expected Copy code button in CodeSnippet markup, got: ${html}`);
  }
  if (!html.includes("hc-code-actions")) {
    throw new Error("expected hc-code-actions toolbar in CodeSnippet markup");
  }
  if (!html.includes("const") || !html.includes("value")) {
    throw new Error("expected snippet text to be rendered in markup");
  }
}

function keepsMermaidThemeVariablesModeAware(): void {
  const light = mermaidThemeVariables("light");
  const dark = mermaidThemeVariables("dark");
  assertEqual(light.primaryColor, "rgb(255, 255, 255)", "light Mermaid nodes should keep the light snippet surface");
  assertEqual(dark.primaryColor, "rgb(27, 30, 36)", "dark Mermaid nodes should use the dark panel surface");
  assertEqual(dark.primaryTextColor, "rgb(232, 234, 238)", "dark Mermaid text should use the dark foreground");
  if (light.primaryColor === dark.primaryColor) {
    throw new Error("Mermaid theme variables must change across light and dark modes");
  }
}

function assertClassedAsyncText(segments: Array<{ className?: string; text: string }> | null, expected: Array<[string, string]>): void {
  const classed = segments
    ?.filter((segment) => segment.className)
    .map((segment) => [segment.text, segment.className] as [string, string]);
  for (const pair of expected) {
    if (!classed?.some(([textValue, className]) => textValue === pair[0] && className === pair[1])) {
      throw new Error(`Shiki should emit ${JSON.stringify(pair)} in ${JSON.stringify(classed)}`);
    }
  }
}

function assertClassedText(language: string, text: string, expected: Array<[string, string]>): void {
  const classed = highlightCodeSegments(language, text)
    ?.filter((segment) => segment.className)
    .map((segment) => [segment.text, segment.className] as [string, string]);
  for (const pair of expected) {
    if (!classed?.some(([textValue, className]) => textValue === pair[0] && className === pair[1])) {
      throw new Error(`${language} should emit ${JSON.stringify(pair)} in ${JSON.stringify(classed)}`);
    }
  }
}

function segmentText(segments: Array<{ text: string }> | null): string | null {
  return segments?.map((segment) => segment.text).join("") ?? null;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
