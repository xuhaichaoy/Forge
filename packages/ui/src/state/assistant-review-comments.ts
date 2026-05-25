export interface AssistantReviewComment {
  title: string;
  body: string;
  path: string;
  line: number;
  startLine?: number;
  priority?: string;
}

export interface AssistantReviewCommentExtraction {
  cleanedContent: string;
  comments: AssistantReviewComment[];
}

const CODE_COMMENT_PATTERN = /^[ \t]*:code-comment\{([^{}]*)\}[ \t]*(?:\r?\n)?/gm;
const ATTR_PATTERN = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'=]+))/g;
const PRIORITY_PREFIX_PATTERN = /^(?:<sub>\s*)*\[(p\d)\](?:\s*<\/sub>)*\s*(.*)$/i;

export function extractAssistantReviewComments(markdown: string, cwd?: string | null): AssistantReviewCommentExtraction {
  CODE_COMMENT_PATTERN.lastIndex = 0;
  const comments: AssistantReviewComment[] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = CODE_COMMENT_PATTERN.exec(markdown))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    const attrs = parseDirectiveAttrs(match[1] ?? "");
    const comment = reviewCommentFromAttrs(attrs, cwd);
    if (!comment) continue;
    comments.push(comment);
  }
  if (ranges.length === 0) return { cleanedContent: markdown, comments };
  let cleaned = "";
  let cursor = 0;
  for (const range of ranges) {
    cleaned += markdown.slice(cursor, range.start);
    cursor = range.end;
  }
  cleaned += markdown.slice(cursor);
  return { cleanedContent: collapseDirectiveWhitespace(cleaned), comments };
}

function parseDirectiveAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(body))) {
    const key = match[1];
    if (!key) continue;
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function reviewCommentFromAttrs(attrs: Record<string, string>, cwd?: string | null): AssistantReviewComment | null {
  const title = attrs.title?.trim() ?? "";
  const body = attrs.body?.trim() ?? "";
  const file = attrs.file?.trim() ?? "";
  if (!title || !body || !file) return null;
  const start = Math.max(1, integerValue(attrs.start) ?? 1);
  const end = Math.max(1, integerValue(attrs.end) ?? start);
  const line = Math.max(start, end);
  const titleWithPriority = titleWithPriorityAttr(title, integerValue(attrs.priority));
  const priority = priorityFromTitle(titleWithPriority);
  const strippedTitle = stripPriorityPrefix(titleWithPriority);
  return {
    title: strippedTitle,
    body,
    path: resolveCommentPath(file, cwd),
    line,
    ...(line === start ? {} : { startLine: start }),
    ...(priority ? { priority: priority.toUpperCase() } : {}),
  };
}

function integerValue(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value.trim());
  if (!Number.isFinite(number)) return null;
  return Math.trunc(number);
}

function titleWithPriorityAttr(title: string, priority: number | null): string {
  if (priority == null || priorityFromTitle(title)) return title;
  return `[P${priority}] ${title}`;
}

function priorityFromTitle(title: string): string | null {
  const match = title.match(PRIORITY_PREFIX_PATTERN);
  return match?.[1] ?? null;
}

function stripPriorityPrefix(title: string): string {
  const match = title.match(PRIORITY_PREFIX_PATTERN);
  return (match?.[2] ?? title).trim();
}

function resolveCommentPath(path: string, cwd?: string | null): string {
  const normalized = normalizeSlashes(path.trim());
  if (!cwd || isAbsolutePath(normalized) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) {
    return normalized;
  }
  return normalizePathParts(`${normalizeSlashes(cwd).replace(/\/+$/, "")}/${normalized}`);
}

function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function normalizePathParts(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push(part);
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function collapseDirectiveWhitespace(markdown: string): string {
  return markdown.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
