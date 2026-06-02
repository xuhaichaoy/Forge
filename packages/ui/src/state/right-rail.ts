import type { BranchDetailsViewModel } from "./branch-details";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";
import type { RailEntry } from "./render-groups";

export const RAIL_LIST_PREVIEW_LIMIT = 6;
export const DESKTOP_RIGHT_RAIL_WIDTH_PX = 300;
export const DESKTOP_RIGHT_RAIL_GAP_PX = 16;
export const DESKTOP_LEFT_PANEL_WIDTH_PX = 300;
export const LEGACY_RIGHT_RAIL_PINNED_STORAGE_KEY = "hicodex.rightRail.isPinned";
export const RIGHT_RAIL_PINNED_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.rightRailPinned;

const DESKTOP_THREAD_LAYOUT_WIDTH_PX = 736;
const DESKTOP_RIGHT_RAIL_OVERLAY_THRESHOLD_PX = 180;
const DESKTOP_RIGHT_RAIL_SHIFT_THRESHOLD_PX = 400;

export type RightRailSectionId =
  /*
   * CODEX-REF: local-conversation-thread-*.js — automation section (sectionKey=
   * "automation") 渲染**单条 automation**（输入是 `{automations,
   * conversationId}` 返回的 single object）。Codex bundle 内无 multi-list
   * automation 渲染分支。HiCodex 之前的 legacy `"automations"` (multi list) 没有
   * Codex 出处，删除以严格对齐。
   */
  | "progress"
  | "automation"
  | "branchDetails"
  | "artifacts"
  | "sideChats"
  /*
   * CODEX-REF: local-conversation-thread-DAwsPWah.js Wf — Desktop renders TWO
   * distinct background sections, not one merged "Subagents and tasks" list.
   * sectionKey="background-subagents" (title <Rf type="subagents"/> →
   * "Subagents", fed `backgroundAgents:l, backgroundTerminals:[]`) and
   * sectionKey="background-tasks" (title <Rf type="tasks"/> → "Tasks", fed
   * `backgroundTerminals:u`, with a "View all processes" header after-button).
   * Title i18n keys: codex.localConversation.backgroundTasks.title.subagents
   * / .title.tasks. The old combined-title branch is gone from the new bundle.
   */
  | "backgroundSubagents"
  | "backgroundTasks"
  | "browser"
  | "sources";
export type RightRailDisplayMode = "overlay" | "shift" | "gutter";

export interface RightRailSection {
  id: RightRailSectionId;
  title: string;
  summary?: string;
  count: number;
  entries: RailEntry[];
  allEntries: RailEntry[];
  remainingCount: number;
  canToggle: boolean;
  defaultCollapsed?: boolean;
  branchDetails?: BranchDetailsViewModel;
}

// codex: local-conversation-thread-*.js automation — single automation summary
// payload `{automations, conversationId}` with rrule humanized
// and "Next run: …" tooltip in the automation row body. HiCodex mirrors the
// structured fields without inheriting Desktop's full rrule library;
// rruleSummary is pre-humanized by the caller.
export interface RightRailAutomationInput {
  id: string;
  name: string;
  rruleSummary?: string;
  nextRunAtMs?: number | null;
}

// codex: local-conversation-thread-*.js browser-tabs — single browser tab
// summary (browser-use summary) with a body rendering title + displayUrl
// two-line row plus shimmer-on-active. HiCodex collapses the multi-tab list
// into the one-active-tab summary used by Desktop.
export interface RightRailBrowserInput {
  title: string;
  displayUrl: string;
  isActive: boolean;
  tabId?: string;
}

export interface RightRailProjectionInput {
  progress: RailEntry[];
  // codex: local-conversation-thread-*.js automation — new per-conversation
  // automation summary (distinct from the legacy `automations` RailEntry list).
  automation?: RightRailAutomationInput;
  /*
   * CODEX-REF: Codex 渲染 single automation 经 `{automations, conversationId}`
   * 返回 single object，不渲染 multi-list。HiCodex 严格对齐后删除 multi-list
   * 数据流入；保留 `automation` 单条字段。
   */
  branchDetails: BranchDetailsViewModel | BranchDetailsEntryInput;
  artifacts: RailEntry[];
  showOutputs?: boolean;
  sideChats?: RailEntry[];
  backgroundAgents?: RailEntry[];
  backgroundTerminals?: RailEntry[];
  // codex: local-conversation-thread-*.js browser-tabs — replaces the legacy
  // pre-built RailEntry[] with the structured single-tab summary that mirrors
  // Desktop's browser-tab row body.
  browser?: RightRailBrowserInput;
  sources: RailEntry[];
}

