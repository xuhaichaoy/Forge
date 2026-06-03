import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileDiff,
  GitBranch,
  Github,
  Globe,
  ImageIcon,
  Laptop,
  List,
  LoaderCircle,
  MessageSquareText,
  Network,
  Settings,
  Square,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
// codex: local-conversation-thread-*.js — persisted across remounts
// (in-memory only, matches Desktop atomFamily semantics)
import { useSectionCollapse } from "../hooks/use-section-collapse";
import { convertLocalFileSrc } from "../lib/tauri-host";
import { fileIconFor } from "../lib/file-icon";
import { shouldOpenArtifactPreview } from "../state/artifact-preview";
import type { BranchDetailsViewModel } from "../state/branch-details";
import { DiffStatsDisplay } from "./diff-stats-display";
import { SummaryPanelRow } from "./summary-panel-row";
import { useHiCodexIntl } from "./i18n-provider";
import type { OpenThreadHandler } from "./open-thread";
import type { RailEntry, RailEntryAction, RailEntryReference } from "../state/render-groups";
import {
  clipRailEntries,
  type RightRailDisplayMode,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";

/*
 * CODEX-REF: local-conversation-thread-DAwsPWah.js — Codex Desktop's right-rail
 * summary panel is a **fixed-size floating card**:
 *   `rounded-3xl border border-token-border-default bg-token-dropdown-background
 *    pt-3 shadow-md`
 * Note vs. the older bundle: there is **no `backdrop-blur-sm`**, the surface
 * fill is now an explicit `bg-token-dropdown-background`, and padding is
 * **top-only (`pt-3`)** rather than the previous `py-3`. It is NOT
 * user-resizable; clicking an
 * Artifact / file entry does **not** render an inline preview here. Instead
 * it calls `openWorkspaceFile({..., openInSidePanel: true, scope: v2})`,
 * which opens the AppShell **RightPanel** (app-shell-*.js) and routes it to
 * `/file-preview` (a lazy-loaded `FilePreviewPage` registered in
 * app-main-*.js). That big right panel is the one with the
 * resize handle, default 600 px, min 320 px, full-width toggle.
 *
 * Earlier versions of this file conflated the two by adding resize/fullwidth
 * to the summary rail and inlining `ArtifactPreviewPanel` here. Reverted: the
 * rail is purely sections, and file/source previews live in AppShell
 * side-panel tabs.
 */
export interface RightRailProps {
  sections: RightRailSectionViewModel[];
  displayMode?: RightRailDisplayMode;
  isPinned?: boolean;
  onOpenArtifactPreview?: (entry: RailEntry) => void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenDiff?: () => void;
  onOpenThreadId?: OpenThreadHandler;
  onCleanBackgroundTerminals?: () => void;
  backgroundTerminalCleanupPending?: boolean;
  // codex: local-conversation-thread-*.js — automation panel CTA;
  // Desktop's automation row routes to the automation detail view.
  onAutomationOpen?: (automationId: string) => void;
  // codex: local-conversation-thread-*.js — browser panel CTA;
  // Desktop's browser row opens the active browser-use tab in the sandbox view.
  onBrowserOpen?: (tabId: string | undefined) => void;
  // codex: local-conversation-thread-*.js — Environment section
  // accordion accepts an `after` slot in the header (worktree menu trigger
  // alongside diff stats). HiCodex exposes the worktree-menu open callback as
  // an optional prop; when absent the trigger renders nothing (pure noop) so
  // existing call sites are unaffected.
  onOpenWorktreeMenu?: () => void;
}

export interface RailSectionProps {
  count: number;
  defaultCollapsed?: boolean;
  id: RightRailSectionViewModel["id"];
  summary?: string;
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
}

export interface RailListProps {
  entries: RailEntry[];
  sectionId: RightRailSectionViewModel["id"];
  backgroundTerminalCleanupPending?: boolean;
  onCleanBackgroundTerminals?: () => void;
}

export function RightRail({
  sections,
  displayMode = "overlay",
  isPinned = true,
  onOpenArtifactPreview,
  onOpenFileReference,
  onOpenUrl,
  onOpenDiff,
  onOpenThreadId,
  onCleanBackgroundTerminals,
  backgroundTerminalCleanupPending = false,
  // codex: local-conversation-thread-*.js —
  // P0 right-rail data + callbacks. HiCodexApp wires these once the
  // corresponding feature lights up.
  onAutomationOpen,
  onBrowserOpen,
  // codex: local-conversation-thread-*.js — environment section
  // header `after` slot CTA (worktree menu opener); silent when caller does
  // not wire it so the rail keeps current behavior for non-worktree shells.
  onOpenWorktreeMenu,
}: RightRailProps) {
  const { formatMessage } = useHiCodexIntl();
  const canOpenEntry = (entry: RailEntry) =>
    isRailEntryActionAvailable(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenThreadId,
    });
  const openEntry = (entry: RailEntry) => {
    openRailEntry(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenThreadId,
    });
  };
  const openSideChatEntry = (entry: RailEntry) => {
    openRailSideChatEntry(entry, { onOpenThreadId });
  };
  // codex: local-conversation-thread-*.js — automation row click opens the
  // automation detail panel; the id is encoded as `automation:<id>` by
  // `automationRailEntry`.
  const canOpenAutomationEntry = () => Boolean(onAutomationOpen);
  const openAutomationEntry = (entry: RailEntry) => {
    if (!onAutomationOpen) return;
    const automationId = entry.id.startsWith("automation:")
      ? entry.id.slice("automation:".length)
      : entry.id;
    onAutomationOpen(automationId);
  };
  // codex: local-conversation-thread-*.js — browser row click opens the
  // active browser-use tab; tabId is encoded as `browser:<tabId>` by
  // `browserRailEntry` (or `browser:active` when unknown).
  const canOpenBrowserEntry = () => Boolean(onBrowserOpen);
  const openBrowserEntry = (entry: RailEntry) => {
    if (!onBrowserOpen) return;
    const tabId = entry.id.startsWith("browser:")
      ? entry.id.slice("browser:".length)
      : undefined;
    onBrowserOpen(tabId === "active" ? undefined : tabId);
  };
  /*
   * Click flow for the Artifact / file cards:
   *   - If the entry is previewable (`shouldOpenArtifactPreview`), parent
   *     opens the AppShell side-panel tab via `onOpenArtifactPreview`. Matches
   *     the Codex `openWorkspaceFile({..., openInSidePanel: true, ...})` route
   *     in local-conversation-thread-*.js.
   *   - Otherwise fall back to the generic "open file in editor" / "open
   *     URL" / "open diff" handlers (Codex open-workspace-file-*.js
   *     non-side-panel branch).
   */
  const canOpenArtifactEntry = (entry: RailEntry) =>
    canOpenEntry(entry) || Boolean(onOpenArtifactPreview && shouldOpenArtifactPreview(entry));
  const openArtifactEntry = (entry: RailEntry) => {
    if (onOpenArtifactPreview && shouldOpenArtifactPreview(entry)) {
      onOpenArtifactPreview(entry);
      return;
    }
    openEntry(entry);
  };

  return (
    <aside className="hc-right-rail" data-display-mode={displayMode} data-pinned={isPinned ? "true" : "false"}>
      {/*
       * CODEX-REF: local-conversation-thread-*.js — sections wrapper
       * className `flex h-fit max-h-full min-h-0 flex-col gap-3 overflow-y-auto pb-3`。
       * 外壳是 `overflow-hidden`，sections 在内层 wrapper 内 scroll。
       */}
      <div className="hc-right-rail-sections">
      {sections.map((section) => (
        <RailSection
          key={section.id}
          count={section.count}
          defaultCollapsed={section.defaultCollapsed}
          id={section.id}
          summary={section.summary}
          title={section.title}
          /*
           * codex: local-conversation-thread-*.js — Environment
           * section accordion accepts an `after` prop in its header. Codex
           * Desktop renders the worktree menu trigger (Monitor/Cloud/Worktree
           * icon + chevron-down + current worktree label) there alongside the
           * branch diff stats. HiCodex's branch diff stats already live inside
           * `BranchDetailsCard` as a row trailing; the header slot is reserved
           * for the worktree menu trigger when `onOpenWorktreeMenu` is wired.
           */
          /*
           * CODEX-REF: local-conversation-thread-*.js —
           * Environment section 的 header `after` slot 总是渲染
           * Choose environment 按钮(path B disabled state:settings-cog icon
           * 7x7 px,tooltip "Choose environment",disabled when canChangeEnvironment
           * 为假)。HiCodex 没有 environments 数据流,此处仅纯 UI 占位符严格对齐
           * Codex 容器 className(7x7、rounded-sm、bg-transparent、tertiary)。
           * WorktreeMenuTrigger 已 deprecate(onOpenWorktreeMenu 无调用方,dead prop)。
           */
          /*
           * CODEX-REF: local-conversation-thread-CEeZyOcp.js — the Tasks (background
           * -tasks) section header carries an `after` action button "View all processes"
           * (opens the process manager). HiCodex has no process-manager view yet, so the
           * button renders in its Codex form (size-6 rounded-sm tertiary, icon-xs glyph,
           * aria-label/title via the Codex id) but disabled until the route is wired.
           */
          headerAction={section.id === "branchDetails"
            ? <EnvironmentSelectorPlaceholder />
            : section.id === "backgroundTasks"
              ? <ViewAllProcessesPlaceholder />
              : undefined}
        >
          {section.id === "branchDetails" && section.branchDetails
            ? <BranchDetailsCard details={section.branchDetails} canOpenEntry={canOpenEntry} onOpenEntry={openEntry} />
            : section.id === "sources"
              /* CODEX-REF: local-conversation-thread-*.js — Codex renders Sources as a
               * wrapping row of icon-only favicon buttons (name in tooltip), with a
               * `py-1 text-base text-token-description-foreground` "No sources yet" row
               * when the tool-source list is empty rather than hiding the section. */
              ? (section.allEntries.length === 0
                  ? <div className="hc-rail-empty-state">{formatMessage({ id: "codex.localConversation.sources.empty", defaultMessage: "No sources yet" })}</div>
                  : <SourcesIconRow entries={section.allEntries} />)
            : section.id === "artifacts" && section.allEntries.length === 0
              /* CODEX-REF: local-conversation-thread-*.js —
               * Codex Desktop's artifact list body renders a
               * `codex.localConversation.artifacts.empty` "No artifacts yet" row when
               * the artifact list is empty, matching the Sources empty-state behavior. */
              ? <div className="hc-rail-empty-state">{formatMessage({ id: "codex.localConversation.artifacts.empty", defaultMessage: "No artifacts yet" })}</div>
            : (
                <RailList
                  entries={section.allEntries}
                  sectionId={section.id}
                  backgroundTerminalCleanupPending={backgroundTerminalCleanupPending}
                  /* codex: local-conversation-thread-*.js — route the new P0
                   * single-entry sections through dedicated open handlers so
                   * `<RightRail onAutomationOpen=… onBrowserOpen=…>` is the
                   * one source of truth. */
                  canOpenEntry={section.id === "artifacts"
                    ? canOpenArtifactEntry
                    : section.id === "automation"
                      ? canOpenAutomationEntry
                      : section.id === "browser"
                        ? canOpenBrowserEntry
                        : canOpenEntry}
                  onCleanBackgroundTerminals={section.id === "backgroundTasks" && hasBackgroundTerminalEntries(section.allEntries)
                    ? onCleanBackgroundTerminals
                    : undefined}
                  onOpenEntry={section.id === "artifacts"
                    ? openArtifactEntry
                    : section.id === "automation"
                      ? openAutomationEntry
                      : section.id === "browser"
                        ? openBrowserEntry
                        : section.id === "sideChats" ? openSideChatEntry
                        : openEntry}
                />
              )}
        </RailSection>
      ))}
      </div>
    </aside>
  );
}

