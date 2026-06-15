import { useEffect, useState } from "react";
import { type ConversationRenderUnit } from "../state/render-groups";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { FileReference } from "./file-reference-types";
import { useForgeIntl } from "./i18n-provider";
import type { OpenThreadHandler } from "./open-thread";
import {
  ToolActivityDetail,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./tool-activity-detail";
import {
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS,
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS,
  RUNNING_COMMAND_ELAPSED_STYLE,
  ToolActivityChevronIcon,
  ToolActivityDiffStats,
  ToolActivitySummaryLabel,
  desktopCollapsedToolActivityChevronClassName,
} from "./tool-activity-summary";
import { workedForAggregateRows } from "./tool-activity-worked-for-aggregate";
import {
  initialToolActivityViewState,
  isToolActivityExpandable,
  shouldShowToolActivityInlineDetail,
  toolActivityDetailItems,
  workedForExpandedDetailItems,
  type ToolActivityViewState,
} from "./tool-activity-generic-view-model";
import {
  useRunningCommandElapsed,
  useToolActivitySummaryLabel,
} from "./tool-activity-timing";

export {
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS,
  DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS,
  desktopCollapsedToolActivityChevronClassName,
} from "./tool-activity-summary";
export {
  initialToolActivityExpanded,
  initialToolActivityViewState,
  isToolActivityExpandable,
  shouldShowToolActivityInlineDetail,
  toolActivityDetailItems,
  workedForExpandedDetailItems,
} from "./tool-activity-generic-view-model";
export { useToolActivitySummaryLabel } from "./tool-activity-timing";
export type { ToolActivityViewState } from "./tool-activity-generic-view-model";

export function GenericToolActivityView({
  unit,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenFileReference,
  onOpenThreadId,
  threadId,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  threadId: string | null;
}) {
  const defaultViewState = initialToolActivityViewState(unit);
  const [viewState, setViewState] = useState<ToolActivityViewState>(defaultViewState);
  const isWorkedFor = unit.summary.groupType === "worked-for";
  const isMultiAgent = unit.summary.groupType === "multi-agent-group";
  const isCollapsedToolActivity = unit.summary.groupType === "collapsed-tool-activity";
  const detailItems = toolActivityDetailItems(unit);
  const hasDetails = detailItems.length > 0;
  const canExpand = hasDetails && isToolActivityExpandable(unit);
  const summaryLabel = useToolActivitySummaryLabel(unit);
  const runningCommandElapsed = useRunningCommandElapsed(unit);
  const { formatMessage } = useForgeIntl();
  const detail = unit.summary.details.find((value) => value !== unit.summary.label);
  const expanded = viewState !== "collapsed";
  const showInlineDetail = shouldShowToolActivityInlineDetail(unit, detail);
  const summaryClassName = isCollapsedToolActivity
    ? DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS
    : "hc-tool-summary";
  const summaryLabelClassName = isCollapsedToolActivity
    ? DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS
    : "hc-tool-summary-label";
  const summaryChevronClassName = isCollapsedToolActivity
    ? desktopCollapsedToolActivityChevronClassName(expanded)
    : expanded
      ? "is-open"
      : "";
  useEffect(() => {
    setViewState(defaultViewState);
  }, [defaultViewState, unit.key]);
  return (
    <article
      className={`hc-tool-block activity ${unit.summary.inProgress ? "is-running" : ""}`}
      data-content-search-unit-key={unit.key}
      data-group-type={unit.summary.groupType}
      data-item-ids={unit.items.map((item) => item.id).join(" ")}
      data-view-state={viewState}
    >
      {canExpand ? (
        <button
          aria-expanded={expanded}
          className={summaryClassName}
          data-testid={isMultiAgent ? "multi-agent-action-header" : undefined}
          data-view-state={viewState}
          type="button"
          onClick={() => setViewState((value) => nextToolActivityViewState(value))}
        >
          <ToolActivitySummaryLabel
            icon={unit.summary.icon}
            label={summaryLabel}
            labelParts={unit.summary.labelParts}
            className={summaryLabelClassName}
            compact={isCollapsedToolActivity}
          />
          {runningCommandElapsed !== null && (
            <span className="hc-tool-summary-elapsed" style={RUNNING_COMMAND_ELAPSED_STYLE}>
              {formatMessage(
                { id: "toolSummaryForCmd.runningTimer", defaultMessage: " for {elapsed}" },
                { elapsed: runningCommandElapsed },
              )}
            </span>
          )}
          {unit.summary.activeDiffStats && (
            <ToolActivityDiffStats
              added={unit.summary.activeDiffStats.linesAdded}
              removed={unit.summary.activeDiffStats.linesRemoved}
            />
          )}
          {showInlineDetail && <small>{detail}</small>}
          <ToolActivityChevronIcon className={summaryChevronClassName} size={14} />
        </button>
      ) : (
        <div
          className={summaryClassName}
          data-testid={isMultiAgent ? "multi-agent-action-header" : undefined}
        >
          <ToolActivitySummaryLabel
            icon={unit.summary.icon}
            label={summaryLabel}
            labelParts={unit.summary.labelParts}
            className={summaryLabelClassName}
            compact={isCollapsedToolActivity}
          />
          {runningCommandElapsed !== null && (
            <span className="hc-tool-summary-elapsed" style={RUNNING_COMMAND_ELAPSED_STYLE}>
              {formatMessage(
                { id: "toolSummaryForCmd.runningTimer", defaultMessage: " for {elapsed}" },
                { elapsed: runningCommandElapsed },
              )}
            </span>
          )}
          {unit.summary.activeDiffStats && (
            <ToolActivityDiffStats
              added={unit.summary.activeDiffStats.linesAdded}
              removed={unit.summary.activeDiffStats.linesRemoved}
            />
          )}
          {showInlineDetail && <small>{detail}</small>}
        </div>
      )}
      {isWorkedFor && <div className="hc-worked-for-divider" />}
      {hasDetails && (
        <AnimatedDisclosure
          className="hc-tool-details-motion"
          dataViewState={viewState}
          innerClassName="hc-tool-details"
          open={expanded}
          testId={toolActivityBodyTestId(unit)}
        >
          {/*
           * Working 聚合行（仅 worked-for 单元）— 把 summary.counts 转成
           * "Ran N commands" / "Created N files" / "Explored {N files, M searches, K lists}"
           * 之类文案。进行中用小写动词（running/created/editing/...），完成用大写动词
           * （Ran/Created/Edited/...）。
           */}
          {isWorkedFor && (() => {
            /*
             * CODEX-REF: local-conversation-thread-*.js — the worked-for aggregate
             * pushes segments 到数组 `a`，最后 `return t.formatList(a,
             * {type:'unit'})` 用 react-intl 的 Intl.ListFormat 把数组 join 成
             * **单行字符串**。leading segment 大写动词（"Created N files"），后续
             * segment 小写动词（"edited M files"）。Forge 严格对齐：从原来的
             * `<ul><li>per row</li></ul>` 多行列表改为单行 `<div>` 含 formatList
             * join 后的文本。Intl.ListFormat type:"unit" 在 en/long style 用 ", "
             * 分隔，等价于 Codex 行为。
             */
            const rows = workedForAggregateRows(unit);
            if (rows.length === 0) return null;
            /*
             * CODEX-REF: Codex `Mp` 用两套 i18n key 区分 leading / compact：
             *   localConversation.toolActivitySummary.created.leading
             *     → "{count, plural, one {Created # file} other {Created # files}}"  (大写动词)
             *   localConversation.toolActivitySummary.created
             *     → "{count, plural, one {created # file} other {created # files}}"  (小写动词)
             * 按列表位置 `a.length === 0 ? leading : compact` 选择：第 0 条用 leading
             * 描述符，其余用 compact，再 formatMessage（ICU 复数 + ZH 词典）。
             */
            const segments = rows.map((row, index) => {
              const descriptor = index === 0 ? row.leading : row.compact;
              return formatMessage(
                { id: descriptor.id, defaultMessage: descriptor.defaultMessage },
                descriptor.values,
              );
            });
            const joined = typeof Intl !== "undefined" && typeof Intl.ListFormat === "function"
              ? new Intl.ListFormat(undefined, { type: "unit", style: "long" }).format(segments)
              : segments.join(", ");
            return <div className="hc-worked-for-aggregate">{joined}</div>;
          })()}
          {(isWorkedFor ? workedForExpandedDetailItems(unit) : detailItems).map((item) => (
            <ToolActivityDetail
              item={item}
              key={item.id}
              onMcpAppHostCall={onMcpAppHostCall}
              onOpenFileReference={onOpenFileReference}
              onOpenThreadId={onOpenThreadId}
              onReadMcpResource={onReadMcpResource}
              threadId={threadId}
            />
          ))}
        </AnimatedDisclosure>
      )}
    </article>
  );
}

function toolActivityBodyTestId(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): string | undefined {
  if (unit.summary.groupType === "multi-agent-group") return "multi-agent-action-rows";
  if (unit.summary.groupType === "exploration") return "exploration-accordion-body";
  if (unit.summary.groupType === "pending-mcp-tool-calls") return "pending-mcp-tool-calls-body";
  return undefined;
}

function nextToolActivityViewState(current: ToolActivityViewState): ToolActivityViewState {
  if (current === "preview") return "expanded";
  if (current === "expanded") return "collapsed";
  return "expanded";
}
