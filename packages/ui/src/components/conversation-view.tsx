import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GitFork } from "lucide-react";
import type { ReactNode } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import { isItemInProgress } from "../state/thread-item-fields";
import {
  ToolActivityView,
  ToolBlock,
} from "./event-unit";
import type { PatchAction, PatchActionState } from "./event-unit";
import type { FileReference } from "./file-reference-types";
import { GeneratedImageGallery } from "./generated-image-gallery";
import { AssistantEndResourceCards } from "./assistant-end-resource-cards";
import { IconActionButton, MessageActionRow } from "./message-action-row";
import { MessageUnitView } from "./message-unit";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";
import type { McpAppHostCallHandler, ReadMcpResourceHandler } from "./tool-activity-detail";
import { DynamicToolCallGroupView, ThreadItemView } from "./thread-item-view";
import { type SubmitTurnRatingEvent } from "./turn-rating-controls";
import {
  setThreadScrollDistanceFromBottom,
  threadScrollDistanceFromBottom,
  useThreadScrollController,
} from "./thread-scroll-layout";
import {
  groupUnitsByTurn,
  TurnCollapseFrame,
} from "./turn-collapse";

export {
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS,
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS,
  desktopCollapsedToolActivityChevronClassName,
  initialToolActivityExpanded,
  initialToolActivityViewState,
  isToolActivityExpandable,
  reasoningActivityBody,
  shouldShowToolActivityInlineDetail,
  stripReasoningActivityHeading,
  ToolActivityView,
  ToolBlock,
  toolActivityDetailItems,
  formatTurnDiffFileCount,
  turnDiffHeaderStatsVisible,
  turnDiffViewModel,
  workedForAggregateRows,
  workedForExpandedDetailItems,
} from "./event-unit";
export type { PatchAction, PatchActionState } from "./event-unit";
export {
  CodeSnippet,
  codeBlockTitle,
  highlightCodeSegments,
  Markdownish,
  mermaidDiagramKind,
  mermaidFlowchartPreviewModel,
  memoryCitationEntries,
  memoryCitationFileReference,
  parseMarkdownBlocks,
  parseMarkdownInline,
  sanitizeMermaidCode,
  shouldRenderMermaidPreview,
  shouldRenderSvgCodePreview,
  svgCodePreviewDataUrl,
} from "./message-unit";
export type {
  MarkdownBlock,
  MarkdownInlineSegment,
  MarkdownTaskListItem,
  MemoryCitationEntryView,
} from "./message-unit";
export type { FileReference } from "./file-reference-types";
export { userImageSrc } from "./user-message-content-render";

export interface ConversationViewProps {
  units: ConversationRenderUnit[];
  emptyState?: ReactNode;
  /**
   * Active conversation id used to scope page-local per-turn collapse state.
   * Mirrors Codex Desktop's `(conversationId, turnId)` keyed `OT/kT` state
   * without persisting stale expanded/collapsed choices across page reloads.
   */
  threadId?: string | null;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  // codex: `wa(o, { path })` deep-link — when supplied, scope diff view to a single file.
  onOpenDiff?: (filePath?: string) => void;
  onForkTurn?: (turnId: string) => void;
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenAutomation?: (automationId: string) => void;
  memoryCitationRoot?: string | null;
  onOpenThreadId?: OpenThreadHandler;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  /**
   * Patch action handler — see `event-unit.tsx` `TurnDiffBlock` props for the
   * Codex Desktop revertChanges / reapplyChanges semantics. Wired by the app
   * shell so HiCodexApp can call the Tauri host and surface the
   * `UnifiedDiffFailureDialog` on partial / failed apply.
   */
  onPatchAction?: PatchActionHandler;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
}

export type PatchActionHandler = (action: PatchAction, diff: string) => void;

