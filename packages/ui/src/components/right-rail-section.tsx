import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
// codex: local-conversation-thread-*.js — persisted across remounts
// (in-memory only, matches Desktop atomFamily semantics)
import { useSectionCollapse } from "../hooks/use-section-collapse";
import type { RightRailSection as RightRailSectionViewModel } from "../state/right-rail";

export interface RailSectionProps {
  count: number;
  defaultCollapsed?: boolean;
  id: RightRailSectionViewModel["id"];
  summary?: string;
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
}

/*
 * CODEX-REF: local-conversation-thread-CNXrCEaG.js — only a subset of rail sections pass
 * a count badge to the header. Re-verified in 26.602.40724: artifacts (Outputs),
 * side-chats, background-subagents (Subagents), background-tasks (Tasks), tool-sources
 * (Sources) AND browser-tabs all DO (browser-tabs builds `titleSuffix:(0,Q.jsx)(vp,{count:
 * p.length})` at :5890, vp returns null only when count===0); automation, environment
 * (branchDetails) and progress do NOT. (An earlier Forge note wrongly excluded browser.)
 */
function sectionHasCountBadge(sectionId: RightRailSectionViewModel["id"]): boolean {
  return (
    sectionId === "artifacts"
    || sectionId === "sideChats"
    || sectionId === "backgroundSubagents"
    || sectionId === "backgroundTasks"
    || sectionId === "sources"
    || sectionId === "browser"
  );
}

export function RailSection({ count, defaultCollapsed = false, id, summary, title, children, headerAction = null }: RailSectionProps) {
  // codex: local-conversation-thread-*.js — persisted across remounts
  // (in-memory only, matches Desktop atomFamily semantics). The hook seeds
  // from `defaultCollapsed` on the first read for a given key and then writes
  // through to a module-level Map on toggle, so users keep their collapse
  // choice when the rail unmounts (thread switch, panel hide, etc.).
  const [collapsed, setCollapsed] = useSectionCollapse(id, defaultCollapsed);
  const expanded = !collapsed;
  const contentId = `hc-rail-section-content-${id}`;
  return (
    <section className="hc-rail-section">
      <div className="hc-rail-section-header">
        <button
          aria-controls={contentId}
          aria-expanded={expanded}
          className="hc-rail-section-toggle"
          type="button"
          onClick={() => setCollapsed(expanded)}
        >
          {/* codex `Gd` section header: button children = [title, count, chevron] —
              the disclosure chevron is the TRAILING child (after the title + count),
              not leading. */}
          {/* CODEX-REF: local-conversation-thread-CEeZyOcp.js (Xf) — the count is a
              `titleSuffix` rendered alongside the title via `(0,Q.jsx)(Xf,{count:…length})`;
              `Xf` returns null ONLY when `count===0` — it does NOT gate on expanded state, so
              the badge stays visible whenever count>0 (expanded AND collapsed). Forge
              previously hid it on expand. Per-section: only artifacts / side-chats /
              background-subagents / background-tasks / tool-sources pass a `titleSuffix`;
              automation, browser-tabs, environment (branchDetails) and progress pass NONE, so
              they render no count badge even when count>0 (see sectionHasCountBadge). */}
          <span className="hc-rail-section-title">{title}</span>
          {count > 0 && sectionHasCountBadge(id) && <span className="hc-rail-section-count">{count}</span>}
          <ChevronRight className="hc-rail-section-chevron" data-expanded={expanded ? "true" : "false"} size={14} />
        </button>
        {headerAction}
      </div>
      {/*
       * CODEX-REF: local-conversation-thread-*.js — Codex
       * 用 framer-motion div + AnimatePresence 做折叠展开:
       *   initial / exit: { height: 0, opacity: 0, marginTop: 0 }
       *   animate:        { height: "auto", opacity: 1, marginTop: 2 }
       *   transition:     { duration: 0.5, ease: [.19, 1, .22, 1] }
       *   className:      "relative z-0 overflow-hidden"
       * Forge 用 CSS grid-rows trick + opacity + margin-top 等价实现 height-auto
       * 动画(无 framer-motion 依赖),transition spec 严格对齐 Codex 的 disclosure 缓动。
       */}
      <div
        aria-hidden={!expanded}
        className="hc-rail-section-collapsible"
        data-expanded={expanded ? "true" : "false"}
        id={contentId}
      >
        <div className="hc-rail-section-collapsible-inner">
          <div className="hc-rail-section-content">
            {summary && <div className="hc-rail-section-summary">{summary}</div>}
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
