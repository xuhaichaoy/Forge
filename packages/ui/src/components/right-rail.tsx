import {
  List,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { shouldOpenArtifactPreview } from "../state/artifact-preview";
import { useForgeIntl } from "./i18n-provider";
import type { OpenThreadHandler } from "./open-thread";
import type { RailEntry, RailEntryReference } from "../state/render-groups";
import {
  type RightRailDisplayMode,
  type RightRailSection as RightRailSectionViewModel,
} from "../state/right-rail";
import { BranchDetailsCard } from "./right-rail-branch-details";
import {
  isRailEntryActionAvailable,
  openRailEntry,
  openRailSideChatEntry,
} from "./right-rail-entry-actions";
import { isGeneratedImageArtifact } from "./right-rail-entry-icons";
import { RailList, SourcesIconRow } from "./right-rail-entries";
import { RailSection } from "./right-rail-section";

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
  onOpenGeneratedImagePreview?: (entry: RailEntry, entries: readonly RailEntry[]) => boolean | void;
  onOpenFileReference?: (reference: RailEntryReference) => void;
  onOpenUrl?: (url: string) => void;
  onOpenDiff?: () => void;
  onOpenPlan?: (entry: RailEntry) => void;
  onOpenThreadId?: OpenThreadHandler;
  onBranchSwitched?: (branchName: string) => void;
  onCleanBackgroundTerminals?: () => void;
  backgroundTerminalCleanupPending?: boolean;
  // codex: local-conversation-thread-*.js — automation panel CTA;
  // Desktop's automation row routes to the automation detail view.
  onAutomationOpen?: (automationId: string) => void;
  // codex: local-conversation-thread-*.js — browser panel CTA;
  // Desktop's browser row opens the active browser-use tab in the sandbox view.
  onBrowserOpen?: (tabId: string | undefined) => void;
}

export function RightRail({
  sections,
  displayMode = "overlay",
  isPinned = true,
  onOpenArtifactPreview,
  onOpenGeneratedImagePreview,
  onOpenFileReference,
  onOpenUrl,
  onOpenDiff,
  onOpenPlan,
  onOpenThreadId,
  onBranchSwitched,
  onCleanBackgroundTerminals,
  backgroundTerminalCleanupPending = false,
  // codex: local-conversation-thread-*.js —
  // P0 right-rail data + callbacks. ForgeApp wires these once the
  // corresponding feature lights up.
  onAutomationOpen,
  onBrowserOpen,
}: RightRailProps) {
  const { formatMessage } = useForgeIntl();
  const canOpenEntry = (entry: RailEntry) =>
    isRailEntryActionAvailable(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenPlan,
      onOpenThreadId,
    });
  const openEntry = (entry: RailEntry) => {
    openRailEntry(entry, {
      onOpenFileReference,
      onOpenUrl,
      onOpenDiff,
      onOpenPlan,
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
    canOpenEntry(entry)
    || Boolean(onOpenGeneratedImagePreview && isGeneratedImageArtifact(entry))
    || Boolean(onOpenArtifactPreview && shouldOpenArtifactPreview(entry));
  const openArtifactEntry = (entry: RailEntry) => {
    if (isGeneratedImageArtifact(entry) && onOpenGeneratedImagePreview) {
      const artifacts = sections.find((section) => section.id === "artifacts")?.allEntries ?? [entry];
      const didOpen = onOpenGeneratedImagePreview(entry, artifacts);
      if (didOpen !== false) return;
    }
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
           * CODEX-REF: local-conversation-thread-*.js —
           * Environment section 的 header `after` slot 总是渲染
           * Choose environment 按钮(path B disabled state:Plus icon in the
           * current Desktop screenshot/bundle, tooltip "Choose environment",
           * disabled when canChangeEnvironment 为假)。Forge 没有 environments
           * 数据流,此处仅纯 UI 占位符严格对齐 Codex 容器 className。
           * WorktreeMenuTrigger 已 deprecate(onOpenWorktreeMenu 无调用方,dead prop)。
           */
          /*
           * CODEX-REF: local-conversation-thread-CEeZyOcp.js — the Tasks (background
           * -tasks) section header carries an `after` action button "View all processes"
           * (opens the process manager). Forge has no process-manager view yet, so the
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
            ? (
                <BranchDetailsCard
                  details={section.branchDetails}
                  canOpenEntry={canOpenEntry}
                  onOpenEntry={openEntry}
                  onBranchSwitched={onBranchSwitched}
                />
              )
            : section.id === "sources"
              /* CODEX-REF: local-conversation-thread-*.js — Codex renders Sources as a
               * wrapping row of icon-only favicon buttons when the source can open, or
               * static icon spans otherwise (name in tooltip), with a `py-1 text-base
               * text-token-description-foreground` "No sources yet" row when the
               * tool-source list is empty rather than hiding the section. */
              ? (section.allEntries.length === 0
                  ? <div className="hc-rail-empty-state">{formatMessage({ id: "codex.localConversation.sources.empty", defaultMessage: "No sources yet" })}</div>
                  : <SourcesIconRow entries={section.allEntries} canOpenEntry={canOpenEntry} onOpenEntry={openEntry} />)
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
 * header icons were a Forge-original embellishment; removed for parity.
 */

/*
 * CODEX-REF: local-conversation-thread-*.js — Choose
 * environment 按钮 placeholder。Codex 容器 className:
 *   `flex h-7 w-7 shrink-0 cursor-interaction items-center justify-center
 *    rounded-sm border-0 bg-transparent p-0 text-token-text-tertiary
 *    hover:bg-token-list-hover-background data-[state=open]:bg-token-list-hover-background`
 * path B(无 environment selected,canChangeEnvironment 假)只渲染 plus
 * icon (`icon-sm`) + tooltip + disabled。Forge 没 environments 数据流,
 * 此处 disabled 占位严格对齐 Codex path B 视觉。
 */
function EnvironmentSelectorPlaceholder(): ReactNode {
  const { formatMessage } = useForgeIntl();
  // CODEX-REF: local-conversation-thread-Bf38rCmF.pretty.js — the Choose environment
  // trigger uses i18n id `threadPage.runAction.environmentSelector.label`
  // (defaultMessage "Choose environment") and renders its plus glyph at icon-sm,
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
      <Plus size={16} aria-hidden="true" />
    </button>
  );
}

/*
 * CODEX-REF: local-conversation-thread-CEeZyOcp.js — Tasks (background-tasks) section
 * header `after` action: "View all processes" button that opens the process manager.
 * Codex container className: `ms-auto inline-flex size-6 cursor-interaction items-center
 * justify-center rounded-sm text-token-text-tertiary hover:text-token-foreground …` with
 * an `icon-xs` (16px) glyph and aria-label/title from
 * `codex.localConversation.backgroundTasks.viewAllProcessesLabel`. Forge has no
 * process-manager route yet, so the button renders in Codex's form (reusing the
 * environment-selector placeholder shape) but is disabled until the route is wired.
 * lucide `List` is the clean-room match for the process-list glyph.
 */
function ViewAllProcessesPlaceholder(): ReactNode {
  const { formatMessage } = useForgeIntl();
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

function hasBackgroundTerminalEntries(entries: ReadonlyArray<RailEntry>): boolean {
  return entries.some(isBackgroundTerminalEntry);
}

function isBackgroundTerminalEntry(entry: RailEntry): boolean {
  return entry.id.startsWith("background-terminal:");
}
