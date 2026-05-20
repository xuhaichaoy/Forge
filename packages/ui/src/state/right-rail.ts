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
  | "branchDetails"
  | "artifacts"
  | "sideChats"
  | "backgroundTasks"
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
  branchDetails?: BranchDetailsViewModel;
}

export interface RightRailProjectionInput {
  progress: RailEntry[];
  branchDetails: BranchDetailsViewModel | BranchDetailsEntryInput;
  artifacts: RailEntry[];
  showOutputs?: boolean;
  sideChats?: RailEntry[];
  backgroundAgents?: RailEntry[];
  backgroundTerminals?: RailEntry[];
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
    sections.push(projectEntrySection("progress", "Progress", input.progress, false, progressSummary(input.progress)));
  }

  const branchInput = input.branchDetails;
  const branchDetails = isBranchDetailsViewModel(branchInput) ? branchInput : undefined;
  const branchEntries = branchDetails ? branchDetailsEntries(branchDetails) : (branchInput as BranchDetailsEntryInput).entries;
  const hasBranchDetails = branchDetails ? branchDetails.hasData : branchEntries.length > 0;
  if (hasBranchDetails) {
    sections.push({
      id: "branchDetails",
      title: branchDetails?.title ?? (branchInput as BranchDetailsEntryInput).title ?? "Git",
      count: branchEntries.length,
      entries: branchEntries,
      allEntries: branchEntries,
      remainingCount: 0,
      canToggle: false,
      ...(branchDetails ? { branchDetails } : {}),
    });
  }

  // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js Xf —
  // Codex Desktop's `Xf` function renders Outputs as `se = !M && jsx(cf, ...)` where
  // `M = !E && b.kind === 'git'`, so Outputs is strictly suppressed whenever a git
  // project owns the right rail — even if real artifacts exist. The empty body uses the
  // `codex.localConversation.artifacts.empty` "No artifacts yet" row when shown.
  //
  // HiCodex deviation: in our agentic flows the assistant routinely writes files to
  // locations outside the git working tree (e.g. /Users/<me>/Downloads/*.xlsx,
  // generated images, /tmp scripts). Strictly mirroring Codex hides those artifacts
  // entirely whenever the user happens to be inside a git project, which makes the
  // generated file undiscoverable in the rail even though the inline file card is
  // visible in the transcript. We therefore keep Codex behavior for the empty case
  // (git project + no artifacts -> Outputs hidden) but force the section back on when
  // at least one artifact was projected, so users can always reach their generated
  // outputs. Non-git projects still get the always-on empty-state row like Codex.
  const shouldShowOutputs =
    input.showOutputs ?? (!hasBranchDetails || input.artifacts.length > 0);
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
    sections.push(projectEntrySection("backgroundTasks", "Background tasks", backgroundTasks, false));
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
  };
}

function progressSummary(entries: RailEntry[]): string {
  const completed = entries.reduce((count, entry) => count + (isCompletedProgressStatus(entry.status) ? 1 : 0), 0);
  const taskLabel = entries.length === 1 ? "task" : "tasks";
  return `${completed} out of ${entries.length} ${taskLabel} completed`;
}

function isCompletedProgressStatus(status: string | undefined): boolean {
  return status === "completed" || status === "complete" || status === "done";
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
