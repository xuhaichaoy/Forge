import {
  RAIL_LIST_PREVIEW_LIMIT,
  clipRailEntries,
  projectRightRailSections,
  rightRailContentShiftPx,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
  rightRailShouldRender,
} from "../src/state/right-rail";

export default function runRightRailTests(): void {
  keepsCodexDesktopSectionOrder();
  hidesEmptySections();
  keepsPopulatedBranchDetails();
  clipsRailEntriesByDefaultAndExpandsAllEntries();
  keepsProgressEntriesUnclippedLikeCodexDesktop();
  preservesSectionCountsAndEntryMeta();
  projectsBranchDiffAction();
  computesDesktopRightRailDisplayModeAndContentShift();
  hidesRightRailBelowThirteenSeventyViewportEquivalent();
}

function keepsCodexDesktopSectionOrder(): void {
  const sections = projectRightRailSections({
    progress: [railEntry("progress-1", "Read guide", "completed", "Plan")],
    branchDetails: {
      entries: [railEntry("branch-1", "Branch", "completed", "codex/right-rail")],
    },
    artifacts: [railEntry("artifact-1", "right-rail.test.ts", "modified", "packages/ui/test/right-rail.test.ts")],
    backgroundAgents: [railEntry("agent-1", "Explorer (explorer)", "active", "Uses gpt-5.4")],
    backgroundTerminals: [railEntry("terminal-1", "npm run dev", "running", "/workspace/project")],
    sources: [railEntry("source-1", "github:list_prs", "completed", "MCP tool")],
  });

  assertDeepEqual(
    sections.map((section) => section.title),
    ["Progress", "Branch details", "Artifacts", "Background agents", "Background terminals", "Sources"],
    "right rail section order should match Codex Desktop",
  );
}

function hidesEmptySections(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });

  assertEqual(sections.length, 0, "right rail should not project empty sections");
}

function keepsPopulatedBranchDetails(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      title: "Branch details",
      emptyText: "empty",
      rows: [
        { id: "branch", label: "Branch", value: "codex/right-rail" },
      ],
      hasData: true,
      diff: null,
    },
    artifacts: [],
    sources: [],
  });

  assertEqual(sections.length, 1, "populated branch details should be projected");
  assertEqual(sections[0]?.title, "Branch details", "branch details section should keep its title");
}

function clipsRailEntriesByDefaultAndExpandsAllEntries(): void {
  const entries = makeEntries(RAIL_LIST_PREVIEW_LIMIT + 3, "artifact");

  const preview = clipRailEntries(entries);
  assertEqual(preview.entries.length, RAIL_LIST_PREVIEW_LIMIT, "default rail preview should show six entries");
  assertEqual(preview.remainingCount, 3, "default rail preview should return remaining count");
  assertEqual(preview.entries[0], entries[0], "default rail preview should preserve entry object identity");

  const expanded = clipRailEntries(entries, true);
  assertEqual(expanded.entries.length, entries.length, "expanded rail preview should show all entries");
  assertEqual(expanded.remainingCount, 0, "expanded rail preview should not report remaining entries");
  assertEqual(expanded.entries[entries.length - 1], entries[entries.length - 1], "expanded preview should keep last entry");
}

function keepsProgressEntriesUnclippedLikeCodexDesktop(): void {
  const progressEntries = makeEntries(RAIL_LIST_PREVIEW_LIMIT + 3, "progress");

  const sections = projectRightRailSections({
    progress: progressEntries,
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });

  const progress = sectionById(sections, "progress");
  assertEqual(progress.entries.length, progressEntries.length, "progress should project every plan item");
  assertEqual(progress.allEntries.length, progressEntries.length, "progress should keep every source entry");
  assertEqual(progress.canToggle, false, "progress should not use preview toggles");
  assertEqual(progress.remainingCount, 0, "progress should not hide entries behind a remaining count");
}

