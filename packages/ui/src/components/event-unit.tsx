import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Clock,
  FileSearch,
  FileText,
  GitFork,
  Globe2,
  ListTodo,
  LoaderCircle,
  Network,
  PencilLine,
  ShieldAlert,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useState, type ReactNode } from "react";
import { stringField } from "../lib/format";
import { formatMessage as formatMessageModule, type I18nValues } from "../state/i18n";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";

type FormatMessage = HiCodexIntlContextValue["formatMessage"];
import {
  type ConversationRenderUnit,
  type EventFormat,
  type EventTone,
  type ToolActivityIcon,
} from "../state/render-groups";
import {
  humanReadableToolLabel,
  isItemInProgress,
  itemText,
  itemType,
  mcpAppResourceUri,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
} from "../state/thread-item-fields";
import { isRunningSkillDefinitionRead, joinConjunction } from "../state/tool-activity-grouping";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { FileReference } from "./file-reference-types";
import { CodeSnippet, Markdownish } from "./message-unit";
import {
  ToolActivityDetail,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./tool-activity-detail";
import type { OpenRemoteTaskHandler, OpenThreadHandler } from "./open-thread";

type ToolActivityViewState = "collapsed" | "expanded" | "preview";

export const DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS =
  "hc-tool-summary group/collapsed-tool-activity group/summary inline-flex w-fit max-w-full min-w-0 cursor-interaction items-center self-start gap-1 border-0 bg-transparent px-0 py-0 text-left shadow-none hover:bg-transparent";
export const DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS =
  "hc-tool-summary-label block min-w-0 max-w-full shrink overflow-hidden truncate [mask-image:linear-gradient(to_right,black_calc(100%_-_0.25rem),transparent)] [mask-repeat:no-repeat] pr-1";

export function desktopCollapsedToolActivityChevronClassName(expanded: boolean): string {
  return `inline-chevron flex-shrink-0 text-token-input-placeholder-foreground ${
    expanded ? "is-open opacity-100" : "opacity-0 group-hover/summary:opacity-100"
  }`;
}

/**
 * Codex's running-command elapsed span is `whitespace-nowrap text-size-chat
 * tabular-nums`. The shared stylesheet is out of this edit's scope, so the
 * geometry-critical bits (non-wrapping + tabular figures so the ticking second
 * doesn't shift width) are applied inline; `hc-tool-summary-elapsed` stays as a
 * styling hook.
 */
const RUNNING_COMMAND_ELAPSED_STYLE = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

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

function PendingMcpToolCallsActivityView({
  unit,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenThreadId,
  threadId,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenThreadId?: OpenThreadHandler;
  threadId: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [viewState, setViewState] = useState<ToolActivityViewState>("collapsed");
  const detailItems = toolActivityDetailItems(unit);
  const expanded = viewState !== "collapsed";
  const activeItem = pendingMcpHeaderItem(unit.items);
  const fallbackItem = unit.items.at(-1) ?? null;
  const headerItem = activeItem ?? fallbackItem;
  const headerLabel = activeItem
    ? pendingMcpActiveLabel(activeItem)
    : // CODEX-REF local-conversation-thread-CEeZyOcp.js
      //   id:`localConversationTurn.pendingMcpToolCalls.completedHeader`,
      //   defaultMessage:`Used {apps}`
      formatMessage(
        {
          id: "localConversationTurn.pendingMcpToolCalls.completedHeader",
          defaultMessage: "Used {apps}",
        },
        { apps: pendingMcpSourceList(unit.items) },
      );

  useEffect(() => {
    setViewState("collapsed");
  }, [unit.key]);

  return (
    <article
      className={`hc-tool-block activity hc-pending-mcp-tool-calls ${unit.summary.inProgress ? "is-running" : ""}`}
      data-content-search-unit-key={unit.key}
      data-group-type={unit.summary.groupType}
      data-item-ids={unit.items.map((item) => item.id).join(" ")}
      data-view-state={viewState}
    >
      <button
        aria-expanded={expanded}
        className="hc-pending-mcp-tool-calls-header"
        type="button"
        onClick={() => setViewState((value) => nextToolActivityViewState(value))}
      >
        {headerItem && (
          <span className="hc-pending-mcp-tool-calls-source-icon" aria-hidden>
            <Network size={12} />
          </span>
        )}
        <span className={`hc-pending-mcp-tool-calls-label ${activeItem ? "hc-status-event-shimmer" : ""}`}>
          {headerLabel}
        </span>
        <ChevronRight className={`hc-pending-mcp-tool-calls-chevron ${expanded ? "is-open" : ""}`} size={14} />
      </button>
      <div
        aria-hidden={!expanded || undefined}
        className="hc-pending-mcp-tool-calls-body"
        data-testid="pending-mcp-tool-calls-body"
      >
        <div className="hc-pending-mcp-tool-calls-body-inner">
          {detailItems.map((item) => (
            <ToolActivityDetail
              item={item}
              key={item.id}
              onMcpAppHostCall={onMcpAppHostCall}
              onOpenThreadId={onOpenThreadId}
              onReadMcpResource={onReadMcpResource}
              threadId={threadId}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function pendingMcpHeaderItem(items: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && isItemInProgress(item)) return item;
  }
  return null;
}

function pendingMcpActiveLabel(item: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"][number]): string {
  // Codex's in-progress pending-MCP header (NS with completed:false) renders the
  // human-readable, sentence-cased tool name — never a "Calling" verb prefix.
  return humanReadableToolLabel(mcpToolName(item).trim() || "tool");
}

function pendingMcpSourceList(items: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"]): string {
  const sources: string[] = [];
  for (const item of items) {
    const server = mcpServerName(item);
    const source = mcpSourceTitle(server);
    if (!sources.includes(source)) sources.push(source);
  }
  if (sources.length === 0) return "MCP";
  // Codex builds the `{apps}` value of `pendingMcpToolCalls.completedHeader`
  // ("Used {apps}") with Intl.ListFormat type:"conjunction" — Oxford-comma,
  // localized — so reuse the shared joinConjunction helper here.
  return joinConjunction(sources);
}

function MultiAgentActivityView({
  unit,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenThreadId,
  threadId,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenThreadId?: OpenThreadHandler;
  threadId: string | null;
}) {
  const defaultViewState = initialToolActivityViewState(unit);
  const [viewState, setViewState] = useState<ToolActivityViewState>(defaultViewState);
  const detailItems = toolActivityDetailItems(unit);
  const expanded = unit.summary.inProgress || viewState !== "collapsed";
  const summaryLabel = useToolActivitySummaryLabel(unit);

  useEffect(() => {
    setViewState(defaultViewState);
  }, [defaultViewState, unit.key]);

  return (
    <article
      className={`hc-tool-block activity hc-multi-agent-action ${unit.summary.inProgress ? "is-running" : ""}`}
      data-content-search-unit-key={unit.key}
      data-group-type={unit.summary.groupType}
      data-item-ids={unit.items.map((item) => item.id).join(" ")}
      data-view-state={expanded ? "expanded" : "collapsed"}
    >
      <button
        aria-expanded={expanded}
        className="hc-multi-agent-action-header"
        data-testid="multi-agent-action-header"
        type="button"
        onClick={() => {
          if (!unit.summary.inProgress) setViewState((value) => nextToolActivityViewState(value));
        }}
      >
        <span className={`hc-multi-agent-action-title ${unit.summary.inProgress ? "hc-status-event-shimmer" : ""}`}>
          {summaryLabel}
        </span>
        <ChevronRight className={`hc-multi-agent-action-chevron ${expanded ? "is-open" : ""}`} size={14} />
      </button>
      {detailItems.length > 0 && (
        <AnimatedDisclosure
          className="hc-tool-details-motion"
          dataViewState={expanded ? "expanded" : "collapsed"}
          innerClassName="hc-tool-details"
          open={expanded}
          testId="multi-agent-action-rows"
        >
          {detailItems.map((item) => (
            <ToolActivityDetail
              item={item}
              key={item.id}
              onMcpAppHostCall={onMcpAppHostCall}
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

function GenericToolActivityView({
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
  const { formatMessage } = useHiCodexIntl();
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
          <ChevronRight className={summaryChevronClassName} size={14} />
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
             * segment 小写动词（"edited M files"）。HiCodex 严格对齐：从原来的
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

/*
 * 把 ToolActivitySummary.counts 转换成"聚合行"。每行携带 Codex 的 leading / compact
 * 两套 i18n 描述符（CODEX-REF local-conversation-thread-CEeZyOcp.js
 * `localConversation.toolActivitySummary.*`，由 `a.length===0 ? leading : compact`
 * 按列表位置选择，leading 用大写动词、compact 用小写动词）。渲染处按 index 选
 * leading/compact 并 formatMessage，ICU 复数 + ZH 词典负责本地化。
 */
interface WorkedForRowDescriptor {
  id: string;
  defaultMessage: string;
  values?: I18nValues;
}

export interface WorkedForAggregateRow {
  key: string;
  leading: WorkedForRowDescriptor;
  compact: WorkedForRowDescriptor;
}

// 大写/小写仅靠 .leading 后缀切换 id（defaultMessage 与 bundle 逐字一致）。
function aggregateRow(
  key: string,
  baseId: string,
  leadingDefault: string,
  compactDefault: string,
  values?: I18nValues,
): WorkedForAggregateRow {
  return {
    key,
    leading: { id: `${baseId}.leading`, defaultMessage: leadingDefault, values },
    compact: { id: baseId, defaultMessage: compactDefault, values },
  };
}

export function workedForAggregateRows(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): WorkedForAggregateRow[] {
  const { counts, inProgress } = unit.summary;
  const rows: WorkedForAggregateRow[] = [];

  // 命令执行
  const runningCommands = counts.runningCommands ?? 0;
  const webSearchCommands = counts.webSearchCommands ?? 0;
  const runningWebSearchCommands = counts.runningWebSearchCommands ?? 0;
  const ordinaryCommands = Math.max(counts.commands - webSearchCommands, 0);
  const runningOrdinaryCommands = Math.max(runningCommands - runningWebSearchCommands, 0);
  const completedCommands = Math.max(ordinaryCommands - runningOrdinaryCommands, 0);
  const completedWebSearchCommands = Math.max(webSearchCommands - runningWebSearchCommands, 0);
  if (inProgress && runningOrdinaryCommands > 0) {
    rows.push(aggregateRow(
      "commands.running",
      "localConversation.toolActivitySummary.commands.running",
      "{count, plural, one {Running # command} other {Running # commands}}",
      "{count, plural, one {running # command} other {running # commands}}",
      { count: runningOrdinaryCommands },
    ));
  }
  if (completedWebSearchCommands > 0) {
    rows.push(aggregateRow(
      "webSearchCommands.completed",
      "localConversation.toolActivitySummary.webSearchCommands.searched",
      "{count, plural, one {Searched web} other {Searched web # times}}",
      "{count, plural, one {searched web} other {searched web # times}}",
      { count: completedWebSearchCommands },
    ));
  }
  if (completedCommands > 0) {
    rows.push(aggregateRow(
      "commands.completed",
      "localConversation.toolActivitySummary.commands",
      "{count, plural, one {Ran # command} other {Ran # commands}}",
      "{count, plural, one {ran # command} other {ran # commands}}",
      { count: completedCommands },
    ));
  }
  if (inProgress && runningWebSearchCommands > 0) {
    rows.push(aggregateRow(
      "webSearchCommands.running",
      "localConversation.toolActivitySummary.webSearchCommands.searching",
      "Searching the web",
      "searching the web",
    ));
  }

  // 文件创建
  const runningCreated = counts.runningCreatedFiles ?? 0;
  const completedCreated = Math.max(counts.createdFiles - runningCreated, 0);
  if (inProgress && runningCreated > 0) {
    rows.push(aggregateRow(
      "created.running",
      "localConversation.toolActivitySummary.creating",
      "{count, plural, one {Creating # file} other {Creating # files}}",
      "{count, plural, one {creating # file} other {creating # files}}",
      { count: runningCreated },
    ));
  }
  if (completedCreated > 0) {
    rows.push(aggregateRow(
      "created.completed",
      "localConversation.toolActivitySummary.created",
      "{count, plural, one {Created # file} other {Created # files}}",
      "{count, plural, one {created # file} other {created # files}}",
      { count: completedCreated },
    ));
  }

  // 文件编辑
  const runningEdited = counts.runningEditedFiles ?? 0;
  const completedEdited = Math.max(counts.editedFiles - runningEdited, 0);
  if (inProgress && runningEdited > 0) {
    rows.push(aggregateRow(
      "edited.running",
      "localConversation.toolActivitySummary.editing",
      "{count, plural, one {Editing # file} other {Editing # files}}",
      "{count, plural, one {editing # file} other {editing # files}}",
      { count: runningEdited },
    ));
  }
  if (completedEdited > 0) {
    rows.push(aggregateRow(
      "edited.completed",
      "localConversation.toolActivitySummary.edited",
      "{count, plural, one {Edited # file} other {Edited # files}}",
      "{count, plural, one {edited # file} other {edited # files}}",
      { count: completedEdited },
    ));
  }

  // 文件删除
  const runningDeleted = counts.runningDeletedFiles ?? 0;
  const completedDeleted = Math.max(counts.deletedFiles - runningDeleted, 0);
  if (inProgress && runningDeleted > 0) {
    rows.push(aggregateRow(
      "deleted.running",
      "localConversation.toolActivitySummary.deleting",
      "{count, plural, one {Deleting # file} other {Deleting # files}}",
      "{count, plural, one {deleting # file} other {deleting # files}}",
      { count: runningDeleted },
    ));
  }
  if (completedDeleted > 0) {
    rows.push(aggregateRow(
      "deleted.completed",
      "localConversation.toolActivitySummary.deleted",
      "{count, plural, one {Deleted # file} other {Deleted # files}}",
      "{count, plural, one {deleted # file} other {deleted # files}}",
      { count: completedDeleted },
    ));
  }

  // Exploration 聚合："Explored/Exploring {details}"，details 由子键 ListFormat 拼接
  if (counts.exploredFiles > 0 || counts.searches > 0 || counts.lists > 0) {
    const details = explorationDetails(counts.exploredFiles, counts.searches, counts.lists);
    if (inProgress) {
      rows.push(aggregateRow(
        "exploration",
        "localConversation.toolActivitySummary.exploration.exploring",
        "Exploring {details}",
        "exploring {details}",
        { details },
      ));
    } else {
      rows.push(aggregateRow(
        "exploration",
        "localConversation.toolActivitySummary.exploration",
        "Explored {details}",
        "explored {details}",
        { details },
      ));
    }
  }

  // Web 搜索
  if (counts.webSearches > 0) {
    if (inProgress) {
      rows.push(aggregateRow(
        "webSearch.completed",
        "localConversation.toolActivitySummary.webSearches.searching",
        "{count, plural, one {Searching the web # time} other {Searching the web # times}}",
        "{count, plural, one {searching the web # time} other {searching the web # times}}",
        { count: counts.webSearches },
      ));
    } else {
      rows.push(aggregateRow(
        "webSearch.completed",
        "localConversation.toolActivitySummary.webSearches",
        "{count, plural, one {Searched web # time} other {Searched web # times}}",
        "{count, plural, one {searched web # time} other {searched web # times}}",
        { count: counts.webSearches },
      ));
    }
  }

  // MCP 工具调用
  if (counts.mcpCalls > 0) {
    rows.push(aggregateRow(
      "mcp",
      "localConversation.toolActivitySummary.mcpToolCalls",
      "{count, plural, one {Called # tool} other {Called # tools}}",
      "{count, plural, one {called # tool} other {called # tools}}",
      { count: counts.mcpCalls },
    ));
  }

  // 审批结果聚合（approved/denied requests）
  if (counts.approvedRequests && counts.approvedRequests > 0) {
    rows.push(aggregateRow(
      "approved",
      "localConversation.toolActivitySummary.approvedRequests",
      "{count, plural, one {Approved request} other {Approved # requests}}",
      "{count, plural, one {approved request} other {approved # requests}}",
      { count: counts.approvedRequests },
    ));
  }
  if (counts.deniedRequests && counts.deniedRequests > 0) {
    rows.push(aggregateRow(
      "denied",
      "localConversation.toolActivitySummary.deniedRequests",
      "{count, plural, one {Denied request} other {Denied # requests}}",
      "{count, plural, one {denied request} other {denied # requests}}",
      { count: counts.deniedRequests },
    ));
  }

  return rows;
}

/*
 * exploration `{details}` 值：CODEX 用 `exploration.files|searches|lists` 三个 ICU
 * 复数子键（"# file" / "# search" / "# list"）再 Intl.ListFormat type:"unit" join。
 * 该子串非 leading/compact 敏感，用模块级 formatMessage 按当前 locale 解析。
 */
function explorationDetails(exploredFiles: number, searches: number, lists: number): string {
  const parts: string[] = [];
  if (exploredFiles > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.files", defaultMessage: "{count, plural, one {# file} other {# files}}" },
      { count: exploredFiles },
    ));
  }
  if (searches > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.searches", defaultMessage: "{count, plural, one {# search} other {# searches}}" },
      { count: searches },
    ));
  }
  if (lists > 0) {
    parts.push(formatMessageModule(
      { id: "localConversation.toolActivitySummary.exploration.lists", defaultMessage: "{count, plural, one {# list} other {# lists}}" },
      { count: lists },
    ));
  }
  return typeof Intl !== "undefined" && typeof Intl.ListFormat === "function"
    ? new Intl.ListFormat(undefined, { type: "unit", style: "long" }).format(parts)
    : parts.join(", ");
}

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

function ToolActivitySummaryLabel({
  className,
  compact,
  icon,
  label,
  labelParts,
}: {
  className: string;
  compact: boolean;
  icon: ToolActivityIcon;
  label: string;
  labelParts?: { action: string; detail: string };
}) {
  /**
   * Codex Desktop `wg.commandRanWithDetail` template
   * (`<action>Ran</action> <detail>{command}</detail>`)
   * renders the action span shrink-0 + muted and the detail span min-w-0 truncate;
   * source: local-conversation-thread-*.js :3766 (template), :4207-4211 (`O_` / `D_` renderers).
   */
  const renderText = labelParts
    ? (
      <>
        <span className="hc-tool-summary-action">{labelParts.action}</span>
        <span className="hc-tool-summary-detail">{` ${labelParts.detail}`}</span>
      </>
    )
    : label;

  if (compact) {
    return (
      <span className={className}>
        <span className="hc-tool-summary-inline">
          <ToolActivityIconMark icon={icon} />
          <span className="hc-tool-summary-text">{renderText}</span>
        </span>
      </span>
    );
  }

  return (
    <>
      <ToolActivityIconMark icon={icon} />
      <span className={className}>{renderText}</span>
    </>
  );
}

function ToolActivityIconMark({ icon }: { icon: ToolActivityIcon }) {
  const props = { className: "hc-tool-summary-icon", size: 16 };
  if (icon === "clock") return <Clock {...props} />;
  if (icon === "edit") return <PencilLine {...props} />;
  if (icon === "mcp") return <Network {...props} />;
  if (icon === "plan") return <ListTodo {...props} />;
  if (icon === "reasoning") return <Brain {...props} />;
  if (icon === "search") return <FileSearch {...props} />;
  if (icon === "skill") return <Sparkles {...props} />;
  if (icon === "web-search") return <Globe2 {...props} />;
  if (icon === "terminal") return <Terminal {...props} />;
  return <Wrench {...props} />;
}

function ToolActivityDiffStats({ added, removed }: { added: number; removed: number }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <span
      className="hc-tool-summary-diff-stats"
      aria-label={formatMessage(
        { id: "hc.diffStats.linesAddedRemoved", defaultMessage: "{added} lines added, {removed} lines removed" },
        { added, removed },
      )}
    >
      <span className="hc-tool-summary-diff-added">+{added}</span>
      <span className="hc-tool-summary-diff-removed">-{removed}</span>
    </span>
  );
}

export function workedForExpandedDetailItems(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"] {
  if (unit.summary.groupType !== "worked-for") return [];
  return toolActivityDetailItems(unit);
}

function useToolActivitySummaryLabel(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): string {
  const { formatMessage } = useHiCodexIntl();
  const [now, setNow] = useState(() => Date.now());
  const workedForItem = unit.summary.groupType === "worked-for" ? workedForActivityItem(unit.items) : undefined;
  const status = typeof workedForItem?.status === "string" ? workedForItem.status : "";
  const startedAtMs = numberField(workedForItem, "startedAtMs");
  const completedAtMs = numberField(workedForItem, "completedAtMs");

  useEffect(() => {
    if (status !== "working" || startedAtMs === null || completedAtMs !== null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAtMs, startedAtMs, status]);

  if (!workedForItem || startedAtMs === null || status !== "working") return unit.summary.label;
  const elapsedMs = Math.max((completedAtMs ?? now) - startedAtMs, 0);
  // CODEX-REF local-conversation-thread-CEeZyOcp.js
  //   id:`localConversation.workingFor`, defaultMessage:`Working for {time}`
  //   id:`localConversation.working`,    defaultMessage:`Working`
  return elapsedMs >= 1_000
    ? formatMessage(
        { id: "localConversation.workingFor", defaultMessage: "Working for {time}" },
        { time: formatWorkedDuration(elapsedMs) },
      )
    : formatMessage({ id: "localConversation.working", defaultMessage: "Working" });
}

export function initialToolActivityExpanded(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  return initialToolActivityViewState(unit) !== "collapsed";
}

export function initialToolActivityViewState(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): ToolActivityViewState {
  if (typeof unit.summary.defaultExpanded === "boolean") {
    return unit.summary.defaultExpanded ? "expanded" : "collapsed";
  }
  if (unit.summary.groupType === "web-search-group") return unit.summary.inProgress ? "collapsed" : "expanded";
  if (unit.summary.groupType === "exploration") return unit.summary.inProgress ? "preview" : "collapsed";
  if (unit.summary.groupType === "reasoning") return "collapsed";
  if (
    unit.summary.groupType === "collapsed-tool-activity"
    && unit.items.some((item) => Boolean(mcpAppResourceUri(item)))
  ) {
    return "expanded";
  }
  return (
    unit.summary.inProgress
    && unit.summary.groupType === "multi-agent-group"
  ) ? "expanded" : "collapsed";
}

export function isToolActivityExpandable(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): boolean {
  if (unit.summary.groupType === "reasoning") return false;
  if (unit.summary.groupType === "exploration" && unit.summary.inProgress) return false;
  if (unit.summary.groupType === "web-search-group" && unit.summary.inProgress) return false;
  return toolActivityDetailItems(unit).length > 0;
}

export function shouldShowToolActivityInlineDetail(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
  detail: string | null | undefined,
): boolean {
  return Boolean(
    detail
      && unit.summary.inProgress
      && unit.summary.groupType !== "worked-for"
      && unit.summary.groupType !== "multi-agent-group"
      && unit.summary.groupType !== "collapsed-tool-activity"
      && unit.summary.groupType !== "web-search-group",
  );
}

function numberField(record: Record<string, unknown> | undefined, field: string): number | null {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toolActivityDetailItems(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>) {
  if (unit.summary.groupType === "worked-for") {
    return unit.items.filter((item) => item.type !== "worked-for" && item.type !== "workedFor");
  }
  if (unit.summary.groupType === "exploration") {
    return unit.items.filter((item) => item.type === "exec" || item.type === "commandExecution");
  }
  /*
   * Reasoning items live inside cross-type mergeable buckets per Codex `Ge` :7782
   * but are never rendered as their own detail row — `Jw` :7881 maps reasoning
   * entries to `F2 = null`. Without filtering them out here, `GenericToolActivityView`
   * would iterate them as ordinary detail rows and the `ItemBlock` fallback would
   * serialize the raw ThreadItem as JSON, producing the `"type": "reasoning"` blocks
   * the user reported.
   */
  return unit.items.filter((item) => item.type !== "reasoning" && !isRunningSkillDefinitionRead(item));
}

function workedForActivityItem(items: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"]) {
  return items.find((item) => item.type === "worked-for" || item.type === "workedFor") as Record<string, unknown> | undefined;
}

// codex `zu`/`Bu`: floor to whole seconds (not round) + hours tier, zero units trimmed.
function formatWorkedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    const parts = [`${hours}h`];
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return parts.join(" ");
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Codex's single-command / exec summary row appends a live `toolSummaryForCmd
 * .runningTimer` (" for {elapsed}", tabular-nums) span after the status text while
 * the command runs (e.g. "Running command for 4s", ticking each second). HiCodex
 * only timed the worked-for group, so this hook supplies the per-command elapsed
 * for an in-progress single exec row in a collapsed-tool-activity unit.
 *
 * Scope mirrors the finding: a single in-progress `exec` item that is NOT routed to
 * exploration (own group type) or a running web-search command. Uses the item's
 * `startedAtMs` with the same floor-seconds format as worked-for.
 */
function runningCommandStartedAtMs(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): number | null {
  if (unit.summary.groupType !== "collapsed-tool-activity" || !unit.summary.inProgress) return null;
  if (unit.summary.counts.runningWebSearchCommands > 0) return null;
  if (unit.items.length !== 1) return null;
  const item = unit.items[0];
  if (!item || itemType(item) !== "exec" || !isItemInProgress(item)) return null;
  return numberField(item as Record<string, unknown>, "startedAtMs");
}

function useRunningCommandElapsed(unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>): string | null {
  const startedAtMs = runningCommandStartedAtMs(unit);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  if (startedAtMs === null) return null;
  const elapsedMs = Math.max(now - startedAtMs, 0);
  return elapsedMs >= 1_000 ? formatWorkedDuration(elapsedMs) : null;
}

export function ToolBlock({
  contentSearchUnitKey,
  details,
  format = "text",
  item,
  itemIds,
  label,
  inProgress = false,
  onOpenFileReference,
  onOpenConversationThreadId,
  onOpenDiff,
  onOpenRemoteTask,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  tone,
  value,
}: {
  contentSearchUnitKey?: string;
  details?: string;
  format?: EventFormat;
  inProgress?: boolean;
  item?: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  itemIds?: string;
  label: string;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenDiff?: () => void;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  patchActionInFlight?: boolean;
  tone?: "terminal" | EventTone;
  value: string;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [streamErrorExpanded, setStreamErrorExpanded] = useState(false);
  const [userInputExpanded, setUserInputExpanded] = useState(false);
  if (format === "diff") {
    return (
      <TurnDiffBlock
        contentSearchUnitKey={contentSearchUnitKey}
        inProgress={inProgress}
        itemIds={itemIds}
        onOpenDiff={onOpenDiff}
        onPatchAction={onPatchAction}
        patchActionState={patchActionState}
        patchActionInFlight={patchActionInFlight}
        value={value}
      />
    );
  }
  if (format === "status" || format === "divider-status" || format === "context-status") {
    const dividerStatus = format === "divider-status" || format === "context-status";
    const contextStatus = format === "context-status";
    const statusContent = dividerStatus
      ? statusDividerContent({
          contextStatus,
          formatMessage,
          inProgress,
          item,
          label,
          onOpenConversationThreadId,
          onOpenRemoteTask,
        })
      : label;
    return (
      <article
        className={`hc-status-event ${dividerStatus ? "hc-status-event-divider" : ""}`}
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
        data-item-type={item ? itemType(item) : undefined}
        data-running={dividerStatus && inProgress ? "true" : undefined}
      >
        {dividerStatus && <span className="hc-status-event-rule" aria-hidden="true" />}
        <span className="hc-status-event-label">
          {statusContent}
        </span>
        {dividerStatus && <span className="hc-status-event-rule" aria-hidden="true" />}
      </article>
    );
  }
  if (format === "automation-update") {
    return (
      <article
        className="hc-automation-update-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <Clock aria-hidden className="hc-automation-update-icon" size={14} />
        <span className="hc-automation-update-text">{value || label}</span>
      </article>
    );
  }
  if (format === "user-input-response") {
    if (inProgress) {
      return (
        <article
          className="hc-user-input-response-event is-pending"
          data-content-search-unit-key={contentSearchUnitKey}
          data-item-ids={itemIds}
          data-running="true"
        >
          <div className="hc-user-input-response-summary">
            <LoaderCircle aria-hidden className="hc-user-input-response-spinner" size={14} />
            <span className="hc-user-input-response-summary-text">{value || label}</span>
          </div>
        </article>
      );
    }
    const hasDetails = Boolean(details?.trim());
    const rows = hasDetails ? userInputResponseDetailRows(details ?? "") : [];
    const summaryContent = (
      <>
        <span className="hc-user-input-response-summary-text">{value || label}</span>
        {hasDetails && <ChevronRight aria-hidden className={userInputExpanded ? "is-open" : ""} size={14} />}
      </>
    );
    return (
      <article
        className="hc-user-input-response-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-has-details={hasDetails || undefined}
        data-item-ids={itemIds}
      >
        {hasDetails ? (
          <button
            aria-expanded={userInputExpanded}
            className="hc-user-input-response-summary"
            type="button"
            onClick={() => setUserInputExpanded((value) => !value)}
          >
            {summaryContent}
          </button>
        ) : (
          <div className="hc-user-input-response-summary">
            {summaryContent}
          </div>
        )}
        {hasDetails && (
          <AnimatedDisclosure
            className="hc-user-input-response-details-motion"
            innerClassName="hc-user-input-response-details"
            open={userInputExpanded}
          >
            {rows.map((row, index) => (
              <div className="hc-user-input-response-detail" key={`${row.question}-${index}`}>
                <span className="hc-user-input-response-question">{row.question}</span>
                <span className="hc-user-input-response-answer">{row.answer === "No answer provided" ? formatMessage({ id: "localConversation.userInputRequest.noAnswer", defaultMessage: "No answer provided" }) : row.answer}</span>
              </div>
            ))}
          </AnimatedDisclosure>
        )}
      </article>
    );
  }
  if (format === "stream-error") {
    const hasDetails = Boolean(details?.trim());
    // Localize the Codex "Reconnecting N/M" progress string (data layer keeps the
    // English content for tests; render reverse-maps via the attempt/maxAttempts).
    const reconnectMatch = /^Reconnecting\s+(\d+)\/(\d+)$/.exec((value ?? "").trim());
    const streamErrorText = reconnectMatch
      ? formatMessage(
          { id: "localConversation.streamError.reconnecting", defaultMessage: "Reconnecting {progress}" },
          {
            progress: `${reconnectMatch[1]}${formatMessage(
              { id: "localConversation.streamError.reconnectingProgressDenominator", defaultMessage: "/{maxAttempts}" },
              { maxAttempts: reconnectMatch[2] },
            )}`,
          },
        )
      : value || label;
    const summaryContent = (
      <>
        <span className="hc-error-event-text">{streamErrorText}</span>
        {hasDetails && <ChevronDown aria-hidden className={streamErrorExpanded ? "is-open" : ""} size={14} />}
      </>
    );
    return (
      <article
        className="hc-error-event hc-stream-error-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-has-details={hasDetails || undefined}
        data-item-ids={itemIds}
      >
        {hasDetails ? (
          <button
            aria-expanded={streamErrorExpanded}
            className="hc-error-event-summary"
            type="button"
            onClick={() => setStreamErrorExpanded((value) => !value)}
          >
            {summaryContent}
          </button>
        ) : (
          <div className="hc-error-event-summary">
            {summaryContent}
          </div>
        )}
        {hasDetails && (
          <AnimatedDisclosure
            className="hc-error-event-details-motion"
            innerClassName="hc-error-event-details"
            open={streamErrorExpanded}
          >
            {details}
          </AnimatedDisclosure>
        )}
      </article>
    );
  }
  if (format === "system-error") {
    return (
      <article
        className="hc-error-event hc-system-error-event"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <div className="hc-error-event-text">{value || label}</div>
      </article>
    );
  }

  return (
    <article
      className={`hc-tool-block ${tone ?? ""}`}
      data-content-search-unit-key={contentSearchUnitKey}
      data-item-ids={itemIds}
    >
      <div className="hc-tool-label">
        <Terminal size={14} /> {label}
      </div>
      {format === "markdown"
        ? (
            <div className="hc-tool-markdown">
              <Markdownish text={value} onOpenFileReference={onOpenFileReference} />
            </div>
          )
        : <pre>{value || "..."}</pre>}
    </article>
  );
}

function statusDividerIcon(type: string) {
  const className = "hc-status-event-kind-icon";
  if (type === "auto-review-interruption-warning") return <ShieldAlert className={className} size={16} aria-hidden="true" />;
  if (type === "model-changed") return <Brain className={className} size={16} aria-hidden="true" />;
  if (type === "personality-changed") return <CircleUserRound className={className} size={16} aria-hidden="true" />;
  if (type === "remote-task-created") return <Cloud className={className} size={14} aria-hidden="true" />;
  if (type === "forked-from-conversation") return <GitFork className={className} size={14} aria-hidden="true" />;
  return null;
}

function statusDividerContent({
  contextStatus,
  formatMessage,
  inProgress,
  item,
  label,
  onOpenConversationThreadId,
  onOpenRemoteTask,
}: {
  contextStatus: boolean;
  formatMessage: FormatMessage;
  inProgress: boolean;
  item?: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  label: string;
  onOpenConversationThreadId?: OpenThreadHandler;
  onOpenRemoteTask?: OpenRemoteTaskHandler;
}) {
  if (contextStatus) {
    return (
      <>
        {!inProgress && <Check className="hc-status-event-icon" size={12} aria-hidden="true" />}
        {inProgress ? <span className="hc-thinking-shimmer-text">{label}</span> : label}
      </>
    );
  }
  const type = item ? itemType(item) : "";
  if (type === "remote-task-created") {
    const taskId = item ? stringField(item, "taskId") || stringField(item, "task_id") : "";
    const canOpen = Boolean(taskId && onOpenRemoteTask);
    // CODEX-REF local-conversation-thread-CEeZyOcp.js
    //   id:`localConversation.remoteTaskCreated`, defaultMessage:`Created {taskLink} in Codex Cloud`
    //   id:`localConversation.remoteTaskCreated.task`, defaultMessage:`task`
    // {taskLink} is a rich-text node; resolve the surrounding text (leaving
    // {taskLink} as a split marker) then inject the localized `task` button.
    const taskLabel = formatMessage({ id: "localConversation.remoteTaskCreated.task", defaultMessage: "task" });
    const taskLink = (
      <button
        className="hc-status-event-inline-link"
        disabled={!canOpen}
        type="button"
        onClick={canOpen ? () => onOpenRemoteTask?.(taskId) : undefined}
      >
        {taskLabel}
      </button>
    );
    const [before, after] = splitOnPlaceholder(
      formatMessage({ id: "localConversation.remoteTaskCreated", defaultMessage: "Created {taskLink} in Codex Cloud" }),
      "taskLink",
    );
    return (
      <>
        {statusDividerIcon(type)}
        <span className="hc-status-event-rich-text" aria-label={label}>
          {before}
          {taskLink}
          {after}
        </span>
      </>
    );
  }
  if (type === "forked-from-conversation") {
    const sourceConversationId = item
      ? stringField(item, "sourceConversationId") || stringField(item, "source_conversation_id")
      : "";
    const canOpen = Boolean(sourceConversationId && onOpenConversationThreadId);
    return (
      <>
        {statusDividerIcon(type)}
        <button
          className="hc-status-event-inline-link hc-status-event-fork-link"
          disabled={!canOpen}
          type="button"
          onClick={canOpen ? () => onOpenConversationThreadId?.(sourceConversationId) : undefined}
        >
          {/* CODEX-REF localConversation.forkedFromConversation = `Forked from conversation` */}
          {formatMessage({ id: "localConversation.forkedFromConversation", defaultMessage: "Forked from conversation" })}
        </button>
      </>
    );
  }
  const warning = item ? statusDividerWarning(type, item, formatMessage) : null;
  return (
    <>
      {statusDividerIcon(type)}
      {label}
      {item && warning && <StatusEventWarning item={item} type={type} warning={warning} />}
    </>
  );
}

interface StatusEventWarningModel {
  ariaLabel: string;
  content: ReactNode;
  title: string;
}

function StatusEventWarning({
  item,
  type,
  warning,
}: {
  item: Extract<ConversationRenderUnit, { kind: "event" }>["item"];
  type: string;
  warning: StatusEventWarningModel;
}) {
  const tooltipId = statusEventTooltipId(type, item);
  return (
    <span className="hc-status-event-warning-wrap">
      <span
        aria-describedby={tooltipId}
        aria-label={warning.ariaLabel}
        className="hc-status-event-warning"
        role="img"
        tabIndex={0}
        title={warning.title}
      >
        <TriangleAlert size={12} aria-hidden="true" />
      </span>
      <span className="hc-status-event-tooltip" id={tooltipId} role="tooltip">
        {warning.content}
      </span>
    </span>
  );
}

function statusEventTooltipId(type: string, item: Extract<ConversationRenderUnit, { kind: "event" }>["item"]): string {
  const rawId = stringField(item, "id") || `${type}-warning`;
  return `hc-status-event-tooltip-${rawId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

// Split a formatMessage result around an unreplaced ICU placeholder ("{name}")
// so a rich-text node can be injected where Codex passes a React chunk/value.
function splitOnPlaceholder(message: string, name: string): [string, string] {
  const token = `{${name}}`;
  const index = message.indexOf(token);
  if (index < 0) return [message, ""];
  return [message.slice(0, index), message.slice(index + token.length)];
}

function statusDividerWarning(
  type: string,
  item: Extract<ConversationRenderUnit, { kind: "event" }>["item"],
  formatMessage: FormatMessage,
): StatusEventWarningModel | null {
  if (type === "auto-review-interruption-warning") {
    // CODEX-REF localConversation.autoReviewInterruptionWarning.nextSteps
    const line = formatMessage({
      id: "localConversation.autoReviewInterruptionWarning.nextSteps",
      defaultMessage:
        "Auto-review stopped this turn after repeated denials. Add more context or choose a different permission mode to continue.",
    });
    return {
      ariaLabel: "Auto-review interruption guidance",
      content: <span>{line}</span>,
      title: line,
    };
  }
  if (type === "model-changed") {
    // CODEX-REF localConversation.modelChanged.warning.line1 / .line2
    const line1 = formatMessage({
      id: "localConversation.modelChanged.warning.line1",
      defaultMessage: "Changing models mid-conversation will degrade performance.",
    });
    const line2 = formatMessage({
      id: "localConversation.modelChanged.warning.line2",
      defaultMessage: "Context may automatically compact.",
    });
    return {
      ariaLabel: "Model change warning",
      content: (
        <>
          <span>{line1}</span>
          <span>{line2}</span>
        </>
      ),
      title: `${line1}\n${line2}`,
    };
  }
  if (type === "model-rerouted" && stringField(item, "reason") === "highRiskCyberActivity") {
    // CODEX-REF localConversation.modelRerouted.warning.line1 / .line2
    //   line2 = `Think this is a mistake? Request a review at <link>chatgpt.com/cyber</link> or report via /feedback`
    const line1 = formatMessage({
      id: "localConversation.modelRerouted.warning.line1",
      defaultMessage: "Heads up, your request was re-routed to reduce cyber-abuse risk.",
    });
    const line2 = formatMessage({
      id: "localConversation.modelRerouted.warning.line2",
      defaultMessage:
        "Think this is a mistake? Request a review at <link>chatgpt.com/cyber</link> or report via /feedback",
    });
    const link = /^([\s\S]*?)<link>([\s\S]*?)<\/link>([\s\S]*)$/.exec(line2);
    const line2Prefix = link ? link[1] : line2;
    const linkText = link ? link[2] : "chatgpt.com/cyber";
    const line2Suffix = link ? link[3] : "";
    return {
      ariaLabel: "Model reroute warning",
      content: (
        <>
          <span>{line1}</span>
          <span>
            {line2Prefix}
            <a href="https://chatgpt.com/cyber" rel="noreferrer" target="_blank">{linkText}</a>
            {line2Suffix}
          </span>
        </>
      ),
      title: `${line1}\n${line2Prefix}${linkText}${line2Suffix}`,
    };
  }
  return null;
}

function userInputResponseDetailRows(details: string): Array<{ question: string; answer: string }> {
  return details.split(/\n{2,}/).flatMap((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    return [{ question: lines[0] ?? "Question", answer: lines.slice(1).join("\n") || "No answer provided" }];
  });
}

export interface TurnDiffFileViewModel {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  renderedLineEstimate: number;
}

export interface TurnDiffViewModel {
  hasChanges: boolean;
  fileCount: number;
  linesAdded: number;
  linesRemoved: number;
  files: TurnDiffFileViewModel[];
}

/**
 * Undo / Reapply patch 回调 — 由 `HiCodexApp.handlePatchAction` 接线，调用
 * Tauri `host_apply_patch_action` 执行 git apply / --reverse，并在失败时把
 * `PatchActionResult` 投给 `<UnifiedDiffFailureDialog/>`。
 *
 * Prop 仍声明为可选，方便 Storybook / 单测以静态 fixture 渲染 TurnDiffBlock
 * 而不必拽起整个 Tauri stack；运行时 HiCodexApp 必传，按钮可见且可点击。
 * 双击/重复点击保护：HiCodexApp 用 `useRef` 同步锁 + 全局 `patchActionInFlight`
 * disable 所有 Undo/Reapply 按钮（避免并发 git apply）。
 */
export type PatchAction = "undo" | "reapply";
export type PatchActionState = { action: PatchAction; diff: string } | null;

/**
 * codex: local-conversation-thread-*.js — default collapse threshold (3).
 * The header shows `Edited N files`, the body shows the first 3
 * file rows; further rows are revealed by the "Show N more files" footer.
 */
const TURN_DIFF_COLLAPSE_THRESHOLD = 3;

/**
 * codex: local-conversation-thread-*.js — inline-render cutoff (5000): files whose
 * `max(unifiedLineCount, additions+deletions) > 5000` are rendered as a
 * "Too large to render inline" row instead of inline hunks.
 */
const TURN_DIFF_INLINE_RENDER_CUTOFF = 5000;

export function TurnDiffBlock({
  contentSearchUnitKey,
  inProgress,
  itemIds,
  onOpenDiff,
  onPatchAction,
  patchActionState,
  patchActionInFlight,
  value,
}: {
  contentSearchUnitKey?: string;
  inProgress: boolean;
  itemIds?: string;
  /**
   * codex: local-conversation-thread `Fv` Review button + `wa(o, { path })`
   * deep-link. When a path is supplied the host should open the diff scoped to
   * that file (single-file review).
   */
  onOpenDiff?: (filePath?: string) => void;
  onPatchAction?: (action: PatchAction, diff: string) => void;
  patchActionState?: PatchActionState;
  /**
   * Global in-flight flag — disables ALL Undo/Reapply buttons while any patch
   * action is running. Backstops the synchronous `useRef` lock in HiCodexApp;
   * the button-level `disabled` is the user-visible guarantee that prevents
   * double-click before any git apply runs.
   */
  patchActionInFlight?: boolean;
  value: string;
}) {
  const { formatMessage } = useHiCodexIntl();
  const model = turnDiffViewModel(value);
  // codex: `Pv` local state `y` — show only the first `Av` files until expanded.
  const [filesExpanded, setFilesExpanded] = useState(false);
  // codex: per-file `es` disclosure — inline hunks for any file the user opened.
  const [openInlineFiles, setOpenInlineFiles] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFilesExpanded(false);
    setOpenInlineFiles(new Set());
  }, [value]);

  if (!model.hasChanges) return null;

  /*
   * Undo / Reapply toggles against the last patch action for this diff. The
   * callback is optional for fixture-only renderers; HiCodexApp wires it to
   * the Tauri `host_apply_patch_action` command at runtime.
   */
  const patchActionForThisDiff =
    patchActionState && patchActionState.diff === value
      ? patchActionState.action === "undo"
        ? "reapply"
        : "undo"
      : "undo";

  const singleFileName = model.fileCount === 1 && model.files.length === 1 ? model.files[0]!.path : null;
  const titleLabel = formatTurnDiffFileCount(model.fileCount, singleFileName, formatMessage);
  const singleFileDetailsLabel =
    singleFileName == null ? null : formatMessage({ id: "hc.unifiedDiff.details", defaultMessage: "Details" });

  if (inProgress) {
    const progressTitleLabel = formatTurnDiffFilesChanged(model.fileCount, formatMessage);
    return (
      <article
        className="hc-tool-block activity hc-turn-diff-progress"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <div className="hc-turn-diff-progress-row">
          <div className="hc-turn-diff-progress-summary">
            <span className="hc-turn-diff-progress-title">{progressTitleLabel}</span>
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          </div>
          <div className="hc-turn-diff-spacer" />
          {onOpenDiff && (
            <button
              className="hc-turn-diff-review"
              type="button"
              onClick={() => onOpenDiff()}
              title={formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
              aria-label={formatMessage({
                id: "codex.unifiedDiff.reviewChangedFiles",
                defaultMessage: "Review changed files",
              })}
            >
              {/*
               * Codex Desktop i18n (local-conversation-thread-*.js), build 26.602:
               *   codex.unifiedDiff.reviewChanges       = "Review" (button label; desc:
               *     "Button label to view and follow changes in the diff for a Codex task")
               *   codex.unifiedDiff.viewDiffTooltip     = "Review" (narrow-width label + title)
               *   codex.unifiedDiff.reviewChangedFiles  = "Review changed files" (aria-label)
               *   codex.unifiedDiff.reviewChangesHover  = "Review changes" (hover/header subtitle)
               * The bundle renders a single "Review" label; HiCodex keeps a responsive
               * full/short split that resolves to the same "Review" text at any width.
               */}
              <span className="hc-turn-diff-review-full">
                {formatMessage({ id: "codex.unifiedDiff.reviewChanges", defaultMessage: "Review" })}
              </span>
              <span className="hc-turn-diff-review-short">
                {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
              </span>
            </button>
          )}
        </div>
      </article>
    );
  }

  const visibleFiles = filesExpanded
    ? model.files
    : model.files.slice(0, TURN_DIFF_COLLAPSE_THRESHOLD);
  const remaining = Math.max(model.files.length - visibleFiles.length, 0);
  const diffByFile = splitDiffByFile(value);

  const handleHeaderReview = () => onOpenDiff?.();
  const handlePerFileReview = (path: string) => onOpenDiff?.(path);

  return (
    <article
      className="hc-tool-block hc-turn-diff"
      data-content-search-unit-key={contentSearchUnitKey}
      data-item-ids={itemIds}
    >
      {/*
       * codex: `Pv` `group/turn-diff-header` wrapper. The whole header is
       * covered by `Iv`, an invisible button that triggers Review on click.
       * Inner buttons stop propagation so Undo/Reapply still work.
       */}
      <div className="hc-turn-diff-header hc-turn-diff-header--with-hover">
        {onOpenDiff && (
          // codex: `Iv` — absolute overlay button covering the entire header.
          <button
            type="button"
            className="hc-turn-diff-header-overlay"
            aria-label={formatMessage({
              id: "codex.unifiedDiff.reviewChangedFiles",
              defaultMessage: "Review changed files",
            })}
            onClick={handleHeaderReview}
          />
        )}
        {/* codex: `Pv` 60px header icon — file glyph inside rounded square */}
        <span className="hc-turn-diff-header-icon" aria-hidden="true">
          <FileText size={18} />
        </span>
        <div className="hc-turn-diff-header-text">
          <span className="hc-turn-diff-title">{titleLabel}</span>
          {/*
           * codex: default subtitle = DiffStats; on hover/focus it is replaced
           * by the reviewChangesHover label ("Review changes") followed by a
           * separate arrow icon — the arrow is an icon element, not a glyph
           * baked into the string. Re-verified vs Codex Desktop v26.519.81530.
           */}
          <span className="hc-turn-diff-subtitle turn-diff-default-subtitle">
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          </span>
          <span className="hc-turn-diff-subtitle turn-diff-hover-subtitle" aria-hidden="true">
            {formatMessage({ id: "codex.unifiedDiff.reviewChangesHover", defaultMessage: "Review changes" })}
            <ArrowRight aria-hidden className="hc-turn-diff-review-arrow" size={12} />
          </span>
        </div>
        <div className="hc-turn-diff-spacer" />
        {/*
         * `onPatchAction` is always provided by `HiCodexApp.tsx` at runtime
         * (wired to the Tauri `host_apply_patch_action` command); the prop
         * stays optional so fixture-only renderers (tests / Storybook) can
         * skip the toolbar.
         */}
        {onPatchAction && (
          <button
            className="hc-turn-diff-patch-action"
            /*
             * Codex Desktop i18n: revertChangesTooltip = "Undo", reapplyChangesTooltip = "Reapply"
             * (local-conversation-thread-*.js). HiCodex tooltips align to single-word
             * Codex values; aria-label adds verb context for screen readers.
             */
            title={
              patchActionForThisDiff === "undo"
                ? formatMessage({ id: "codex.unifiedDiff.revertChangesTooltip", defaultMessage: "Undo" })
                : formatMessage({ id: "codex.unifiedDiff.reapplyChangesTooltip", defaultMessage: "Reapply" })
            }
            aria-label={
              patchActionForThisDiff === "undo"
                ? formatMessage({ id: "hc.unifiedDiff.undoThisPatch", defaultMessage: "Undo this patch" })
                : formatMessage({ id: "hc.unifiedDiff.reapplyThisPatch", defaultMessage: "Reapply this patch" })
            }
            type="button"
            disabled={patchActionInFlight}
            onClick={(event) => {
              // codex: `Pv` inner buttons stopPropagation so the `Iv` overlay
              // does not also trigger Review.
              event.stopPropagation();
              // codex: `ln(o, {eventName:"codex_undo_clicked", metadata:{source:"turn_diff"}})`
              if (patchActionForThisDiff === "undo" && typeof console !== "undefined") {
                console.info("codex_undo_clicked", { source: "turn_diff" });
              }
              onPatchAction(patchActionForThisDiff, value);
            }}
          >
            {patchActionForThisDiff === "undo"
              ? formatMessage({ id: "codex.unifiedDiff.revertChangesTooltip", defaultMessage: "Undo" })
              : formatMessage({ id: "codex.unifiedDiff.reapplyChangesTooltip", defaultMessage: "Reapply" })}
          </button>
        )}
        {onOpenDiff && (
          <button
            className="hc-turn-diff-review"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleHeaderReview();
            }}
          >
            {/*
             * codex: the completed-card trailing button shows the single
             * viewDiffTooltip label "Review" (not "Review changes"); the
             * "Review changes" wording lives only on the hover subtitle above.
             * Re-verified vs Codex Desktop v26.519.81530.
             */}
            <span className="hc-turn-diff-review-full">
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
            <span className="hc-turn-diff-review-short">
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
          </button>
        )}
      </div>

      <div className="hc-turn-diff-files">
        {visibleFiles.map((file) => {
          const tooLarge = isTurnDiffFileTooLargeToRender(file);
          const fileDiff = diffByFile.get(file.path) ?? "";
          const inlineOpen = openInlineFiles.has(file.path);
          const rowLabel = singleFileDetailsLabel ?? file.path;
          const showFileStats = singleFileDetailsLabel == null;
          const reviewControl = onOpenDiff ? (
            <span
              role="button"
              tabIndex={0}
              className="hc-turn-diff-file-review"
              aria-label={formatMessage({ id: "hc.unifiedDiff.showFileInReview", defaultMessage: "Show file in review" })}
              title={formatMessage({ id: "hc.unifiedDiff.showInReview", defaultMessage: "Show in review" })}
              onClick={(event) => {
                event.stopPropagation();
                handlePerFileReview(file.path);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                handlePerFileReview(file.path);
              }}
            >
              {formatMessage({ id: "codex.unifiedDiff.viewDiffTooltip", defaultMessage: "Review" })}
            </span>
          ) : null;
          if (tooLarge) {
            return (
              <div className="hc-turn-diff-file" key={file.path}>
                <div className="hc-turn-diff-file-row">
                  <span className="hc-turn-diff-file-path">{rowLabel}</span>
                  {showFileStats && <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />}
                  <span className="hc-turn-diff-file-too-large">
                    {/* codex: `Rv` — large-file row label (codex.unifiedDiff.inlineLargeFile) */}
                    {formatMessage({
                      id: "codex.unifiedDiff.inlineLargeFile",
                      defaultMessage: "Too large to render inline",
                    })}
                  </span>
                  {reviewControl}
                </div>
              </div>
            );
          }
          return (
            <div className="hc-turn-diff-file" key={file.path}>
              <button
                type="button"
                className="hc-turn-diff-file-row"
                aria-expanded={inlineOpen}
                onClick={() => {
                  setOpenInlineFiles((prev) => {
                    const next = new Set(prev);
                    if (next.has(file.path)) next.delete(file.path);
                    else next.add(file.path);
                    return next;
                  });
                }}
              >
                {/* codex: `es` disclosure chevron — rotates when row is open */}
                <ChevronRight
                  aria-hidden
                  size={12}
                  className={inlineOpen ? "is-open" : ""}
                />
                <span className="hc-turn-diff-file-path">{rowLabel}</span>
                {showFileStats && <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />}
                {reviewControl}
              </button>
              {!tooLarge && inlineOpen && fileDiff.length > 0 ? (
                <div className="hc-turn-diff-file-inline">
                  {/* codex: `es` inline diff body — CodeSnippet `diff` language */}
                  <CodeSnippet language="diff" text={fileDiff} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/*
       * codex: `Lv` — Show N more files / Collapse files toggle.
       * Threshold is `Av = 3`. Codex i18n keys:
       *   codex.unifiedDiff.showMoreFiles = "Show {count} more files"
       *   codex.unifiedDiff.collapseFiles  = "Collapse files"
       */}
      {remaining > 0 ? (
        <button
          type="button"
          className="hc-turn-diff-expand-files"
          aria-expanded={false}
          onClick={() => setFilesExpanded(true)}
        >
          <span>
            {formatMessage(
              {
                id: "codex.unifiedDiff.showMoreFiles",
                defaultMessage: "{count, plural, one {Show # more file} other {Show # more files}}",
              },
              { count: remaining },
            )}
          </span>
          <ChevronRight aria-hidden size={12} className="hc-turn-diff-expand-files-chevron" />
        </button>
      ) : filesExpanded && model.files.length > TURN_DIFF_COLLAPSE_THRESHOLD ? (
        <button
          type="button"
          className="hc-turn-diff-expand-files"
          aria-expanded={true}
          onClick={() => setFilesExpanded(false)}
        >
          <span>{formatMessage({ id: "codex.unifiedDiff.collapseFiles", defaultMessage: "Collapse files" })}</span>
          <ChevronRight
            aria-hidden
            size={12}
            className="hc-turn-diff-expand-files-chevron is-open"
          />
        </button>
      ) : null}
    </article>
  );
}

/**
 * codex: `_v`/`vv` — `max(unifiedLineCount, additions+deletions) > gv`.
 */
function isTurnDiffFileTooLargeToRender(file: TurnDiffFileViewModel): boolean {
  return Math.max(file.renderedLineEstimate, file.linesAdded + file.linesRemoved) > TURN_DIFF_INLINE_RENDER_CUTOFF;
}

/**
 * codex: `es` per-file inline diff body — recover the diff fragment for each
 * file out of the merged unified diff. We rely on the same `diff --git a/.. b/..`
 * marker `turnDiffGitPath` recognizes; each fragment runs from one marker line
 * up to (but not including) the next marker.
 */
function splitDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = diff.split("\n");
  let currentPath: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentPath != null && buffer.length > 0) {
      result.set(currentPath, buffer.join("\n"));
    }
  };
  for (const line of lines) {
    const headerPath = turnDiffGitPath(line);
    if (headerPath != null) {
      flush();
      currentPath = headerPath;
      buffer = [line];
      continue;
    }
    if (currentPath != null) buffer.push(line);
  }
  flush();
  return result;
}

function TurnDiffStats({ added, removed }: { added: number; removed: number }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <span
      className="hc-turn-diff-stats"
      aria-label={formatMessage(
        { id: "hc.diffStats.linesAddedRemoved", defaultMessage: "{added} lines added, {removed} lines removed" },
        { added, removed },
      )}
    >
      <span className="hc-turn-diff-added">+{added}</span>
      <span className="hc-turn-diff-removed">-{removed}</span>
    </span>
  );
}

/**
 * codex: local-conversation-thread `Pv` header — i18n keys
 *   codex.unifiedDiff.editedFiles plural { one: "Edited 1 file", other: "Edited {count} files" }
 *   codex.unifiedDiff.editedFile = "Edited {filename}"
 *
 * Accepts an optional `singleFileName`; when fileCount === 1 and a filename is
 * supplied, returns the file-specific label. Otherwise falls back to the
 * plural-aware count label.
 */
export function formatTurnDiffFileCount(
  fileCount: number,
  singleFileName?: string | null,
  formatMessage?: FormatMessage,
): string {
  if (fileCount === 1 && typeof singleFileName === "string" && singleFileName.trim().length > 0) {
    // codex: codex.unifiedDiff.editedFile defaultMessage="Edited {filename}"
    const filename = turnDiffBasename(singleFileName);
    return formatMessage
      ? formatMessage({ id: "codex.unifiedDiff.editedFile", defaultMessage: "Edited {filename}" }, { filename })
      : `Edited ${filename}`;
  }
  // codex: codex.unifiedDiff.editedFiles plural defaultMessage="{fileCount, plural, one {Edited # file} other {Edited # files}}"
  return formatMessage
    ? formatMessage(
        {
          id: "codex.unifiedDiff.editedFiles",
          defaultMessage: "{fileCount, plural, one {Edited # file} other {Edited # files}}",
        },
        { fileCount },
      )
    : fileCount === 1
      ? "Edited 1 file"
      : `Edited ${fileCount} files`;
}

export function formatTurnDiffFilesChanged(fileCount: number, formatMessage?: FormatMessage): string {
  // codex: codex.unifiedDiff.filesChanged plural defaultMessage="{fileCount, plural, one {# file changed} other {# files changed}}"
  return formatMessage
    ? formatMessage(
        {
          id: "codex.unifiedDiff.filesChanged",
          defaultMessage: "{fileCount, plural, one {# file changed} other {# files changed}}",
        },
        { fileCount },
      )
    : fileCount === 1
      ? "1 file changed"
      : `${fileCount} files changed`;
}

function turnDiffBasename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function turnDiffHeaderStatsVisible(fileCount: number, inProgress: boolean): boolean {
  return inProgress || fileCount > 0;
}

export function turnDiffViewModel(diff: string): TurnDiffViewModel {
  const files = turnDiffFiles(diff);
  const totals = files.length > 0
    ? files.reduce((acc, file) => ({
        linesAdded: acc.linesAdded + file.linesAdded,
        linesRemoved: acc.linesRemoved + file.linesRemoved,
      }), { linesAdded: 0, linesRemoved: 0 })
    : countDiffLines(diff);
  const fallbackFileCount = diff.trim().length > 0 && (totals.linesAdded > 0 || totals.linesRemoved > 0) ? 1 : 0;
  const fileCount = files.length > 0 ? files.length : fallbackFileCount;
  return {
    hasChanges: fileCount > 0 || totals.linesAdded > 0 || totals.linesRemoved > 0,
    fileCount,
    linesAdded: totals.linesAdded,
    linesRemoved: totals.linesRemoved,
    files,
  };
}

function turnDiffFiles(diff: string): TurnDiffFileViewModel[] {
  const files: TurnDiffFileViewModel[] = [];
  let current: TurnDiffFileViewModel | null = null;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    const gitPath = turnDiffGitPath(line);
    if (gitPath) {
      current = {
        path: gitPath,
        linesAdded: 0,
        linesRemoved: 0,
        renderedLineEstimate: 0,
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      current.renderedLineEstimate += 1;
      inHunk = true;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.linesAdded += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (line.startsWith("-")) {
      current.linesRemoved += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (inHunk && (line.startsWith(" ") || line.startsWith("\\"))) {
      current.renderedLineEstimate += 1;
    }
  }
  return files.length > 0 ? mergeTurnDiffFiles(files) : fallbackUnifiedDiffFiles(diff);
}

function mergeTurnDiffFiles(files: TurnDiffFileViewModel[]): TurnDiffFileViewModel[] {
  const byPath = new Map<string, TurnDiffFileViewModel>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (!existing) {
      byPath.set(file.path, { ...file });
      continue;
    }
    existing.linesAdded += file.linesAdded;
    existing.linesRemoved += file.linesRemoved;
    existing.renderedLineEstimate += file.renderedLineEstimate;
  }
  return Array.from(byPath.values());
}

function turnDiffGitPath(line: string): string | null {
  const prefix = "diff --git ";
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length);
  if (value.startsWith("\"")) {
    const oldPath = parseQuotedDiffPath(value, 0);
    if (!oldPath || value[oldPath.nextIndex] !== " ") return null;
    const newPath = parseQuotedDiffPath(value, oldPath.nextIndex + 1);
    return newPath?.path.startsWith("b/") ? newPath.path.slice(2) : null;
  }
  const index = value.lastIndexOf(" b/");
  if (index < 0) return null;
  const path = value.slice(index + 1);
  return path.startsWith("b/") ? path.slice(2) : null;
}

function parseQuotedDiffPath(value: string, startIndex: number): { path: string; nextIndex: number } | null {
  if (value[startIndex] !== "\"") return null;
  let path = "";
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") return { path, nextIndex: index + 1 };
    if (char !== "\\") {
      path += char ?? "";
      continue;
    }
    const next = value[index + 1];
    if (next === undefined) return null;
    if (/[0-7]/u.test(next)) {
      let octal = next;
      let offset = 2;
      while (offset <= 3 && /[0-7]/u.test(value[index + offset] ?? "")) {
        octal += value[index + offset];
        offset += 1;
      }
      path += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    const escapes: Record<string, string> = {
      "\"": "\"",
      "\\": "\\",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    path += escapes[next] ?? next;
    index += 1;
  }
  return null;
}

function fallbackUnifiedDiffFiles(diff: string): TurnDiffFileViewModel[] {
  const files: TurnDiffFileViewModel[] = [];
  let current: TurnDiffFileViewModel | null = null;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = normalizeDiffHeaderPath(line.slice(4));
      if (path && path !== "/dev/null") {
        current = { path, linesAdded: 0, linesRemoved: 0, renderedLineEstimate: 0 };
        files.push(current);
        inHunk = false;
      }
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      current.renderedLineEstimate += 1;
      inHunk = true;
      continue;
    }
    if (line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.linesAdded += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (line.startsWith("-")) {
      current.linesRemoved += 1;
      if (inHunk) current.renderedLineEstimate += 1;
    } else if (inHunk && (line.startsWith(" ") || line.startsWith("\\"))) {
      current.renderedLineEstimate += 1;
    }
  }
  return mergeTurnDiffFiles(files);
}

function normalizeDiffHeaderPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"")) {
    const parsed = parseQuotedDiffPath(trimmed, 0);
    return parsed ? stripDiffPathPrefix(parsed.path) : "";
  }
  const [path] = trimmed.split("\t");
  return stripDiffPathPrefix(path ?? "");
}

function stripDiffPathPrefix(path: string): string {
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function countDiffLines(diff: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) linesRemoved += 1;
  }
  return { linesAdded, linesRemoved };
}
