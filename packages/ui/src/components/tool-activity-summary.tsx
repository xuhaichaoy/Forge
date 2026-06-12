import {
  Brain,
  ChevronRight,
  Clock,
  FileSearch,
  Globe2,
  ListTodo,
  Network,
  PencilLine,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ToolActivityIcon } from "../state/render-groups";
import { useHiCodexIntl } from "./i18n-provider";

export const DESKTOP_COLLAPSED_TOOL_ACTIVITY_SUMMARY_CLASS =
  "hc-tool-summary group/collapsed-tool-activity group/summary inline-flex w-fit max-w-full min-w-0 cursor-interaction items-center self-start gap-1 border-0 bg-transparent px-0 py-0 text-left shadow-none hover:bg-transparent";
export const DESKTOP_COLLAPSED_TOOL_ACTIVITY_LABEL_CLASS =
  "hc-tool-summary-label block min-w-0 max-w-full shrink overflow-hidden truncate [mask-image:linear-gradient(to_right,black_calc(100%_-_0.25rem),transparent)] [mask-repeat:no-repeat] pr-1";

export function desktopCollapsedToolActivityChevronClassName(expanded: boolean): string {
  return `inline-chevron flex-shrink-0 text-token-input-placeholder-foreground ${
    expanded ? "is-open opacity-100" : "opacity-0 group-hover/summary:opacity-100"
  }`;
}

export const RUNNING_COMMAND_ELAPSED_STYLE = {
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

export function ToolActivitySummaryLabel({
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

export function ToolActivityDiffStats({ added, removed }: { added: number; removed: number }) {
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

export { ChevronRight as ToolActivityChevronIcon };
