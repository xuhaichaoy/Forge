import {
  Brain,
  ChevronRight,
  Clock3,
  FileSearch,
  Globe2,
  ListTodo,
  Network,
  PencilLine,
  Terminal,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
  type ConversationRenderUnit,
  type EventFormat,
  type EventTone,
  type ToolActivityIcon,
} from "../state/render-groups";
import {
  itemText,
  mcpAppResourceUri,
} from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { FileReference } from "./file-reference-types";
import { CodeSnippet, Markdownish } from "./message-unit";
import {
  ToolActivityDetail,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./tool-activity-detail";
import type { OpenThreadHandler } from "./open-thread";

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
  onOpenThreadId,
  threadId = null,
}: ToolActivityViewProps) {
  /*
   * Codex Desktop's `Jw` agent-body renderer (codex-local-conversation-thread.pretty.js:7881)
   * maps standalone reasoning items to `F2 = null` — they are not surfaced as their own
   * rows. Reasoning content is folded into the surrounding exploration group via `Ge` in
   * split-items-into-render-groups, or silently dropped.
   *
   * The live "Thinking…" UX is rendered by the separate `ZT` thinking-placeholder
   * (`codex-local-conversation-thread.pretty.js:8335` / `:8384`), which `oT` (`:8000-8002`)
   * activates while the turn is in_progress and no visible work / blocking request /
   * assistant output is taking precedence. HiCodex's `desktopThinkingPlaceholderItem`
   * (project-conversation.ts:540) injects a synthetic `type: "reasoning"` item marked with
   * `_syntheticKind: "thinking-placeholder"` for exactly that purpose, so we let units
   * carrying the placeholder render (showing the "Thinking" label) while skipping all
   * other reasoning toolActivity units.
   */
  if (unit.summary.groupType === "reasoning") {
    const hasThinkingPlaceholder = unit.items.some((item) =>
      (item as Record<string, unknown>)._syntheticKind === "thinking-placeholder",
    );
    if (!hasThinkingPlaceholder) return null;
    return <ReasoningActivityView unit={unit} />;
  }

  return (
    <GenericToolActivityView
      unit={unit}
      onMcpAppHostCall={onMcpAppHostCall}
      onReadMcpResource={onReadMcpResource}
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

function GenericToolActivityView({
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
  const isWorkedFor = unit.summary.groupType === "worked-for";
  const isMultiAgent = unit.summary.groupType === "multi-agent-group";
  const isCollapsedToolActivity = unit.summary.groupType === "collapsed-tool-activity";
  const detailItems = toolActivityDetailItems(unit);
  const hasDetails = detailItems.length > 0;
  const canExpand = hasDetails && isToolActivityExpandable(unit);
  const summaryLabel = useToolActivitySummaryLabel(unit);
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
          {(isWorkedFor ? workedForExpandedDetailItems(unit) : detailItems).map((item) => (
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
  const props = { className: "hc-tool-summary-icon", size: 14 };
  if (icon === "clock") return <Clock3 {...props} />;
  if (icon === "edit") return <PencilLine {...props} />;
  if (icon === "mcp") return <Network {...props} />;
  if (icon === "plan") return <ListTodo {...props} />;
  if (icon === "reasoning") return <Brain {...props} />;
  if (icon === "search") return <FileSearch {...props} />;
  if (icon === "web-search") return <Globe2 {...props} />;
  if (icon === "terminal") return <Terminal {...props} />;
  return <Wrench {...props} />;
}

function ToolActivityDiffStats({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="hc-tool-summary-diff-stats" aria-label={`${added} lines added, ${removed} lines removed`}>
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
  return elapsedMs >= 1_000 ? `Working for ${formatWorkedDuration(elapsedMs)}` : "Working";
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
      && unit.summary.groupType !== "collapsed-tool-activity",
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
  return unit.items.filter((item) => item.type !== "reasoning");
}

function workedForActivityItem(items: Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"]) {
  return items.find((item) => item.type === "worked-for" || item.type === "workedFor") as Record<string, unknown> | undefined;
}

function formatWorkedDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function ToolBlock({
  contentSearchUnitKey,
  format = "text",
  itemIds,
  label,
  inProgress = false,
  onOpenFileReference,
  onOpenDiff,
  tone,
  value,
}: {
  contentSearchUnitKey?: string;
  format?: EventFormat;
  inProgress?: boolean;
  itemIds?: string;
  label: string;
  onOpenDiff?: () => void;
  onOpenFileReference?: (reference: FileReference) => void;
  tone?: "terminal" | EventTone;
  value: string;
}) {
  if (format === "diff") {
    return (
      <TurnDiffBlock
        contentSearchUnitKey={contentSearchUnitKey}
        inProgress={inProgress}
        itemIds={itemIds}
        onOpenDiff={onOpenDiff}
        value={value}
      />
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

export interface TurnDiffFileViewModel {
  path: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface TurnDiffViewModel {
  hasChanges: boolean;
  fileCount: number;
  linesAdded: number;
  linesRemoved: number;
  files: TurnDiffFileViewModel[];
}

function TurnDiffBlock({
  contentSearchUnitKey,
  inProgress,
  itemIds,
  onOpenDiff,
  value,
}: {
  contentSearchUnitKey?: string;
  inProgress: boolean;
  itemIds?: string;
  onOpenDiff?: () => void;
  value: string;
}) {
  const model = turnDiffViewModel(value);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  if (!model.hasChanges) return null;

  if (inProgress) {
    return (
      <article
        className="hc-tool-block hc-turn-diff"
        data-content-search-unit-key={contentSearchUnitKey}
        data-item-ids={itemIds}
      >
        <div className="hc-turn-diff-header">
          <div className="hc-turn-diff-progress-summary">
            <span className="hc-turn-diff-title is-muted">{formatTurnDiffFileCount(model.fileCount)}</span>
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          </div>
          <div className="hc-turn-diff-spacer" />
          {onOpenDiff && (
            <button className="hc-turn-diff-review" type="button" onClick={onOpenDiff}>
              <span className="hc-turn-diff-review-full">Review changes</span>
              <span className="hc-turn-diff-review-short">Review</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className="hc-tool-block hc-turn-diff"
      data-content-search-unit-key={contentSearchUnitKey}
      data-item-ids={itemIds}
    >
      <div className="hc-turn-diff-header">
        <button
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse changed files" : "Expand changed files"}
          className="hc-turn-diff-toggle"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="hc-turn-diff-title">{formatTurnDiffFileCount(model.fileCount)}</span>
          {turnDiffHeaderStatsVisible(model.fileCount, false) && (
            <TurnDiffStats added={model.linesAdded} removed={model.linesRemoved} />
          )}
          <ChevronRight aria-hidden className={expanded ? "is-open" : ""} size={14} />
        </button>
        <div className="hc-turn-diff-spacer" />
        {onOpenDiff && (
          <button className="hc-turn-diff-review" type="button" onClick={onOpenDiff}>
            <span className="hc-turn-diff-review-full">Review changes</span>
            <span className="hc-turn-diff-review-short">Review</span>
          </button>
        )}
      </div>
      <AnimatedDisclosure
        className="hc-turn-diff-motion"
        innerClassName="hc-turn-diff-body"
        open={expanded}
      >
        {model.files.length > 0 && (
          <div className="hc-turn-diff-files">
            {model.files.map((file) => (
              <div className="hc-turn-diff-file" key={file.path}>
                <span>{file.path}</span>
                <TurnDiffStats added={file.linesAdded} removed={file.linesRemoved} />
              </div>
            ))}
          </div>
        )}
        <CodeSnippet language="diff" text={value || ""} />
      </AnimatedDisclosure>
    </article>
  );
}

function TurnDiffStats({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="hc-turn-diff-stats" aria-label={`${added} lines added, ${removed} lines removed`}>
      <span className="hc-turn-diff-added">+{added}</span>
      <span className="hc-turn-diff-removed">-{removed}</span>
    </span>
  );
}

export function formatTurnDiffFileCount(fileCount: number): string {
  return fileCount === 1 ? "1 file changed" : `${fileCount} files changed`;
}

export function turnDiffHeaderStatsVisible(fileCount: number, inProgress: boolean): boolean {
  return inProgress || fileCount > 1;
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
  for (const line of diff.split("\n")) {
    const gitPath = turnDiffGitPath(line);
    if (gitPath) {
      current = {
        path: gitPath,
        linesAdded: 0,
        linesRemoved: 0,
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) current.linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) current.linesRemoved += 1;
  }
  return files.length > 0 ? files : fallbackUnifiedDiffFiles(diff);
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
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = normalizeDiffHeaderPath(line.slice(4));
      if (path && path !== "/dev/null") {
        current = { path, linesAdded: 0, linesRemoved: 0 };
        files.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) current.linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) current.linesRemoved += 1;
  }
  return files;
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
