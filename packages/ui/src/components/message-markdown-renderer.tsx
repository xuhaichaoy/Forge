import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { CitationDirective } from "../state/automation-citations";
import {
  createMarkdownWordSegmenter,
  markdownFadeTextSegments,
  markdownIndexedFadeSegmentCount,
  markdownInlineContainsPriorityBadgeImage,
  normalizeTableRow,
  parseMarkdownBlocks,
  parseMarkdownDocument,
  parseMarkdownInline,
  parseMarkdownPromptLink,
} from "../state/conversation-markdown-engine";
import type {
  MarkdownBlock,
  MarkdownInlineParseOptions,
  MarkdownInlineSegment,
  MarkdownListItemValue,
  MarkdownPromptLinkSegment,
  MarkdownReferenceDefinitions,
  MarkdownWordSegmenter,
} from "../state/conversation-markdown-engine";
import { AutomationCitationChip } from "./automation-citation";
import type { FileReference } from "./file-reference-types";
import { useHiCodexIntl } from "./i18n-provider";
import { FileCitationAnchor } from "./message-file-citations";
import { LazyMarkdownCodeBlock } from "./message-markdown-code-block";
import {
  desktopAssistantCopyText,
  selectedMarkdownRichCopyPayload,
} from "./message-markdown-copy";
import {
  Heading,
  MarkdownLink,
  MarkdownPromptLink,
} from "./message-markdown-links";
import {
  MarkdownImageView,
  resolvedMarkdownImage,
} from "./message-markdown-media";
import { MathDisplay, MathInline } from "./message-markdown-math";

export {
  desktopAssistantCopyText,
  selectedMarkdownRichCopyPayload,
} from "./message-markdown-copy";

export function Markdownish({
  fadeType = "none",
  text,
  mediaSources,
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  trailingAutomationCitations,
}: {
  fadeType?: MarkdownFadeType;
  text: string;
  mediaSources?: Map<string, string>;
  onOpenAutomationCitation?: (citation: CitationDirective) => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  trailingAutomationCitations?: CitationDirective[];
}) {
  /*
   * Parsing is pure; cache the result by `text` so the streaming loop only
   * pays the parse cost when the text actually changes. Without this, every
   * unrelated `MessageUnitView` parent re-render that bypasses memo (e.g.
   * because a callback prop changed identity) would re-tokenise the full
   * assistant message -- a significant CPU spike that on mid-tier machines
   * dropped frames and surfaced as visible flicker.
   */
  const markdownDocument = useMemo(() => parseMarkdownDocument(text), [text]);
  const { blocks, references } = markdownDocument;
  const segmenter = useRef<MarkdownWordSegmenter | null>(createMarkdownWordSegmenter());
  const previousFadeSegmentCount = useRef(0);
  const markdownRootRef = useRef<HTMLDivElement | null>(null);
  const fadeEnabled = fadeType === "indexed";
  const fadeSegmentCount = fadeEnabled ? markdownIndexedFadeSegmentCount(blocks, segmenter.current, references) : 0;
  const fadeContext = fadeEnabled
    ? {
        nextIndex: 0,
        previousSegmentCount: previousFadeSegmentCount.current,
        segmenter: segmenter.current,
      }
    : null;
  useEffect(() => {
    previousFadeSegmentCount.current = fadeEnabled ? fadeSegmentCount : 0;
  }, [fadeEnabled, fadeSegmentCount]);
  useEffect(() => {
    const root = markdownRootRef.current;
    if (!root) return;
    const ownerDocument = root.ownerDocument;
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData || event.defaultPrevented) return;
      const payload = selectedMarkdownRichCopyPayload(root);
      if (!payload) return;
      event.clipboardData.setData("text/html", payload.htmlText);
      event.clipboardData.setData("text/plain", payload.plainText);
      event.preventDefault();
    };
    ownerDocument.addEventListener("copy", handleCopy, { capture: true });
    return () => ownerDocument.removeEventListener("copy", handleCopy, { capture: true });
  }, []);
  return (
    <div
      className={`hc-markdown${fadeEnabled ? " is-indexed-fade" : ""}`}
      data-markdown-fade={fadeEnabled ? "indexed" : undefined}
      ref={markdownRootRef}
    >
      {blocks.length === 0
        ? <p>{"\u00a0"}</p>
        : blocks.map((block, index) => {
            const inlineAutomationCitations = index === blocks.length - 1 && block.kind === "paragraph"
              ? trailingAutomationCitations
              : undefined;
            return (
              <MarkdownBlockView
                block={block}
                fadeContext={fadeContext}
                inlineAutomationCitations={inlineAutomationCitations}
                key={index}
                mediaSources={mediaSources}
                onOpenAutomationCitation={onOpenAutomationCitation}
                onOpenFileReference={onOpenFileReference}
                onOpenFileReferenceExternal={onOpenFileReferenceExternal}
                references={references}
              />
            );
          })}
    </div>
  );
}