export interface BranchDetailsEntryInput {
  entries: RailEntry[];
  title?: string;
}

export interface ClippedRailEntries {
  entries: RailEntry[];
  remainingCount: number;
  canToggle: boolean;
}

export interface RightRailPreferenceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function rightRailPreferenceStorage(): RightRailPreferenceStorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadRightRailPinned(
  storage: RightRailPreferenceStorageLike | null | undefined,
  fallback = true,
): boolean {
  if (!storage) return fallback;
  try {
    const raw = readMigratedStorageValue(storage, RIGHT_RAIL_PINNED_STORAGE_KEY, [LEGACY_RIGHT_RAIL_PINNED_STORAGE_KEY]);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveRightRailPinned(
  storage: RightRailPreferenceStorageLike | null | undefined,
  isPinned: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(RIGHT_RAIL_PINNED_STORAGE_KEY, isPinned ? "1" : "0");
  } catch {
    // Storage failures should not break the conversation shell.
  }
}

/*
 * Earlier HiCodex versions defined `loadRightRailOpen`/`saveRightRailOpen`
 * around a `rightRailOpen` atom (HiCodex's misread of Codex Desktop's
 * `ea = A(P, !1)` RightPanel atom) and gated `showRightRail` on that boolean.
 * That model inverted the Summary Rail semantics — Progress/Git/Outputs/Sources
 * disappeared by default and only showed after the user clicked into a file
 * preview. The current code derives visibility from `isPinned + displayMode
 * + RightPanel (file preview)`; the storage key and accessors were removed.
 */
export function rightRailDisplayMode(contentWidthPx: number): RightRailDisplayMode {
  const sideSpace = rightRailSideSpace(contentWidthPx);
  if (sideSpace < DESKTOP_RIGHT_RAIL_OVERLAY_THRESHOLD_PX) return "overlay";
  if (sideSpace < DESKTOP_RIGHT_RAIL_SHIFT_THRESHOLD_PX) return "shift";
  return "gutter";
}

export function rightRailShouldRender(contentWidthPx: number): boolean {
  return rightRailDisplayMode(contentWidthPx) !== "overlay";
}

export function rightRailContentShiftPx(
  contentWidthPx: number,
  hasContent: boolean,
  isPinned = true,
): number {
  if (!hasContent || !isPinned || contentWidthPx <= 0 || rightRailDisplayMode(contentWidthPx) !== "shift") {
    return 0;
  }
  return -(DESKTOP_RIGHT_RAIL_WIDTH_PX + DESKTOP_RIGHT_RAIL_GAP_PX) / 2;
}

export function rightRailReservedInlineEndPx(
  contentWidthPx: number,
  hasContent: boolean,
  isPinned = true,
): number {
  if (!hasContent || !isPinned || contentWidthPx <= 0 || rightRailDisplayMode(contentWidthPx) === "overlay") {
    return 0;
  }
  return DESKTOP_RIGHT_RAIL_WIDTH_PX + (DESKTOP_RIGHT_RAIL_GAP_PX * 2);
}

export function projectRightRailSections(input: RightRailProjectionInput): RightRailSection[] {
  const sections: RightRailSection[] = [];

  if (input.progress.length > 0) {
    sections.push(projectEntrySection(
      "progress",
      "Progress",
      input.progress,
      true,
      undefined,
      allProgressEntriesCompleted(input.progress),
    ));
  }

  // codex: local-conversation-thread-*.js automation — single-entry section
  // with a Clock icon, label=name, meta=rrule summary, status carries the
  // humanized "Next run: …" string used as title in Desktop. Sort: directly
  // after progress, before automations/branchDetails (Desktop order
  // progress→automation→environment).
  if (input.automation) {
    const entry = automationRailEntry(input.automation);
    sections.push({
      id: "automation",
      title: "Automations",
      count: 1,
      entries: [entry],
      allEntries: [entry],
      remainingCount: 0,
      canToggle: false,
    });
  }

  /*
   * CODEX-REF: legacy `automations` multi-list section 已删除。Codex 只渲染
   * single automation 经 sectionKey "automation"（已在上方处理）。
   */
  const branchInput = input.branchDetails;
  const branchDetails = isBranchDetailsViewModel(branchInput) ? branchInput : undefined;
  const branchEntries = branchDetails ? branchDetailsEntries(branchDetails) : (branchInput as BranchDetailsEntryInput).entries;
  const hasBranchDetails = branchDetails ? branchDetails.hasData : branchEntries.length > 0;
  if (hasBranchDetails) {
    // codex: local-conversation-thread-*.js — environment section
    // title (i18n `codex.localConversation.environmentSummary.title`). The
    // section keyed `branchDetails` here is what Desktop labels "Environment";
    // the title default falls back to "Environment" while still honoring an
    // explicit override coming in via `branchDetails.title`/entry-input title.
    // TODO: codex: local-conversation-thread-*.js — PR row +
    // gh-status row require GitHub CLI integration; HiCodex no data source yet.
    sections.push({
      id: "branchDetails",
      title: branchDetails?.title ?? (branchInput as BranchDetailsEntryInput).title ?? "Environment",
      count: branchEntries.length,
      entries: branchEntries,
      allEntries: branchEntries,
      remainingCount: 0,
      canToggle: false,
      ...(branchDetails ? { branchDetails } : {}),
    });
  }

  // CODEX-REF: local-conversation-thread-*.js —
  // Codex Desktop renders the Git summary when the rail is Git-backed and renders
  // Outputs only when it is not, so the Outputs section is suppressed for
  // Git-backed rails even if artifact entries exist.
  const shouldShowOutputs = input.showOutputs ?? !hasBranchDetails;
  if (shouldShowOutputs) {
    sections.push(projectEntrySection("artifacts", "Outputs", input.artifacts, true));
  }

  if (input.sideChats && input.sideChats.length > 0) {
    sections.push(projectEntrySection("sideChats", "Side chats", input.sideChats, false));
  }

  // CODEX-REF: local-conversation-thread-DAwsPWah.js Wf — `Ve` then `He`.
  // Two separate sections, placed after Side chats and before Browser:
  //   Ve = l.length>0 && <Wd sectionKey="background-subagents" title=subagents
  //        titleSuffix=count{l.length} … backgroundAgents:l, backgroundTerminals:[] />
  //   He = de>0     && <Wd after=<button …"View all processes"/>
  //        sectionKey="background-tasks" title=tasks titleSuffix=count{de} …
  //        backgroundTerminals:u />
  // The two source arrays are separable in HiCodex's projection input:
  // `backgroundAgents` (subagents) and `backgroundTerminals` (tasks). Desktop
  // no longer merges them into a single "Subagents and tasks" list.
  const backgroundSubagents = input.backgroundAgents ?? [];
  if (backgroundSubagents.length > 0) {
    sections.push(projectEntrySection(
      "backgroundSubagents",
      "Subagents",
      backgroundSubagents,
      false,
    ));
  }

  const backgroundTasks = input.backgroundTerminals ?? [];
  if (backgroundTasks.length > 0) {
    sections.push(projectEntrySection(
      "backgroundTasks",
      "Tasks",
      backgroundTasks,
      false,
    ));
  }

  // codex: local-conversation-thread-*.js browser-tabs — single-entry section
  // with an active-spinner / Globe icon and shimmer-on-active title. HiCodex
  // captures the active/idle bit in `entry.status` so the renderer can route
  // it through the existing browser-row icon logic and add the shimmer class.
  if (input.browser) {
    const entry = browserRailEntry(input.browser);
    sections.push({
      id: "browser",
      title: "Browser",
      count: 1,
      entries: [entry],
      allEntries: [entry],
      remainingCount: 0,
      canToggle: false,
    });
  }

  // CODEX-REF: local-conversation-thread-*.js Sources slot —
  // 在 Codex 桌面版 panel sequence 中,Sources
  // (`tool-sources`, sectionKey:"tool-sources") **总是渲染**(无渲染条件),空态由
  // section 内部 "No sources yet" empty row 承载。HiCodex 原条件 `sources.length>0 ||
  // sections.length>0` 没源码依据,已对齐 always。
  sections.push(projectEntrySection("sources", "Sources", input.sources, true));

  return sections;
}

export function clipRailEntries(
  entries: RailEntry[],
  expanded = false,
  limit = RAIL_LIST_PREVIEW_LIMIT,
): ClippedRailEntries {
  const normalizedLimit = Math.max(0, limit);
  const canToggle = entries.length > normalizedLimit;
  const visibleEntries = expanded || !canToggle
    ? entries
    : entries.slice(0, normalizedLimit);

  return {
    entries: visibleEntries,
    remainingCount: Math.max(0, entries.length - visibleEntries.length),
    canToggle,
  };
}

function projectEntrySection(
  id: Exclude<RightRailSectionId, "branchDetails">,
  title: string,
  entries: RailEntry[],
  clippedByDefault: boolean,
  summary?: string,
  defaultCollapsed?: boolean,
): RightRailSection {
  const clipped = clippedByDefault
    ? clipRailEntries(entries)
    : {
        entries,
        remainingCount: 0,
        canToggle: false,
      };
  return {
    id,
    title,
    ...(summary ? { summary } : {}),
    count: entries.length,
    entries: clipped.entries,
    allEntries: entries,
    remainingCount: clipped.remainingCount,
    canToggle: clipped.canToggle,
    ...(defaultCollapsed ? { defaultCollapsed } : {}),
  };
}

function isCompletedProgressStatus(status: string | undefined): boolean {
  return status === "completed";
}

function allProgressEntriesCompleted(entries: RailEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => isCompletedProgressStatus(entry.status));
}

