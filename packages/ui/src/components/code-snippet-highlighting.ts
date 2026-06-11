import type { CSSProperties } from "react";

export interface CodeHighlightSegment {
  className?: string;
  style?: CSSProperties;
  text: string;
}

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

export function isPlainTextLanguage(language: string): boolean {
  return !language || ["plain", "plaintext", "text", "txt"].includes(language);
}

export function codeHighlightKey(language: string, text: string): string {
  return `${language}\u0000${text}`;
}

export function highlightCodeSegments(language: string, text: string): CodeHighlightSegment[] | null {
  const normalizedLanguage = normalizeHighlightLanguage(language);
  if (!normalizedLanguage || text.length === 0) return null;
  if (normalizedLanguage === "json") return highlightJsonCode(text);
  if (normalizedLanguage === "xml") return highlightXmlCode(text);
  if (normalizedLanguage === "yaml") return highlightYamlCode(text);
  if (normalizedLanguage === "markdown") return highlightMarkdownCode(text);
  if (normalizedLanguage === "css") return highlightCssCode(text);
  if (normalizedLanguage === "sql") return highlightSqlCode(text);
  if (normalizedLanguage === "bash") {
    return highlightGenericCode(text, {
      hashComments: true,
      slashComments: false,
      dashComments: false,
      keywords: BASH_KEYWORDS,
      builtIns: BASH_BUILT_INS,
      literals: new Set(),
      variables: true,
    });
  }
  if (normalizedLanguage === "python") {
    return highlightGenericCode(text, {
      hashComments: true,
      slashComments: false,
      dashComments: false,
      keywords: PYTHON_KEYWORDS,
      builtIns: PYTHON_BUILT_INS,
      literals: PYTHON_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "rust") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: RUST_KEYWORDS,
      builtIns: RUST_BUILT_INS,
      literals: RUST_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "go") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: GO_KEYWORDS,
      builtIns: GO_BUILT_INS,
      literals: GO_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "java") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: JAVA_KEYWORDS,
      builtIns: JAVA_BUILT_INS,
      literals: JAVA_LITERALS,
      variables: false,
    });
  }
  if (normalizedLanguage === "javascript") {
    return highlightGenericCode(text, {
      hashComments: false,
      slashComments: true,
      dashComments: false,
      keywords: JS_TS_KEYWORDS,
      builtIns: JS_TS_BUILT_INS,
      literals: JS_TS_LITERALS,
      variables: false,
    });
  }
  return null;
}

function highlightJsonCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const lineComment = matchPatternAt(DOUBLE_SLASH_COMMENT_RE, text, index);
    if (lineComment) {
      pushHighlightSegment(segments, lineComment, "hljs-comment");
      index += lineComment.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"/y, text, index);
    if (string) {
      const nextIndex = nextNonWhitespaceIndex(text, index + string.length);
      pushHighlightSegment(segments, string, nextIndex >= 0 && text[nextIndex] === ":" ? "hljs-attr" : "hljs-string");
      index += string.length;
      continue;
    }
    const number = matchPatternAt(NUMBER_RE, text, index);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      index += number.length;
      continue;
    }
    const literal = matchPatternAt(/\b(?:true|false|null)\b/y, text, index);
    if (literal) {
      pushHighlightSegment(segments, literal, "hljs-literal");
      index += literal.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "", /^[{}[\],:]/u.test(text[index] ?? "") ? "hljs-operator" : undefined);
    index += 1;
  }
  return segments;
}

function highlightXmlCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      const comment = text.slice(index, end < 0 ? text.length : end + 3);
      pushHighlightSegment(segments, comment, "hljs-comment");
      index += comment.length;
      continue;
    }
    if (text[index] === "<") {
      const end = text.indexOf(">", index + 1);
      const tag = text.slice(index, end < 0 ? text.length : end + 1);
      highlightXmlTag(tag).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
      index += tag.length;
      continue;
    }
    const nextTag = text.indexOf("<", index);
    const plain = text.slice(index, nextTag < 0 ? text.length : nextTag);
    pushHighlightSegment(segments, plain);
    index += plain.length;
  }
  return segments;
}

