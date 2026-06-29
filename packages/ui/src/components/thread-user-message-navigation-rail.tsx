import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppWindow, GitCommitHorizontal, GitPullRequest, Globe, ImageIcon, MessageSquareText } from "lucide-react";
import type { ScrollToUnitKeyRef } from "./conversation-virtual-turn-list";
import { useForgeIntl } from "./i18n-provider";
import { useThreadScrollController } from "./thread-scroll-layout";
import { fileIconFor } from "../lib/file-icon";
import type {
  AssistantAfterRenderUnit,
  AssistantEndResource,
  ConversationRenderUnit,
  RailEntry,
} from "../state/render-groups";
import {
  parseMarkdownBlocks,
  parseMarkdownInline,
} from "../state/conversation-markdown-engine";
import { threadScrollDistanceFromBottom } from "../state/thread-scroll";
import type {
  MarkdownBlock,
  MarkdownInlineSegment,
  MarkdownListItemValue,
} from "../state/conversation-markdown-engine";

export const THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS = 4;
const THREAD_USER_MESSAGE_NAVIGATION_MAX_OUTPUTS = 2;
const THREAD_USER_MESSAGE_NAVIGATION_PREVIEW_CACHE_LIMIT = 160;
const THREAD_USER_MESSAGE_NAVIGATION_REVEAL_STALLED_FRAMES = 8;
const THREAD_USER_MESSAGE_NAVIGATION_REVEAL_TOP_INSET_PX = 16;
const CONTENT_SEARCH_UNIT_SELECTOR = "[data-content-search-unit-key]";
const DESKTOP_NAVIGATION_DIRECTIVE_LINE_PATTERN = /^::[a-zA-Z0-9-]+.*$/gm;
const navigationPreviewTextCache = new Map<string, string>();
type UserMessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }> & { role: "user" };
type AssistantMessageRenderUnit = Extract<ConversationRenderUnit, { kind: "message" }> & { role: "assistant" };

export interface ThreadUserMessageNavigationItem {
  id: string;
  label: string;
  response: string;
  outputs: ThreadUserMessageNavigationOutput[];
}

export type ThreadUserMessageNavigationOutputType =
  | "app"
  | "commit"
  | "file"
  | "google-drive"
  | "image"
  | "pull-request"
  | "review"
  | "website";

export interface ThreadUserMessageNavigationOutput {
  type: ThreadUserMessageNavigationOutputType;
  label: string;
  path?: string;
}

export function threadUserMessageNavigationItems(
  units: readonly ConversationRenderUnit[],
): ThreadUserMessageNavigationItem[] {
  const items: ThreadUserMessageNavigationItem[] = [];
  let current: ThreadUserMessageNavigationItem | null = null;
  for (const unit of units) {
    if (isUserMessageRenderUnit(unit)) {
      const text = normalizedNavigationText(unit.copyText ?? unit.text);
      current = {
        id: unit.key,
        label: text,
        response: "",
        outputs: [],
      };
      items.push(current);
      continue;
    }
    if (!current) continue;
    if (isAssistantMessageRenderUnit(unit)) {
      const response = normalizedNavigationPreviewText(unit.copyText ?? unit.text);
      if (response && !current.response) current.response = response;
      for (const output of navigationOutputsFromRailEntries(unit.artifacts)) {
        appendNavigationOutput(current.outputs, output);
      }
      for (const output of navigationOutputsFromAssistantAfter(unit.assistantAfter)) {
        appendNavigationOutput(current.outputs, output);
      }
      continue;
    }
    for (const output of navigationOutputsFromUnit(unit)) {
      appendNavigationOutput(current.outputs, output);
    }
  }
  return items;
}

function isUserMessageRenderUnit(unit: ConversationRenderUnit): unit is UserMessageRenderUnit {
  return unit.kind === "message" && unit.role === "user";
}

function isAssistantMessageRenderUnit(unit: ConversationRenderUnit): unit is AssistantMessageRenderUnit {
  return unit.kind === "message" && unit.role === "assistant";
}

