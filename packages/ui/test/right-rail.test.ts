import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RightRail } from "../src/components/right-rail";
import { __resetSectionCollapseStateForTesting } from "../src/hooks/use-section-collapse";
import { projectBranchDetails } from "../src/state/branch-details";
import {
  RAIL_LIST_PREVIEW_LIMIT,
  RIGHT_RAIL_PINNED_STORAGE_KEY,
  clipRailEntries,
  loadRightRailPinned,
  projectRightRailSections,
  rightRailContentShiftPx,
  rightRailDisplayMode,
  rightRailReservedInlineEndPx,
  rightRailShouldRender,
  saveRightRailPinned,
  type RightRailPreferenceStorageLike,
} from "../src/state/right-rail";

export default function runRightRailTests(): void {
  __resetSectionCollapseStateForTesting();
  keepsCodexDesktopSectionOrder();
  hidesEmptySections();
  keepsPopulatedBranchDetails();
  collapsesCompletedProgressByDefaultLikeCodexDesktop();
  usesDesktopBackgroundTaskTitles();
  clipsRailEntriesByDefaultAndExpandsAllEntries();
  clipsProgressEntriesLikeCodexDesktop();
  omitsProgressCompletionSummaryLikeCodexDesktop();
  hidesOutputsWhenGitSummaryIsShowingLikeCodexDesktop();
  hidesOutputsForGitProjectArtifactsLikeCodexDesktop();
  rendersRunningSideChatSpinnerAndBackgroundTerminalStopAction();
  preservesSectionCountsAndEntryMeta();
  projectsBranchDiffAction();
  projectsDesktopGitSurfaceWithoutExtraStatusRows();
  rendersDesktopStatusFooterTrigger();
  loadsAndPersistsRightRailPinnedPreference();
  computesDesktopRightRailDisplayModeAndContentShift();
  hidesRightRailWhileDesktopModeIsOverlay();
}

function keepsCodexDesktopSectionOrder(): void {
  const sections = projectRightRailSections({
    progress: [railEntry("progress-1", "Read guide", "completed", "Plan")],
    // CODEX-REF: pe:automation — Codex 仅渲染 single automation。Legacy
    // `automations` multi-list 已删除以严格对齐 Codex。
    automation: { id: "auto-1", name: "Weekly digest", rruleSummary: "every Monday at 9am" },
    branchDetails: {
      entries: [],
    },
    artifacts: [railEntry("artifact-1", "right-rail.test.ts", "modified", "packages/ui/test/right-rail.test.ts")],
    sideChats: [railEntry("side-chat:side-1", "Side chat", "idle", "Uses gpt-5.2")],
    backgroundAgents: [railEntry("agent-1", "Explorer (explorer)", "active", "Uses gpt-5.4")],
    backgroundTerminals: [railEntry("terminal-1", "npm run dev", "running", "/workspace/project")],
    // codex: _e:browser-tabs — new structured browser-tab summary replaces the
    // legacy RailEntry[] form.
    browser: { title: "Codex docs", displayUrl: "platform.openai.com", isActive: true, tabId: "tab-1" },
    sources: [railEntry("source-1", "github:list_prs", "completed", "MCP tool")],
    status: [railEntry("status-1", "42 tokens/s", "running", "18% used")],
  });

  // CODEX-REF: section order — Progress, Automation (single), Environment/
  // Outputs, Side chats, Background tasks, Browser, Sources, Status。Codex 仅
  // single automation，无 legacy multi-list automations。
  assertDeepEqual(
    sections.map((section) => section.title),
    [
      "Progress",
      "Automations",
      "Outputs",
      "Side chats",
      "Subagents and tasks",
      "Browser",
      "Sources",
      "Status",
    ],
    "right rail section order should match Codex Desktop",
  );
  assertEqual(
    sectionById(sections, "backgroundTasks").count,
    2,
    "background tasks should combine background agents and terminals",
  );
  // codex: pe:automation/_e:browser-tabs — assert the new sections actually
  // emit a single-entry payload from the structured projection inputs.
  assertEqual(sectionById(sections, "automation").count, 1, "automation section should be single-entry");
  assertEqual(sectionById(sections, "automation").entries[0]?.title, "Weekly digest", "automation entry uses provided name");
  assertEqual(sectionById(sections, "browser").count, 1, "browser section should be single-entry");
  assertEqual(sectionById(sections, "browser").entries[0]?.title, "Codex docs", "browser entry uses tab title");
  assertEqual(
    sectionById(sections, "browser").entries[0]?.meta,
    "platform.openai.com",
    "browser entry meta carries displayUrl",
  );
  assertEqual(
    sectionById(sections, "browser").entries[0]?.status,
    "active",
    "browser entry status mirrors isActive",
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

  // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js Xf/ef/jf —
  // Codex Desktop always renders the Outputs section when the Git summary panel is
  // hidden (showing "No artifacts yet" when empty) and always renders the Sources
  // section ("No sources yet" when empty). Progress/branchDetails/sideChats stay
  // hidden when they have no data. So an otherwise-empty conversation projects the
  // two always-on sections.
  assertDeepEqual(
    sections.map((section) => section.id),
    ["artifacts", "sources"],
    "right rail should project Outputs and Sources empty-state sections like Codex Desktop",
  );
  assertEqual(sectionById(sections, "artifacts").allEntries.length, 0, "empty Outputs should expose zero entries");
  assertEqual(sectionById(sections, "sources").allEntries.length, 0, "empty Sources should expose zero entries");
}

function keepsPopulatedBranchDetails(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      title: "Environment",
      emptyText: "empty",
      rows: [
        { id: "branch", label: "Branch", value: "codex/right-rail" },
      ],
      hasData: true,
      diff: null,
      gitStatus: null,
    },
    artifacts: [],
    sources: [],
  });

  // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js he —
  // Codex Desktop always emits the Sources panel section alongside Git; an empty
  // sources list renders the "No sources yet" empty state row.
  assertEqual(sections.length, 2, "populated branch details should project Environment and Sources sections");
  assertEqual(sections[0]?.title, "Environment", "branch details section should keep Desktop Environment title");
  assertEqual(sections[0]?.allEntries[0]?.id, "changes", "Git section should start with the Desktop Changes entry");
  assertEqual(sections[1]?.id, "sources", "Sources section should follow Git like Codex Desktop");
  assertEqual(sections[1]?.allEntries.length, 0, "Sources section should expose zero entries for the empty state");
}

