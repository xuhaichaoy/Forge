import type { Thread } from "@hicodex/codex-protocol";
import { projectBranchDetails } from "../src/state/branch-details";

export default function runBranchDetailsTests() {
  projectsThreadCwdGitInfoAndStatus();
  ignoresPlainThreadContextWithoutGitOrDiffData();
  countsChangedFilesFromDiffText();
  dedupesFilesAndPreservesKind();
  returnsEmptyStateWithoutData();
}

function projectsThreadCwdGitInfoAndStatus() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-branch-details",
      cwd: "/Users/haichao/Desktop/data/HiCodex",
      gitInfo: {
        branch: "codex/branch-details-tests",
        sha: "1234567890abcdef",
        originUrl: "git@example.com:hicodex/HiCodex.git",
      },
      status: { type: "active", activeFlags: [] },
    }),
  });

  assertEqual(view.hasData, true, "thread data should mark branch details as populated");
  assertRow(view.rows, "cwd", "Working directory", "/Users/haichao/Desktop/data/HiCodex");
  assertRow(view.rows, "branch", "Branch", "codex/branch-details-tests");
  assertRow(view.rows, "commit", "Commit", "1234567890ab");
  assertRow(view.rows, "origin", "Origin", "git@example.com:hicodex/HiCodex.git");
  assertRow(view.rows, "status", "Thread status", "active");
}

function ignoresPlainThreadContextWithoutGitOrDiffData() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-no-branch-details",
      cwd: "/Users/haichao/Desktop/data/HiCodex",
      status: { type: "idle" },
      gitInfo: null,
    }),
  });

  assertEqual(view.hasData, false, "non-git thread context alone should not populate branch details");
  assertEqual(view.rows.length, 0, "non-git thread context should not create branch detail rows");
}

function threadFixture(overrides: Partial<Thread> & { id: string }): Thread {
  const { id, ...rest } = overrides;
  return {
    id,
    forkedFromId: null,
    preview: "",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    status: { type: "idle" },
    path: null,
    cwd: "",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: null,
    turns: [],
    ...rest,
  };
}

function countsChangedFilesFromDiffText() {
  const view = projectBranchDetails({
    thread: null,
    diff: {
      diff: [
        "diff --git a/packages/ui/src/state/branch-details.ts b/packages/ui/src/state/branch-details.ts",
        "index 1111111..2222222 100644",
        "--- a/packages/ui/src/state/branch-details.ts",
        "+++ b/packages/ui/src/state/branch-details.ts",
        "diff --git a/packages/ui/src/HiCodexApp.tsx b/packages/ui/src/HiCodexApp.tsx",
        "index 3333333..4444444 100644",
      ].join("\n"),
    },
  });

  assertNotNull(view.diff, "diff text should produce a diff projection");
  assertEqual(view.diff.summary, "2 changed files", "diff text should count unique changed files");
  assertEqual(view.diff.files.length, 0, "diff text counts should not invent file rows");
  assertEqual(view.hasData, true, "diff data should mark branch details as populated");
}

function dedupesFilesAndPreservesKind() {
  const view = projectBranchDetails({
    thread: null,
    diff: {
      files: [
        { path: " packages/ui/src/state/branch-details.ts ", kind: "modified" },
        { path: "packages/ui/src/state/branch-details.ts", kind: "deleted" },
        { path: "packages/ui/test/branch-details.test.ts", kind: "added" },
        { path: "   " },
      ],
    },
  });

  assertNotNull(view.diff, "file list should produce a diff projection");
  assertEqual(view.diff.summary, "2 changed files", "deduped files should drive changed file summary");
  assertEqual(view.diff.files.length, 2, "duplicate and blank paths should be removed");
  assertEqual(
    view.diff.files[0]?.path,
    "packages/ui/src/state/branch-details.ts",
    "file paths should be trimmed",
  );
  assertEqual(view.diff.files[0]?.kind, "modified", "first file kind should be preserved");
  assertEqual(
    view.diff.files[1]?.path,
    "packages/ui/test/branch-details.test.ts",
    "second unique file should remain in order",
  );
  assertEqual(view.diff.files[1]?.kind, "added", "second file kind should be preserved");
}

function returnsEmptyStateWithoutData() {
  const view = projectBranchDetails({
    thread: null,
    diff: null,
  });

  assertEqual(view.title, "Branch details", "title should be stable");
  assertEqual(
    view.emptyText,
    "Branch details will appear when the app server provides thread Git or diff data.",
    "empty text should explain unavailable branch details",
  );
  assertEqual(view.rows.length, 0, "empty state should not include rows");
  assertEqual(view.diff, null, "empty state should not include diff");
  assertEqual(view.hasData, false, "empty state should report hasData false");
}

function assertRow(
  rows: Array<{ id: string; label: string; value: string }>,
  id: string,
  label: string,
  value: string,
) {
  const row = rows.find((candidate) => candidate.id === id);
  assertNotNull(row, `expected row ${id}`);
  assertEqual(row.label, label, `row ${id} label`);
  assertEqual(row.value, value, `row ${id} value`);
}

function assertNotNull<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
