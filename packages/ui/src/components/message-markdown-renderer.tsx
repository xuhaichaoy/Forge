import { ChevronRight } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, type Ref } from "react";
import type { CitationDirective } from "../state/automation-citations";
import {
  createMarkdownWordSegmenter,
  markdownIndexedFadeSegmentCount,
  parseMarkdownBlocks,
  parseMarkdownDocument,
} from "../state/conversation-markdown-engine";
import type {
  MarkdownBlock,
  MarkdownListItemValue,
  MarkdownReferenceDefinitions,
  MarkdownWordSegmenter,
} from "../state/conversation-markdown-engine";
import { InlineAutomationCitations } from "./automation-citation-inline";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl } from "./i18n-provider";
import { LazyMarkdownCodeBlock } from "./message-markdown-code-block";
import {
  selectedMarkdownRichCopyPayload,
} from "./message-markdown-copy";
import {
  type MarkdownFadeContext,
  renderInline,
  renderInlineWithBreaks,
} from "./message-markdown-inline-renderer";
import { Heading } from "./message-markdown-links";
import {
  MarkdownImageView,
  resolvedMarkdownImage,
} from "./message-markdown-media";
import { MathDisplay } from "./message-markdown-math";
import { MarkdownTableView } from "./message-markdown-table-view";

export {
  desktopAssistantCopyText,
  selectedMarkdownRichCopyPayload,
} from "./message-markdown-copy";

export function Markdownish({
  copyRootRef,
  fadeType = "none",
  text,
  mediaSources,
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  trailingAutomationCitations,
}: {
  copyRootRef?: Ref<HTMLDivElement>;
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
  const setMarkdownRootRef = useCallback((element: HTMLDivElement | null) => {
    markdownRootRef.current = element;
    assignRef(copyRootRef, element);
  }, [copyRootRef]);
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
      ref={setMarkdownRootRef}
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

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
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

interface MarkdownBlockViewProps {
  block: MarkdownBlock;
  fadeContext?: MarkdownFadeContext | null;
  inlineAutomationCitations?: CitationDirective[];
  mediaSources?: Map<string, string>;
  onOpenAutomationCitation?: (citation: CitationDirective) => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenFileReferenceExternal?: (reference: FileReference) => void;
  references?: MarkdownReferenceDefinitions;
}

/*
 * Streaming flicker / freeze fix.
 *
 * Every streamed token re-parses the WHOLE assistant message into a fresh
 * `blocks` array (new object refs), and `MarkdownBlockView` had no memo — so
 * every block of every message (KaTeX math included) re-rendered on each
 * token. With a long transcript that saturated the main thread: the page
 * flickered and briefly stopped accepting clicks.
 *
 * Fade mode drives per-segment indices off a MUTABLE `fadeContext` that
 * accumulates as each block renders, so skipping a block there would desync
 * the fade — and `fadeType` is `"indexed"` ONLY on the single in-flight
 * streaming message (every other message passes `"none"` → `fadeContext` is
 * null). We therefore memoize exactly that common case: non-fade blocks whose
 * content is unchanged frame-to-frame are skipped, so during streaming the
 * entire transcript above the streaming tail stops re-rendering. The
 * streaming message itself (fadeContext != null) is left untouched.
 */
const MarkdownBlockView = memo(MarkdownBlockViewInner, (prev, next) => {
  if (prev.fadeContext || next.fadeContext) return false;
  if (prev.mediaSources !== next.mediaSources) return false;
  if (prev.references !== next.references) return false;
  if (prev.inlineAutomationCitations !== next.inlineAutomationCitations) return false;
  if (prev.onOpenAutomationCitation !== next.onOpenAutomationCitation) return false;
  if (prev.onOpenFileReference !== next.onOpenFileReference) return false;
  if (prev.onOpenFileReferenceExternal !== next.onOpenFileReferenceExternal) return false;
  if (prev.block === next.block) return true;
  // Blocks are small and re-parsed (new refs) every frame but usually
  // identical; a structural compare is far cheaper than the re-render + (for
  // math) KaTeX re-layout it avoids.
  return prev.block.kind === next.block.kind
    && JSON.stringify(prev.block) === JSON.stringify(next.block);
});

function MarkdownBlockViewInner({
  block,
  fadeContext,
  inlineAutomationCitations,
  mediaSources,
  onOpenAutomationCitation,
  onOpenFileReference,
  onOpenFileReferenceExternal,
  references,
}: MarkdownBlockViewProps) {
  const { formatMessage } = useForgeIntl();
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
        <MarkdownTableView
          block={block}
          fadeContext={fadeContext}
          mediaSources={mediaSources}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceExternal={onOpenFileReferenceExternal}
          references={references}
        />
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
  const { formatMessage } = useForgeIntl();
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
