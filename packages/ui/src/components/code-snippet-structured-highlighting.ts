import { CSS_AT_KEYWORDS } from "./code-snippet-highlight-sets";
import {
  BLOCK_COMMENT_RE,
  DOUBLE_SLASH_COMMENT_RE,
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

export function highlightJsonCode(text: string): CodeHighlightSegment[] {
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

export function highlightXmlCode(text: string): CodeHighlightSegment[] {
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

export function highlightCssCode(text: string): CodeHighlightSegment[] {
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

export function highlightYamlCode(text: string): CodeHighlightSegment[] {
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

const MARKDOWN_BLOCK_RE = /^(?:#{1,6}\s.*|[-*+]\s+.*|\d+\.\s+.*|>\s?.*|```.*|---+|\*\*\*+|___+)\s*$/;

export function highlightMarkdownCode(text: string): CodeHighlightSegment[] {
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