function highlightXmlTag(tag: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const open = /^<\/?/.exec(tag)?.[0] ?? "<";
  pushHighlightSegment(segments, open, "hljs-tag");
  let index = open.length;
  const tagName = matchPatternAt(/[A-Za-z][\w:.-]*/y, tag, index);
  if (tagName) {
    pushHighlightSegment(segments, tagName, "hljs-name");
    index += tagName.length;
  }
  while (index < tag.length) {
    const close = matchPatternAt(/\/?>/y, tag, index);
    if (close) {
      pushHighlightSegment(segments, close, "hljs-tag");
      index += close.length;
      continue;
    }
    const whitespace = matchPatternAt(/\s+/y, tag, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const attr = matchPatternAt(/[A-Za-z_:][\w:.-]*/y, tag, index);
    if (attr) {
      pushHighlightSegment(segments, attr, "hljs-attr");
      index += attr.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y, tag, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }
    pushHighlightSegment(segments, tag[index] ?? "", tag[index] === "=" ? "hljs-operator" : undefined);
    index += 1;
  }
  return segments;
}

function matchPatternAt(pattern: RegExp, text: string, index: number): string | null {
  pattern.lastIndex = index;
  const match = pattern.exec(text);
  return match && match.index === index ? match[0] ?? null : null;
}

function pushHighlightSegment(segments: CodeHighlightSegment[], text: string, className?: string, style?: CSSProperties): void {
  if (!text) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.className === className && highlightStyleKey(previous.style) === highlightStyleKey(style)) {
    previous.text += text;
    return;
  }
  segments.push({
    text,
    ...(className ? { className } : {}),
    ...(style ? { style } : {}),
  });
}

function highlightStyleKey(style: CSSProperties | undefined): string {
  if (!style) return "";
  return `${style.color ?? ""}|${style.fontStyle ?? ""}|${style.fontWeight ?? ""}|${style.textDecoration ?? ""}`;
}

function nextNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}

function previousNonWhitespaceIndex(text: string, index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/u.test(text[cursor] ?? "")) return cursor;
  }
  return -1;
}


function normalizeHighlightLanguage(language: string): "bash" | "css" | "go" | "java" | "javascript" | "json" | "markdown" | "python" | "rust" | "sql" | "xml" | "yaml" | null {
  const normalized = language.trim().toLowerCase();
  if (!normalized || normalized === "text" || normalized === "plaintext") return null;
  if (["js", "jsx", "mjs", "cjs", "javascript", "ts", "tsx", "mts", "cts", "typescript"].includes(normalized)) return "javascript";
  if (["json", "jsonc"].includes(normalized)) return "json";
  if (["sh", "shell", "bash", "zsh"].includes(normalized)) return "bash";
  if (["py", "python"].includes(normalized)) return "python";
  if (["html", "xml", "xhtml"].includes(normalized)) return "xml";
  if (["rs", "rust"].includes(normalized)) return "rust";
  if (["go", "golang"].includes(normalized)) return "go";
  if (["java"].includes(normalized)) return "java";
  if (["sql", "pgsql", "postgres", "postgresql", "mysql", "sqlite"].includes(normalized)) return "sql";
  if (["yaml", "yml"].includes(normalized)) return "yaml";
  if (["css", "scss", "sass", "less"].includes(normalized)) return "css";
  if (["md", "markdown", "mdx"].includes(normalized)) return "markdown";
  return null;
}

interface GenericHighlightConfig {
  hashComments: boolean;
  slashComments: boolean;
  dashComments: boolean;
  keywords: Set<string>;
  builtIns: Set<string>;
  literals: Set<string>;
  variables: boolean;
}

const JS_TS_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "static",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const JS_TS_LITERALS = new Set(["false", "Infinity", "NaN", "null", "true", "undefined"]);
const JS_TS_BUILT_INS = new Set([
  "Array",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Reflect",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "console",
  "document",
  "global",
  "process",
  "require",
  "window",
]);

const BASH_KEYWORDS = new Set([
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "until",
  "while",
]);

