import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConversationRenderUnit } from "../state/render-groups";
import { isRunningSkillDefinitionRead } from "../state/tool-activity-grouping";
import { AnimatedDisclosure } from "./animated-disclosure";
import type { OpenThreadHandler } from "./open-thread";
import {
  ToolActivityDetail,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./tool-activity-detail";

type MultiAgentViewState = "collapsed" | "expanded" | "preview";

export function MultiAgentActivityView({
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
  const defaultViewState = initialMultiAgentViewState(unit);
  const [viewState, setViewState] = useState<MultiAgentViewState>(defaultViewState);
  const detailItems = multiAgentDetailItems(unit);
  const expanded = unit.summary.inProgress || viewState !== "collapsed";

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
          if (!unit.summary.inProgress) setViewState((value) => nextMultiAgentViewState(value));
        }}
      >
        <span className={`hc-multi-agent-action-title ${unit.summary.inProgress ? "hc-status-event-shimmer" : ""}`}>
          {unit.summary.label}
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

function initialMultiAgentViewState(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): MultiAgentViewState {
  if (typeof unit.summary.defaultExpanded === "boolean") {
    return unit.summary.defaultExpanded ? "expanded" : "collapsed";
  }
  return unit.summary.inProgress ? "expanded" : "collapsed";
}

function multiAgentDetailItems(
  unit: Extract<ConversationRenderUnit, { kind: "toolActivity" }>,
): Extract<ConversationRenderUnit, { kind: "toolActivity" }>["items"] {
  return unit.items.filter((item) => item.type !== "reasoning" && !isRunningSkillDefinitionRead(item));
}

function nextMultiAgentViewState(current: MultiAgentViewState): MultiAgentViewState {
  if (current === "preview") return "expanded";
  if (current === "expanded") return "collapsed";
  return "expanded";
}