export function ConversationView({
  units,
  emptyState = null,
  threadId = null,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onOpenDiff,
  onForkTurn,
  onSubmitTurnFeedback,
  onOpenFileReference,
  onOpenAutomation,
  memoryCitationRoot,
  onOpenThreadId,
  onOpenConversationThreadId,
  onOpenRemoteTask,
  onMcpAppHostCall,
  onReadMcpResource,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
}: ConversationViewProps) {
  const groups = useMemo(() => groupUnitsByTurn(units), [units]);
  const [turnCollapseState, setTurnCollapseState] = useState<Record<string, boolean>>({});
  if (units.length === 0) {
    return <>{emptyState}</>;
  }

  const renderUnit = (
    unit: ConversationRenderUnit,
    key: string,
    context?: { isMostRecentTurn?: boolean },
  ) => (
    <ConversationUnitView
      key={key}
      unit={unit}
      isMostRecentTurn={context?.isMostRecentTurn === true}
      onEditLastUserMessage={onEditLastUserMessage}
      onOpenAssistantArtifact={onOpenAssistantArtifact}
      onRevealAssistantEndResource={onRevealAssistantEndResource}
      onOpenDiff={onOpenDiff}
      onForkTurn={onForkTurn}
      onSubmitTurnFeedback={onSubmitTurnFeedback}
      onOpenFileReference={onOpenFileReference}
      onOpenAutomation={onOpenAutomation}
      memoryCitationRoot={memoryCitationRoot}
      onOpenThreadId={onOpenThreadId}
      onOpenConversationThreadId={onOpenConversationThreadId}
      onOpenRemoteTask={onOpenRemoteTask}
      onMcpAppHostCall={onMcpAppHostCall}
      onReadMcpResource={onReadMcpResource}
      onPatchAction={onPatchAction}
      patchActionState={patchActionState}
      patchActionInFlight={patchActionInFlight}
      threadId={threadId}
    />
  );

  return (
    <VirtualizedTurnList
      groups={groups}
      renderGroup={(group, index) => {
        const isMostRecentTurn = Boolean(group.turnId) && index === groups.length - 1;
        const renderGroupUnit = (unit: ConversationRenderUnit, key: string) =>
          renderUnit(unit, key, { isMostRecentTurn });
        if (!group.turnId) {
          return (
            <RenderUnitsList
              key={`untracked:${index}`}
              units={group.units}
              renderUnit={renderGroupUnit}
            />
          );
        }
        const collapseKey = threadId && group.turnId ? `${threadId}:${group.turnId}` : null;
        return (
          <TurnCollapseFrame
            key={group.turnId}
            turnId={group.turnId}
            units={group.units}
            renderUnit={renderGroupUnit}
            collapsedOverride={collapseKey ? turnCollapseState[collapseKey] : undefined}
            onCollapsedChange={collapseKey ? (collapsed) => {
              setTurnCollapseState((current) => ({ ...current, [collapseKey]: collapsed }));
            } : undefined}
          />
        );
      }}
    />
  );
}

const DESKTOP_TURN_ESTIMATED_HEIGHT_PX = 280;
const DESKTOP_TURN_GAP_PX = 12;
const DESKTOP_TURN_OVERSCAN = 2;
const DESKTOP_STICKY_BOTTOM_THRESHOLD_PX = 24;

export interface VirtualTurnRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

