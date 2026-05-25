// codex: local-conversation-thread-CecHj6JI.js#sh — Codex's assistant body
// runs `P=N` on the markdown right before rendering: it scans for the leaf
// directive `:citation{...}` (the directive name `G` in the bundle), pulls
// each one's `index=`/`automation_id=` attrs into a chip view, and either
// inlines them into the trailing paragraph or, when the trailing block is
// not a `_h(content)` paragraph, falls back to a flex chip row
// (`<div className="mt-3 flex flex-wrap gap-1.5">...{citations.map(<Jm>)}</div>`).
// This module is the HiCodex equivalent of `P=N`: it extracts directives off
// the raw markdown so message-unit.tsx can drive the same two-state render.

import { automationScheduleSummary } from "./automation-schedule-summary";

export interface CitationDirective {
  id: string;
  title?: string;
  actionLabel?: string;
  openAutomationId?: string;
  schedule?: string;
  url?: string;
  source?: string;
  /** Any extra raw attrs from the directive */
  attrs?: Record<string, string>;
}

export interface CitationExtractionResult {
  /** Markdown 文本去掉 inline citation directive 后的剩余 */
  cleanedContent: string;
  /** 文档末尾段落中提取出的 citations（按出现顺序）*/
  trailingCitations: CitationDirective[];
  /** 不在尾段、需要单独 chip row 呈现的 citations */
  loose: CitationDirective[];
}

// codex: split-items-into-render-groups-Dbyy4o9H.js#fe + local-conversation-thread-CecHj6JI.js#sh —
// completed assistant messages receive an `automationCitations` array made of
// `automation-update` items. Desktop then creates temporary `:citation{}`
// directives from their indexes (`lh`) and resolves each directive back to the
// original update item (`vh`) before rendering `Jm`. HiCodex normalizes those
// update items into the same chip data shape used for text-authored citation
// directives, while preserving the original string attrs for future routing.
export function automationCitationsFromItems(value: unknown): CitationDirective[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const citation = automationCitationFromItem(item, index);
    return citation ? [citation] : [];
  });
}

// codex: local-conversation-thread-CecHj6JI.js#P=N — leaf directive regex per
// remark-directive spec (`:name{attrs}`). Greedy on name (only letters), the
// attribute body cannot contain `{` or `}`. We deliberately don't try to
// support the container variant (`:::citation ... :::`) since Codex's
// directive emitter only produces leaf form for citations.
const DIRECTIVE_PATTERN = /:citation\{([^{}]*)\}/g;

/*
 * Match a single attribute inside the directive body. We need to support all
 * three forms:
 *   id=plain       — bare token, terminated by whitespace
 *   title="quoted" — double-quoted, value can contain spaces and equals
 *   url='url'      — single-quoted
 * We never split on whitespace inside a quoted run, otherwise titles with
 * spaces (very common — they're human-authored) would be truncated.
 */
const ATTR_PATTERN = /([A-Za-z_][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'=]+))/g;

// codex: local-conversation-thread-CecHj6JI.js#P=N — Codex's `Jm` component
// reads `index`, `id`, `automationId` (camel + snake), `title`, `name`, `url`,
// and `source` off the directive payload. HiCodex normalizes the spelling
// variants here so consumers only have to look at one canonical shape.
function parseDirectiveAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_PATTERN.exec(body))) {
    const key = match[1];
    if (!key) continue;
    const raw = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = raw;
  }
  return attrs;
}

// codex: local-conversation-thread-CecHj6JI.js#Jm — Codex normalizes the chip
// view from `id|automation_id|automationId` plus `title|name`. Mirror that so
// the resulting `CitationDirective` is always usable by the renderer even when
// the directive author used different spelling.
function directiveFromAttrs(attrs: Record<string, string>): CitationDirective | null {
  const id = attrs.id ?? attrs.automation_id ?? attrs.automationId ?? attrs.index ?? "";
  if (!id.trim()) return null;
  const title = attrs.title ?? attrs.name ?? attrs.label;
  const actionLabel = attrs.actionLabel ?? attrs.action_label ?? attrs.action;
  const url = attrs.url ?? attrs.href;
  const schedule = automationScheduleSummary(attrs.rrule ?? attrs.schedule) ?? undefined;
  const source = attrs.source ?? attrs.kind;
  const directive: CitationDirective = { id: id.trim() };
  if (title) directive.title = title;
  if (actionLabel) directive.actionLabel = actionLabel;
  if (schedule) directive.schedule = schedule;
  if (url) directive.url = url;
  if (source) directive.source = source;
  // Preserve the full attribute bag so future renderers (or onOpen handlers)
  // can read fields like `mode=create`/`status=ok` that Codex's `Jm` also
  // forwards into its tooltip without listing every key here.
  directive.attrs = attrs;
  return directive;
}