function isBranchDetailsViewModel(value: RightRailProjectionInput["branchDetails"]): value is BranchDetailsViewModel {
  return "rows" in value && "emptyText" in value && "hasData" in value;
}

function branchDetailsEntries(details: BranchDetailsViewModel): RailEntry[] {
  const rows = details.rows.map((row) => ({
    id: row.id,
    title: row.label,
    ...(row.value ? { meta: row.value } : {}),
    status: row.status ?? "available",
    ...(row.details && row.details.length > 0 ? { details: row.details } : {}),
    // codex: local-conversation-thread-*.js — environment row 4 PR — actionUrl
    // lifts into a `url` action so right-rail's onOpenUrl handler opens GitHub.
    ...(row.actionUrl ? { action: { kind: "url" as const, url: row.actionUrl } } : {}),
  }));
  return [
    {
      id: "changes",
      title: "Changes",
      meta: branchChangesMeta(details),
      status: details.diff?.hasDiff ? "changed" : "available",
      action: { kind: "diff" },
    },
    ...rows,
  ];
}

function branchChangesMeta(details: BranchDetailsViewModel): string {
  if (details.diff) return details.diff.summary;
  const changedFiles = details.gitStatus?.changedFiles;
  if (changedFiles !== undefined) {
    return `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`;
  }
  return "Review changed files";
}

