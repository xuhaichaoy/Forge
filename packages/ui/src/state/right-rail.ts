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
  | "progress"
  // codex: local-conversation-thread/pe:automation — per-conversation single
  // automation summary (sectionKey "automation"), distinct from the legacy
  // multi-entry "automations" list.
  | "automation"
  | "automations"
  | "branchDetails"
  | "artifacts"
  | "sideChats"
  | "backgroundTasks"
  | "browser"
  | "sources"
  | "status";
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

// codex: local-conversation-thread/pe:automation — single automation summary
// payload `lo({automations, conversationId})` with rrule humanized via `$i(...)`
// and "Next run: …" tooltip in the `au` body. HiCodex mirrors the structured
// fields without inheriting Desktop's full rrule library; rruleSummary is
// pre-humanized by the caller.
export interface RightRailAutomationInput {
  id: string;
  name: string;
  rruleSummary?: string;
  nextRunAtMs?: number | null;
}

// codex: local-conversation-thread/_e:browser-tabs — single browser tab summary
// `f = browserUseSummary` with `_l` body rendering title + displayUrl two-line
// row plus shimmer-on-active. HiCodex collapses the multi-tab list into the
// one-active-tab summary used by Desktop.
export interface RightRailBrowserInput {
  title: string;
  displayUrl: string;
  isActive: boolean;
  tabId?: string;
}

// codex: local-conversation-thread/Ce:mu — status footer payload (token-speed
// line + context-window usage tooltip + compact-thread button). The projection
// input carries the raw counters so HiCodexApp can pipe the same shape into
// both `projectRightRailSections` and the `<RightRail statusFooter=… />` prop.
export interface RightRailStatusFooterInput {
  tokensUsed?: number;
  contextWindow?: number;
  tokensPerSecond?: number;
}

export interface RightRailProjectionInput {
  progress: RailEntry[];
  // codex: local-conversation-thread/pe:automation — new per-conversation
  // automation summary (distinct from the legacy `automations` RailEntry list).
  automation?: RightRailAutomationInput;
  automations?: RailEntry[];
  branchDetails: BranchDetailsViewModel | BranchDetailsEntryInput;
  artifacts: RailEntry[];
  showOutputs?: boolean;
  sideChats?: RailEntry[];
  backgroundAgents?: RailEntry[];
  backgroundTerminals?: RailEntry[];
  // codex: local-conversation-thread/_e:browser-tabs — replaces the legacy
  // pre-built RailEntry[] with the structured single-tab summary that mirrors
  // Desktop's `_l` body.
  browser?: RightRailBrowserInput;
  sources: RailEntry[];
  status?: RailEntry[];
  // codex: local-conversation-thread/Ce:mu — status footer counters. Kept on
  // the projection input for documentation/typing; HiCodexApp forwards the
  // same value to `<RightRail statusFooter=… />` since the footer is rendered
  // outside the `RightRailSection[]` list.
  statusFooter?: RightRailStatusFooterInput;
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

  // codex: local-conversation-thread/pe:automation — single-entry section with
  // `na` (Clock) icon, label=name, meta=rrule summary, status carries the
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

  if (input.automations && input.automations.length > 0) {
    sections.push(projectEntrySection("automations", "Automations", input.automations, false));
  }

