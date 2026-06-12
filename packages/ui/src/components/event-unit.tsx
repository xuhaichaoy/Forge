import { ChevronRight } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { type ConversationRenderUnit } from "../state/render-groups";
import { itemText } from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { FileReference } from "./file-reference-types";
import { Markdownish } from "./message-markdown-renderer";
import { MultiAgentActivityView } from "./multi-agent-activity";
import { PendingMcpToolCallsActivityView } from "./pending-mcp-tool-calls-activity";
import type { McpAppHostCallHandler, ReadMcpResourceHandler } from "./tool-activity-detail";
import type { OpenThreadHandler } from "./open-thread";
import {
  GenericToolActivityView,
  useToolActivitySummaryLabel,
} from "./tool-activity-generic-view";
export { workedForAggregateRows } from "./tool-activity-worked-for-aggregate";
export type { WorkedForAggregateRow } from "./tool-activity-worked-for-aggregate";
export { ToolBlock } from "./tool-block";
export {
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS,
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS,
  desktopCollapsedToolActivityChevronClassName,
  initialToolActivityExpanded,
  initialToolActivityViewState,
  isToolActivityExpandable,
  shouldShowToolActivityInlineDetail,
  toolActivityDetailItems,
  workedForExpandedDetailItems,
} from "./tool-activity-generic-view";
export type { ToolActivityViewState } from "./tool-activity-generic-view";

interface ToolActivityViewProps {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onOpenFileReference?: (reference: FileReference) => void;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenThreadId?: OpenThreadHandler;
  threadId?: string | null;
}

