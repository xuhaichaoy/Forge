/*
 * Pure CommonMark/GFM-plus parsing engine for the conversation surface.
 *
 * This module is the single source of truth for turning assistant/event/plan
 * markdown text into the `MarkdownBlock` / `MarkdownInlineSegment` AST plus the
 * reference-definition map and the streaming fade segment counts. It contains
 * NO React, JSX, or DOM access — every export is a pure (text | AST) -> value
 * transform — so it can be imported by `message-unit`, `event-unit`, and
 * `plan-summary-card` (transitively via `Markdownish`) without pulling in any
 * rendering concern. The React rendering of this AST lives in `message-unit`.
 *
 * Behaviour here is byte-identical to the parser that previously lived inline
 * in `message-unit.tsx`; it was extracted verbatim, only the `export` surface
 * was widened so the renderer can import what it needs. See `message-unit.tsx`
 * for the original CODEX-REF alignment notes on the two-layer marked + Forge
 * directive parser.
 *
 * The implementation now lives in sibling domain modules (extracted verbatim,
 * wave-9): -block (block loop + termination guard), -inline (inline loop),
 * -links (links/images/references), -math, -html, -fade (streaming fade
 * segments), -scan (escape-aware scanning primitives). This file is the
 * stable import path: it re-exports the full original surface unchanged.
 */

export {
  memoryCitationEntries,
  memoryCitationFileReference,
} from "./conversation-memory-citations";
export type { MemoryCitationEntryView } from "./conversation-memory-citations";
export { safeMarkdownHref } from "./conversation-markdown-safety";
export { normalizeTableRow } from "./conversation-markdown-table";
export {
  markdownPromptLinkFromHref,
  parseMarkdownPromptLink,
} from "./conversation-markdown-prompt-links";
export type {
  MarkdownPromptLinkKind,
  MarkdownPromptLinkSegment,
} from "./conversation-markdown-prompt-links";
export type {
  MarkdownBlock,
  MarkdownImageBlock,
  MarkdownInlineSegment,
  MarkdownListItemValue,
  MarkdownNestedListItem,
  MarkdownTableAlign,
  MarkdownTaskListItem,
} from "./conversation-markdown-types";
export {
  parseMarkdownBlocks,
  parseMarkdownDocument,
} from "./conversation-markdown-block";
export type { MarkdownDocument } from "./conversation-markdown-block";
export {
  createMarkdownWordSegmenter,
  markdownFadeTextSegments,
  markdownIndexedFadeSegmentCount,
} from "./conversation-markdown-fade";
export type { MarkdownWordSegmenter } from "./conversation-markdown-fade";
export {
  markdownInlineContainsPriorityBadgeImage,
  parseMarkdownInline,
} from "./conversation-markdown-inline";
export type { MarkdownInlineParseOptions } from "./conversation-markdown-inline";
export type {
  MarkdownReferenceDefinition,
  MarkdownReferenceDefinitions,
} from "./conversation-markdown-links";
export { parseMarkdownInlineMath } from "./conversation-markdown-math";