/*
 * Codex Desktop's rail sections are *text-only* — every section call site in
 * local-conversation-thread-*.js passes a bare `<X i18n .../>` to the `title`
 * prop. Section
 * header icons were a HiCodex-original embellishment; removed for parity.
 */

// CODEX-REF: local-conversation-thread-*.js (Environment section) —
// 当前 Codex 桌面版 Environment section 内仅以下 row 顺序:
//   1. Changes        (file-with-plus icon + diff-stats trailing,
//                      zero 时仍渲染 `+0 -0`,无 fallback 字符串)
//   2. worktree / thread-handoff trigger(仅 conversationId 存在时渲染;
//      HiCodex 用 "Local" 行承载相同语义)
//   3. branch picker  (branch-graph icon + label=currentBranch + chevron-right;
//      HiCodex 当前没 currentBranch 数据流,跳过该独立 row)
//   4. git actions    (commit/push action rows;HiCodex 没数据流,跳过)
//   5. GitHub status  (icon + 多状态 label;HiCodex 用 "GitHub" 行对齐)
// 注:Codex 没有独立 "Branch" 和 "Commit" row(HiCodex 旧 5-row 设计来自已不存在的
// 旧 bundle 引用)。本次砍掉独立 Branch / Commit row 以严格对齐当前 Desktop。
function BranchDetailsCard({
  details,
  canOpenEntry,
  onOpenEntry,
}: {
  details: BranchDetailsViewModel;
  canOpenEntry: (entry: RailEntry) => boolean;
  onOpenEntry: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
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
  // NOT coalesce to `+0 -0`. HiCodex previously coalesced line counts with `?? 0`,
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
          `.icon-sm{width:18px;height:18px}`). lucide `FileDiff` is HiCodex's
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
          NOT expose the execution mode (the `local` row carries only id/label), so HiCodex
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

/*
 * CODEX-REF: local-conversation-thread-*.js — Choose
 * environment 按钮 placeholder。Codex 容器 className:
 *   `flex h-7 w-7 shrink-0 cursor-interaction items-center justify-center
 *    rounded-sm border-0 bg-transparent p-0 text-token-text-tertiary
 *    hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background`
 * path B(无 environment selected,canChangeEnvironment 假)只渲染 settings-cog
 * icon (`icon-sm`) + tooltip + disabled。HiCodex 没 environments 数据流,
 * 此处 disabled 占位严格对齐 Codex path B 视觉。
 */
function EnvironmentSelectorPlaceholder(): ReactNode {
  const { formatMessage } = useHiCodexIntl();
  // CODEX-REF: local-conversation-thread-CEeZyOcp.js — the Choose environment
  // trigger uses i18n id `threadPage.runAction.environmentSelector.label`
  // (defaultMessage "Choose environment") and renders its cog at `icon-xs` (16px),
  // not `composer.environmentSelector.title`/14px. Aligned id + size here.
  const chooseEnvironmentLabel = formatMessage({
    id: "threadPage.runAction.environmentSelector.label",
    defaultMessage: "Choose environment",
  });
  return (
    <button
      aria-label={chooseEnvironmentLabel}
      className="hc-rail-environment-selector"
      disabled
      title={chooseEnvironmentLabel}
      type="button"
    >
      <Settings size={16} aria-hidden="true" />
    </button>
  );
}

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — Tasks (background-tasks) section
 * header `after` action: "View all processes" button that opens the process manager.
 * Codex container className: `ms-auto inline-flex size-6 cursor-interaction items-center
 * justify-center rounded-sm text-token-text-tertiary hover:text-token-foreground …` with
 * an `icon-xs` (16px) glyph and aria-label/title from
 * `codex.localConversation.backgroundTasks.viewAllProcessesLabel`. HiCodex has no
 * process-manager route yet, so the button renders in Codex's form (reusing the
 * environment-selector placeholder shape) but is disabled until the route is wired.
 * lucide `List` is the clean-room match for the process-list glyph.
 */