function ToolActivityViewInner({
  unit,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenFileReference,
  onOpenThreadId,
  threadId = null,
}: ToolActivityViewProps) {
  /*
   * Reasoning 单元渲染（恢复 DEVELOPMENT.md:116 规则）。
   *
   * 规则原文："Standalone reasoning items do not render as raw rows unless they
   * are the synthetic thinking placeholder. Reasoning is folded into surrounding
   * exploration/mergeable activity or skipped."
   *
   * 真实 reasoning ThreadItem 不渲染独立行；只有合成的 thinking-placeholder
   * （由 desktopThinkingPlaceholderItem 注入）会渲染 ReasoningActivityView。
   */
  if (unit.summary.groupType === "reasoning") {
    const hasThinkingPlaceholder = unit.items.some((item) =>
      (item as Record<string, unknown>)._syntheticKind === "thinking-placeholder",
    );
    if (!hasThinkingPlaceholder) return null;
    return <ReasoningActivityView unit={unit} />;
  }
  if (unit.summary.groupType === "multi-agent-group") {
    return (
      <MultiAgentActivityView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onOpenThreadId={onOpenThreadId}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (unit.summary.groupType === "pending-mcp-tool-calls") {
    return (
      <PendingMcpToolCallsActivityView
        unit={unit}
        onMcpAppHostCall={onMcpAppHostCall}
        onOpenThreadId={onOpenThreadId}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }

  return (
    <GenericToolActivityView
      unit={unit}
      onMcpAppHostCall={onMcpAppHostCall}
      onReadMcpResource={onReadMcpResource}
      onOpenFileReference={onOpenFileReference}
      onOpenThreadId={onOpenThreadId}
      threadId={threadId}
    />
  );
}

/*
 * Memoize so non-streaming process rows skip re-render on every streaming-token
 * projection. The unit reference itself changes every projection (the projection
 * always rebuilds), so the default shallow check would never skip; the
 * comparator below uses VALUE comparison on the bits that actually drive the
 * rendered DOM (summary fields, items array identity/length, and the small set
 * of handler props). Stable keys (set by `toolActivityRenderKey`) plus this
 * memo keep the rendered DOM (and any CSS animations attached to it) untouched
 * during the streaming pass, which removes a major source of perceived flicker
 * below the streaming model output.
 */
export const ToolActivityView = memo(ToolActivityViewInner, (prev, next) => {
  if (
    prev.onMcpAppHostCall !== next.onMcpAppHostCall
    || prev.onOpenFileReference !== next.onOpenFileReference
    || prev.onReadMcpResource !== next.onReadMcpResource
    || prev.onOpenThreadId !== next.onOpenThreadId
    || prev.threadId !== next.threadId
  ) {
    return false;
  }
  if (prev.unit === next.unit) return true;
  const a = prev.unit;
  const b = next.unit;
  if (a.key !== b.key) return false;
  if (a.kind !== b.kind) return false;
  if (a.summary.label !== b.summary.label) return false;
  if (a.summary.groupType !== b.summary.groupType) return false;
  if (a.summary.inProgress !== b.summary.inProgress) return false;
  if (a.summary.icon !== b.summary.icon) return false;
  if ((a.summary.defaultExpanded ?? null) !== (b.summary.defaultExpanded ?? null)) return false;
  if ((a.summary.totalDurationMs ?? 0) !== (b.summary.totalDurationMs ?? 0)) return false;
  if (a.items.length !== b.items.length) return false;
  for (let i = 0; i < a.items.length; i += 1) {
    if (a.items[i] !== b.items[i]) return false;
  }
  return true;
});

export type { TurnDiffFileViewModel, TurnDiffViewModel } from "./turn-diff-view-model";
export { TurnDiffBlock } from "./turn-diff-block";
export type { PatchAction, PatchActionState } from "./turn-diff-block";
export {
  formatTurnDiffFileCount,
  formatTurnDiffFilesChanged,
  turnDiffHeaderStatsVisible,
  turnDiffViewModel,
} from "./turn-diff-view-model";

/*
 * Reasoning 渲染 — 仅供 synthetic thinking-placeholder 使用。
 *
 * DEVELOPMENT.md:116 规则：standalone reasoning items 不直接渲染为 raw row。
 * 真实 reasoning 内容被 split-items-into-render-groups 折进 exploration / mergeable
 * activity 或丢弃；本 view 只接 synthetic thinking-placeholder（live "Thinking" 占位）。
 *
 * 用 reasoningActivityBody（兼容路径）拼接 placeholder 文本作为可展开 body；
 * inProgress 时显示"Thinking"label，完成态不应该出现（thinking-placeholder 只在
 * turn in_progress 时存在）。
 */
function ReasoningActivityView({
  unit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
}) {
  const body = reasoningActivityBody(unit);
  const canToggle = body.length > 0 && !unit.summary.inProgress;
  const [expanded, setExpanded] = useState(unit.summary.inProgress && body.length > 0);
  const summaryLabel = useToolActivitySummaryLabel(unit);

  useEffect(() => {
    setExpanded(unit.summary.inProgress && body.length > 0);
  }, [body, unit.key, unit.summary.inProgress]);

  const summaryContent = (
    <>
      <span className="hc-tool-summary-label">{summaryLabel}</span>
      {canToggle && <ChevronRight className={expanded ? "is-open" : ""} size={14} />}
    </>
  );

  return (
    <article
      className={`hc-tool-block activity ${unit.summary.inProgress ? "is-running" : ""}`}
      data-content-search-unit-key={unit.key}
      data-group-type={unit.summary.groupType}
      data-item-ids={unit.items.map((item) => item.id).join(" ")}
      data-view-state={expanded ? "expanded" : "collapsed"}
    >
      {canToggle ? (
        <button
          aria-expanded={expanded}
          className="hc-tool-summary hc-reasoning-summary"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {summaryContent}
        </button>
      ) : (
        <div className="hc-tool-summary hc-reasoning-summary">
          {summaryContent}
        </div>
      )}
      {body.length > 0 && (
        <AnimatedDisclosure
          className="hc-tool-details-motion"
          innerClassName="hc-tool-details hc-reasoning-details"
          open={expanded}
        >
          <Markdownish text={body} />
        </AnimatedDisclosure>
      )}
    </article>
  );
}

export function reasoningActivityBody(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): string {
  if (unit.summary.groupType !== "reasoning") return "";
  return unit.items
    .map((item) => stripReasoningActivityHeading(itemText(item)))
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function stripReasoningActivityHeading(value: string): string {
  const trimmed = value.trimStart();
  const boldHeading = /^\*\*([^\n]*?)\*\*\s*/u.exec(trimmed);
  if (boldHeading) return trimmed.slice(boldHeading[0].length);
  const markdownHeading = /^#{1,6}[ \t]+[^\r\n]+(?:\r?\n)+/u.exec(trimmed);
  if (markdownHeading) return trimmed.slice(markdownHeading[0].length).trimStart();
  return trimmed.startsWith("**") ? "" : trimmed;
}