function collapsesCompletedProgressByDefaultLikeCodexDesktop(): void {
  const sections = projectRightRailSections({
    progress: [
      railEntry("progress-1", "Read Desktop bundle", "completed", "latest todo-list"),
      railEntry("progress-2", "Patch right rail", "completed", "latest todo-list"),
    ],
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });

  assertEqual(sectionById(sections, "progress").defaultCollapsed, true, "completed progress should default collapsed");
  const html = renderToStaticMarkup(createElement(RightRail, { sections }));
  assertStringIncludes(html, "aria-expanded=\"false\"", "completed progress should render collapsed by default");
  assertStringExcludes(html, "hc-rail-section-count", "collapsed progress should not render a title count");

  const aliasStatusSections = projectRightRailSections({
    progress: [
      railEntry("progress-1", "Read Desktop bundle", "done", "latest todo-list"),
    ],
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });
  assertEqual(
    sectionById(aliasStatusSections, "progress").defaultCollapsed,
    undefined,
    "progress should only treat Desktop's completed status as completed",
  );
}

function usesDesktopBackgroundTaskTitles(): void {
  const onlyAgents = projectRightRailSections({
    progress: [],
    branchDetails: { entries: [] },
    artifacts: [],
    backgroundAgents: [railEntry("agent-1", "Explorer", "active", "Uses gpt-5")],
    backgroundTerminals: [],
    sources: [],
  });
  const onlyTerminals = projectRightRailSections({
    progress: [],
    branchDetails: { entries: [] },
    artifacts: [],
    backgroundAgents: [],
    backgroundTerminals: [railEntry("background-terminal:1", "npm test", "running", "/workspace")],
    sources: [],
  });
  const mixed = projectRightRailSections({
    progress: [],
    branchDetails: { entries: [] },
    artifacts: [],
    backgroundAgents: [railEntry("agent-1", "Explorer", "active", "Uses gpt-5")],
    backgroundTerminals: [railEntry("background-terminal:1", "npm test", "running", "/workspace")],
    sources: [],
  });

  assertEqual(sectionById(onlyAgents, "backgroundTasks").title, "Subagents", "agent-only background section title");
  assertEqual(sectionById(onlyTerminals, "backgroundTasks").title, "Tasks", "terminal-only background section title");
  assertEqual(sectionById(mixed, "backgroundTasks").title, "Subagents and tasks", "mixed background section title");
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

function clipsProgressEntriesLikeCodexDesktop(): void {
  const progressEntries = Array.from({ length: RAIL_LIST_PREVIEW_LIMIT + 3 }, (_, index) =>
    railEntry(`progress-${index + 1}`, `progress ${index + 1}`, "pending", `progress meta ${index + 1}`),
  );

  const sections = projectRightRailSections({
    progress: progressEntries,
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });

  const progress = sectionById(sections, "progress");
  assertEqual(progress.entries.length, RAIL_LIST_PREVIEW_LIMIT, "progress should preview six plan items by default");
  assertEqual(progress.allEntries.length, progressEntries.length, "progress should keep every source entry");
  assertEqual(progress.canToggle, true, "progress should use the Desktop expandable list");
  assertEqual(progress.remainingCount, 3, "progress should report remaining plan items behind Show more");
  const html = renderToStaticMarkup(createElement(RightRail, { sections }));
  assertStringIncludes(html, "hc-rail-more-button", "progress should render the Desktop expandable list affordance");
}

function omitsProgressCompletionSummaryLikeCodexDesktop(): void {
  const sections = projectRightRailSections({
    progress: [
      railEntry("progress-1", "Read Desktop bundle", "completed", "latest todo-list"),
      railEntry("progress-2", "Patch right rail", "in_progress", "latest todo-list"),
      railEntry("progress-3", "Run focused tests", "pending", "latest todo-list"),
    ],
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sources: [],
  });

  assertEqual(sectionById(sections, "progress").summary, undefined, "progress should not project a right-rail summary");
  const html = renderToStaticMarkup(createElement(RightRail, { sections }));
  assertStringExcludes(html, "hc-rail-section-summary", "progress should render plan rows without a summary line");
  assertStringIncludes(html, "hc-rail-card-title-progress", "progress rows should use the Desktop three-line text style");
}

function hidesOutputsWhenGitSummaryIsShowingLikeCodexDesktop(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      title: "Environment",
      emptyText: "empty",
      rows: [
        { id: "branch", label: "Branch", value: "codex/right-rail" },
      ],
      hasData: true,
      diff: null,
      gitStatus: null,
    },
    artifacts: [railEntry("artifact-1", "right-rail.test.ts", "modified", "artifact meta")],
    showOutputs: false,
    sources: [],
  });

  // CODEX-REF: /private/tmp/codex-asar/pretty/local-conversation-thread-BX7YNcUw.pretty.js:7918-7952 —
  // Codex Desktop keeps the Sources section in the panel even while Outputs is
  // suppressed by the Git summary, so the expected order is ["Git", "Sources"].
  assertDeepEqual(
    sections.map((section) => section.title),
    ["Environment", "Sources"],
    "Desktop hides Outputs but keeps Sources when the Git summary section is active",
  );
}