function ViewAllProcessesPlaceholder(): ReactNode {
  const { formatMessage } = useHiCodexIntl();
  const viewAllProcessesLabel = formatMessage({
    id: "codex.localConversation.backgroundTasks.viewAllProcessesLabel",
    defaultMessage: "View all processes",
  });
  return (
    <button
      aria-label={viewAllProcessesLabel}
      className="hc-rail-environment-selector"
      disabled
      title={viewAllProcessesLabel}
      type="button"
    >
      <List size={16} aria-hidden="true" />
    </button>
  );
}

/*
 * codex: local-conversation-thread-*.js — Environment section
 * header `after` slot: worktree menu trigger. Desktop's Environment data aggregator
 * threads `{worktreeLabel, worktreeMode}` into the section header next to the
 * diff stats; clicking the chip opens the worktree mode menu (Local / Cloud /
 * Worktree …). HiCodex re-uses the lightweight chip styling from the composer
 * worktree menu and surfaces a single trigger button — the menu itself lives
 * in `worktree-mode-menu.tsx` and is opened by the caller (HiCodexApp) when
 * `onOpenWorktreeMenu` fires.
 */
function WorktreeMenuTrigger({
  worktreeLabel,
  onOpen,
}: {
  worktreeLabel: string;
  onOpen: () => void;
}): ReactNode {
  const { formatMessage } = useHiCodexIntl();
  return (
    <button
      aria-haspopup="menu"
      aria-label={formatMessage(
        { id: "hc.rightRail.worktreeMenu.openLabel", defaultMessage: "Open worktree menu ({worktreeLabel})" },
        { worktreeLabel },
      )}
      className="hc-rail-section-action hc-rail-worktree-trigger"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      title={worktreeLabel}
      type="button"
    >
      <Laptop size={12} />
      <span className="hc-rail-worktree-trigger-label">{worktreeLabel}</span>
      <ChevronDown size={12} />
    </button>
  );
}