export function virtualTurnRange(input: {
  count: number;
  heights: ReadonlyMap<number, number>;
  scrollTop: number;
  viewportHeight: number;
  estimatedHeight?: number;
  gap?: number;
  overscan?: number;
}): VirtualTurnRange {
  const count = Math.max(0, input.count);
  const estimatedHeight = input.estimatedHeight ?? DESKTOP_TURN_ESTIMATED_HEIGHT_PX;
  const gap = input.gap ?? DESKTOP_TURN_GAP_PX;
  const overscan = input.overscan ?? DESKTOP_TURN_OVERSCAN;
  if (count === 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
  }

  const viewportHeight = Math.max(1, input.viewportHeight || 900);
  const viewportTop = Math.max(0, input.scrollTop);
  const viewportBottom = viewportTop + viewportHeight;
  const offsets = turnOffsets(count, input.heights, estimatedHeight, gap);
  let firstVisible = 0;
  let lastVisible = count - 1;

  for (let index = 0; index < count; index += 1) {
    const rowBottom = offsets[index] + turnHeight(input.heights, index, estimatedHeight);
    if (rowBottom >= viewportTop) {
      firstVisible = index;
      break;
    }
  }

  for (let index = firstVisible; index < count; index += 1) {
    if (offsets[index] > viewportBottom) {
      lastVisible = Math.max(firstVisible, index - 1);
      break;
    }
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(count, lastVisible + overscan + 1);
  const totalHeight = offsets[count - 1] + turnHeight(input.heights, count - 1, estimatedHeight);
  const paddingTop = offsets[startIndex] ?? 0;
  const afterLastRendered = endIndex >= count
    ? totalHeight
    : offsets[endIndex];
  const paddingBottom = Math.max(0, totalHeight - afterLastRendered);
  return { startIndex, endIndex, paddingTop, paddingBottom, totalHeight };
}

export function virtualTurnRangeFromBottom(input: {
  turnKeys: readonly string[];
  heights: ReadonlyMap<string, number>;
  distanceFromBottom: number;
  viewportHeight: number;
  estimatedHeight?: number;
  gap?: number;
  overscan?: number;
}): VirtualTurnRange {
  const turnKeys = input.turnKeys;
  const count = turnKeys.length;
  const estimatedHeight = input.estimatedHeight ?? DESKTOP_TURN_ESTIMATED_HEIGHT_PX;
  const gap = input.gap ?? DESKTOP_TURN_GAP_PX;
  const overscan = input.overscan ?? DESKTOP_TURN_OVERSCAN;
  if (count === 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
  }

  const viewportHeight = Math.max(1, input.viewportHeight || 900);
  const viewportBottomDistance = Math.max(0, input.distanceFromBottom);
  const viewportTopDistance = viewportBottomDistance + viewportHeight;
  const offsets = turnOffsetsByKey(turnKeys, input.heights, estimatedHeight, gap);
  const totalHeight = offsets[count - 1] + turnHeightByKey(input.heights, turnKeys[count - 1], estimatedHeight);
  let firstVisible = -1;
  let lastVisible = -1;

  for (let index = 0; index < count; index += 1) {
    const top = offsets[index] ?? 0;
    const height = turnHeightByKey(input.heights, turnKeys[index], estimatedHeight);
    const rowBottomDistance = Math.max(0, totalHeight - (top + height));
    const rowTopDistance = Math.max(rowBottomDistance, totalHeight - top);
    const visible = rowTopDistance >= viewportBottomDistance && rowBottomDistance <= viewportTopDistance;
    if (!visible) continue;
    if (firstVisible < 0) firstVisible = index;
    lastVisible = index;
  }

  if (firstVisible < 0 || lastVisible < 0) {
    if (viewportBottomDistance > totalHeight) {
      firstVisible = 0;
      lastVisible = 0;
    } else {
      firstVisible = count - 1;
      lastVisible = count - 1;
    }
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(count, lastVisible + overscan + 1);
  const paddingTop = offsets[startIndex] ?? 0;
  const afterLastRendered = endIndex >= count ? totalHeight : offsets[endIndex] ?? totalHeight;
  const paddingBottom = Math.max(0, totalHeight - afterLastRendered);
  return { startIndex, endIndex, paddingTop, paddingBottom, totalHeight };
}

function turnOffsets(
  count: number,
  heights: ReadonlyMap<number, number>,
  estimatedHeight: number,
  gap: number,
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    offsets.push(offset);
    offset += turnHeight(heights, index, estimatedHeight) + (index === count - 1 ? 0 : gap);
  }
  return offsets;
}

function turnHeight(heights: ReadonlyMap<number, number>, index: number, estimatedHeight: number): number {
  const measured = heights.get(index);
  return measured && measured > 0 ? measured : estimatedHeight;
}

function turnOffsetsByKey(
  turnKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimatedHeight: number,
  gap: number,
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let index = 0; index < turnKeys.length; index += 1) {
    offsets.push(offset);
    offset += turnHeightByKey(heights, turnKeys[index], estimatedHeight) + (index === turnKeys.length - 1 ? 0 : gap);
  }
  return offsets;
}