function hidesOutputsForGitProjectArtifactsLikeCodexDesktop(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      title: "Environment",
      emptyText: "empty",
      rows: [
        { id: "branch", label: "Branch", value: "codex/right-rail" },
      ],
      hasData: true,
      diff: null,
      gitStatus: null,
    },
    artifacts: [
      railEntry("artifact-downloads", "beijing_weather_7d.xlsx", "completed", "/Users/me/Downloads/beijing_weather_7d.xlsx"),
    ],
    sources: [],
  });

  // CODEX-REF: /private/tmp/codex-asar/pretty/local-conversation-thread-BX7YNcUw.pretty.js:7918-7952 —
  // Codex Desktop hides Outputs entirely when the Git summary is visible; the artifact
  // count is only used inside the Outputs section after `!M` allows that section to mount.
  assertDeepEqual(
    sections.map((section) => section.id),
    ["branchDetails", "sources"],
    "git project with artifacts should hide Outputs like Codex Desktop",
  );
}

function rendersRunningSideChatSpinnerAndBackgroundTerminalStopAction(): void {
  const sections = projectRightRailSections({
    progress: [],
    branchDetails: {
      entries: [],
    },
    artifacts: [],
    sideChats: [railEntry("side-chat:side-1", "Side chat", "active", "Uses gpt-5.2")],
    backgroundTerminals: [railEntry("background-terminal:proc-1", "npm run dev", "running", "/workspace")],
    sources: [],
  });
  const html = renderToStaticMarkup(createElement(RightRail, {
    sections,
    onCleanBackgroundTerminals: () => {},
  }));

  assertStringIncludes(
    html,
    "hc-rail-progress-spinner",
    "running side chat should render a spinner icon like Codex Desktop",
  );
  assertStringIncludes(
    html,
    "aria-label=\"Stop all background terminals\"",
    "background terminal row should expose an inline stop action",
  );
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
      entries: [railEntry("branch-1", "Branch", "available", "main")],
    },
    artifacts,
    showOutputs: true,
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
    "main",
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
      title: "Environment",
      emptyText: "empty",
      rows: [],
      hasData: true,
      gitStatus: null,
      diff: {
        title: "Diff",
        summary: "1 changed file",
        changedFiles: 1,
        hasDiff: true,
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
    "Changes rail entry should expose a diff action",
  );
  assertEqual(branchDetails.allEntries[0]?.title, "Changes", "Git diff entry should use Desktop Changes label");
  assertEqual(
    branchDetails.allEntries[0]?.details,
    undefined,
    "Changes entry should not inline the diff file list inside the Git card",
  );
}

