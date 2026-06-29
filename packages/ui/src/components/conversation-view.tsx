import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ConversationRenderUnit, RailEntry } from "../state/render-groups";
import type { PatchAction, PatchActionState } from "./event-unit";
import type { FileReference } from "./file-reference-types";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";
import type { McpAppHostCallHandler, ReadMcpResourceHandler } from "./tool-activity-detail";
import {
  VirtualizedTurnList,
  type ScrollToUnitKeyRef,
} from "./conversation-virtual-turn-list";
import { groupUnitsByTurn } from "../state/turn-collapse-projection";
import { TurnCollapseFrame } from "./turn-collapse";
import { ConversationUnitView } from "./conversation-unit-view";
import type { OpenGeneratedImageGalleryPreview } from "./generated-image-gallery";
import {
  ThreadUserMessageNavigationRail,
  threadUserMessageNavigationItems,
} from "./thread-user-message-navigation-rail";

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
export {
  turnKeysForGroups,
  virtualTurnRange,
  virtualTurnRangeFromBottom,
} from "./conversation-virtual-turn-list";
export {
  THREAD_USER_MESSAGE_NAVIGATION_MIN_ITEMS,
  ThreadUserMessageNavigationRail,
  threadUserMessageNavigationItems,
} from "./thread-user-message-navigation-rail";
export { ConversationUnitView } from "./conversation-unit-view";

export interface ConversationViewProps {
  units: ConversationRenderUnit[];
  emptyState?: ReactNode;
  /**
   * Active conversation id used to scope page-local per-turn collapse state.
   * Mirrors Codex Desktop's `(conversationId, turnId)` keyed `OT/kT` state
   * without persisting stale expanded/collapsed choices across page reloads.
   */
  threadId?: string | null;
  activePlanSidePanelKey?: string | null;
  onEditLastUserMessage?: (turnId: string, message: string) => void | Promise<void>;
  onOpenAssistantArtifact?: (entry: RailEntry) => void;
  onRevealAssistantEndResource?: (entry: RailEntry) => void;
  onOpenPlan?: (entry: RailEntry) => void;
  // codex: `wa(o, { path })` deep-link — when supplied, scope diff view to a single file.
  onOpenDiff?: (filePath?: string) => void;
  onOpenGeneratedImagePreview?: OpenGeneratedImageGalleryPreview;
  onForkTurn?: (turnId: string) => void;
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
   * shell so ForgeApp can call the Tauri host and surface the
   * `UnifiedDiffFailureDialog` on partial / failed apply.
   */
  onPatchAction?: PatchActionHandler;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
  /**
   * Late-binding imperative jump for ⌘F: the virtualized turn list assigns a
   * `(unitKey) => boolean` here so thread-find can scroll to matches whose
   * turn is outside the rendered window (Desktop's find navigates via the
   * virtual list, not the DOM). Returns false for unknown unit keys.
   */
  scrollToUnitKeyRef?: ScrollToUnitKeyRef;
}

export type PatchActionHandler = (action: PatchAction, diff: string) => void;

export function ConversationView({
  units,
  emptyState = null,
  threadId = null,
  activePlanSidePanelKey = null,
  onEditLastUserMessage,
  onOpenAssistantArtifact,
  onRevealAssistantEndResource,
  onOpenPlan,
  onOpenDiff,
  onOpenGeneratedImagePreview,
  onForkTurn,
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
  scrollToUnitKeyRef,
}: ConversationViewProps) {
  const groups = useMemo(() => groupUnitsByTurn(units), [units]);
  const deferredNavigationUnits = useDeferredValue(units);
  const userMessageNavigationItems = useMemo(
    () => threadUserMessageNavigationItems(deferredNavigationUnits),
    [deferredNavigationUnits],
  );
  const userMessageNavigationScrollToUnitRef = useRef<((unitKey: string) => boolean) | null>(null);
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
      activePlanSidePanelKey={activePlanSidePanelKey}
      onEditLastUserMessage={onEditLastUserMessage}
      onOpenAssistantArtifact={onOpenAssistantArtifact}
      onRevealAssistantEndResource={onRevealAssistantEndResource}
      onOpenPlan={onOpenPlan}
      onOpenDiff={onOpenDiff}
      onOpenGeneratedImagePreview={onOpenGeneratedImagePreview}
      onForkTurn={onForkTurn}
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
    <>
      <ThreadUserMessageNavigationRail
        items={userMessageNavigationItems}
        scrollToUnitKeyRef={userMessageNavigationScrollToUnitRef}
      />
      <VirtualizedTurnList
        additionalScrollToUnitKeyRef={userMessageNavigationScrollToUnitRef}
        groups={groups}
        scrollToUnitKeyRef={scrollToUnitKeyRef}
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
    </>
  );
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