function preservesSectionCountsAndEntryMeta(): void {
  const artifacts = makeEntries(RAIL_LIST_PREVIEW_LIMIT + 1, "artifact");
  const sources = [
    railEntry("source-1", "github:list_prs", "completed", "MCP tool"),
    railEntry("source-2", "Codex Desktop parity", "running", "Web search"),
  ];

  const sections = projectRightRailSections({
    progress: [railEntry("progress-1", "Wire projection", "inProgress", "latest todo-list")],
    branchDetails: {
      entries: [railEntry("branch-1", "Working directory", "available", "/workspace/project")],
    },
    artifacts,
    sources,
  });

  const progress = sectionById(sections, "progress");
  const branchDetails = sectionById(sections, "branchDetails");
  const artifactsSection = sectionById(sections, "artifacts");
  const sourcesSection = sectionById(sections, "sources");

  assertEqual(progress.count, 1, "progress count should match source entries");
  assertEqual(progress.entries[0]?.status, "inProgress", "progress entry status should be preserved");
  assertEqual(progress.entries[0]?.meta, "latest todo-list", "progress entry meta should be preserved");

  assertEqual(branchDetails.count, 1, "branch details count should match source entries");
  assertEqual(branchDetails.entries[0]?.status, "available", "branch details status should be preserved");
  assertEqual(
    branchDetails.entries[0]?.meta,
    "/workspace/project",
    "branch details meta should be preserved",
  );

  assertEqual(artifactsSection.count, artifacts.length, "artifacts count should include clipped entries");
  assertEqual(
    artifactsSection.entries.length,
    RAIL_LIST_PREVIEW_LIMIT,
    "artifacts section entries should be clipped by default",
  );
  assertEqual(artifactsSection.remainingCount, 1, "artifacts section should expose hidden entry count");
  assertEqual(artifactsSection.entries[0]?.status, "completed", "artifact status should be preserved");
  assertEqual(artifactsSection.entries[0]?.meta, "artifact meta 1", "artifact meta should be preserved");

  assertEqual(sourcesSection.count, sources.length, "sources count should match source entries");
  assertEqual(sourcesSection.entries[1]?.status, "running", "source status should be preserved");
  assertEqual(sourcesSection.entries[1]?.meta, "Web search", "source meta should be preserved");
}

function projectsBranchDiffAction(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      title: "Branch details",
      emptyText: "empty",
      rows: [],
      hasData: true,
      diff: {
        title: "Diff",
        summary: "1 changed file",
        files: [{ path: "packages/ui/src/state/right-rail.ts" }],
      },
    },
    artifacts: [],
    sources: [],
  });

  const branchDetails = sectionById(sections, "branchDetails");
  assertDeepEqual(
    branchDetails.allEntries[0]?.action,
    { kind: "diff" },
    "branch diff rail entry should expose a diff action",
  );
}

function computesDesktopRightRailDisplayModeAndContentShift(): void {
  assertEqual(rightRailDisplayMode(1_000), "overlay", "narrow content should use overlay right rail mode");
  assertEqual(rightRailDisplayMode(1_200), "shift", "medium content should use shift right rail mode");
  assertEqual(rightRailDisplayMode(1_500), "gutter", "wide content should use gutter right rail mode");

  assertEqual(rightRailContentShiftPx(1_200, true), -158, "shift mode should move content by half the rail plus gap");
  assertEqual(rightRailContentShiftPx(1_200, false), 0, "missing content should not move the thread body");
  assertEqual(rightRailContentShiftPx(1_200, true, false), 0, "unpinned right rail should not move the thread body");
  assertEqual(rightRailContentShiftPx(1_500, true), 0, "gutter mode should keep the thread centered");
  assertEqual(rightRailReservedInlineEndPx(1_000, true), 0, "overlay mode should not reserve layout space");
  assertEqual(rightRailReservedInlineEndPx(1_200, true), 332, "shift mode should reserve the visible rail footprint");
  assertEqual(rightRailReservedInlineEndPx(1_500, true), 332, "gutter mode should reserve the visible rail footprint");
  assertEqual(rightRailReservedInlineEndPx(1_200, false), 0, "missing content should not reserve right rail space");
  assertEqual(rightRailReservedInlineEndPx(1_200, true, false), 0, "unpinned right rail should not reserve right rail space");
}

function hidesRightRailBelowThirteenSeventyViewportEquivalent(): void {
  assertEqual(rightRailShouldRender(1_069), false, "right rail should not render below the 1370px app width breakpoint");
  assertEqual(rightRailShouldRender(1_070), true, "right rail should render once the main content width reaches the 1370px breakpoint");
}

function railEntry(id: string, title: string, status: string, meta: string) {
  return { id, title, status, meta };
}

function makeEntries(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    railEntry(`${prefix}-${index + 1}`, `${prefix} ${index + 1}`, "completed", `${prefix} meta ${index + 1}`),
  );
}

function sectionById(
  sections: ReturnType<typeof projectRightRailSections>,
  id: "progress" | "branchDetails" | "artifacts" | "backgroundAgents" | "backgroundTerminals" | "sources",
) {
  const section = sections.find((candidate) => candidate.id === id);
  assertNotNull(section, `expected ${id} section`);
  return section;
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