function automationCitationFromItem(value: unknown, index: number): CitationDirective | null {
  const record = objectRecord(value);
  if (!record) return null;
  const args = objectRecord(record.arguments) ?? {};
  const result = objectRecord(record.result) ?? {};
  const snapshot = objectRecord(result.snapshot) ?? {};
  const id = stringAttr(args.id)
    || stringAttr(args.automation_id)
    || stringAttr(args.automationId)
    || stringAttr(result.automationId)
    || stringAttr(record.callId)
    || stringAttr(record.id)
    || `automation-${index + 1}`;
  const mode = stringAttr(result.mode) || stringAttr(args.mode);
  const action = automationCitationActionLabel(mode, stringAttr(result.deleteStatus));
  const name = stringAttr(args.name)
    || stringAttr(args.title)
    || stringAttr(args.label)
    || stringAttr(snapshot.name)
    || "Untitled automation";
  const url = stringAttr(args.url) || stringAttr(args.href);
  const rawSchedule = stringAttr(args.rrule)
    || stringAttr(record.rrule)
    || stringAttr(snapshot.rrule)
    || stringAttr(args.schedule)
    || stringAttr(record.schedule)
    || stringAttr(snapshot.schedule);
  const schedule = automationScheduleSummary(rawSchedule) ?? undefined;
  const source = action;
  const openAutomationId = stringAttr(result.automationId)
    || stringAttr(result.automation_id)
    || stringAttr(args.automation_id)
    || stringAttr(args.automationId)
    || id;
  const attrs = stringAttrs({
    ...args,
    actionLabel: action,
    automation_id: openAutomationId,
    id,
    index: String(index),
    mode,
    name,
    rrule: rawSchedule,
    schedule,
    source,
  });
  const directive: CitationDirective = {
    id,
    title: name,
    actionLabel: action,
    openAutomationId,
    attrs,
  };
  if (schedule) directive.schedule = schedule;
  if (url) directive.url = url;
  return directive;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringAttr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringAttrs(value: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const text = stringAttr(raw);
    if (text) attrs[key] = text;
  }
  return attrs;
}

function automationCitationActionLabel(mode: string, deleteStatus: string): string {
  if (mode === "create") return "Created";
  if (mode === "update") return "Updated";
  if (mode === "delete") return deleteStatus === "not_found" ? "Missing" : "Deleted";
  if (mode === "suggested-create") return "Proposed";
  if (mode === "suggested-update") return "Proposed update";
  return "Automation";
}

interface DirectiveHit {
  citation: CitationDirective;
  /** Offset into the ORIGINAL markdown string where `:citation{...}` started */
  start: number;
  /** Offset (exclusive) where the directive ended */
  end: number;
}

function collectDirectiveHits(markdown: string): DirectiveHit[] {
  DIRECTIVE_PATTERN.lastIndex = 0;
  const hits: DirectiveHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = DIRECTIVE_PATTERN.exec(markdown))) {
    const body = match[1] ?? "";
    const attrs = parseDirectiveAttrs(body);
    const citation = directiveFromAttrs(attrs);
    if (!citation) continue;
    hits.push({ citation, start: match.index, end: match.index + match[0].length });
  }
  return hits;
}

/*
 * Compute the byte offset where the document's TRAILING paragraph begins.
 * Codex's `sh` checks "is the last block a `_h(content)` paragraph?" — its
 * equivalent here is: starting from the end of the document, walk back over
 * blank lines, then take every contiguous non-blank, non-fenced, non-special
 * line as the trailing paragraph. A leading blank line (or BOF) terminates
 * the run.
 *
 * The function returns the offset of the first character of the trailing
 * paragraph (after stripping any final whitespace), so a citation whose
 * `start` is >= this offset is "inside the trailing paragraph" and gets the
 * inline-then-stripped treatment; everything before that offset is "loose"
 * and gets the chip-row fallback.
 *
 * NOTE: we deliberately treat code fences (```) and HR/heading lines as
 * paragraph breaks. A citation that appears immediately after a fenced code
 * block but on its own paragraph (separated by a blank line) is still
 * trailing — Codex's renderer pivots on the LAST block, which is the
 * post-fence paragraph in that case.
 */
