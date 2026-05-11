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
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  type ConversationRenderUnit,
  type EventFormat,
  type EventTone,
  type ToolActivityIcon,
  projectConversation,
} from "../state/render-groups";
import {
  itemText,
} from "../state/thread-item-fields";
import { AnimatedDisclosure } from "./animated-disclosure";
import { CodeSnippet, Markdownish } from "./message-unit";
import type { FileReference } from "./message-unit";
import { ToolActivityDetail } from "./tool-activity-detail";
import type { OpenThreadHandler } from "./open-thread";

export type ConversationUnitRenderer = (unit: ConversationRenderUnit, key: string) => ReactNode;
type ToolActivityViewState = "collapsed" | "expanded" | "preview";

export function ToolActivityView({
  unit,
  onOpenThreadId,
  renderUnit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  renderUnit?: ConversationUnitRenderer;
}) {
  if (unit.summary.groupType === "reasoning") return <ReasoningActivityView unit={unit} />;

  return (
    <GenericToolActivityView
      unit={unit}
      onOpenThreadId={onOpenThreadId}
      renderUnit={renderUnit}
    />
  );
}

function GenericToolActivityView({
  unit,
  onOpenThreadId,
  renderUnit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  onOpenThreadId?: OpenThreadHandler;
  renderUnit?: ConversationUnitRenderer;
}) {
  const defaultViewState = initialToolActivityViewState(unit);
  const [viewState, setViewState] = useState<ToolActivityViewState>(defaultViewState);
  const isWorkedFor = unit.summary.groupType === "worked-for";
  const isMultiAgent = unit.summary.groupType === "multi-agent-group";
  const detailItems = toolActivityDetailItems(unit);
  const hasDetails = detailItems.length > 0;
  const canExpand = hasDetails && isToolActivityExpandable(unit);
  const summaryLabel = useToolActivitySummaryLabel(unit);
  const detail = unit.summary.details.find((value) => value !== unit.summary.label);
  const expanded = viewState !== "collapsed";
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
          className="hc-tool-summary"
          data-testid={isMultiAgent ? "multi-agent-action-header" : undefined}
          data-view-state={viewState}
          type="button"
          onClick={() => setViewState((value) => nextToolActivityViewState(value))}
        >
          <ToolActivityIconMark icon={unit.summary.icon} />
          <span className="hc-tool-summary-label">{summaryLabel}</span>
          {!isWorkedFor && !isMultiAgent && unit.summary.inProgress && detail && <small>{detail}</small>}
          <ChevronRight className={expanded ? "is-open" : ""} size={14} />
        </button>
      ) : (
        <div
          className="hc-tool-summary"
          data-testid={isMultiAgent ? "multi-agent-action-header" : undefined}
        >
          <ToolActivityIconMark icon={unit.summary.icon} />
          <span className="hc-tool-summary-label">{summaryLabel}</span>
          {!isWorkedFor && !isMultiAgent && unit.summary.inProgress && detail && <small>{detail}</small>}
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
          {isWorkedFor
            ? <WorkedForExpandedContent unit={unit} renderUnit={renderUnit} />
            : detailItems.map((item) => (
                <ToolActivityDetail item={item} key={item.id} onOpenThreadId={onOpenThreadId} />
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

function WorkedForExpandedContent({
  unit,
  renderUnit,
}: {
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>;
  renderUnit?: ConversationUnitRenderer;
}) {
  if (!renderUnit) return null;
  const units = workedForExpandedUnits(unit);
  return (
    <div className="hc-worked-for-expanded">
      {units.map((detailUnit) => renderUnit(detailUnit, detailUnit.key))}
    </div>
  );
}

export function workedForExpandedUnits(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): ConversationRenderUnit[] {
  if (unit.summary.groupType !== "worked-for") return [];
  const detailItems = toolActivityDetailItems(unit);
  if (detailItems.length === 0) return [];
  return projectConversation(detailItems).units;
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
  return unit.items;
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
  onOpenFileReference,
  tone,
  value,
}: {
  contentSearchUnitKey?: string;
  format?: EventFormat;
  itemIds?: string;
  label: string;
  onOpenFileReference?: (reference: FileReference) => void;
  tone?: "terminal" | EventTone;
  value: string;
}) {
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
        : format === "diff"
          ? <CodeSnippet language="diff" text={value || ""} />
          : <pre>{value || "..."}</pre>}
    </article>
  );
}