const BASH_BUILT_INS = new Set([
  "cd",
  "echo",
  "export",
  "local",
  "printf",
  "pwd",
  "read",
  "return",
  "set",
  "shift",
  "source",
  "test",
]);

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const PYTHON_LITERALS = new Set(["False", "None", "True"]);
const PYTHON_BUILT_INS = new Set(["dict", "enumerate", "int", "len", "list", "print", "range", "set", "str", "tuple"]);

const RUST_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "const",
  "continue",
  "crate",
  "dyn",
  "else",
  "enum",
  "extern",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
]);

const RUST_LITERALS = new Set(["false", "None", "Some", "true"]);
const RUST_BUILT_INS = new Set(["Box", "Clone", "Debug", "Default", "Err", "Ok", "Option", "Result", "String", "Vec", "println"]);

const GO_KEYWORDS = new Set([
  "break",
  "case",
  "chan",
  "const",
  "continue",
  "default",
  "defer",
  "else",
  "fallthrough",
  "for",
  "func",
  "go",
  "goto",
  "if",
  "import",
  "interface",
  "map",
  "package",
  "range",
  "return",
  "select",
  "struct",
  "switch",
  "type",
  "var",
]);

const GO_LITERALS = new Set(["false", "iota", "nil", "true"]);
const GO_BUILT_INS = new Set(["append", "bool", "byte", "cap", "close", "copy", "delete", "error", "int", "len", "make", "new", "panic", "print", "println", "rune", "string"]);

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "final",
  "finally",
  "float",
  "for",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "native",
  "new",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "try",
  "void",
  "volatile",
  "while",
]);

const JAVA_LITERALS = new Set(["false", "null", "true"]);
const JAVA_BUILT_INS = new Set(["Boolean", "Double", "Exception", "Integer", "List", "Long", "Map", "Object", "Optional", "Set", "String", "System"]);

const SQL_KEYWORDS = new Set([
  "ADD",
  "ALTER",
  "AND",
  "AS",
  "ASC",
  "BETWEEN",
  "BY",
  "CASE",
  "CREATE",
  "DELETE",
  "DESC",
  "DISTINCT",
  "DROP",
  "ELSE",
  "END",
  "EXISTS",
  "FROM",
  "GROUP",
  "HAVING",
  "IN",
  "INNER",
  "INSERT",
  "INTO",
  "IS",
  "JOIN",
  "LEFT",
  "LIKE",
  "LIMIT",
  "NOT",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "OUTER",
  "RIGHT",
  "SELECT",
  "SET",
  "TABLE",
  "THEN",
  "UPDATE",
  "VALUES",
  "WHEN",
  "WHERE",
]);

const SQL_BUILT_INS = new Set(["AVG", "COUNT", "COALESCE", "LOWER", "MAX", "MIN", "NOW", "SUM", "UPPER"]);

const CSS_AT_KEYWORDS = new Set(["charset", "container", "font-face", "import", "keyframes", "media", "supports"]);

