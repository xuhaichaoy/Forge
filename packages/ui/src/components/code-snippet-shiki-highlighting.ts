import type { CSSProperties } from "react";
import {
  highlightCodeSegments,
  isPlainTextLanguage,
} from "./code-snippet-highlighting";
import {
  pushHighlightSegment,
  type CodeHighlightSegment,
} from "./code-snippet-highlight-segments";

const SHIKI_THEME = "github-light";
const SHIKI_LANGUAGE_ALIASES = new Map<string, string>([
  ["c++", "cpp"],
  ["cxx", "cpp"],
  ["h++", "cpp"],
  ["hpp", "cpp"],
  ["cc", "cpp"],
  ["c#", "csharp"],
  ["cs", "csharp"],
  ["f#", "fsharp"],
  ["fs", "fsharp"],
  ["objectivec", "objc"],
  ["objective-c", "objc"],
  ["obj-c", "objc"],
  ["shell", "bash"],
  ["sh", "bash"],
  ["zsh", "bash"],
  ["ps", "powershell"],
  ["ps1", "powershell"],
  ["dockerfile", "docker"],
  ["docker-compose", "yaml"],
  ["compose", "yaml"],
  ["postgres", "sql"],
  ["postgresql", "sql"],
  ["pgsql", "sql"],
  ["mysql", "sql"],
  ["sqlite", "sql"],
  ["rb", "ruby"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["rs", "rust"],
  ["golang", "go"],
  ["py", "python"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["md", "markdown"],
  ["mdx", "mdx"],
  ["yml", "yaml"],
]);

type ShikiModule = {
  bundledLanguages?: Record<string, unknown>;
  bundledLanguagesAlias?: Record<string, unknown>;
  createHighlighter: (options: { langs: string[]; themes: string[] }) => Promise<ShikiHighlighter>;
};

type ShikiHighlighter = {
  codeToTokens: (code: string, options: { includeExplanation?: boolean; lang: string; theme: string }) => { tokens: ShikiToken[][] };
  loadLanguage: (language: string) => Promise<void>;
};

type ShikiToken = {
  color?: string;
  content: string;
  explanation?: Array<{
    scopes?: Array<{
      scopeName?: string;
    }>;
  }>;
  fontStyle?: number;
};

type ShikiImporter = () => Promise<ShikiModule>;

let shikiImporter: ShikiImporter = importShikiModule;
let shikiModulePromise: Promise<ShikiModule> | null = null;
let shikiHighlighterPromise: Promise<ShikiHighlighter> | null = null;
const loadedShikiLanguages = new Set<string>();

async function importShikiModule(): Promise<ShikiModule> {
  return import("shiki") as unknown as Promise<ShikiModule>;
}

export function setShikiImporterForTests(importer: ShikiImporter): () => void {
  const previous = shikiImporter;
  shikiImporter = importer;
  resetShikiCache();
  return () => {
    shikiImporter = previous;
    resetShikiCache();
  };
}

function resetShikiCache(): void {
  shikiModulePromise = null;
  shikiHighlighterPromise = null;
  loadedShikiLanguages.clear();
}

async function getShikiModule(): Promise<ShikiModule> {
  shikiModulePromise ??= shikiImporter();
  return shikiModulePromise;
}

async function getShikiHighlighter(module: ShikiModule): Promise<ShikiHighlighter> {
  shikiHighlighterPromise ??= module.createHighlighter({
    langs: [],
    themes: [SHIKI_THEME],
  });
  return shikiHighlighterPromise;
}

export async function highlightCodeSegmentsWithShiki(language: string, text: string): Promise<CodeHighlightSegment[] | null> {
  const fallback = () => highlightCodeSegments(language, text);
  const normalizedLanguage = normalizeShikiLanguage(language);
  if (!normalizedLanguage || text.length === 0) return fallback();
  try {
    const shikiModule = await getShikiModule();
    if (!isBundledShikiLanguage(shikiModule, normalizedLanguage)) return fallback();
    const highlighter = await getShikiHighlighter(shikiModule);
    if (!loadedShikiLanguages.has(normalizedLanguage)) {
      await highlighter.loadLanguage(normalizedLanguage);
      loadedShikiLanguages.add(normalizedLanguage);
    }
    const result = highlighter.codeToTokens(text, {
      includeExplanation: true,
      lang: normalizedLanguage,
      theme: SHIKI_THEME,
    });
    const segments = shikiTokensToHighlightSegments(result.tokens);
    return segments.some((segment) => Boolean(segment.className || segment.style)) ? segments : fallback();
  } catch {
    resetShikiCache();
    return fallback();
  }
}

function shikiTokensToHighlightSegments(lines: ShikiToken[][]): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) pushHighlightSegment(segments, "\n");
    line.forEach((token) => {
      pushHighlightSegment(segments, token.content, shikiTokenClassName(token), shikiTokenStyle(token));
    });
  });
  return segments;
}

