import type { BranchDetailsViewModel } from "./branch-details";
import type { RailEntry } from "./render-groups";

export const RAIL_LIST_PREVIEW_LIMIT = 6;

export type RightRailSectionId = "progress" | "branchDetails" | "artifacts" | "sources";

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

export function projectRightRailSections(input: RightRailProjectionInput): RightRailSection[] {
  const sections: RightRailSection[] = [];

  if (input.progress.length > 0) {
    sections.push(projectEntrySection("progress", "Progress", input.progress));
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
    sections.push(projectEntrySection("artifacts", "Artifacts", input.artifacts));
  }

  if (input.sources.length > 0) {
    sections.push(projectEntrySection("sources", "Sources", input.sources));
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
): RightRailSection {
  const clipped = clipRailEntries(entries);
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