const MARKDOWN_BLOCK_RE = /^(?:#{1,6}\s.*|[-*+]\s+.*|\d+\.\s+.*|>\s?.*|```.*|---+|\*\*\*+|___+)\s*$/;

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//y;
const DOUBLE_SLASH_COMMENT_RE = /\/\/[^\n]*/y;
const DASH_COMMENT_RE = /--[^\n]*/y;
const HASH_COMMENT_RE = /#[^\n]*/y;
const STRING_RE = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/y;
const NUMBER_RE = /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\b/y;
const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/y;
const BASH_VARIABLE_RE = /\$(?:\{[A-Za-z_][\w]*\}|[A-Za-z_][\w]*|\d+)/y;

function highlightSqlCode(text: string): CodeHighlightSegment[] {
  return highlightGenericCode(text, {
    hashComments: false,
    slashComments: false,
    dashComments: true,
    keywords: SQL_KEYWORDS,
    builtIns: SQL_BUILT_INS,
    literals: new Set(["FALSE", "NULL", "TRUE"]),
    variables: false,
  });
}

function highlightCssCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }
    const blockComment = matchPatternAt(BLOCK_COMMENT_RE, text, index);
    if (blockComment) {
      pushHighlightSegment(segments, blockComment, "hljs-comment");
      index += blockComment.length;
      continue;
    }
    const string = matchPatternAt(STRING_RE, text, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }
    const customProperty = matchPatternAt(/--[A-Za-z_][\w-]*/y, text, index);
    if (customProperty) {
      pushHighlightSegment(segments, customProperty, "hljs-variable");
      index += customProperty.length;
      continue;
    }
    const atKeyword = matchPatternAt(/@[A-Za-z_-][\w-]*/y, text, index);
    if (atKeyword) {
      const name = atKeyword.slice(1);
      pushHighlightSegment(segments, atKeyword, CSS_AT_KEYWORDS.has(name) ? "hljs-keyword" : "hljs-meta");
      index += atKeyword.length;
      continue;
    }
    const numberWithUnit = matchPatternAt(/\b(?:\d+(?:\.\d*)?|\.\d+)(?:%|[A-Za-z]+)?\b/y, text, index);
    if (numberWithUnit) {
      pushHighlightSegment(segments, numberWithUnit, "hljs-number");
      index += numberWithUnit.length;
      continue;
    }
    const hexColor = matchPatternAt(/#[\da-fA-F]{3,8}\b/y, text, index);
    if (hexColor) {
      pushHighlightSegment(segments, hexColor, "hljs-number");
      index += hexColor.length;
      continue;
    }
    const identifier = matchPatternAt(/[A-Za-z_-][\w-]*/y, text, index);
    if (identifier) {
      const nextIndex = nextNonWhitespaceIndex(text, index + identifier.length);
      const previousIndex = previousNonWhitespaceIndex(text, index);
      const className = nextIndex >= 0 && text[nextIndex] === ":"
        ? "hljs-attr"
        : previousIndex >= 0 && text[previousIndex] === "."
          ? "hljs-title"
          : undefined;
      pushHighlightSegment(segments, identifier, className);
      index += identifier.length;
      continue;
    }
    const operator = /^[{}()[\].,;:+\-*/%=<>!&|?~]+/u.exec(text.slice(index))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      index += operator.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function highlightYamlCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const lines = text.split(/(\n)/);
  for (const part of lines) {
    if (part === "\n") {
      pushHighlightSegment(segments, part);
      continue;
    }
    highlightYamlLine(part).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
  }
  return segments;
}

function highlightYamlLine(line: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const commentIndex = line.search(/(^|\s)#/u);
  const body = commentIndex >= 0 ? line.slice(0, commentIndex + (line[commentIndex] === "#" ? 0 : 1)) : line;
  const comment = commentIndex >= 0 ? line.slice(body.length) : "";
  let cursor = 0;
  const keyMatch = /^(\s*(?:-\s*)?)([A-Za-z0-9_.-]+)(\s*:)/u.exec(body);
  if (keyMatch) {
    pushHighlightSegment(segments, keyMatch[1] ?? "");
    pushHighlightSegment(segments, keyMatch[2] ?? "", "hljs-attr");
    pushHighlightSegment(segments, keyMatch[3] ?? "", "hljs-operator");
    cursor = keyMatch[0].length;
  }
  while (cursor < body.length) {
    const whitespace = matchPatternAt(/\s+/y, body, cursor);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      cursor += whitespace.length;
      continue;
    }
    const string = matchPatternAt(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'/y, body, cursor);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      cursor += string.length;
      continue;
    }
    const literal = matchPatternAt(/\b(?:false|null|true|yes|no|on|off)\b/y, body, cursor);
    if (literal) {
      pushHighlightSegment(segments, literal, "hljs-literal");
      cursor += literal.length;
      continue;
    }
    const number = matchPatternAt(NUMBER_RE, body, cursor);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      cursor += number.length;
      continue;
    }
    const operator = /^[:[\]{},&*|>!-]+/u.exec(body.slice(cursor))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      cursor += operator.length;
      continue;
    }
    pushHighlightSegment(segments, body[cursor] ?? "");
    cursor += 1;
  }
  if (comment) pushHighlightSegment(segments, comment, "hljs-comment");
  return segments;
}

function highlightMarkdownCode(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  const lines = text.split(/(\n)/);
  for (const part of lines) {
    if (part === "\n") {
      pushHighlightSegment(segments, part);
    } else if (MARKDOWN_BLOCK_RE.test(part)) {
      pushHighlightSegment(segments, part, "hljs-section");
    } else {
      highlightMarkdownInline(part).forEach((segment) => pushHighlightSegment(segments, segment.text, segment.className));
    }
  }
  return segments;
}

