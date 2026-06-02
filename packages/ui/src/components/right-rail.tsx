import {
  Bot,
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
          headerAction={section.id === "branchDetails"
            ? <EnvironmentSelectorPlaceholder />
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
  if (!details.hasData) {
    return (
      <div className="hc-rail-card">
        <div className="hc-rail-card-meta">{details.emptyText}</div>
      </div>
    );
  }

  const localRow = details.rows.find((row) => row.id === "local");
  const githubRow = details.rows.find((row) => row.id === "github");
  const githubLabel = githubRow?.value ?? details.githubStatus?.label ?? "GitHub CLI unavailable";

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
        label="Changes"
        trailing={changesTrailing}
        onClick={canOpenChanges ? () => onOpenEntry(changesEntry) : undefined}
        title={changesEntry.meta}
      />
      {/* CODEX-REF: local-conversation-thread-DAwsPWah.js — worktree/execution-mode
          trigger row. Codex renders the macbook glyph (lucide `Laptop`) at `icon-sm`
          (app-main-DGDTSRlh.css `.icon-sm{width:18px;height:18px}`) for the local
          execution mode; cloud→Cloud, worktree→GitBranch. BranchDetailsViewModel does
          NOT expose the execution mode here (the `local` row carries only id/label/
          value), so HiCodex always renders Laptop and cannot mode-swap the glyph yet.
          HiCodex 没接 worktree handoff 数据流,沿用旧 localRow 数据承载 label。 */}
      {localRow ? (
        <SummaryPanelRow
          icon={<Laptop size={18} />}
          label={localRow.label}
          title={localRow.value || localRow.label}
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
  return (
    <button
      aria-label="Choose environment"
      className="hc-rail-environment-selector"
      disabled
      title="Choose environment"
      type="button"
    >
      <Settings size={14} aria-hidden="true" />
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
  return (
    <button
      aria-haspopup="menu"
      aria-label={`Open worktree menu (${worktreeLabel})`}
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
          <span className="hc-rail-section-title">{title}</span>
          {!expanded && count > 0 && id !== "progress" && <span className="hc-rail-section-count">{count}</span>}
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
        return (
          <RailEntryCard
            entry={entry}
            key={entry.id}
            sectionId={sectionId}
            displayTitle={isGeneratedImage ? `Generated image ${generatedImageCount}` : undefined}
            trailingAction={sectionId === "backgroundTasks" && isBackgroundTerminalEntry(entry) && onCleanBackgroundTerminals ? (
              <button
                aria-label="Stop all background terminals"
                className="hc-rail-section-action hc-rail-card-action"
                disabled={backgroundTerminalCleanupPending}
                onClick={(event) => {
                  event.stopPropagation();
                  onCleanBackgroundTerminals();
                }}
                title="Stop all background terminals"
                type="button"
              >
                {backgroundTerminalCleanupPending
                  ? <LoaderCircle className="hc-rail-progress-spinner" size={12} />
                  : <Square size={12} />}
              </button>
            ) : undefined}
            canOpen={canOpenEntry}
            onOpen={onOpenEntry}
          />
        );
      })}
      {clipped.canToggle && (
        <button className="hc-rail-more-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : `Show ${clipped.remainingCount} more`}
        </button>
      )}
    </div>
  );
}

function RailEntryCard({
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
          trailingAction={trailingAction}
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
        trailingAction={trailingAction}
      />
    </div>
  );
}

function RailEntryContent({
  entry,
  sectionId,
  displayTitle,
  trailingAction,
}: {
  entry: RailEntry;
  sectionId: RightRailSectionViewModel["id"];
  displayTitle?: string;
  trailingAction?: ReactNode;
}) {
  const title = displayTitle ?? entry.title;
  const isBrowser = sectionId === "browser";
  const browserActive = isBrowser && entry.status === "active";
  // codex: automation row — sublabel (rrule summary) 是二行 layout;
  // browser 单独走 inline baseline gap-2,见下方 branch。
  const showSecondary = sectionId === "branchDetails" || sectionId === "automation";
  // codex: automation row — Desktop sets the row tooltip to "Next run: …" (entry.status
  // for automation rows) rather than the rrule summary, so use status when
  // present for automation rows; fall back to meta/title otherwise.
  const tooltip = sectionId === "automation" && entry.status
    ? entry.status
    : entry.meta ?? title;
  const diffStats = sectionId === "backgroundSubagents" && isBackgroundAgentEntry(entry) ? entry.diffStats ?? null : null;
  // codex: browser row — Browser title shimmer while the tab is active。Codex 把整段
  // (title + displayUrl) 用 `loading-shimmer-pure-text` 包裹,见 isBrowser 分支。
  const titleClassName = [
    "hc-rail-card-title",
    sectionId === "progress" ? "hc-rail-card-title-progress" : null,
  ].filter(Boolean).join(" ");
  return (
    <div className="hc-rail-card-main">
      <span className="hc-rail-card-icon" aria-hidden="true">
        {railEntryIcon(entry, sectionId)}
      </span>
      <div className="hc-rail-card-copy">
        {isBrowser ? (
          /*
           * CODEX-REF: local-conversation-thread-*.js (Browser row) —
           * title 和 displayUrl 同一行 baseline-aligned。源码 className 精确:
           *   active:  `flex min-w-0 items-baseline gap-2` 包在
           *            `<span class="loading-shimmer-pure-text w-full max-w-full min-w-0">` 内
           *   inactive: 同样 `flex items-baseline gap-2` 作为 labelClassName 传给 label 组件
           * 子 span:
           *   title:      `max-w-[60%] min-w-0 shrink truncate`
           *   displayUrl: `max-w-[40%] min-w-0 shrink truncate text-sm`
           *               + inactive 时 `text-token-text-secondary`(active 由 shimmer 接管)
           */
          <div
            className={browserActive
              ? "hc-rail-card-browser-label loading-shimmer-pure-text"
              : "hc-rail-card-browser-label"}
            title={tooltip}
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
          </div>
        ) : (
          <>
            <div className="hc-rail-card-title-row">
              <div className={titleClassName} title={tooltip}>{title}</div>
              {/* codex: an ACTIVE background subagent shows a shimmering "is working"
                  label next to its name (backgroundAgents.activeLabel =
                  loading-shimmer-pure-text + text-token-description-foreground). */}
              {sectionId === "backgroundSubagents" && isBackgroundAgentEntry(entry) && entry.status === "active" && (
                <span className="hc-rail-card-working">is working</span>
              )}
              {diffStats && <RailDiffStats stats={diffStats} />}
            </div>
            {showSecondary && entry.meta && <div className="hc-rail-card-meta">{entry.meta}</div>}
            {/* codex automation row shows next-run only as the title tooltip, not a visible body line. */}
            {showSecondary && entry.status && sectionId !== "automation" && (
              <div className="hc-rail-card-status">{entry.status}</div>
            )}
            {showSecondary && entry.details?.map((detail) => (
              <div className="hc-rail-card-status" key={detail}>{detail}</div>
            ))}
          </>
        )}
      </div>
      {trailingAction && <div className="hc-rail-card-actions">{trailingAction}</div>}
    </div>
  );
}

function RailDiffStats({ stats }: { stats: NonNullable<RailEntry["diffStats"]> }) {
  return (
    <span className="hc-rail-diff-stats" aria-label={`${stats.linesAdded} lines added, ${stats.linesRemoved} lines removed`}>
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
    return normalizeProgressStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={14} />
      : <MessageSquareText size={14} />;
  }
  if (sectionId === "backgroundSubagents") {
    return entry.status === "active"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={14} />
      : <Bot size={14} />;
  }
  if (sectionId === "backgroundTasks") return <Terminal size={14} />;
  if (sectionId === "browser") {
    // codex: browser row — Desktop's active state shows a spinner; idle uses
    // a static Globe. HiCodex normalizes "active" (set by
    // browserRailEntry) to inProgress for the same spinner output.
    return normalizeProgressStatus(entry.status) === "inProgress"
      ? <LoaderCircle className="hc-rail-progress-spinner" size={14} />
      : <Globe size={14} />;
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