  const branchInput = input.branchDetails;
  const branchDetails = isBranchDetailsViewModel(branchInput) ? branchInput : undefined;
  const branchEntries = branchDetails ? branchDetailsEntries(branchDetails) : (branchInput as BranchDetailsEntryInput).entries;
  const hasBranchDetails = branchDetails ? branchDetails.hasData : branchEntries.length > 0;
  if (hasBranchDetails) {
    // codex: local-conversation-thread-CecHj6JI.js#J — environment section
    // title (i18n `codex.localConversation.environmentSummary.title`). The
    // section keyed `branchDetails` here is what Desktop labels "Environment";
    // the title default falls back to "Environment" while still honoring an
    // explicit override coming in via `branchDetails.title`/entry-input title.
    // TODO: codex: local-conversation-thread-CecHj6JI.js#J — PR row (ga) +
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

  // CODEX-REF: /private/tmp/codex-asar/pretty/local-conversation-thread-BX7YNcUw.pretty.js:7918-7952 —
  // Codex Desktop renders the Git summary when `M` is truthy and renders Outputs
  // only when `!M`, so the Outputs section is suppressed for Git-backed rails even
  // if artifact entries exist.
  const shouldShowOutputs = input.showOutputs ?? !hasBranchDetails;
  if (shouldShowOutputs) {
    sections.push(projectEntrySection("artifacts", "Outputs", input.artifacts, true));
  }

  if (input.sideChats && input.sideChats.length > 0) {
    sections.push(projectEntrySection("sideChats", "Side chats", input.sideChats, false));
  }

  const backgroundTasks = [
    ...(input.backgroundAgents ?? []),
    ...(input.backgroundTerminals ?? []),
  ];
  if (backgroundTasks.length > 0) {
    sections.push(projectEntrySection(
      "backgroundTasks",
      backgroundTasksTitle(input.backgroundAgents ?? [], input.backgroundTerminals ?? []),
      backgroundTasks,
      false,
    ));
  }

  // codex: local-conversation-thread/_e:browser-tabs — single-entry section
  // with `ma`(active)/`wa`(Globe) icon and shimmer-on-active title. HiCodex
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

  // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js he —
  // Codex Desktop's `<jf>` panel section always renders the "Sources" group in the
  // summary panel; when no tool sources are present it shows a "No sources yet" empty
  // state row instead of hiding the section. We mirror that by emitting Sources
  // whenever the rest of the panel has content (so users never see Sources collapse
  // mid-conversation), or whenever real sources are present.
  if (input.sources.length > 0 || sections.length > 0) {
    sections.push(projectEntrySection("sources", "Sources", input.sources, true));
  }

  if (input.status && input.status.length > 0) {
    sections.push(projectEntrySection("status", "Status", input.status, false));
  }

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

function backgroundTasksTitle(backgroundAgents: RailEntry[], backgroundTerminals: RailEntry[]): string {
  const hasBackgroundAgents = backgroundAgents.length > 0;
  const hasBackgroundTerminals = backgroundTerminals.length > 0;
  if (hasBackgroundAgents && hasBackgroundTerminals) return "Subagents and tasks";
  if (hasBackgroundAgents) return "Subagents";
  return "Tasks";
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
    // codex: local-conversation-thread-CecHj6JI.js#J row 4 PR — actionUrl lifts
    // into a `url` action so right-rail's onOpenUrl handler opens GitHub.
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

// codex: local-conversation-thread/au:automationRow — single automation row:
// `<es>` shell with `na`(Clock), label = automation.name, sublabel = rrule
// humanized via `$i(rrule)`, title="Next run: …" tooltip computed off
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

// codex: local-conversation-thread/_l:browserRow — single browser-tab row:
// `<es>` shell with `ma`(active spinner)/`wa`(Globe) icon, title + displayUrl
// two-line layout, shimmer overlay on the title when `isActive`.
function browserRailEntry(input: RightRailBrowserInput): RailEntry {
  return {
    id: input.tabId ? `browser:${input.tabId}` : "browser:active",
    title: input.title,
    meta: input.displayUrl,
    status: input.isActive ? "active" : "idle",
  };
}

// codex: local-conversation-thread/au:automationRow — `Next run:` tooltip
// timestamp formatting. Desktop uses the user's locale + an "X minutes/hours
// from now" rrule helper; HiCodex shows the localized date/time, which keeps
// the tooltip readable without pulling in a full rrule library.
function formatNextRunAt(nextRunAtMs: number | null | undefined): string {
  if (nextRunAtMs == null || !Number.isFinite(nextRunAtMs)) return "";
  try {
    return new Date(nextRunAtMs).toLocaleString();
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