function rightRailSideSpace(contentWidthPx: number): number {
  return (Math.max(0, contentWidthPx) - DESKTOP_THREAD_LAYOUT_WIDTH_PX) / 2;
}

// codex: local-conversation-thread-*.js automationRow — single automation row:
// row shell with a Clock icon, label = automation.name, sublabel = humanized
// rrule, title="Next run: …" tooltip computed off
// nextRunAtMs. HiCodex packs the same fields into the RailEntry slots that
// `right-rail.tsx::railEntryIcon` / `RailEntryContent` already understand.
function automationRailEntry(input: RightRailAutomationInput): RailEntry {
  const nextRun = formatNextRunAt(input.nextRunAtMs);
  return {
    id: `automation:${input.id}`,
    title: input.name,
    ...(input.rruleSummary ? { meta: input.rruleSummary } : {}),
    ...(nextRun ? { status: `Next run: ${nextRun}` } : {}),
  };
}

// codex: local-conversation-thread-*.js browserRow — single browser-tab row:
// row shell with an active-spinner / Globe icon, title + displayUrl
// two-line layout, shimmer overlay on the title when `isActive`.
function browserRailEntry(input: RightRailBrowserInput): RailEntry {
  return {
    id: input.tabId ? `browser:${input.tabId}` : "browser:active",
    title: input.title,
    meta: input.displayUrl,
    status: input.isActive ? "active" : "idle",
  };
}

// codex format-automation-next-run-label-*.js: a relative-day label, NOT a raw
// locale datetime — calendar-day delta via start-of-day diff (Math.round) → "Today
// at {time}" (delta 0) / "Tomorrow at {time}" (1) / "{weekday} at {time}" (else),
// with time = {hour:'numeric', minute:'2-digit'} and weekday:'long'; "Not scheduled"
// when there is no next run. (Codex also maps PAUSED → "-", but HiCodex's rail input
// carries no automation status, so that branch is omitted per "没有依据".)
function formatNextRunAt(nextRunAtMs: number | null | undefined): string {
  if (nextRunAtMs == null || !Number.isFinite(nextRunAtMs)) return "Not scheduled";
  try {
    const next = new Date(nextRunAtMs);
    const now = new Date();
    const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const deltaDays = Math.round((startOfDay(next) - startOfDay(now)) / 86_400_000);
    const time = next.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (deltaDays === 0) return `Today at ${time}`;
    if (deltaDays === 1) return `Tomorrow at ${time}`;
    const weekday = next.toLocaleDateString(undefined, { weekday: "long" });
    return `${weekday} at ${time}`;
  } catch {
    return "";
  }
}

export function formatTokensCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}