function highlightMarkdownInline(text: string): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const code = matchPatternAt(/`[^`]+`/y, text, index);
    if (code) {
      pushHighlightSegment(segments, code, "hljs-code");
      index += code.length;
      continue;
    }
    const link = matchPatternAt(/\[[^\]]+\]\([^)]+\)/y, text, index);
    if (link) {
      pushHighlightSegment(segments, link, "hljs-link");
      index += link.length;
      continue;
    }
    const emphasis = matchPatternAt(/(?:\*\*|__)[\s\S]+?(?:\*\*|__)|(?:\*|_)[^*_]+(?:\*|_)/y, text, index);
    if (emphasis) {
      pushHighlightSegment(segments, emphasis, "hljs-emphasis");
      index += emphasis.length;
      continue;
    }
    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function highlightGenericCode(text: string, config: GenericHighlightConfig): CodeHighlightSegment[] {
  const segments: CodeHighlightSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const whitespace = matchPatternAt(/\s+/y, text, index);
    if (whitespace) {
      pushHighlightSegment(segments, whitespace);
      index += whitespace.length;
      continue;
    }

    const blockComment = matchPatternAt(BLOCK_COMMENT_RE, text, index);
    if (blockComment) {
      pushHighlightSegment(segments, blockComment, "hljs-comment");
      index += blockComment.length;
      continue;
    }

    const lineComment = (config.slashComments ? matchPatternAt(DOUBLE_SLASH_COMMENT_RE, text, index) : null)
      ?? (config.dashComments ? matchPatternAt(DASH_COMMENT_RE, text, index) : null)
      ?? (config.hashComments ? matchPatternAt(HASH_COMMENT_RE, text, index) : null);
    if (lineComment) {
      pushHighlightSegment(segments, lineComment, "hljs-comment");
      index += lineComment.length;
      continue;
    }

    const variable = config.variables ? matchPatternAt(BASH_VARIABLE_RE, text, index) : null;
    if (variable) {
      pushHighlightSegment(segments, variable, "hljs-variable");
      index += variable.length;
      continue;
    }

    const string = matchPatternAt(STRING_RE, text, index);
    if (string) {
      pushHighlightSegment(segments, string, "hljs-string");
      index += string.length;
      continue;
    }

    const number = matchPatternAt(NUMBER_RE, text, index);
    if (number) {
      pushHighlightSegment(segments, number, "hljs-number");
      index += number.length;
      continue;
    }

    const identifier = matchPatternAt(IDENTIFIER_RE, text, index);
    if (identifier) {
      pushHighlightSegment(segments, identifier, genericIdentifierClass(text, index, identifier, config));
      index += identifier.length;
      continue;
    }

    const operator = /^[{}()[\].,;:+\-*/%=<>!&|?~]+/u.exec(text.slice(index))?.[0] ?? "";
    if (operator) {
      pushHighlightSegment(segments, operator, "hljs-operator");
      index += operator.length;
      continue;
    }

    pushHighlightSegment(segments, text[index] ?? "");
    index += 1;
  }
  return segments;
}

function genericIdentifierClass(
  text: string,
  index: number,
  identifier: string,
  config: GenericHighlightConfig,
): string | undefined {
  const upperIdentifier = identifier.toUpperCase();
  if (config.keywords.has(identifier) || config.keywords.has(upperIdentifier)) return "hljs-keyword";
  if (config.literals.has(identifier) || config.literals.has(upperIdentifier)) return "hljs-literal";
  if (config.builtIns.has(identifier) || config.builtIns.has(upperIdentifier)) return "hljs-built_in";
  const nextIndex = nextNonWhitespaceIndex(text, index + identifier.length);
  const previousIndex = previousNonWhitespaceIndex(text, index);
  if (nextIndex >= 0 && text[nextIndex] === "(" && (previousIndex < 0 || text[previousIndex] !== ".")) {
    return "hljs-title function_";
  }
  if (previousIndex >= 0 && text[previousIndex] === ".") return "hljs-property";
  return undefined;
}
