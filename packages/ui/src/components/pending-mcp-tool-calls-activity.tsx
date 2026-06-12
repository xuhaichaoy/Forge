import { ChevronRight, Network } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConversationRenderUnit } from "../state/render-groups";
import {
  humanReadableToolLabel,
  isItemInProgress,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
} from "../state/thread-item-fields";
import { isRunningSkillDefinitionRead, joinConjunction } from "../state/tool-activity-grouping";
import { useHiCodexIntl } from "./i18n-provider";
import type { OpenThreadHandler } from "./open-thread";
import {
  ToolActivityDetail,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./tool-activity-detail";

type PendingMcpViewState = "collapsed" | "expanded" | "preview";

export function PendingMcpToolCallsActivityView({
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
  const [viewState, setViewState] = useState<PendingMcpViewState>("collapsed");
  const detailItems = pendingMcpDetailItems(unit);
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
        onClick={() => setViewState((value) => nextPendingMcpViewState(value))}
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
  // human-readable, sentence-cased tool name - never a "Calling" verb prefix.
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
  // ("Used {apps}") with Intl.ListFormat type:"conjunction" - Oxford-comma,
  // localized - so reuse the shared joinConjunction helper here.
  return joinConjunction(sources);
}

function pendingMcpDetailItems(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"] {
  return unit.items.filter((item) => item.type !== "reasoning" && !isRunningSkillDefinitionRead(item));
}

function nextPendingMcpViewState(current: PendingMcpViewState): PendingMcpViewState {
  if (current === "preview") return "expanded";
  if (current === "expanded") return "collapsed";
  return "expanded";
}