function projectsDesktopGitSurfaceWithoutExtraStatusRows(): void {
  const branchDetails = projectBranchDetails({
    thread: {
      id: "thread-git-status",
      sessionId: "thread-git-status",
      forkedFromId: null,
      preview: "",
      ephemeral: false,
      modelProvider: "openai",
      createdAt: 0,
      updatedAt: 0,
      status: { type: "idle" },
      path: null,
      cwd: "/workspace/project",
      cliVersion: "test",
      source: "appServer",
      threadSource: null,
      agentNickname: null,
      agentRole: null,
      gitInfo: {
        branch: "main",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:hicodex/HiCodex.git",
      },
      name: null,
      turns: [],
    },
    gitStatus: {
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      changedFiles: 3,
      hasDiff: true,
      ghStatus: {
        isInstalled: false,
      },
    },
  });
  const sections = projectRightRailSections({
    progress: [],
    branchDetails,
    artifacts: [],
    sources: [],
  });

  const branchDetailsSection = sectionById(sections, "branchDetails");
  assertDeepEqual(
    branchDetailsSection.allEntries.map((entry) => entry.id),
    ["changes", "local", "branch", "commit", "github"],
    "Git section should project only Desktop surface rows",
  );
  assertEqual(entryById(branchDetailsSection.allEntries, "changes").meta, "3 changed files", "Changes should carry diff summary");
  assertEqual(entryById(branchDetailsSection.allEntries, "local").meta, "Work locally", "Local row should not expose cwd");
  assertEqual(entryById(branchDetailsSection.allEntries, "branch").meta, "main", "Branch row should expose branch name");
  assertEqual(entryById(branchDetailsSection.allEntries, "commit").meta, "Commit", "Commit row should be an action label, not a SHA");
  assertEqual(
    entryById(branchDetailsSection.allEntries, "github").meta,
    "GitHub CLI unavailable",
    "GitHub status row should preserve Desktop unavailable copy",
  );

  const html = renderToStaticMarkup(createElement(RightRail, { sections }));
  assertStringIncludes(html, "Changes", "Git card should render the Changes row");
  assertStringIncludes(html, "GitHub CLI unavailable", "Git card should render gh status");
  assertStringExcludes(html, "Ahead / behind", "Git card should not render ahead/behind rows");
  assertStringExcludes(html, "Changed files", "Git card should not render changed-files rows");
  assertStringExcludes(html, "abcdef123456", "Git card should not render commit hashes");
}

function loadsAndPersistsRightRailPinnedPreference(): void {
  const storage = new MemoryStorage();

  assertEqual(loadRightRailPinned(storage), true, "right rail should default to pinned when no preference exists");
  saveRightRailPinned(storage, false);
  assertEqual(storage.getItem(RIGHT_RAIL_PINNED_STORAGE_KEY), "0", "unpinned preference should persist as zero");
  assertEqual(loadRightRailPinned(storage), false, "right rail should load unpinned preference");
  saveRightRailPinned(storage, true);
  assertEqual(storage.getItem(RIGHT_RAIL_PINNED_STORAGE_KEY), "1", "pinned preference should persist as one");
  assertEqual(loadRightRailPinned(storage), true, "right rail should load pinned preference");

  storage.setItem(RIGHT_RAIL_PINNED_STORAGE_KEY, "invalid");
  assertEqual(loadRightRailPinned(storage, false), false, "invalid right rail preference should use fallback");
}

