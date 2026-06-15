import { parseMarkdownInline } from "./conversation-markdown-inline";
import type { MarkdownInlineParseOptions } from "./conversation-markdown-inline";
import type { MarkdownReferenceDefinitions } from "./conversation-markdown-links";
import type {
  MarkdownBlock,
  MarkdownListItemValue,
} from "./conversation-markdown-types";

/*
 * Streaming fade segmentation for the conversation markdown engine: counts
 * and slices the word-like segments that the renderer fades in while a
 * message streams. Extracted verbatim from ./conversation-markdown-engine.
 */

interface MarkdownWordSegment {
  isWordLike?: boolean;
  segment: string;
}

export interface MarkdownWordSegmenter {
  segment(text: string): Iterable<MarkdownWordSegment>;
}

export function createMarkdownWordSegmenter(): MarkdownWordSegmenter | null {
  const segmenterCtor = (Intl as unknown as {
    Segmenter?: new (locale?: string | string[], options?: { granularity: "word" }) => MarkdownWordSegmenter;
  }).Segmenter;
  if (!segmenterCtor) return null;
  try {
    return new segmenterCtor(undefined, { granularity: "word" });
  } catch {
    return null;
  }
}

export function markdownIndexedFadeSegmentCount(
  blocks: MarkdownBlock[],
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
  references?: MarkdownReferenceDefinitions,
): number {
  return blocks.reduce((count, block) => count + markdownBlockFadeSegmentCount(block, segmenter, references), 0);
}

function markdownBlockFadeSegmentCount(
  block: MarkdownBlock,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "blockquote":
      return block.children
        ? block.children.reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0)
        : markdownInlineFadeSegmentCount(block.text, segmenter, { references });
    case "details":
      return markdownInlineFadeSegmentCount(block.summary, segmenter, { references });
    case "list":
      return block.items.reduce((count, item) => count + markdownListItemFadeSegmentCount(item, segmenter, references), 0);
    case "taskList":
      return block.items.reduce((count, item) => count + markdownInlineFadeSegmentCount(item.text, segmenter, { references }), 0);
    case "table":
      return [...block.headers, ...block.rows.flat()].reduce(
        (count, cell) => count + markdownInlineFadeSegmentCount(cell, segmenter, { references }),
        0,
      );
    case "code":
    case "hr":
    case "image":
    case "imageGrid":
    case "math":
      return 0;
  }
}

function markdownListItemFadeSegmentCount(
  item: MarkdownListItemValue,
  segmenter: MarkdownWordSegmenter | null,
  references?: MarkdownReferenceDefinitions,
): number {
  if (typeof item === "string") return markdownInlineFadeSegmentCount(item, segmenter, { references });
  return markdownInlineFadeSegmentCount(item.text, segmenter, { references })
    + (item.children ?? []).reduce((count, child) => count + markdownBlockFadeSegmentCount(child, segmenter, references), 0);
}

function markdownInlineFadeSegmentCount(
  text: string,
  segmenter: MarkdownWordSegmenter | null,
  options: MarkdownInlineParseOptions = {},
): number {
  return parseMarkdownInline(text, options).reduce((count, segment) => {
    if (segment.kind === "text") return count + markdownFadeTextSegments(segment.text, segmenter).length;
    if (
      segment.kind === "del"
      || segment.kind === "em"
      || segment.kind === "htmlSpan"
      || segment.kind === "link"
      || segment.kind === "strong"
    ) {
      return count + markdownInlineFadeSegmentCount(
        segment.text,
        segmenter,
        segment.kind === "link" ? { ...options, inLink: true } : options,
      );
    }
    return count;
  }, 0);
}

export function markdownFadeTextSegments(
  text: string,
  segmenter: MarkdownWordSegmenter | null = createMarkdownWordSegmenter(),
): string[] {
  if (!segmenter) {
    const fallbackSegments = Array.from(text.match(/\s*\S+(?:\s+|$)/g) ?? []);
    return fallbackSegments.length > 0 || text.length === 0 ? fallbackSegments : [text];
  }
  const segments: string[] = [];
  for (const part of segmenter.segment(text)) {
    if (/^\s*$/u.test(part.segment) || part.isWordLike !== true) {
      const previousIndex = Math.max(segments.length - 1, 0);
      segments[previousIndex] = `${segments[previousIndex] ?? ""}${part.segment}`;
      continue;
    }
    segments.push(part.segment);
  }
  return segments;
}
