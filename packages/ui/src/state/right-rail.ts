import type { BranchDetailsViewModel } from "./branch-details";
import type { RailEntry } from "./render-groups";

export const RAIL_LIST_PREVIEW_LIMIT = 6;
export const DESKTOP_RIGHT_RAIL_WIDTH_PX = 300;
export const DESKTOP_RIGHT_RAIL_GAP_PX = 16;
export const DESKTOP_LEFT_PANEL_WIDTH_PX = 300;
export const RIGHT_RAIL_MIN_APP_WIDTH_PX = 1370;
export const RIGHT_RAIL_MIN_MAIN_WIDTH_PX = RIGHT_RAIL_MIN_APP_WIDTH_PX - DESKTOP_LEFT_PANEL_WIDTH_PX;

const DESKTOP_THREAD_LAYOUT_WIDTH_PX = 736;
const DESKTOP_RIGHT_RAIL_OVERLAY_THRESHOLD_PX = 180;
const DESKTOP_RIGHT_RAIL_SHIFT_THRESHOLD_PX = 360;

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

export function rightRailDisplayMode(contentWidthPx: number): RightRailDisplayMode {
  const sideSpace = rightRailSideSpace(contentWidthPx);
  if (sideSpace < DESKTOP_RIGHT_RAIL_OVERLAY_THRESHOLD_PX) return "overlay";
  if (sideSpace < DESKTOP_RIGHT_RAIL_SHIFT_THRESHOLD_PX) return "shift";
  return "gutter";
}

export function rightRailShouldRender(contentWidthPx: number): boolean {
  return contentWidthPx >= RIGHT_RAIL_MIN_MAIN_WIDTH_PX;
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
    sections.push(projectEntrySection("progress", "Progress", input.progress, false));
  }

  const branchInput = input.branchDetails;
  const branchDetails = isBranchDetailsViewModel(branchInput) ? branchInput : undefined;
  const branchEntries = branchDetails ? branchDetailsEntries(branchDetails) : (branchInput as BranchDetailsEntryInput).entries;
  const hasBranchDetails = branchDetails ? branchDetails.hasData : branchEntries.length > 0;
  if (hasBranchDetails) {
    sections.push({
      id: "branchDetails",
      title: branchDetails?.title ?? (branchInput as BranchDetailsEntryInput).title ?? "Branch details",
      count: branchEntries.length,
      entries: branchEntries,
      allEntries: branchEntries,
      remainingCount: 0,
      canToggle: false,
      ...(branchDetails ? { branchDetails } : {}),
    });
  }

  if (input.artifacts.length > 0) {
    sections.push(projectEntrySection("artifacts", "Artifacts", input.artifacts, true));
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

  if (input.sources.length > 0) {
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
    count: entries.length,
    entries: clipped.entries,
    allEntries: entries,
    remainingCount: clipped.remainingCount,
    canToggle: clipped.canToggle,
  };
}

function isBranchDetailsViewModel(value: RightRailProjectionInput["branchDetails"]): value is BranchDetailsViewModel {
  return "rows" in value && "emptyText" in value && "hasData" in value;
}

function branchDetailsEntries(details: BranchDetailsViewModel): RailEntry[] {
  const rows = details.rows.map((row) => ({
    id: row.id,
    title: row.label,
    meta: row.value,
    status: "available",
  }));
  if (!details.diff) return rows;
  return [
    ...rows,
    {
      id: "diff",
      title: details.diff.title,
      meta: details.diff.summary,
      status: details.diff.files.length > 0 ? "changed" : undefined,
      action: { kind: "diff" },
    },
  ];
}

function rightRailSideSpace(contentWidthPx: number): number {
  return (Math.max(0, contentWidthPx) - DESKTOP_THREAD_LAYOUT_WIDTH_PX) / 2;
}