function trailingParagraphStartOffset(markdown: string): number {
  if (markdown.length === 0) return 0;
  // Strip the unconditional trailing whitespace so the "last line" we look at
  // is always real content (otherwise a markdown that ends with "\n\n" would
  // appear to have a blank trailing line and we'd say there is no paragraph).
  let endOffset = markdown.length;
  while (endOffset > 0 && /\s/.test(markdown.charAt(endOffset - 1))) {
    endOffset -= 1;
  }
  if (endOffset === 0) return markdown.length;

  // Walk backward line-by-line; the trailing paragraph runs from the first
  // line we hit (going backward) up until either the start of the document
  // or a blank/structural line.
  let cursor = endOffset;
  let lineEnd = endOffset;
  while (cursor > 0) {
    const newlineIndex = markdown.lastIndexOf("\n", cursor - 1);
    const lineStart = newlineIndex + 1;
    const line = markdown.slice(lineStart, lineEnd);
    if (line.trim().length === 0) {
      // Blank line terminates the run; the trailing paragraph starts on the
      // NEXT non-blank line (which is whatever we last accepted).
      return lineEnd;
    }
    if (isStructuralLine(line)) {
      // A fenced/code-block/HR/heading/list/blockquote line is also a hard
      // break — the trailing paragraph can't span it. Return the byte after
      // this line's newline.
      return lineEnd;
    }
    cursor = newlineIndex;
    lineEnd = newlineIndex >= 0 ? newlineIndex : 0;
    if (newlineIndex < 0) break;
  }
  return 0;
}

function isStructuralLine(line: string): boolean {
  return /^```/.test(line.trim())
    || /^#{1,6}\s+/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^\s*(\$\$|\\\[)/.test(line)
    || /^\s*([-*+]|\d+[.)])\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\|/.test(line.trim());
}

// codex: local-conversation-thread-CecHj6JI.js#P=N — main entrypoint. The
// caller passes the raw assistant markdown; we hand back the stripped text
// (so Markdownish never tries to render the directive as raw `:citation{...}`
// text) plus the two citation buckets the renderer needs.
export function extractAutomationCitations(markdown: string): CitationExtractionResult {
  if (!markdown.includes(":citation")) {
    return { cleanedContent: markdown, trailingCitations: [], loose: [] };
  }
  const hits = collectDirectiveHits(markdown);
  if (hits.length === 0) {
    return { cleanedContent: markdown, trailingCitations: [], loose: [] };
  }

  const trailingStart = trailingParagraphStartOffset(markdown);
  const trailingCitations: CitationDirective[] = [];
  const loose: CitationDirective[] = [];
  for (const hit of hits) {
    if (hit.start >= trailingStart) trailingCitations.push(hit.citation);
    else loose.push(hit.citation);
  }

  /*
   * Strip every directive from the markdown. We splice the original string
   * around the hit offsets rather than running a global `.replace` so the
   * trailing/loose classification (which uses ORIGINAL offsets) stays valid
   * even when two citations share a line.
   */
  const pieces: string[] = [];
  let cursor = 0;
  for (const hit of hits) {
    pieces.push(markdown.slice(cursor, hit.start));
    cursor = hit.end;
  }
  pieces.push(markdown.slice(cursor));
  const cleanedContent = collapseDirectiveWhitespace(pieces.join(""));

  return { cleanedContent, trailingCitations, loose };
}

/*
 * After stripping leaf directives we sometimes leave behind ugly fragments:
 *   "See   for details." (two consecutive spaces where the directive was)
 *   "Result: ." (space before the period because the directive was right
 *               before punctuation)
 *   trailing empty paragraphs at the end of the doc.
 * Codex normalizes this by re-flowing the paragraph; we just collapse runs of
 * inline whitespace and trim trailing whitespace on each line, which is
 * sufficient for the markdown renderer.
 */
function collapseDirectiveWhitespace(value: string): string {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
