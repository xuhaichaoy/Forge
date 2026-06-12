import {
  SQL_BUILT_INS,
  SQL_KEYWORDS,
} from "./code-snippet-highlight-sets";
import {
  BASH_VARIABLE_RE,
  BLOCK_COMMENT_RE,
  DASH_COMMENT_RE,
  DOUBLE_SLASH_COMMENT_RE,
  HASH_COMMENT_RE,
  IDENTIFIER_RE,
  matchPatternAt,
  nextNonWhitespaceIndex,
  NUMBER_RE,
  previousNonWhitespaceIndex,
  STRING_RE,
} from "./code-snippet-highlight-scanner";
import {
  pushHighlightSegment,
  type CodeHighlightSegment,
} from "./code-snippet-highlight-segments";

export interface GenericHighlightConfig {
  hashComments: boolean;
  slashComments: boolean;
  dashComments: boolean;
  keywords: Set<string>;
  builtIns: Set<string>;
  literals: Set<string>;
  variables: boolean;
}

export function highlightSqlCode(text: string): CodeHighlightSegment[] {
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

export function highlightGenericCode(text: string, config: GenericHighlightConfig): CodeHighlightSegment[] {
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