export function markdownAllowsTrailingAutomationInline(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /^\s*:{2,3}[a-zA-Z0-9-]+(?:\s|\{|\[|$)/m.test(text)) {
    return false;
  }
  try {
    return parseMarkdownBlocks(text).at(-1)?.kind === "paragraph";
  } catch {
    return true;
  }
}

type MarkdownFadeType = "none" | "indexed";

interface MarkdownFadeContext {
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

function MarkdownBlockView({
  block,
  fadeContext,
  inlineAutomationCitations,
  mediaSources,
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: {
  block: MarkdownBlock;
  fadeContext?: MarkdownFadeContext | null;
  inlineAutomationCitations?: CitationDirective[];
  mediaSources?: Map<string, string>;
  onOpenAutomationCitation?: (citation: CitationDirective) => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}) {
  const { formatMessage } = useHiCodexIntl();
  switch (block.kind) {
    case "heading": {
      return <Heading level={block.level}>{renderInline(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</Heading>;
    }
    case "paragraph":
      return (
        <p>
          {renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
          <InlineAutomationCitations citations={inlineAutomationCitations} onOpen={onOpenAutomationCitation} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote>
          {block.children
            ? block.children.map((child, index) => (
                <MarkdownBlockView
                  block={child}
                  fadeContext={fadeContext}
                  key={`${child.kind}-${index}`}
                  mediaSources={mediaSources}
                  onOpenFileReference={onOpenFileReference}
                  onOpenFileReferenceExternal={onOpenFileReferenceExternal}
                  references={references}
                />
              ))
            : renderInlineWithBreaks(block.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
        </blockquote>
      );
    case "code":
      // codex: mermaid-diagram-*.js -- codeblock lang=mermaid renderer.
      // `LazyMarkdownCodeBlock` defers to `CodeSnippet`, which detects
      // `language === "mermaid"` and dynamic-imports the mermaid core to
      // `mermaid.render(id, source)` the SVG; render failures fall back to a
      // raw `<pre><code class="language-mermaid">` block so the surrounding
      // message keeps rendering.
      return (
        <LazyMarkdownCodeBlock block={block} />
      );
    case "details":
      return (
        <details className="hc-markdown-details" open={block.open}>
          <summary>
            <ChevronRight size={13} />
            <span>{renderInline(block.summary, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</span>
          </summary>
          <div className="hc-markdown-details-body">
            <Markdownish text={block.text} mediaSources={mediaSources} onOpenFileReference={onOpenFileReference} onOpenFileReferenceExternal={onOpenFileReferenceExternal} />
          </div>
        </details>
      );
    case "math":
      // codex: katex-*.js -- inline $ + block $$ KaTeX rendering.
      // Block-level math (`$$...$$` or `\[...\]`) goes through `MathDisplay`,
      // which calls `renderKatexToString` with `displayMode=true`; KaTeX
      // parse failures fall back to the raw source so the message still
      // renders. Inline `$...$` / `\(...\)` is handled by `MathInline` in
      // `renderInline` below with `displayMode=false`.
      return <MathDisplay text={block.text} />;
    case "list": {
      const className = markdownListContainsTaskItems(block.items) ? "hc-task-list contains-task-list" : undefined;
      const children = (
        <>
          {block.items.map((item, index) => (
            <MarkdownListItemView
              fadeContext={fadeContext}
              item={item}
              key={index}
              loose={block.loose === true}
              mediaSources={mediaSources}
              onOpenFileReference={onOpenFileReference}
              onOpenFileReferenceExternal={onOpenFileReferenceExternal}
              references={references}
            />
          ))}
        </>
      );
      return block.ordered ? <ol className={className} start={block.start}>{children}</ol> : <ul className={className}>{children}</ul>;
    }
    case "taskList":
      return (
        <ul className="hc-task-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <input aria-label={item.checked
                ? formatMessage({ id: "hc.markdown.task.completed", defaultMessage: "Completed task" })
                : formatMessage({ id: "hc.markdown.task.pending", defaultMessage: "Pending task" })} checked={item.checked} readOnly type="checkbox" />
              <span>
                {renderInline(item.text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="hc-markdown-table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((header, index) => (
                  <th align={block.aligns?.[index] ?? undefined} key={index}>{renderInline(header, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {normalizeTableRow(row, block.headers.length).map((cell, cellIndex) => (
                    <td align={block.aligns?.[cellIndex] ?? undefined} key={cellIndex}>{renderInline(cell, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr />;
    case "image":
      return <MarkdownImageView image={resolvedMarkdownImage(block, mediaSources)} />;
    case "imageGrid":
      return (
        <div className="hc-markdown-image-grid" data-markdown-image-grid="true">
          {block.images.map((image, index) => (
            <MarkdownImageView allowWide image={resolvedMarkdownImage(image, mediaSources)} key={`${image.src}-${index}`} />
          ))}
        </div>
      );
  }
}

function MarkdownListItemView({
  fadeContext,
  item,
  loose,
  mediaSources,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: {
  fadeContext?: MarkdownFadeContext | null;
  item: MarkdownListItemValue;
  loose?: boolean;
  mediaSources?: Map<string, string>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}) {
  const { formatMessage } = useHiCodexIntl();
  const text = typeof item === "string" ? item : item.text;
  const children = typeof item === "string" ? [] : item.children ?? [];
  const task = typeof item !== "string" && item.task === true;
  const checked = typeof item !== "string" && item.checked === true;
  return (
    <li className={task ? "task-list-item" : undefined}>
      {task && (
        <input aria-label={checked
          ? formatMessage({ id: "hc.markdown.task.completed", defaultMessage: "Completed task" })
          : formatMessage({ id: "hc.markdown.task.pending", defaultMessage: "Pending task" })} checked={checked} readOnly type="checkbox" />
      )}
      {loose
        ? text.length > 0 && (
            <p>{renderInlineWithBreaks(text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}</p>
          )
        : renderInline(text, onOpenFileReference, mediaSources, fadeContext, { references }, onOpenFileReferenceExternal)}
      {children.map((child, index) => (
        <MarkdownBlockView
          block={child}
          fadeContext={fadeContext}
          key={`${child.kind}-${index}`}
          mediaSources={mediaSources}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceExternal={onOpenFileReferenceExternal}
          references={references}
        />
      ))}
    </li>
  );
}

function markdownListContainsTaskItems(items: MarkdownListItemValue[]): boolean {
  return items.some((item) => typeof item !== "string" && item.task === true);
}

function InlineAutomationCitations({
  citations,
  onOpen,
}: {
  citations?: CitationDirective[];
  onOpen?: (citation: CitationDirective) => void;
}) {
  if (!citations || citations.length === 0) return null;
  return (
    <span className="hc-automation-citation-inline-list">
      {citations.map((citation, index) => (
        <span className="hc-automation-citation-inline-item" key={`${citation.id}-${index}`}>
          <AutomationCitationChip
            citation={citation}
            onOpen={onOpen && citation.openAutomationId?.trim() ? () => onOpen(citation) : undefined}
          />
        </span>
      ))}
    </span>
  );
}

function renderInlineWithBreaks(
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

function renderInline(
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
        <MarkdownLink href={segment.href} key={index} title={segment.title}>
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
      const entry = { path: segment.path, lineStart: segment.lineStart, lineEnd: segment.lineEnd };
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
    // Codex demotes priority-badge images out of subscript so shields.io badges
    // keep their normal image size in review/comment markdown.
    return markdownInlineContainsPriorityBadgeImage(segment.text, options)
      ? <span key={key}>{children}</span>
      : <sub key={key}>{children}</sub>;
  }
  if (segment.tag === "sup") return <sup key={key}>{children}</sup>;
  return <u key={key}>{children}</u>;
}
