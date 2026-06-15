import { ChevronRight, Network } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isItemInProgress } from "../state/thread-item-fields";
import type { ThreadItemUnit } from "./thread-item-types";
import { AnimatedDisclosure } from "./animated-disclosure";
import {
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
  ToolActivityDetail,
  toolActivityDetailViewModel,
} from "./tool-activity-detail";

export function McpToolCallThreadItemView({
  onMcpAppHostCall,
  onReadMcpResource,
  threadId,
  unit,
}: {
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId: string | null;
  unit: ThreadItemUnit;
}) {
  const detail = toolActivityDetailViewModel(unit.item);
  const running = isItemInProgress(unit.item);
  /*
   * codex: a standalone MCP tool call renders as a collapsible summary row
   * (server/tool icon + tool label + hover chevron) over an animated disclosure
   * holding ONLY the result body — the tool label is NOT repeated inside. The
   * summary label shimmers while the call is active (`no active={!completed}`).
   *
   * Codex inits the open flag `V = a && L` (an MCP app with a ready resource)
   * and a one-shot effect only ever calls `H(true)` — so a regular tool call
   * stays FOLDED while running and after completion, and only MCP apps expand
   * themselves; nothing auto-collapses.
   *
   * (Forge keeps its own "server:tool" identity as the label instead of
   * Codex's per-connector `MS` formatting, which needs connector/app metadata
   * Forge does not carry; the icon falls back to the MCP `Network` glyph,
   * matching Codex's no-logo fallback.)
   */
  const isMcpApp = detail.kind === "mcpApp";
  const [expanded, setExpanded] = useState(isMcpApp);
  const lastItemId = useRef(unit.item.id);
  useEffect(() => {
    if (lastItemId.current !== unit.item.id) {
      lastItemId.current = unit.item.id;
      setExpanded(isMcpApp);
    } else if (isMcpApp) {
      setExpanded(true);
    }
  }, [unit.item.id, isMcpApp]);

  const label = mcpToolCallSummaryLabel(detail);

  return (
    <div
      className="hc-thread-item-row group"
      data-content-search-unit-key={unit.key}
      data-item-ids={unit.item.id}
      data-item-type="mcp-tool-call"
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="group flex w-fit max-w-full min-w-0 appearance-none items-center self-start gap-1.5 border-0 bg-transparent px-0 py-0 text-left text-[13px] leading-5 text-stone-500 shadow-none transition-colors hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/20"
        onClick={() => setExpanded((value) => !value)}
      >
        <Network aria-hidden className="shrink-0 text-stone-400 transition-colors group-hover:text-stone-500" size={14} />
        <span className={`min-w-0 flex-1 truncate ${running ? "animate-pulse" : ""}`}>{label}</span>
        <ChevronRight
          aria-hidden
          className={`shrink-0 text-stone-400 transition-[opacity,transform] duration-300 ${
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          size={14}
        />
      </button>
      <AnimatedDisclosure
        className="hc-thread-item-disclosure"
        innerClassName="hc-thread-item-body"
        open={expanded}
      >
        <div className="pt-2">
          <ToolActivityDetail
            hideToolTitle
            item={unit.item}
            onMcpAppHostCall={onMcpAppHostCall}
            onReadMcpResource={onReadMcpResource}
            threadId={threadId}
          />
        </div>
      </AnimatedDisclosure>
    </div>
  );
}

function mcpToolCallSummaryLabel(detail: ReturnType<typeof toolActivityDetailViewModel>): string {
  if (detail.kind === "tool" || detail.kind === "mcpApp" || detail.kind === "pendingTool") {
    // detail.name is "server:tool"; the summary label is the humanized TOOL.
    const colon = detail.name.indexOf(":");
    const tool = colon >= 0 ? detail.name.slice(colon + 1) : detail.name;
    return humanizeMcpToolName(tool);
  }
  return "Tool call";
}

/*
 * codex: Codex's MCP summary label `MS(...)` uses per-connector generators ONLY
 * when a `matchingApp` is resolved from the user's connected-connector registry
 * (`resolvedApps`). Forge carries no connector registry → `matchingApp` is
 * always null → Codex itself falls back to `HS = WS(US(toolName))`: split the
 * tool name into alphanumeric words (`GS`: lowercase, split on /[^a-z0-9]+/),
 * join with spaces (`US`, no prefix to strip when there's no app), and
 * sentence-case (`WS`). So `create_issue` → "Create issue". This is the faithful
 * no-connector rendering; the server identity rides on the (logo) icon in Codex,
 * which Forge shows as the generic `Network` fallback either way.
 */
function humanizeMcpToolName(toolName: string): string {
  const words = toolName.trim().toLowerCase().split(/[^a-z0-9]+/g).filter((word) => word.length > 0);
  const joined = words.length === 0 ? toolName : words.join(" ");
  return joined.length === 0 ? joined : joined.charAt(0).toUpperCase() + joined.slice(1);
}