/*
 * codex: local-conversation-thread-*.js — Environment data
 * aggregator exposes `currentWorktreeName`/`worktreeLabel`; HiCodex pulls the
 * same surface label from the branchDetails local row when available and
 * falls back to "Local" (Desktop's default chip text when no worktree is
 * active).
 */
function branchDetailsWorktreeLabel(details: BranchDetailsViewModel | undefined): string {
  if (!details) return "Local";
  const localRow = details.rows.find((row) => row.id === "local");
  return localRow?.value || localRow?.label || "Local";
}

function branchChangesMeta(details: BranchDetailsViewModel): string {
  if (details.diff) return details.diff.summary;
  const changedFiles = details.gitStatus?.changedFiles;
  if (changedFiles !== undefined) {
    return `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`;
  }
  return "Review changed files";
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
              the badge stays visible whenever count>0 (expanded AND collapsed). HiCodex
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
       * HiCodex 用 CSS grid-rows trick + opacity + margin-top 等价实现 height-auto
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

export function RailList({
  entries,
  sectionId,
  backgroundTerminalCleanupPending = false,
  canOpenEntry,
  onCleanBackgroundTerminals,
  onOpenEntry,
}: RailListProps & {
  canOpenEntry?: (entry: RailEntry) => boolean;
  onCleanBackgroundTerminals?: () => void;
  onOpenEntry?: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [expanded, setExpanded] = useState(false);
  const clipped = shouldClipRailList(sectionId)
    ? clipRailEntries(entries, expanded)
    : {
        entries,
        remainingCount: 0,
        canToggle: false,
      };
  let generatedImageCount = 0;
  /*
   * CODEX-REF: local-conversation-thread-*.js ({artifacts} listClassName):
   *   `-mx-2 flex max-h-[28rem] flex-col gap-px overflow-y-auto px-2`
   * Artifact lists use `max-height: 28rem` so a long artifact list scrolls
   * independently inside the section rather than pushing all other sections out
   * of view. `data-section-id` feeds the CSS selector.
   */
  return (
    <div className="hc-rail-list" data-section-id={sectionId}>
      {clipped.entries.map((entry) => {
        const isGeneratedImage = sectionId === "artifacts" && isGeneratedImageArtifact(entry);
        if (isGeneratedImage) generatedImageCount += 1;
        const displayTitle = isGeneratedImage
          ? formatMessage(
              { id: "codex.localConversation.artifacts.generatedImage", defaultMessage: "Generated image {imageNumber}" },
              { imageNumber: generatedImageCount },
            )
          : undefined;
        // CODEX-REF: local-conversation-thread-CEeZyOcp.js — the background-terminal
        // "Stop all" control is the row's trailing `actions` slot (cleanup button), not a
        // separate card region. Threaded into SummaryPanelRow.trailing below.
        const stopTerminalsAction = sectionId === "backgroundTasks" && isBackgroundTerminalEntry(entry) && onCleanBackgroundTerminals ? (
          <button
            aria-label={formatMessage({ id: "codex.localConversation.backgroundTerminals.stop", defaultMessage: "Stop all background terminals" })}
            className="hc-rail-section-action hc-rail-card-action"
            disabled={backgroundTerminalCleanupPending}
            onClick={(event) => {
              event.stopPropagation();
              onCleanBackgroundTerminals();
            }}
            title={formatMessage({ id: "codex.localConversation.backgroundTerminals.stopTooltip", defaultMessage: "Stop all background terminals" })}
            type="button"
          >
            {backgroundTerminalCleanupPending
              ? <LoaderCircle className="hc-rail-progress-spinner" size={12} />
              : <Square size={12} />}
          </button>
        ) : undefined;
        // CODEX-REF: local-conversation-thread-CEeZyOcp.js — every rail row EXCEPT the
        // plan/progress step list is a single-line `summary-panel-row` (wc): `h-7
        // items-center px-0 py-1`, label `text-base` (14px). Only the progress section
        // renders the multi-line `line-clamp-3` step card. Route progress → RailEntryCard
        // (card) and every other section → RailSummaryRow (single-line wc parity). This
        // collapses the prior multi-line `hc-rail-card` rendering of automation / outputs /
        // side-chats / subagents / terminals onto Codex's uniform single-line row model.
        if (sectionId === "progress") {
          return (
            <RailEntryCard
              entry={entry}
              key={entry.id}
              sectionId={sectionId}
              displayTitle={displayTitle}
              canOpen={canOpenEntry}
              onOpen={onOpenEntry}
            />
          );
        }
        return (
          <RailSummaryRow
            entry={entry}
            key={entry.id}
            sectionId={sectionId}
            displayTitle={displayTitle}
            trailingAction={stopTerminalsAction}
            canOpen={canOpenEntry}
            onOpen={onOpenEntry}
          />
        );
      })}
      {clipped.canToggle && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded
            ? formatMessage({ id: "codex.localConversation.summaryPanelExpandableList.showLess", defaultMessage: "Show less" })
            : formatMessage(
                { id: "codex.localConversation.summaryPanelExpandableList.showMore", defaultMessage: "Show {count} more" },
                { count: clipped.remainingCount },
              )}
        </button>
      )}
    </div>
  );
}

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — single-line rail row (wc /
 * summary-panel-row) used by every non-progress section. Mirrors Codex's uniform
 * `h-7 items-center px-0 py-1` row with a `text-base` (14px) label, an optional
 * leading icon (omitted for subagent `agent` rows whose `icon:null`), and a trailing
 * slot (diff-stats / Stop-terminals action). Per-section label shapes:
 *   - browser:  baseline `[title, displayUrl]` Fragment, shimmer-wrapped while active
 *   - automation: baseline `[name(flex-1 truncate), rrule(max-w-48 shrink-0 truncate
 *     secondary)]` Fragment
 *   - backgroundSubagents: `[name, "is working" shimmer]` Fragment, no icon
 *   - backgroundTasks (terminal): mono command text, "Background terminal" fallback
 *   - outputs / side-chats: plain truncated label
 */
