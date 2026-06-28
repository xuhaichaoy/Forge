import type { ReactNode } from "react";
import {
  markdownFadeTextSegments,
  markdownInlineContainsPriorityBadgeImage,
  parseMarkdownInline,
  parseMarkdownPromptLink,
} from "../state/conversation-markdown-engine";
import type {
  MarkdownInlineParseOptions,
  MarkdownInlineSegment,
  MarkdownPromptLinkSegment,
  MarkdownWordSegmenter,
} from "../state/conversation-markdown-engine";
import type { FileReference } from "./file-reference-types";
import { FileCitationAnchor } from "./message-file-citations";
import {
  fileReferenceFromLocalHref,
  MarkdownLink,
  MarkdownPromptLink,
} from "./message-markdown-links";
import {
  MarkdownImageView,
  resolvedMarkdownImage,
} from "./message-markdown-media";
import { MathInline } from "./message-markdown-math";

export interface MarkdownFadeContext {
  nextIndex: number;
  previousSegmentCount: number;
  segmenter: MarkdownWordSegmenter | null;
}

function renderMarkdownFadeText(text: string, context: MarkdownFadeContext, keyBase: number): ReactNode[] {
  return markdownFadeTextSegments(text, context.segmenter).map((segment) => {
    const index = context.nextIndex;
    context.nextIndex += 1;
    return (
      <span
        className={index >= context.previousSegmentCount ? "hc-markdown-fade-in" : undefined}
        data-markdown-fade-index={index}
        key={`fade-${keyBase}-${index}`}
      >
        {segment}
      </span>
    );
  });
}

export function renderInlineWithBreaks(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const previousLine = index > 0 ? lines[index - 1] ?? "" : "";
    const separator = index === 0 ? [] : [markdownLineHasHardBreak(previousLine) ? <br key={`br-${index}`} /> : "\n"];
    const hardBreak = markdownLineHasHardBreak(line);
    const rendered = renderInline(
      hardBreak ? line.replace(/(?: {2,}|\\)$/u, "") : line,
      onOpenFileReference,
      mediaSources,
      fadeContext,
      options,
      onOpenFileReferenceExternal,
    );
    return [...separator, ...rendered];
  });
}

function markdownLineHasHardBreak(line: string): boolean {
  return /(?: {2,}|\\)$/u.test(line);
}

export function renderInline(
  text: string,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode[] {
  return parseMarkdownInline(text, options).map((segment, index) => {
    if (segment.kind === "code") {
      const promptLink = markdownPromptLinkFromCodeText(segment.text);
      return promptLink ? <MarkdownPromptLink key={index} segment={promptLink} /> : <code key={index}>{segment.text}</code>;
    }
    if (segment.kind === "htmlBreak") return <br key={index} />;
    if (segment.kind === "htmlSpan") {
      return renderBasicInlineHtmlSegment(segment, index, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal);
    }
    if (segment.kind === "promptLink") return <MarkdownPromptLink key={index} segment={segment} />;
    if (segment.kind === "link") {
      return (
        <MarkdownLink
          href={segment.href}
          key={index}
          title={segment.title}
          onOpenLocalHref={localHrefOpener(onOpenFileReference)}
        >
          {renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, { ...options, inLink: true }, onOpenFileReferenceExternal)}
        </MarkdownLink>
      );
    }
    if (segment.kind === "image") {
      return (
        <MarkdownImageView
          allowWide
          image={resolvedMarkdownImage({
            kind: "image",
            alt: segment.alt,
            src: segment.src,
            title: segment.title,
          }, mediaSources)}
          key={index}
        />
      );
    }
    if (segment.kind === "fileCitation") {
      const entry = {
        path: segment.path,
        lineStart: segment.lineStart,
        lineEnd: segment.lineEnd,
        ...(segment.artifactCitation ? { artifactCitation: segment.artifactCitation } : {}),
      };
      return (
        <FileCitationAnchor
          key={index}
          entry={entry}
          displayPath={segment.path}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceExternal={onOpenFileReferenceExternal}
        />
      );
    }
    if (segment.kind === "math") return <MathInline key={index} text={segment.text} />;
    if (segment.kind === "strong") return <strong key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</strong>;
    if (segment.kind === "em") return <em key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</em>;
    if (segment.kind === "del") return <del key={index}>{renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal)}</del>;
    if (fadeContext) return renderMarkdownFadeText(segment.text, fadeContext, index);
    return segment.text;
  });
}

function localHrefOpener(
  onOpenFileReference?: (reference: FileReference) => void,
): ((href: string) => void) | undefined {
  if (!onOpenFileReference) return undefined;
  return (href: string) => {
    const reference = fileReferenceFromLocalHref(href);
    if (reference) onOpenFileReference(reference);
  };
}

function markdownPromptLinkFromCodeText(text: string): MarkdownPromptLinkSegment | null {
  const parsed = parseMarkdownPromptLink(text.trim(), 0);
  if (!parsed || parsed.endIndex !== text.trim().length) return null;
  return {
    kind: "promptLink",
    href: parsed.href,
    label: parsed.label,
    promptKind: parsed.promptKind,
  };
}

function renderBasicInlineHtmlSegment(
  segment: Extract<MarkdownInlineSegment, { kind: "htmlSpan" }>,
  key: number,
  onOpenFileReference?: (reference: FileReference) => void,
  mediaSources?: Map<string, string>,
  fadeContext?: MarkdownFadeContext | null,
  options: MarkdownInlineParseOptions = {},
  onOpenFileReferenceExternal?: (reference: FileReference) => void,
): ReactNode {
  const children = renderInline(segment.text, onOpenFileReference, mediaSources, fadeContext, options, onOpenFileReferenceExternal);
  if (segment.tag === "b" || segment.tag === "strong") return <strong key={key}>{children}</strong>;
  if (segment.tag === "del" || segment.tag === "s") return <del key={key}>{children}</del>;
  if (segment.tag === "em" || segment.tag === "i") return <em key={key}>{children}</em>;
  if (segment.tag === "sub") {
    return markdownInlineContainsPriorityBadgeImage(segment.text, options)
      ? <span key={key}>{children}</span>
      : <sub key={key}>{children}</sub>;
  }
  if (segment.tag === "sup") return <sup key={key}>{children}</sup>;
  return <u key={key}>{children}</u>;
}