export function ThreadUserMessageNavigationRail({
  items,
  scrollToUnitKeyRef,
}: {
  items: readonly ThreadUserMessageNavigationItem[];
  scrollToUnitKeyRef: ScrollToUnitKeyRef;
}) {
  const { formatMessage } = useForgeIntl();
  const scrollController = useThreadScrollController();
  const railRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const revealFrameRef = useRef<number | null>(null);
  const tooltipId = useId();
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [tooltipTarget, setTooltipTarget] = useState<{
    item: ThreadUserMessageNavigationItem;
    button: HTMLButtonElement;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const lastId = items.at(-1)?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(lastId);

  useLayoutEffect(() => {
    let frame: number | null = null;
    let attempts = 0;
    const resolvePortalElement = () => {
      const scrollElement = scrollController?.getScrollElement();
      const shellElement = scrollElement?.closest<HTMLElement>("[data-thread-scroll-shell='true']") ?? null;
      const nextPortalElement =
        shellElement?.querySelector<HTMLElement>("[data-thread-user-message-navigation-portal='true']") ?? null;
      setPortalElement((current) => current === nextPortalElement ? current : nextPortalElement);
      if (!nextPortalElement && attempts < 2 && typeof window !== "undefined") {
        attempts += 1;
        frame = window.requestAnimationFrame(resolvePortalElement);
      }
    };
    resolvePortalElement();
    return () => {
      if (frame !== null && typeof window !== "undefined") window.cancelAnimationFrame(frame);
    };
  }, [scrollController]);

  useEffect(() => {
    setActiveId((current) => current && items.some((item) => item.id === current) ? current : lastId);
  }, [items, lastId]);

  useVisibleUserMessageMarker({
    activeIdRef: useLatestRef(activeId),
    items,
    scrollController,
    setActiveId,
  });

  const cancelPendingReveal = useCallback(() => {
    if (revealFrameRef.current === null) return;
    window.cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = null;
  }, []);

  useEffect(() => cancelPendingReveal, [cancelPendingReveal]);

  const updateTooltipPosition = useCallback(() => {
    const target = tooltipTarget?.button;
    const tooltip = tooltipRef.current;
    if (!target || !tooltip || !portalElement) return;
    const anchorRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const portalRect = portalElement.getBoundingClientRect();
    const top = clamp(
      anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2 - portalRect.top,
      8 - portalRect.top,
      window.innerHeight - tooltipRect.height - 8 - portalRect.top,
    );
    const left = anchorRect.right - portalRect.left;
    setTooltipPosition({ left, top });
  }, [portalElement, tooltipTarget]);

  useLayoutEffect(() => {
    if (!tooltipTarget) {
      setTooltipPosition(null);
      return;
    }
    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [tooltipTarget, updateTooltipPosition]);

  if (items.length < THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS || !portalElement) return null;

  const revealItem = (item: ThreadUserMessageNavigationItem) => {
    cancelPendingReveal();
    setActiveId(item.id);
    let lastObservedDistanceFromBottom: number | null = null;
    let stalledFrames = 0;
    const selector = `[data-content-search-unit-key="${cssEscape(item.id)}"]`;
    const revealMountedTarget = () => {
      revealFrameRef.current = null;
      const target = scrollController?.getScrollElement()?.querySelector<HTMLElement>(selector);
      if (target) {
        scrollNavigationTargetIntoView(scrollController, target);
        highlightUserMessageTarget(target);
        return;
      }
      const scrollElement = scrollController?.getScrollElement();
      const distance = scrollElement ? threadScrollDistanceFromBottom(scrollElement) : null;
      stalledFrames = distance != null
        && lastObservedDistanceFromBottom != null
        && Math.abs(distance - lastObservedDistanceFromBottom) <= 1
        ? stalledFrames + 1
        : 0;
      lastObservedDistanceFromBottom = distance;
      if (stalledFrames >= THREAD_USER_MESSAGE_NAVIGATION_REVEAL_STALLED_FRAMES) return;
      revealFrameRef.current = window.requestAnimationFrame(revealMountedTarget);
    };
    scrollToUnitKeyRef.current?.(item.id);
    revealFrameRef.current = window.requestAnimationFrame(revealMountedTarget);
  };

  const rail = (
    <>
      <nav
        ref={railRef}
        aria-label={formatMessage({
          id: "thread.userMessageNavigation.ariaLabel",
          defaultMessage: "User messages",
          description: "Aria label for the floating thread navigation rail that jumps between user messages",
        })}
        className="hc-thread-user-message-navigation"
        data-thread-user-message-navigation-rail="true"
      >
        <div
          className="hc-thread-user-message-navigation-list"
          data-thread-user-message-navigation-rail-list="true"
          onPointerLeave={() => setTooltipTarget(null)}
        >
          {items.map((item, index) => {
            const isActive = activeId === item.id;
            const isHovered = tooltipTarget?.item.id === item.id;
            return (
              <button
                aria-current={isActive ? "true" : undefined}
                aria-describedby={isHovered ? tooltipId : undefined}
                aria-label={formatMessage({
                  id: "thread.userMessageNavigation.jumpAriaLabel",
                  defaultMessage: "Jump to user message {position}",
                  description: "Aria label for a row in the floating thread user-message navigation rail",
                }, { position: index + 1 })}
                className="hc-thread-user-message-navigation-row"
                data-thread-user-message-navigation-item-id={item.id}
                data-scrub-target={isHovered ? "true" : undefined}
                key={item.id}
                type="button"
                onBlur={() => setTooltipTarget((current) => current?.item.id === item.id ? null : current)}
                onClick={() => revealItem(item)}
                onFocus={(event) => setTooltipTarget({ item, button: event.currentTarget })}
                onMouseEnter={(event) => setTooltipTarget({ item, button: event.currentTarget })}
              >
                <span className="hc-thread-user-message-navigation-marker-wrap" aria-hidden="true">
                  <span className="hc-thread-user-message-navigation-marker" />
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      {tooltipTarget && (
        <div
          className="hc-thread-user-message-navigation-tooltip"
          data-thread-user-message-navigation-tooltip-preview="true"
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          style={{
            left: tooltipPosition?.left ?? -9999,
            top: tooltipPosition?.top ?? -9999,
            visibility: tooltipPosition ? undefined : "hidden",
          }}
        >
          <ThreadUserMessageNavigationTooltipPreview item={tooltipTarget.item} />
        </div>
      )}
    </>
  );
  return createPortal(rail, portalElement);
}

function scrollNavigationTargetIntoView(
  scrollController: ReturnType<typeof useThreadScrollController>,
  target: HTMLElement,
): void {
  const scrollElement = scrollController?.getScrollElement();
  if (!scrollController || !scrollElement) {
    target.scrollIntoView({ block: "start" });
    return;
  }
  const targetRect = target.getBoundingClientRect();
  const scrollRect = scrollElement.getBoundingClientRect();
  const targetTopInViewport = targetRect.top - scrollRect.top;
  const currentDistance = threadScrollDistanceFromBottom(scrollElement);
  const targetDistance = currentDistance - targetTopInViewport + THREAD_USER_MESSAGE_NAVIGATION_REVEAL_TOP_INSET_PX;
  scrollController.scrollToDistanceFromBottomPx(Math.max(0, targetDistance), "instant");
}

function ThreadUserMessageNavigationTooltipPreview({ item }: { item: ThreadUserMessageNavigationItem }) {
  const { formatMessage } = useForgeIntl();
  const label = navigationLabel(item, formatMessage);
  const visibleOutputs = item.outputs.slice(0, THREAD_USER_MESSAGE_NAVIGATION_MAX_OUTPUTS);
  const remainingCount = Math.max(0, item.outputs.length - visibleOutputs.length);
  return (
    <>
      <div className="hc-thread-user-message-navigation-tooltip-heading">
        <span className="hc-thread-user-message-navigation-tooltip-title">{label}</span>
      </div>
      {item.response && (
        <div className="hc-thread-user-message-navigation-tooltip-response">{item.response}</div>
      )}
      {visibleOutputs.length > 0 && (
        <div className="hc-thread-user-message-navigation-tooltip-outputs">
          {visibleOutputs.map((output, index) => (
            <ThreadUserMessageNavigationOutputPill output={output} key={`${output.type}:${output.label}:${index}`} />
          ))}
          {remainingCount > 0 && (
            <span className="hc-thread-user-message-navigation-output-more">
              {formatMessage({
                id: "thread.userMessageNavigation.moreOutputs",
                defaultMessage: "+{count}",
                description: "Count of additional turn outputs hidden from the prompt rail tooltip preview",
              }, { count: remainingCount })}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function ThreadUserMessageNavigationOutputPill({ output }: { output: ThreadUserMessageNavigationOutput }) {
  const { formatMessage } = useForgeIntl();
  return (
    <span className="hc-thread-user-message-navigation-output">
      {navigationOutputIcon(output)}
      <span className="hc-thread-user-message-navigation-output-label">
        {navigationOutputLabel(output, formatMessage)}
      </span>
    </span>
  );
}

function useVisibleUserMessageMarker({
  activeIdRef,
  items,
  scrollController,
  setActiveId,
}: {
  activeIdRef: MutableRefObject<string | null>;
  items: readonly ThreadUserMessageNavigationItem[];
  scrollController: ReturnType<typeof useThreadScrollController>;
  setActiveId: (id: string | null) => void;
}) {
  const itemIds = useMemo(() => items.map((item) => item.id).join("\0"), [items]);
  useEffect(() => {
    const ids = itemIds.length === 0 ? [] : itemIds.split("\0");
    if (ids.length < THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS) return;
    const scrollElement = scrollController?.getScrollElement();
    if (!scrollElement || typeof IntersectionObserver === "undefined") return;
    const idSet = new Set(ids);
    const visible = new Set<string>();
    const targetIds = new Map<Element, string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = targetIds.get(entry.target);
        if (!id) continue;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      const next = ids.find((id) => visible.has(id)) ?? ids.at(-1) ?? null;
      if (next !== activeIdRef.current) setActiveId(next);
    }, {
      root: scrollElement,
      rootMargin: "-16px 0px 0px 0px",
    });
    const observeTargets = () => {
      const liveTargets = new Set<Element>();
      for (const target of scrollElement.querySelectorAll<HTMLElement>(CONTENT_SEARCH_UNIT_SELECTOR)) {
        const id = target.dataset.contentSearchUnitKey;
        if (!id || !idSet.has(id)) continue;
        liveTargets.add(target);
        if (targetIds.has(target)) continue;
        targetIds.set(target, id);
        observer.observe(target);
      }
      for (const target of Array.from(targetIds.keys())) {
        if (liveTargets.has(target)) continue;
        const id = targetIds.get(target);
        if (id) visible.delete(id);
        targetIds.delete(target);
        observer.unobserve(target);
      }
    };
    let observeFrame: number | null = null;
    const scheduleObserveTargets = () => {
      if (observeFrame !== null) return;
      observeFrame = requestAnimationFrame(() => {
        observeFrame = null;
        observeTargets();
      });
    };
    const mutationObserver = new MutationObserver((records) => {
      if (records.some(mutationRecordTouchesContentSearchTarget)) {
        scheduleObserveTargets();
      }
    });
    mutationObserver.observe(scrollElement, { childList: true, subtree: true });
    observeTargets();
    return () => {
      if (observeFrame !== null) cancelAnimationFrame(observeFrame);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [activeIdRef, itemIds, scrollController, setActiveId]);
}

function navigationLabel(
  item: ThreadUserMessageNavigationItem,
  formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"],
): string {
  if (!item.label) {
    return formatMessage({
      id: "thread.userMessageNavigation.noContent",
      defaultMessage: "(No content)",
      description: "Fallback label for an empty user message in the floating thread navigation tooltip",
    });
  }
  if (item.label.startsWith("PLEASE IMPLEMENT THIS PLAN:")) {
    return formatMessage({
      id: "codex.userMessage.implementPlan",
      defaultMessage: "Yes, implement this plan",
      description: "Display text for the synthetic implement-plan follow-up prompt",
    });
  }
  return item.label;
}

function normalizedNavigationText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedNavigationPreviewText(value: string): string {
  const cleaned = value
    .replace(DESKTOP_NAVIGATION_DIRECTIVE_LINE_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return "";
  const cached = navigationPreviewTextCache.get(cleaned);
  if (cached !== undefined) return cached;
  const preview = normalizedNavigationText(markdownBlocksToPlainText(parseMarkdownBlocks(cleaned)));
  rememberNavigationPreviewText(cleaned, preview);
  return preview;
}

function rememberNavigationPreviewText(source: string, preview: string): void {
  if (navigationPreviewTextCache.size >= THREAD_USER_MESSAGE_NAVIGATION_PREVIEW_CACHE_LIMIT) {
    const oldestKey = navigationPreviewTextCache.keys().next().value;
    if (oldestKey !== undefined) navigationPreviewTextCache.delete(oldestKey);
  }
  navigationPreviewTextCache.set(source, preview);
}

function mutationRecordTouchesContentSearchTarget(record: MutationRecord): boolean {
  return nodesContainContentSearchTarget(record.addedNodes) || nodesContainContentSearchTarget(record.removedNodes);
}

function nodesContainContentSearchTarget(nodes: NodeList): boolean {
  for (let index = 0; index < nodes.length; index += 1) {
    if (nodeContainsContentSearchTarget(nodes[index])) return true;
  }
  return false;
}

function nodeContainsContentSearchTarget(node: Node | undefined): boolean {
  if (node instanceof Element) {
    return node.matches(CONTENT_SEARCH_UNIT_SELECTOR) || node.querySelector(CONTENT_SEARCH_UNIT_SELECTOR) !== null;
  }
  if (node instanceof DocumentFragment) {
    return node.querySelector(CONTENT_SEARCH_UNIT_SELECTOR) !== null;
  }
  return false;
}

function markdownBlocksToPlainText(blocks: readonly MarkdownBlock[]): string {
  return blocks.map(markdownBlockToPlainText).filter(Boolean).join(" ");
}

function markdownBlockToPlainText(block: MarkdownBlock): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
    case "math":
      return markdownInlineText(block.text);
    case "blockquote":
      return block.children?.length ? markdownBlocksToPlainText(block.children) : markdownInlineText(block.text);
    case "code":
      return block.text;
    case "details":
      return [markdownInlineText(block.summary), markdownInlineText(block.text)].filter(Boolean).join(" ");
    case "list":
      return block.items.map(markdownListItemToPlainText).filter(Boolean).join(" ");
    case "taskList":
      return block.items.map((item) => markdownInlineText(item.text)).filter(Boolean).join(" ");
    case "table":
      return [...block.headers, ...block.rows.flat()].map(markdownInlineText).filter(Boolean).join(" ");
    case "image":
      return block.alt;
    case "imageGrid":
      return block.images.map((image) => image.alt).filter(Boolean).join(" ");
    case "hr":
      return "";
  }
}

function markdownListItemToPlainText(item: MarkdownListItemValue): string {
  if (typeof item === "string") return markdownInlineText(item);
  return [
    markdownInlineText(item.text),
    item.children?.length ? markdownBlocksToPlainText(item.children) : "",
  ].filter(Boolean).join(" ");
}

function markdownInlineText(text: string): string {
  return parseMarkdownInline(text).map(markdownInlineSegmentText).join("");
}

function markdownInlineSegmentText(segment: MarkdownInlineSegment): string {
  switch (segment.kind) {
    case "text":
    case "code":
    case "htmlSpan":
    case "link":
    case "math":
    case "strong":
    case "em":
    case "del":
      return segment.text;
    case "image":
      return segment.alt;
    case "promptLink":
      return segment.label;
    case "fileCitation":
      return basename(segment.path);
    case "htmlBreak":
      return " ";
  }
}

function navigationOutputsFromAssistantAfter(
  assistantAfter: readonly AssistantAfterRenderUnit[] | undefined,
): ThreadUserMessageNavigationOutput[] {
  if (!assistantAfter) return [];
  return assistantAfter.flatMap((unit) => navigationOutputsFromUnit(unit));
}

function navigationOutputsFromUnit(unit: ConversationRenderUnit | AssistantAfterRenderUnit): ThreadUserMessageNavigationOutput[] {
  switch (unit.kind) {
    case "assistantEndResources":
      return unit.resources.map(navigationOutputFromEndResource);
    case "generatedImageGallery":
      return unit.images.length > 0 || unit.hasPending ? [{ type: "image", label: "" }] : [];
    case "assistantReviewComments":
      return unit.comments.length > 0 ? [{ type: "review", label: "" }] : [];
    default:
      return [];
  }
}

function navigationOutputsFromRailEntries(
  entries: readonly RailEntry[] | undefined,
): ThreadUserMessageNavigationOutput[] {
  if (!entries) return [];
  return entries.map(navigationOutputFromRailEntry).filter((output): output is ThreadUserMessageNavigationOutput => output !== null);
}

function navigationOutputFromEndResource(resource: AssistantEndResource): ThreadUserMessageNavigationOutput {
  switch (resource.type) {
    case "file":
      return { type: "file", label: basename(resource.path), path: resource.path };
    case "website":
      return { type: "website", label: webLabel(resource.target) };
    case "google-drive":
      return { type: "google-drive", label: resource.title };
  }
}

function navigationOutputFromRailEntry(entry: RailEntry): ThreadUserMessageNavigationOutput | null {
  const path = entry.reference?.path;
  if (entry.artifactKind === "generated-image") return { type: "image", label: entry.title || entry.meta || "" };
  if (path) return { type: "file", label: entry.title || basename(path), path };
  if (entry.action?.kind === "url") return { type: "website", label: entry.title || webLabel(entry.action.url) };
  if (entry.action?.kind === "thread") return { type: "review", label: entry.title };
  if (entry.action?.kind === "diff") return { type: "file", label: entry.title };
  if (entry.title) return { type: "file", label: entry.title };
  return null;
}

function appendNavigationOutput(
  outputs: ThreadUserMessageNavigationOutput[],
  output: ThreadUserMessageNavigationOutput,
): void {
  const key = `${output.type}:${output.path ?? output.label}`;
  if (outputs.some((existing) => `${existing.type}:${existing.path ?? existing.label}` === key)) return;
  outputs.push(output);
}

function navigationOutputIcon(output: ThreadUserMessageNavigationOutput): ReactNode {
  switch (output.type) {
    case "app":
      return <AppWindow className="hc-thread-user-message-navigation-output-icon" size={14} />;
    case "commit":
      return <GitCommitHorizontal className="hc-thread-user-message-navigation-output-icon" size={14} />;
    case "file":
      return fileIconFor({ path: output.path ?? output.label, size: 14, className: "hc-thread-user-message-navigation-output-icon" });
    case "google-drive":
      return fileIconFor({ path: output.label, size: 14, className: "hc-thread-user-message-navigation-output-icon" });
    case "image":
      return <ImageIcon className="hc-thread-user-message-navigation-output-icon" size={14} />;
    case "pull-request":
      return <GitPullRequest className="hc-thread-user-message-navigation-output-icon" size={14} />;
    case "review":
      return <MessageSquareText className="hc-thread-user-message-navigation-output-icon" size={14} />;
    case "website":
      return <Globe className="hc-thread-user-message-navigation-output-icon" size={14} />;
  }
}

function navigationOutputLabel(
  output: ThreadUserMessageNavigationOutput,
  formatMessage: ReturnType<typeof useForgeIntl>["formatMessage"],
): ReactNode {
  if (output.label) return output.label;
  switch (output.type) {
    case "app":
      return formatMessage({ id: "thread.userMessageNavigation.appOutput", defaultMessage: "App preview", description: "Fallback label for an app output in the prompt rail tooltip" });
    case "commit":
      return formatMessage({ id: "thread.userMessageNavigation.commitOutput", defaultMessage: "Commit", description: "Label for a commit output in the prompt rail tooltip" });
    case "file":
      return formatMessage({ id: "thread.userMessageNavigation.fileOutput", defaultMessage: "File", description: "Fallback label for a file output in the prompt rail tooltip" });
    case "google-drive":
      return formatMessage({ id: "thread.userMessageNavigation.googleDriveOutput", defaultMessage: "Google Drive", description: "Fallback label for a Google Drive output in the prompt rail tooltip" });
    case "image":
      return formatMessage({ id: "thread.userMessageNavigation.imageOutput", defaultMessage: "Image", description: "Label for a generated image output in the prompt rail tooltip" });
    case "pull-request":
      return formatMessage({ id: "thread.userMessageNavigation.pullRequestOutput", defaultMessage: "Pull request", description: "Fallback label for a pull request output in the prompt rail tooltip" });
    case "review":
      return formatMessage({ id: "thread.userMessageNavigation.reviewOutput", defaultMessage: "Review", description: "Fallback label for a review output in the prompt rail tooltip" });
    case "website":
      return formatMessage({ id: "thread.userMessageNavigation.websiteOutput", defaultMessage: "Web preview", description: "Label for a website output in the prompt rail tooltip" });
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function webLabel(value: string): string {
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/"/g, "\\\"");
}

function highlightUserMessageTarget(target: HTMLElement | null | undefined): void {
  const bubble = target?.querySelector<HTMLElement>("[data-user-message-bubble]")
    ?? target?.querySelector<HTMLElement>("[data-composer-attachment-pill]");
  bubble?.animate?.(
    [
      { backgroundColor: "color-mix(in srgb, var(--hc-text-primary) 14%, transparent)" },
      { backgroundColor: "color-mix(in srgb, var(--hc-text-primary) 14%, transparent)", offset: 0.35 },
      { backgroundColor: "color-mix(in srgb, var(--hc-text-primary) 5%, transparent)" },
    ],
    { duration: 1400, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
}