function shikiTokenClassName(token: ShikiToken): string | undefined {
  const scopes = shikiTokenScopes(token);
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]?.toLowerCase() ?? "";
    const className = shikiScopeClassName(scope);
    if (className) return className;
  }
  return undefined;
}

function shikiScopeClassName(scope: string): string | undefined {
  if (!scope || scope.startsWith("source.")) return undefined;
  if (scope.includes("comment")) return "hljs-comment";
  if (scope.includes("markup.heading") || scope.includes("entity.name.section")) return "hljs-section";
  if (scope.includes("markup.inline.raw") || scope.includes("markup.raw") || scope.includes("markup.fenced_code")) return "hljs-code";
  if (scope.includes("markup.underline.link") || scope.includes("markup.link")) return "hljs-link";
  if (scope.includes("markup.italic") || scope.includes("markup.bold")) return "hljs-emphasis";
  if (scope.includes("constant.numeric")) return "hljs-number";
  if (scope.includes("string") || scope.includes("regexp")) return "hljs-string";
  if (scope.includes("constant.language") || scope.includes("constant.other")) return "hljs-literal";
  if (scope.includes("support.function")) return "hljs-built_in";
  if (scope.includes("entity.name.function")) return "hljs-title function_";
  if (scope.includes("keyword.operator")) return "hljs-operator";
  if (scope.includes("keyword") || scope.includes("storage")) return "hljs-keyword";
  if (scope.includes("entity.other.attribute-name")) return "hljs-attr";
  if (scope.includes("entity.name.tag")) return "hljs-name";
  if (scope.includes("punctuation.definition.tag") || scope.includes("meta.tag")) return "hljs-tag";
  if (scope.includes("variable.other.property") || scope.includes("support.variable.property")) return "hljs-property";
  if (scope.includes("support.class") || scope.includes("support.type") || scope.includes("entity.name.class") || scope.includes("entity.name.type")) return "hljs-built_in";
  if (scope.includes("variable")) return "hljs-variable";
  if (scope.startsWith("meta.")) return "hljs-meta";
  return undefined;
}

function shikiTokenScopes(token: ShikiToken): string[] {
  const scopes: string[] = [];
  for (const explanation of token.explanation ?? []) {
    for (const scope of explanation.scopes ?? []) {
      if (scope.scopeName) scopes.push(scope.scopeName);
    }
  }
  return scopes;
}

function shikiTokenStyle(token: ShikiToken): CSSProperties | undefined {
  if (!token.color && !token.fontStyle) return undefined;
  const style: CSSProperties = {};
  if (token.color) style.color = token.color;
  if (token.fontStyle) {
    if ((token.fontStyle & 1) === 1) style.fontStyle = "italic";
    if ((token.fontStyle & 2) === 2) style.fontWeight = 600;
    if ((token.fontStyle & 4) === 4) style.textDecoration = "underline";
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function normalizeShikiLanguage(language: string): string | null {
  const normalized = language.trim().toLowerCase().replace(/^language-/, "");
  if (isPlainTextLanguage(normalized)) return null;
  return SHIKI_LANGUAGE_ALIASES.get(normalized) ?? normalized;
}

function isBundledShikiLanguage(module: ShikiModule, language: string): boolean {
  return Object.hasOwn(module.bundledLanguages ?? {}, language)
    || Object.hasOwn(module.bundledLanguagesAlias ?? {}, language);
}