function RailSummaryRow({
  entry,
  sectionId,
  displayTitle,
  trailingAction,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
  trailingAction?: ReactNode;
  canOpen?: (entry: RailEntry) => boolean;
  onOpen?: (entry: RailEntry) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  const title = displayTitle ?? entry.title;
  const interactive = Boolean(canOpen?.(entry) && onOpen);
  const onClick = interactive && onOpen ? () => onOpen(entry) : undefined;
  const icon = railEntryIcon(entry, sectionId);

  // codex: automation row tooltip = "Next run: …" (carried on entry.status); other rows
  // tooltip the meta/title.
  const tooltip = sectionId === "automation" && entry.status
    ? entry.status
    : entry.meta ?? title;

  // ----- browser row: baseline [title, displayUrl], shimmer wrap while active -----
  if (sectionId === "browser") {
    const browserActive = entry.status === "active";
    const label = (
      <span
        className={browserActive
          ? "hc-rail-row-browser-label loading-shimmer-pure-text"
          : "hc-rail-row-browser-label"}
      >
        <span className="hc-rail-card-browser-title">{title}</span>
        {entry.meta && (
          <span
            className={browserActive
              ? "hc-rail-card-browser-url"
              : "hc-rail-card-browser-url hc-rail-card-browser-url-inactive"}
          >
            {entry.meta}
          </span>
        )}
      </span>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  // ----- automation row: baseline [name (flex-1 truncate), rrule (shrink-0 truncate)] -----
  if (sectionId === "automation") {
    const label = (
      <>
        <span className="hc-rail-row-automation-name">{title}</span>
        {entry.meta && <span className="hc-rail-row-automation-rrule">{entry.meta}</span>}
      </>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  // ----- background subagent row: no icon, [name, "is working" shimmer], diff-stats trailing -----
  if (sectionId === "backgroundSubagents") {
    const isAgent = isBackgroundAgentEntry(entry);
    const active = isAgent && entry.status === "active";
    const stats = isAgent ? entry.diffStats ?? null : null;
    const label = (
      <>
        <span className="hc-rail-row-subagent-name">{title}</span>
        {active && (
          /* CODEX-REF: backgroundAgents.activeLabel = `loading-shimmer-pure-text shrink-0
             whitespace-nowrap text-token-description-foreground` */
          <span className="hc-rail-card-working">{formatMessage({ id: "codex.localConversation.backgroundAgents.activeLabel", defaultMessage: "is working" })}</span>
        )}
      </>
    );
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-label-baseline"
        trailing={stats ? <RailDiffStats stats={stats} /> : undefined}
        onClick={onClick}
        title={tooltip}
      />
    );
  }

  // ----- background terminal row: mono command, "Background terminal" fallback, Stop trailing -----
  if (sectionId === "backgroundTasks") {
    // CODEX-REF: local-conversation-thread-CEeZyOcp.js — terminal label is
    // `truncate font-mono text-sm` (13px monospace); empty command falls back to
    // `codex.localConversation.backgroundTerminals.defaultLabel` ("Background terminal").
    const commandText = (displayTitle ?? entry.title).trim();
    const label = commandText
      || formatMessage({ id: "codex.localConversation.backgroundTerminals.defaultLabel", defaultMessage: "Background terminal" });
    return (
      <SummaryPanelRow
        icon={icon}
        label={label}
        labelClassName="hc-rail-row-terminal-label"
        onClick={onClick}
        trailing={trailingAction}
        title={tooltip}
      />
    );
  }

  // ----- outputs / side-chats / fallback: plain truncated label -----
  return (
    <SummaryPanelRow
      icon={icon}
      label={title}
      onClick={onClick}
      trailing={trailingAction}
      title={tooltip}
    />
  );
}

// CODEX-REF: local-conversation-thread-CEeZyOcp.js — progress-step card (the only
// multi-line rail row). Single-line sections route through RailSummaryRow instead.
function RailEntryCard({
  entry,
  sectionId,
  displayTitle,
  canOpen,
  onOpen,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
  canOpen?: (entry: RailEntry) => boolean;
  onOpen?: (entry: RailEntry) => void;
}) {
  const progressStatus = sectionId === "progress" ? normalizeProgressStatus(entry.status) : undefined;
  if (canOpen?.(entry) && onOpen) {
    return (
      <button
        className="hc-rail-card hc-rail-card-button"
        data-progress-status={progressStatus}
        type="button"
        onClick={() => onOpen(entry)}
      >
        <RailEntryContent
          entry={entry}
          sectionId={sectionId}
          displayTitle={displayTitle}
        />
      </button>
    );
  }

  return (
    <div className="hc-rail-card" data-progress-status={progressStatus}>
      <RailEntryContent
        entry={entry}
        sectionId={sectionId}
        displayTitle={displayTitle}
      />
    </div>
  );
}

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — the progress (plan/status) step
 * list is the ONLY rail section that keeps the multi-line card layout: each step is a
 * `line-clamp-3 text-base leading-normal` body next to an `icon-sm` status glyph. Every
 * other section now renders through RailSummaryRow (single-line summary-panel-row). This
 * component therefore only serves progress entries.
 */
function RailEntryContent({
  entry,
  sectionId,
  displayTitle,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
}) {
  const title = displayTitle ?? entry.title;
  const tooltip = entry.meta ?? title;
  return (
    <div className="hc-rail-card-main">
      <span className="hc-rail-card-icon" aria-hidden="true">
        {railEntryIcon(entry, sectionId)}
      </span>
      <div className="hc-rail-card-copy">
        <div className="hc-rail-card-title-row">
          <div className="hc-rail-card-title hc-rail-card-title-progress" title={tooltip}>{title}</div>
        </div>
      </div>
    </div>
  );
}

function RailDiffStats({ stats }: { stats: NonNullable<RailEntry["diffStats"]> }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <span
      className="hc-rail-diff-stats"
      aria-label={formatMessage(
        {
          id: "hc.rightRail.diffStats.ariaLabel",
          defaultMessage: "{linesAdded} lines added, {linesRemoved} lines removed",
        },
        { linesAdded: stats.linesAdded, linesRemoved: stats.linesRemoved },
      )}
    >
      <span className="hc-rail-diff-added">+{stats.linesAdded}</span>
      <span className="hc-rail-diff-removed">-{stats.linesRemoved}</span>
    </span>
  );
}

function railEntryIcon(entry: RailEntry, sectionId: RightRailSectionViewModel["id"]): ReactNode {
  if (sectionId === "progress") return progressEntryIcon(entry.status);
  // CODEX-REF: local-conversation-thread-*.js — Codex 仅渲染 single automation
  // row 用 Clock 图标。Legacy multi-list "automations" 分支及 CalendarClock
  // 图标已删除以严格对齐 Codex（无 multi-list automation section）。
  if (sectionId === "automation") return <Clock size={16} />; // codex automation row icon = icon-xs (16px)
  if (sectionId === "branchDetails") return <GitBranch size={14} />;
  if (sectionId === "sideChats") {
    // CODEX-REF: local-conversation-thread-CEeZyOcp.js (Tf) — side-chat row icon
    // (message glyph / spinner) is `icon-sm` (18px), matching Changes/progress, not 14px.
    return normalizeProgressStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={18} />
      : <MessageSquareText size={18} />;
  }
  if (sectionId === "backgroundSubagents") {
    // CODEX-REF: local-conversation-thread-CEeZyOcp.js (Hu) — `case agent:` renders
    // `wc({icon:null,…})`: the subagent row has NO leading icon. Active state is
    // conveyed solely by the "is working" shimmer label next to the name; the spinner
    // does NOT occupy the icon slot. HiCodex previously rendered Bot/LoaderCircle here —
    // dropped to align (return null = empty icon slot).
    return null;
  }
  // CODEX-REF: local-conversation-thread-CEeZyOcp.js (Hu, terminal) — Tasks (background
  // -terminal) row icon is `icon-sm` (18px): `vi className:\`icon-sm shrink-0 …\``, not 14px.
  if (sectionId === "backgroundTasks") return <Terminal size={18} />;
  if (sectionId === "browser") {
    // codex: browser row — Desktop's active state shows a spinner; idle uses
    // a static Globe. HiCodex normalizes "active" (set by
    // browserRailEntry) to inProgress for the same spinner output.
    // CODEX-REF: local-conversation-thread-CEeZyOcp.js — browser row icon is
    // `icon-xs` (16px): `(isActive?…:go) className:\`icon-xs shrink-0\`` (go=Globe).
    return normalizeProgressStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={16} />
      : <Globe size={16} />;
  }
  if (sectionId === "sources") {
    /*
     * Sources panel logo 渲染。
     * Desktop 行为：source.logoUrl / logoUrlDark 选择 + 加载失败 fallback 到 icon。
     * 当前 HiCodex 没有主题信号传入此处，先用 light 优先策略；onError 时回退到
     * generic Network/Globe icon。WebSearch 始终用 Globe。
     */
    if (entry.id === "webSearch") return <Globe size={14} />;
    if (entry.logoUrl || entry.logoUrlDark) {
      return <SourceLogo logoUrl={entry.logoUrl} logoUrlDark={entry.logoUrlDark} alt={entry.title} />;
    }
    return <Network size={14} />;
  }
  const imageSrc = railEntryImageSrc(entry);
  if (imageSrc) return <img alt="" className="hc-rail-card-thumb" src={imageSrc} />;
  // codex Outputs rows render via summary-panel-row with `icon-sm` (18px) icons.
  if (entry.action?.kind === "url") return <Globe size={18} />;
  if (entry.reference && isImageArtifactPath(entry.reference.path)) return <ImageIcon size={18} />;
  /* File icons use the shared clean-room extension/MIME mapping helper. */
  return fileIconFor({ path: entry.reference?.path, size: 18 });
}

function shouldClipRailList(sectionId: RightRailSectionViewModel["id"]): boolean {
  return sectionId === "progress" || sectionId === "artifacts" || sectionId === "sources";
}

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — only a subset of rail sections pass
 * a `titleSuffix:(0,Q.jsx)(Xf,{count:…})` count badge to the section header. Verified in
 * the bundle: artifacts (Outputs), side-chats, background-subagents (Subagents),
 * background-tasks (Tasks) and tool-sources (Sources) DO; automation, browser-tabs,
 * environment (branchDetails) and progress do NOT. HiCodex mirrors that allow-list so a
 * single-entry section like Browser/Automation does not sprout a stray "1" badge.
 */
function sectionHasCountBadge(sectionId: RightRailSectionViewModel["id"]): boolean {
  return (
    sectionId === "artifacts"
    || sectionId === "sideChats"
    || sectionId === "backgroundSubagents"
    || sectionId === "backgroundTasks"
    || sectionId === "sources"
  );
}

/**
 * Source logo 加载组件 — light/dark URL 选择 + onError fallback。
 * 当前 HiCodex 没有把主题信号传到 right-rail，使用 light 优先；失败时切到 dark，
 * 仍失败回退 generic Network icon。
 */
function SourceLogo({
  logoUrl,
  logoUrlDark,
  alt,
}: {
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  alt: string;
}): ReactNode {
  const [failed, setFailed] = useState(false);
  const [usingDark, setUsingDark] = useState(false);
  if (failed) return <Network size={14} />;
  const primary = usingDark ? logoUrlDark : logoUrl;
  const fallback = usingDark ? logoUrl : logoUrlDark;
  const src = primary || fallback || "";
  if (!src) return <Network size={14} />;
  return (
    <img
      alt={alt}
      className="hc-rail-card-thumb"
      src={src}
      onError={() => {
        if (!usingDark && logoUrlDark) {
          setUsingDark(true);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/*
 * codex Sources section (local-conversation-thread-*.js `Nf`): each source renders
 * as an icon-only `size-6` (24px) `rounded-sm` button with an `icon-xs` (16px) logo
 * and the source name in a left tooltip + aria-label — NOT a text-label row card.
 * HiCodex sources carry no open action (onOpenEntry is undefined for "sources"), so
 * we render Codex's non-`onOpen` variant: a `role="img"` span with the name as the
 * tooltip/aria-label. The icon resolution mirrors the railEntryIcon sources branch
 * (webSearch → Globe; logoUrl → SourceLogo; else Network) at 16px.
 */
function sourceEntryLogo(entry: RailEntry): ReactNode {
  if (entry.id === "webSearch") return <Globe size={16} />;
  if (entry.logoUrl || entry.logoUrlDark) {
    return <SourceLogo logoUrl={entry.logoUrl} logoUrlDark={entry.logoUrlDark} alt={entry.title} />;
  }
  return <Network size={16} />;
}

function SourcesIconRow({ entries }: { entries: readonly RailEntry[] }): ReactNode {
  return (
    <div className="hc-rail-sources-icons">
      {entries.map((entry) => (
        <span
          key={entry.id}
          role="img"
          className="hc-rail-source-icon"
          aria-label={entry.title ?? undefined}
          title={entry.title ?? undefined}
        >
          {sourceEntryLogo(entry)}
        </span>
      ))}
    </div>
  );
}

function progressEntryIcon(status: string | undefined): ReactNode {
  const normalized = normalizeProgressStatus(status);
  // codex plan/status step icon is `icon-sm` (18px), not 14px.
  if (normalized === "completed") return <CheckCircle2 size={18} />;
  if (normalized === "inProgress") return <LoaderCircle className="hc-rail-progress-spinner" size={18} />;
  return <Circle size={18} />;
}

function normalizeProgressStatus(status: string | undefined): "completed" | "inProgress" | "pending" {
  if (status === "completed" || status === "complete" || status === "done") return "completed";
  if (status === "inProgress" || status === "in_progress" || status === "running" || status === "active") {
    return "inProgress";
  }
  return "pending";
}

interface RailEntryOpenHandlers {
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenDiff?: () => void;
  onOpenThreadId?: OpenThreadHandler;
}

function isRailEntryActionAvailable(entry: RailEntry, handlers: RailEntryOpenHandlers): boolean {
  const action = railEntryAction(entry);
  if (!action) return false;
  switch (action.kind) {
    case "file":
      return Boolean(handlers.onOpenFileReference);
    case "url":
      return Boolean(handlers.onOpenUrl);
    case "source":
      return false;
    case "diff":
      return Boolean(handlers.onOpenDiff);
    case "thread":
      return Boolean(handlers.onOpenThreadId);
  }
}

function openRailEntry(entry: RailEntry, handlers: RailEntryOpenHandlers): void {
  const action = railEntryAction(entry);
  if (!action) return;
  switch (action.kind) {
    case "file":
      handlers.onOpenFileReference?.(action.reference);
      return;
    case "url":
      handlers.onOpenUrl?.(action.url);
      return;
    case "source":
      return;
    case "diff":
      handlers.onOpenDiff?.();
      return;
    case "thread":
      handlers.onOpenThreadId?.(action.threadId, {
        displayName: action.displayName,
        model: action.model,
        role: action.role,
      });
      return;
  }
}

function openRailSideChatEntry(entry: RailEntry, handlers: RailEntryOpenHandlers): void {
  const action = railEntryAction(entry);
  if (action?.kind !== "thread") return;
  handlers.onOpenThreadId?.(action.threadId, {
    displayName: action.displayName ?? entry.title,
    panelKind: "sideChat",
    model: action.model,
    role: action.role,
  });
}

function railEntryAction(entry: RailEntry): RailEntryAction | undefined {
  return entry.action ?? (entry.reference ? { kind: "file", reference: entry.reference } : undefined);
}

function hasBackgroundTerminalEntries(entries: ReadonlyArray<RailEntry>): boolean {
  return entries.some(isBackgroundTerminalEntry);
}

function isBackgroundTerminalEntry(entry: RailEntry): boolean {
  return entry.id.startsWith("background-terminal:");
}

function isBackgroundAgentEntry(entry: RailEntry): boolean {
  return entry.id.startsWith("background-agent:");
}

function isImageArtifactPath(value: string): boolean {
  return /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i.test(value);
}

function isGeneratedImageArtifact(entry: RailEntry): boolean {
  const path = entry.reference?.path ?? entry.meta ?? entry.id;
  const basename = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  return /^ig_[a-f0-9]{32,}\.(?:avif|gif|jpe?g|png|webp)$/i.test(basename);
}

function railEntryImageSrc(entry: RailEntry): string {
  const action = entry.action;
  if (action?.kind === "url" && isImageArtifactPath(urlPathname(action.url))) return action.url;
  const imagePath = entry.reference?.path && isImageArtifactPath(entry.reference.path)
    ? entry.reference.path
    : entry.meta && isImageArtifactPath(entry.meta) ? entry.meta : "";
  if (!imagePath) return "";
  if (/^(?:data:image\/|blob:|https?:|file:)/i.test(imagePath)) return imagePath;
  if (!imagePath.startsWith("/")) return "";
  try {
    return convertLocalFileSrc(imagePath);
  } catch {
    return `file://${encodeURI(imagePath)}`;
  }
}

function urlPathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}