function computesDesktopRightRailDisplayModeAndContentShift(): void {
  assertEqual(rightRailDisplayMode(1_000), "overlay", "narrow content should use overlay right rail mode");
  assertEqual(rightRailDisplayMode(1_200), "shift", "medium content should use shift right rail mode");
  assertEqual(rightRailDisplayMode(1_500), "shift", "Desktop keeps shifting until the side space reaches 400px");
  assertEqual(rightRailDisplayMode(1_600), "gutter", "wide content should use gutter right rail mode");

  assertEqual(rightRailContentShiftPx(1_200, true), -158, "shift mode should move content by half the rail plus gap");
  assertEqual(rightRailContentShiftPx(1_200, false), 0, "missing content should not move the thread body");
  assertEqual(rightRailContentShiftPx(1_200, true, false), 0, "unpinned right rail should not move the thread body");
  assertEqual(rightRailContentShiftPx(1_500, true), -158, "shift mode should keep moving content below the 400px gutter threshold");
  assertEqual(rightRailContentShiftPx(1_600, true), 0, "gutter mode should keep the thread centered");
  assertEqual(rightRailReservedInlineEndPx(1_000, true), 0, "overlay mode should not reserve layout space");
  assertEqual(rightRailReservedInlineEndPx(1_200, true), 332, "shift mode should reserve the visible rail footprint");
  assertEqual(rightRailReservedInlineEndPx(1_500, true), 332, "shift mode should reserve the visible rail footprint");
  assertEqual(rightRailReservedInlineEndPx(1_600, true), 332, "gutter mode should reserve the visible rail footprint");
  assertEqual(rightRailReservedInlineEndPx(1_200, false), 0, "missing content should not reserve right rail space");
  assertEqual(rightRailReservedInlineEndPx(1_200, true, false), 0, "unpinned right rail should not reserve right rail space");
}

function hidesRightRailWhileDesktopModeIsOverlay(): void {
  assertEqual(rightRailShouldRender(1_095), false, "right rail should not render while Desktop display mode is overlay");
  assertEqual(rightRailShouldRender(1_096), true, "right rail should render once the Desktop display mode leaves overlay");
}

function rendersDesktopStatusFooterTrigger(): void {
  const html = renderToStaticMarkup(createElement(RightRail, {
    sections: projectRightRailSections({
      progress: [],
      branchDetails: { entries: [] },
      artifacts: [],
      sources: [],
    }),
    statusFooter: { tokensUsed: 28_300, contextWindow: 249_000, tokensPerSecond: 42 },
    onCompactThread: () => undefined,
  }));

  assertStringIncludes(html, "42 tokens/s", "status footer should show Desktop token-speed label");
  assertStringIncludes(html, "11% used", "status footer should show Desktop context percent label");
  assertStringIncludes(
    html,
    "28,300 / 249,000 tokens used",
    "status footer should keep full token count in the trigger tooltip",
  );
  assertStringExcludes(
    html,
    "hc-rail-status-footer-compact",
    "status footer should not render HiCodex's old always-visible Compact button",
  );
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
  id:
    | "progress"
    | "automation"
    | "automations"
    | "branchDetails"
    | "artifacts"
    | "sideChats"
    | "backgroundTasks"
    | "browser"
    | "sources"
    | "status",
) {
  const section = sections.find((candidate) => candidate.id === id);
  assertNotNull(section, `expected ${id} section`);
  return section;
}

function entryById<T extends { id: string }>(entries: T[], id: string): T {
  const entry = entries.find((candidate) => candidate.id === id);
  assertNotNull(entry, `expected entry ${id}`);
  return entry;
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

function assertStringIncludes(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: missing ${expected}`);
  }
}

function assertStringExcludes(actual: string, expected: string, message: string): void {
  if (actual.includes(expected)) {
    throw new Error(`${message}: found ${expected}`);
  }
}

class MemoryStorage implements RightRailPreferenceStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
