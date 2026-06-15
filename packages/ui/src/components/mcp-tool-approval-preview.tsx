import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import type {
  PendingRequestMcpToolApproval,
  PendingRequestMcpToolParamEntry,
} from "../state/approval-requests";
import { useForgeIntl } from "./i18n-provider";

const MCP_TOOL_PARAM_PREVIEW_LIMIT = 4;

export function McpToolApprovalHeader({ approval }: { approval: PendingRequestMcpToolApproval }) {
  const { formatMessage } = useForgeIntl();
  const isHighRisk = approval.riskLevel === "high";
  if (isHighRisk) {
    return (
      <div className="hc-mcp-tool-approval-header warning">
        <AlertTriangle aria-hidden size={14} />
        <span>{formatMessage({ id: "composer.mcpToolCallApproval.elevatedRiskLabel", defaultMessage: "Elevated Risk" })}</span>
      </div>
    );
  }
  return (
    <div className="hc-mcp-tool-approval-header">
      <span className="hc-mcp-tool-approval-connector-dot" aria-hidden="true" />
      <span>{approval.connectorName}</span>
    </div>
  );
}

export function McpToolApprovalParams({ approval }: { approval: PendingRequestMcpToolApproval }) {
  const { formatMessage } = useForgeIntl();
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const entries = approval.toolParamEntries;
  if (entries.length === 0) return null;
  const visibleEntries = showAll ? entries : entries.slice(0, MCP_TOOL_PARAM_PREVIEW_LIMIT);
  const hiddenCount = entries.length - visibleEntries.length;
  return (
    <div
      className="hc-mcp-tool-approval-params"
      aria-label={formatMessage({ id: "hc.pendingRequest.toolParameters", defaultMessage: "Tool parameters" })}
    >
      {visibleEntries.map((entry) => {
        const key = entry.name;
        return (
          <McpToolParamRow
            key={key}
            entry={entry}
            expanded={expanded[key] === true}
            onToggle={() => setExpanded((current) => ({ ...current, [key]: current[key] !== true }))}
          />
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="hc-mcp-tool-param-toggle-list"
          onClick={() => setShowAll(true)}
        >
          <span>
            {formatMessage(
              { id: "composer.mcpToolCallApproval.toolParam.more", defaultMessage: "Show {count} more items" },
              { count: hiddenCount },
            )}
          </span>
          <ChevronRight aria-hidden size={12} />
        </button>
      ) : null}
      {showAll && entries.length > MCP_TOOL_PARAM_PREVIEW_LIMIT ? (
        <button
          type="button"
          className="hc-mcp-tool-param-toggle-list"
          onClick={() => setShowAll(false)}
        >
          <span>{formatMessage({ id: "composer.mcpToolCallApproval.toolParam.less", defaultMessage: "Show fewer items" })}</span>
          <ChevronRight aria-hidden className="hc-mcp-tool-param-chevron-up" size={12} />
        </button>
      ) : null}
    </div>
  );
}

function McpToolParamRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: PendingRequestMcpToolParamEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { formatMessage } = useForgeIntl();
  const value = expanded ? entry.expandedText : entry.previewText;
  const toggleAction = expanded
    ? formatMessage({ id: "composer.mcpToolCallApproval.toolParam.collapse", defaultMessage: "Collapse" })
    : formatMessage({ id: "composer.mcpToolCallApproval.toolParam.expand", defaultMessage: "Expand" });
  const valueClass = [
    "hc-mcp-tool-param-value",
    entry.displayKind === "json" ? "json" : "text",
    entry.isExpandable && !expanded ? "collapsed" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className="hc-mcp-tool-param-row">
      <div className="hc-mcp-tool-param-label">{entry.label}</div>
      <div className="hc-mcp-tool-param-content">
        <div className={valueClass} data-expanded={expanded || undefined}>
          {value}
        </div>
        {entry.isExpandable ? (
          <button
            type="button"
            className="hc-mcp-tool-param-toggle"
            aria-expanded={expanded}
            aria-label={formatMessage(
              { id: "composer.mcpToolCallApproval.toolParam.toggle", defaultMessage: "{action} {label}" },
              { action: toggleAction, label: entry.label },
            )}
            onClick={onToggle}
          >
            <span>{toggleAction}</span>
            <ChevronRight
              aria-hidden
              className={expanded ? "hc-mcp-tool-param-chevron-up" : undefined}
              size={12}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