function turnHeightByKey(heights: ReadonlyMap<string, number>, turnKey: string | undefined, estimatedHeight: number): number {
  const measured = turnKey ? heights.get(turnKey) : undefined;
  return measured && measured > 0 ? measured : estimatedHeight;
}

function turnBottomDistanceFromBottom(
  turnKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  index: number,
  estimatedHeight = DESKTOP_TURN_ESTIMATED_HEIGHT_PX,
  gap = DESKTOP_TURN_GAP_PX,
): number {
  if (index < 0 || index >= turnKeys.length) return 0;
  const offsets = turnOffsetsByKey(turnKeys, heights, estimatedHeight, gap);
  const totalHeight = offsets[turnKeys.length - 1] + turnHeightByKey(heights, turnKeys[turnKeys.length - 1], estimatedHeight);
  const top = offsets[index] ?? 0;
  const height = turnHeightByKey(heights, turnKeys[index], estimatedHeight);
  return Math.max(0, totalHeight - (top + height));
}

function VirtualizedTurnList({
  groups,
  renderGroup,
}: {
  groups: ReturnType<typeof groupUnitsByTurn>;
  renderGroup: (group: ReturnType<typeof groupUnitsByTurn>[number], index: number) => ReactNode;
}) {
  const scrollController = useThreadScrollController();
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const rowObserversRef = useRef(new Map<string, ResizeObserver>());
  const rowHeightsRef = useRef(new Map<string, number>());
  const [scrollState, setScrollState] = useState({ distanceFromBottom: 0, viewportHeight: 900 });
  const [heightVersion, setHeightVersion] = useState(0);
  const count = groups.length;
  const turnKeys = useMemo(() => turnKeysForGroups(groups), [groups]);

  useLayoutEffect(() => {
    const scrollElement = scrollController?.getScrollElement() ?? conversationScrollElement(listRef.current);
    if (!scrollElement) return;
    const measure = (providedDistance?: number) => {
      const bottomDistance = providedDistance ?? threadScrollDistanceFromBottom(scrollElement);
      stickToBottomRef.current = bottomDistance <= DESKTOP_STICKY_BOTTOM_THRESHOLD_PX;
      setScrollState({
        distanceFromBottom: bottomDistance,
        viewportHeight: scrollElement.clientHeight || 900,
      });
    };
    const handleScroll = () => measure();
    const handleResize = () => measure();
    measure();
    const removeControllerListener = scrollController?.addScrollListener(measure);
    if (!scrollController) scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    observer?.observe(scrollElement);
    return () => {
      removeControllerListener?.();
      if (!scrollController) scrollElement.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [count, scrollController]);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    if (scrollController) {
      scrollController.scrollToDistanceFromBottomPx(0, "instant");
      return;
    }
    const scrollElement = conversationScrollElement(listRef.current);
    if (scrollElement) setThreadScrollDistanceFromBottom(scrollElement, 0);
  }, [count, heightVersion, scrollController]);

  useEffect(() => {
    const liveKeys = new Set(turnKeys);
    for (const [key, observer] of rowObserversRef.current) {
      if (!liveKeys.has(key)) {
        observer.disconnect();
        rowObserversRef.current.delete(key);
        rowHeightsRef.current.delete(key);
      }
    }
    setHeightVersion((version) => version + 1);
  }, [turnKeys]);

  useEffect(() => () => {
    for (const observer of rowObserversRef.current.values()) observer.disconnect();
    rowObserversRef.current.clear();
  }, []);

  const observeRow = useCallback((turnKey: string, index: number, element: HTMLDivElement | null) => {
    rowObserversRef.current.get(turnKey)?.disconnect();
    rowObserversRef.current.delete(turnKey);
    if (!element) return;

    const updateHeight = () => {
      const height = element.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      const previous = rowHeightsRef.current.get(turnKey);
      if (previous != null && Math.abs(previous - height) < 1) return;
      const turnBottomDistance = turnBottomDistanceFromBottom(turnKeys, rowHeightsRef.current, index);
      rowHeightsRef.current.set(turnKey, height);
      if (previous != null) {
        scrollController?.adjustForMeasuredTurnHeightDelta({
          heightDeltaPx: height - previous,
          turnBottomDistanceFromBottomPx: turnBottomDistance,
          viewportDistanceFromBottomPx: scrollController.getLastScrollDistanceFromBottomPx(),
        });
      }
      setHeightVersion((version) => version + 1);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    rowObserversRef.current.set(turnKey, observer);
  }, [scrollController, turnKeys]);

  const range = useMemo(() => virtualTurnRangeFromBottom({
    turnKeys,
    heights: rowHeightsRef.current,
    distanceFromBottom: scrollState.distanceFromBottom,
    viewportHeight: scrollState.viewportHeight,
  }), [heightVersion, scrollState.distanceFromBottom, scrollState.viewportHeight, turnKeys]);

  return (
    <div className="hc-turn-list" ref={listRef}>
      {range.paddingTop > 0 && (
        <div className="hc-turn-virtual-spacer" style={{ height: range.paddingTop }} aria-hidden="true" />
      )}
      {groups.slice(range.startIndex, range.endIndex).map((group, offset) => {
        const index = range.startIndex + offset;
        const turnKey = turnKeys[index] ?? turnKeyForGroup(group, index);
        return (
          <div
            className="hc-turn-row"
            data-turn-key={turnKey}
            data-content-search-turn-key={turnKey}
            data-last-turn={index === groups.length - 1 || undefined}
            key={turnKey}
            ref={(element) => observeRow(turnKey, index, element)}
          >
            {renderGroup(group, index)}
          </div>
        );
      })}
      {range.paddingBottom > 0 && (
        <div className="hc-turn-virtual-spacer" style={{ height: range.paddingBottom }} aria-hidden="true" />
      )}
    </div>
  );
}

export function turnKeysForGroups(groups: ReturnType<typeof groupUnitsByTurn>): string[] {
  const seenTurnIds = new Map<string, number>();
  return groups.map((group, index) => {
    if (!group.turnId) return turnKeyForGroup(group, index);
    const occurrence = seenTurnIds.get(group.turnId) ?? 0;
    seenTurnIds.set(group.turnId, occurrence + 1);
    return occurrence === 0 ? group.turnId : `${group.turnId}:${occurrence}`;
  });
}

function turnKeyForGroup(group: ReturnType<typeof groupUnitsByTurn>[number], index: number): string {
  return group.turnId ?? `untracked:${index}`;
}

function conversationScrollElement(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;
  return element.closest<HTMLElement>(".hc-thread-scroll-container")
    ?? element.closest<HTMLElement>(".hc-conversation")
    ?? element.parentElement;
}

function RenderUnitsList({
  units,
  renderUnit,
}: {
  units: ConversationRenderUnit[];
  renderUnit: (unit: ConversationRenderUnit, key: string) => ReactNode;
}) {
  return <>{units.map((unit) => renderUnit(unit, unit.key))}</>;
}

export function ConversationUnitView({
  unit,
  isMostRecentTurn = false,
  onOpenFileReference,
  onOpenAutomation,
  memoryCitationRoot,
  onOpenThreadId,
  onOpenConversationThreadId,
  onOpenRemoteTask,
  onMcpAppHostCall,
  onReadMcpResource,
  threadId = null,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onOpenDiff,
  onForkTurn,
  onSubmitTurnFeedback,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
}: {
  unit: ConversationRenderUnit;
  isMostRecentTurn?: boolean;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenAutomation?: (automationId: string) => void;
  memoryCitationRoot?: string | null;
  onOpenThreadId?: OpenThreadHandler;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId?: string | null;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  // codex: `wa(o, { path })` deep-link — when supplied, scope diff view to a single file.
  onOpenDiff?: (filePath?: string) => void;
  onForkTurn?: (turnId: string) => void;
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
}) {
  if (unit.kind === "message") {
    return (
      <MessageUnitView
        unit={unit}
        isMostRecentTurn={isMostRecentTurn}
        onEditLastUserMessage={onEditLastUserMessage}
        onOpenAssistantArtifact={onOpenAssistantArtifact}
        onRevealAssistantEndResource={onRevealAssistantEndResource}
        onForkTurn={onForkTurn}
        onSubmitTurnFeedback={onSubmitTurnFeedback}
        threadId={threadId}
        onOpenThreadId={onOpenThreadId}
        onOpenFileReference={onOpenFileReference}
        onOpenAutomation={onOpenAutomation}
        onOpenDiff={onOpenDiff}
        onPatchAction={onPatchAction}
        patchActionState={patchActionState}
        patchActionInFlight={patchActionInFlight}
        memoryCitationRoot={memoryCitationRoot}
      />
    );
  }
  if (unit.kind === "threadItem") {
    return (
      <ThreadItemView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
        onSubmitTurnFeedback={onSubmitTurnFeedback}
      />
    );
  }
  if (unit.kind === "dynamicToolCallGroup") {
    return <DynamicToolCallGroupView unit={unit} />;
  }
  if (unit.kind === "toolActivity") {
    return (
      <ToolActivityView
        unit={unit}
        onOpenFileReference={onOpenFileReference}
        onOpenThreadId={onOpenThreadId}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (unit.kind === "generatedImageGallery") {
    return (
      <GeneratedImageGalleryOutput
        unit={unit}
        onForkTurn={onForkTurn}
        onSubmitTurnFeedback={onSubmitTurnFeedback}
        threadId={threadId}
      />
    );
  }
  if (unit.kind === "assistantEndResources") {
    return (
      <AssistantEndResourceCards
        resources={unit.resources}
        onOpenArtifact={onOpenAssistantArtifact}
        onRevealResource={onRevealAssistantEndResource}
      />
    );
  }
  return (
    <ToolBlock
      contentSearchUnitKey={unit.key}
      details={unit.details}
      format={unit.format}
      inProgress={isItemInProgress(unit.item)}
      item={unit.item}
      itemIds={unit.item.id}
      label={unit.label}
      onOpenDiff={onOpenDiff}
      onOpenConversationThreadId={onOpenConversationThreadId}
      onOpenFileReference={onOpenFileReference}
      onOpenRemoteTask={onOpenRemoteTask}
      onPatchAction={onPatchAction}
      patchActionState={patchActionState}
      patchActionInFlight={patchActionInFlight}
      tone={unit.tone}
      value={unit.text}
    />
  );
}

function GeneratedImageGalleryOutput({
  unit,
  onForkTurn,
  onSubmitTurnFeedback,
  threadId,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "generatedImageGallery" }>;
  onForkTurn?: (turnId: string) => void;
  onSubmitTurnFeedback?: SubmitTurnRatingEvent;
  threadId?: string | null;
}) {
  const canFork = Boolean(onForkTurn && unit.turnId && !unit.hasPending);
  return (
    <div className="hc-message assistant hc-generated-image-output" data-role="assistant">
      <GeneratedImageGallery images={unit.images} hasPending={unit.hasPending} />
      <MessageActionRow copyText="" hasActionChildren={canFork}>
        {canFork && unit.turnId && (
          <IconActionButton
            ariaLabel="Fork from this point"
            title="Fork"
            onClick={() => onForkTurn?.(unit.turnId ?? "")}
          >
            <GitFork size={13} />
          </IconActionButton>
        )}
      </MessageActionRow>
    </div>
  );
}
