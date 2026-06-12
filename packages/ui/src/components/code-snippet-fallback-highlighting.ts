import {
  BASH_BUILT_INS,
  BASH_KEYWORDS,
  GO_BUILT_INS,
  GO_KEYWORDS,
  GO_LITERALS,
  JAVA_BUILT_INS,
  JAVA_KEYWORDS,
  JAVA_LITERALS,
  JS_TS_BUILT_INS,
  JS_TS_KEYWORDS,
  JS_TS_LITERALS,
  PYTHON_BUILT_INS,
  PYTHON_KEYWORDS,
  PYTHON_LITERALS,
  RUST_BUILT_INS,
  RUST_KEYWORDS,
  RUST_LITERALS,
} from "./code-snippet-highlight-sets";
import {
  highlightGenericCode,
  highlightSqlCode,
} from "./code-snippet-generic-highlighting";
import {
  highlightCssCode,
  highlightJsonCode,
  highlightMarkdownCode,
  highlightXmlCode,
  highlightYamlCode,
} from "./code-snippet-structured-highlighting";
import type { CodeHighlightSegment } from "./code-snippet-highlight-segments";

export type { CodeHighlightSegment } from "./code-snippet-highlight-segments";

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
