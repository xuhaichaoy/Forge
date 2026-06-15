import {
  ChevronDown,
  FileDiff,
  Github,
  Laptop,
} from "lucide-react";
import type { BranchDetailsViewModel } from "../state/branch-details";
import type { RailEntry } from "../state/render-groups";
import { DiffStatsDisplay } from "./diff-stats-display";
import { useForgeIntl } from "./i18n-provider";
import { SummaryPanelRow } from "./summary-panel-row";

// CODEX-REF: local-conversation-thread-*.js (Environment section) —
// 当前 Codex 桌面版 Environment section 内仅以下 row 顺序:
//   1. Changes        (file-with-plus icon + diff-stats trailing,
//                      zero 时仍渲染 `+0 -0`,无 fallback 字符串)
//   2. worktree / thread-handoff trigger(仅 conversationId 存在时渲染;
//      Forge 用 "Local" 行承载相同语义)
//   3. branch picker  (branch-graph icon + label=currentBranch + chevron-right;
//      Forge 当前没 currentBranch 数据流,跳过该独立 row)
//   4. git actions    (commit/push action rows;Forge 没数据流,跳过)
//   5. GitHub status  (icon + 多状态 label;Forge 用 "GitHub" 行对齐)
// 注:Codex 没有独立 "Branch" 和 "Commit" row(Forge 旧 5-row 设计来自已不存在的
// 旧 bundle 引用)。本次砍掉独立 Branch / Commit row 以严格对齐当前 Desktop。
export function BranchDetailsCard({
  details,
  canOpenEntry,
  onOpenEntry,
}: {
  details: BranchDetailsViewModel;
  canOpenEntry: (entry: RailEntry) => boolean;
  onOpenEntry: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useForgeIntl();
  if (!details.hasData) {
    return (
      <div className="hc-rail-card">
        <div className="hc-rail-card-meta">{details.emptyText}</div>
      </div>
    );
  }

  const localRow = details.rows.find((row) => row.id === "local");
  const githubRow = details.rows.find((row) => row.id === "github");
  const githubLabel = githubRow?.value ?? details.githubStatus?.label ?? formatMessage({ id: "codex.localConversation.gitSummary.githubCliUnavailable", defaultMessage: "GitHub CLI unavailable" });

  const changesEntry: RailEntry = {
    id: "changes",
    title: "Changes",
    meta: branchChangesMeta(details),
    status: details.diff?.hasDiff ? "changed" : "available",
    action: { kind: "diff" },
  };
  const canOpenChanges = canOpenEntry(changesEntry);
  // CODEX-REF: local-conversation-thread-DAwsPWah.js (Kd, git-summary Changes row) —
  // trailing = `i ? <spinner icon-xs/> : r==null ? null : <Ms linesAdded={r.additions}
  // linesRemoved={r.deletions}/>`. `r` is the diff-stats object: when it is null
  // (gitStatus absent / no real diff stats) Codex renders NO trailing — it does
  // NOT coalesce to `+0 -0`. Forge previously coalesced line counts with `?? 0`,
  // which forced a bogus `+0 -0` chip whenever gitStatus was missing; aligned to
  // the null branch here. (The loading-spinner branch `i` needs a data-layer
  // loading flag that BranchDetailsViewModel does not expose, so it is omitted.)
  const diffStats =
    details.gitStatus
    && (details.gitStatus.linesAdded != null || details.gitStatus.linesRemoved != null)
      ? {
          linesAdded: details.gitStatus.linesAdded ?? 0,
          linesRemoved: details.gitStatus.linesRemoved ?? 0,
        }
      : null;
  const changesTrailing = diffStats
    ? <DiffStatsDisplay linesAdded={diffStats.linesAdded} linesRemoved={diffStats.linesRemoved} />
    : null;

  return (
    <div className="hc-rail-list">
      {/* CODEX-REF: local-conversation-thread-DAwsPWah.js (Kd) — Changes row icon is
          the custom `Os` changes glyph rendered at `icon-sm` (app-main-DGDTSRlh.css
          `.icon-sm{width:18px;height:18px}`). lucide `FileDiff` is Forge's
          clean-room match for the Os file-diff glyph; sized to 18px. */}
      <SummaryPanelRow
        icon={<FileDiff size={18} />}
        label={formatMessage({ id: "codex.localConversation.gitSummary.branchChangesLabel", defaultMessage: "Changes" })}
        trailing={changesTrailing}
        onClick={canOpenChanges ? () => onOpenEntry(changesEntry) : undefined}
        title={changesEntry.meta}
      />
      {/* CODEX-REF: local-conversation-thread-CEeZyOcp.js (Sf→Zc) — worktree/execution
          -mode trigger row. Codex renders the macbook glyph (lucide `Laptop`) at
          `icon-sm` (app-main `.icon-sm{18px}`) for the local execution mode (cloud→Cloud,
          worktree→GitBranch) and labels the trigger with the SHORT mode name
          `composer.mode.local.short` ("Local") + a chevron. BranchDetailsViewModel does
          NOT expose the execution mode (the `local` row carries only id/label), so Forge
          always renders Laptop + the static "Local" short label and cannot mode-swap yet.
          The label is routed through the Codex `composer.mode.local.short` id so it is
          i18n-backed (no invented "Work locally" subtitle — see branch-details.ts). */}
      {localRow ? (
        <SummaryPanelRow
          icon={<Laptop size={18} />}
          label={formatMessage({ id: "composer.mode.local.short", defaultMessage: "Local" })}
          title={formatMessage({ id: "composer.mode.local.short", defaultMessage: "Local" })}
          trailing={<ChevronDown size={12} />}
        />
      ) : null}
      {/* CODEX-REF: local-conversation-thread-*.js — GitHub status row */}
      <SummaryPanelRow
        icon={<Github size={14} />}
        label={githubLabel}
        title={githubLabel}
      />
    </div>
  );
}

function branchChangesMeta(details: BranchDetailsViewModel): string {
  if (details.diff) return details.diff.summary;
  const changedFiles = details.gitStatus?.changedFiles;
  if (changedFiles !== undefined) {
    return `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`;
  }
  return "Review changed files";
}
