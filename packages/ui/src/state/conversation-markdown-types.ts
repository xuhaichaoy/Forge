/*
 * Pure type leaf for the markdown block/inline shapes shared between
 * conversation-markdown-engine and its helper modules (safety, table).
 * Extracted from ./conversation-markdown-engine so the helpers' type-only
 * back edges no longer close cycles with the engine's value imports of them.
 * The engine re-exports these names in place, so existing import paths keep
 * working unchanged. ./conversation-markdown-prompt-links is itself a leaf
 * (zero imports), so depending on it here cannot re-close the cycle.
 */
import type { MarkdownPromptLinkSegment } from "./conversation-markdown-prompt-links";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { children?: MarkdownBlock[]; kind: "blockquote"; text: string }
  | { kind: "code"; language: string; text: string }
  | { kind: "details"; open: boolean; summary: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "list"; loose?: boolean; ordered: boolean; items: MarkdownListItemValue[]; start?: number }
  | { kind: "taskList"; items: MarkdownTaskListItem[] }
  | { aligns?: MarkdownTableAlign[]; kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" }
  | MarkdownImageBlock
  | { kind: "imageGrid"; images: MarkdownImageBlock[] };

export interface MarkdownImageBlock {
  alt: string;
  kind: "image";
  src: string;
  title: string | null;
}

export interface MarkdownTaskListItem {
  checked: boolean;
  text: string;
}

export interface MarkdownNestedListItem {
  checked?: boolean;
  children?: MarkdownBlock[];
  task?: boolean;
  text: string;
}

export type MarkdownListItemValue = string | MarkdownNestedListItem;

export type MarkdownTableAlign = "center" | "left" | "right" | null;

export type MarkdownInlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "htmlBreak" }
  | { kind: "htmlSpan"; tag: MarkdownBasicHtmlTag; text: string }
  | { kind: "image"; alt: string; src: string; title: string | null }
  | { kind: "link"; text: string; href: string; title?: string | null }
  | MarkdownPromptLinkSegment
  | { kind: "fileCitation"; path: string; lineStart: number; lineEnd: number }
  | { kind: "math"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "del"; text: string };

export type MarkdownBasicHtmlTag = "b" | "del" | "em" | "i" | "s" | "strong" | "sub" | "sup" | "u";
