import type { Thread } from "@forge/codex-protocol";
import { projectBranchDetails } from "../src/state/branch-details";

const TEST_WORKSPACE = "/workspace/Forge";

export default function runBranchDetailsTests() {
  projectsDesktopGitRowsFromThreadCwdGitInfoAndStatus();
  ignoresPlainThreadContextWithoutGitOrDiffData();
  keepsExplicitGitStatusFactsWithoutRenderingExtraRows();
  prefersLiveHostBranchOverStoredThreadBranch();
  usesHostWorktreeModeForEnvironmentRow();
  treatsCleanGitStatusAsData();
  readsStatusFieldsFromThreadGitInfoExtension();
  countsChangedFilesFromDiffText();
  dedupesFilesAndPreservesKind();
  projectsGithubCliStatusRows();
  returnsEmptyStateWithoutData();
}

function projectsDesktopGitRowsFromThreadCwdGitInfoAndStatus() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-branch-details",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "codex/branch-details-tests",
        sha: "1234567890abcdef",
        originUrl: "git@example.com:forge/Forge.git",
      },
      status: { type: "active", activeFlags: [] },
    }),
  });

  assertEqual(view.hasData, true, "thread data should mark Git details as populated");
  assertEqual(view.cwd, TEST_WORKSPACE, "thread cwd should be exposed for the Environment branch picker");
  assertEqual(view.currentBranch, "codex/branch-details-tests", "current branch should be exposed for the Environment branch picker");
  assertRow(view.rows, "local", "Local", "");
  assertRow(view.rows, "branch", "Branch", "codex/branch-details-tests");
  assertRow(view.rows, "commit", "Commit or push", "Commit or push");
  assertMissingRow(view.rows, "cwd", "Working directory should not be rendered in the Desktop Git surface");
  assertMissingRow(view.rows, "origin", "origin URL should not be rendered in the Desktop Git surface");
  assertMissingRow(view.rows, "status", "thread status should not be rendered in the Desktop Git surface");
}

function ignoresPlainThreadContextWithoutGitOrDiffData() {
  // CODEX-REF: /tmp/codex_asar_extract/webview/assets/local-conversation-thread-BX7YNcUw.js yf —
  // Codex Desktop now always emits the "Local" row when the thread has a cwd, even
  // when no Git context has been wired up yet. We mirror that behaviour: hasData
  // stays false (no diff/git facts) but the Local row is projected so the panel
  // can render the canonical 5-row Git layout once it does appear.
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-no-branch-details",
      cwd: TEST_WORKSPACE,
      status: { type: "idle" },
      gitInfo: null,
    }),
  });

  assertEqual(view.hasData, false, "non-git thread context alone should not populate Git details");
  assertEqual(view.rows.length, 1, "non-git thread context should still project the Local row when cwd exists");
  assertRow(view.rows, "local", "Local", "");
}

function keepsExplicitGitStatusFactsWithoutRenderingExtraRows() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-git-status",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "main",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      changedFiles: 3,
      hasDiff: true,
    },
  });

  assertEqual(view.hasData, true, "git status input should mark Git details as populated");
  assertEqual(view.gitStatus?.upstream, "origin/main", "git status should keep upstream");
  assertEqual(view.gitStatus?.ahead, 2, "git status should keep ahead count");
  assertEqual(view.gitStatus?.behind, 1, "git status should keep behind count");
  assertMissingRow(view.rows, "upstream", "upstream should remain a fact but not a visible Git row");
  assertMissingRow(view.rows, "aheadBehind", "ahead/behind should remain facts but not visible Git rows");
  assertMissingRow(view.rows, "changedFiles", "changed files should be represented by the Changes entry only");
}

function prefersLiveHostBranchOverStoredThreadBranch() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-live-host-branch",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "stored/thread-branch",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      branch: "live/host-branch",
      upstream: "origin/live/host-branch",
      ahead: 0,
      behind: 0,
      changedFiles: 0,
      hasDiff: false,
    },
  });

  assertEqual(view.currentBranch, "live/host-branch", "Environment should use the live host branch when it differs from the stored thread branch");
  assertRow(view.rows, "branch", "Branch", "live/host-branch");
}

function usesHostWorktreeModeForEnvironmentRow() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-linked-worktree",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/worktree",
        originUrl: "git@example.com:forge/Forge.git",
        sha: "abcdef1234567890",
      },
    }),
    gitStatus: {
      branch: "feature/worktree",
      changedFiles: 0,
      hasDiff: false,
      isWorktree: true,
    },
  });

  const localRow = view.rows.find((row) => row.id === "local");
  assertEqual(localRow?.label, "Worktree", "Environment mode row should use the host worktree label for linked worktrees");
  assertEqual(localRow?.mode, "worktree", "Environment mode row should keep the worktree mode for the renderer icon");
}

function treatsCleanGitStatusAsData() {
  const view = projectBranchDetails({
    thread: null,
    gitStatus: {
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      changedFiles: 0,
      hasDiff: false,
    },
  });

  assertEqual(view.hasData, true, "clean git status still carries real Git state");
  assertEqual(view.diff, null, "clean git status should not invent a diff card");
  assertMissingRow(view.rows, "upstream", "clean upstream should not render a visible Git row");
  assertMissingRow(view.rows, "aheadBehind", "clean ahead/behind should not render a visible Git row");
  assertMissingRow(view.rows, "changedFiles", "clean changed-files should not render a visible Git row");
}

function readsStatusFieldsFromThreadGitInfoExtension() {
  const view = projectBranchDetails({
    thread: threadFixture({
      id: "thread-git-info-extension",
      cwd: TEST_WORKSPACE,
      gitInfo: gitInfoFixture({
        branch: "feature/right-rail",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
        upstream: "origin/feature/right-rail",
        ahead: 2,
        behind: 1,
        changedFiles: 4,
        hasDiff: true,
      }),
    }),
  });

  assertEqual(view.gitStatus?.upstream, "origin/feature/right-rail", "thread gitInfo upstream should be accepted");
  assertEqual(view.gitStatus?.changedFiles, 4, "thread gitInfo changed files should be accepted");
  assertRow(view.rows, "branch", "Branch", "feature/right-rail");
  assertMissingRow(view.rows, "aheadBehind", "ahead/behind should not render in the Desktop Git surface");
  assertMissingRow(view.rows, "changedFiles", "changed files should not render in the Desktop Git surface");
}

function threadFixture(overrides: Partial<Thread> & { id: string }): Thread {
  const { id, ...rest } = overrides;
  return {
    id,
    extra: null,
    sessionId: id,
    forkedFromId: null,
    parentThreadId: null,
    preview: "",
    ephemeral: false,
    historyMode: "legacy",
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
    recencyAt: rest.recencyAt ?? null,
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
        "diff --git a/packages/ui/src/ForgeApp.tsx b/packages/ui/src/ForgeApp.tsx",
        "index 3333333..4444444 100644",
      ].join("\n"),
    },
  });

  assertNotNull(view.diff, "diff text should produce a diff projection");
  assertEqual(view.diff.summary, "2 changed files", "diff text should count unique changed files");
  assertEqual(view.gitStatus?.changedFiles, 2, "diff text should feed changed file Git status");
  assertMissingRow(view.rows, "changedFiles", "diff counts should be exposed through the Changes entry, not a visible row");
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

function projectsGithubCliStatusRows() {
  const unavailable = projectBranchDetails({
    thread: threadFixture({
      id: "thread-gh-status",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/gh-status",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      ghStatus: {
        isInstalled: false,
      },
    },
  });

  assertEqual(unavailable.githubStatus?.label, "GitHub CLI unavailable", "gh status should mirror Desktop unavailable copy");
  const github = assertRow(unavailable.rows, "github", "GitHub", "GitHub CLI unavailable");
  assertEqual(github.status, "unavailable", "gh unavailable status should be kept for the right rail");

  const signedOut = projectBranchDetails({
    thread: threadFixture({
      id: "thread-gh-signed-out",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/gh-status",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      ghStatus: {
        isAuthenticated: false,
        isInstalled: true,
      },
    },
  });
  assertRow(signedOut.rows, "github", "GitHub", "GitHub CLI not authenticated");

  const loading = projectBranchDetails({
    thread: threadFixture({
      id: "thread-gh-loading",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/gh-status",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      ghStatus: {
        isLoading: true,
      },
    },
  });
  assertRow(loading.rows, "github", "GitHub", "Checking pull request");

  const createPullRequest = projectBranchDetails({
    thread: threadFixture({
      id: "thread-gh-create-pr",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/gh-status",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      ghStatus: {
        isAuthenticated: true,
        isInstalled: true,
      },
    },
  });
  assertRow(createPullRequest.rows, "github", "GitHub", "Create pull request");

  const existingPullRequest = projectBranchDetails({
    thread: threadFixture({
      id: "thread-gh-existing-pr",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/gh-status",
        sha: "abcdef1234567890",
        originUrl: "git@example.com:forge/Forge.git",
      },
    }),
    gitStatus: {
      ghStatus: {
        isAuthenticated: true,
        isInstalled: true,
        pullRequestStatus: { number: 42 },
      },
    },
  });
  assertRow(existingPullRequest.rows, "github", "GitHub", "PR #42");

  const pullRequest = projectBranchDetails({
    thread: threadFixture({
      id: "thread-pr-row",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/pr-row",
        originUrl: "git@example.com:forge/Forge.git",
        sha: "abcdef1234567890",
      },
    }),
    pullRequest: {
      number: 42,
      title: "Align right rail",
      url: "https://github.com/example/forge/pull/42",
      isDraft: false,
      state: "OPEN",
    },
  });
  assertRow(pullRequest.rows, "pull-request", "Pull request", "Align right rail");
  assertMissingRow(pullRequest.rows, "github", "active PR should replace the duplicate GitHub status row");

  const pullRequestWithGithubStatus = projectBranchDetails({
    thread: threadFixture({
      id: "thread-pr-row-gh-status",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/pr-row-gh-status",
        originUrl: "git@example.com:forge/Forge.git",
        sha: "abcdef1234567890",
      },
    }),
    gitStatus: {
      ghStatus: {
        isAuthenticated: true,
        isInstalled: true,
        pullRequestStatus: { number: 42 },
      },
    },
    pullRequest: {
      number: 42,
      title: "Align right rail",
      url: "https://github.com/example/forge/pull/42",
      isDraft: false,
      state: "OPEN",
    },
  });
  assertRow(pullRequestWithGithubStatus.rows, "pull-request", "Pull request", "Align right rail");
  assertMissingRow(
    pullRequestWithGithubStatus.rows,
    "github",
    "active PR row should replace the separate GitHub PR status row",
  );

  const fallbackPullRequest = projectBranchDetails({
    thread: threadFixture({
      id: "thread-pr-row-fallback",
      cwd: TEST_WORKSPACE,
      gitInfo: {
        branch: "feature/pr-row-fallback",
        originUrl: "git@example.com:forge/Forge.git",
        sha: "abcdef1234567890",
      },
    }),
    pullRequest: {
      number: 43,
      title: " ",
      url: "https://github.com/example/forge/pull/43",
      isDraft: false,
      state: "OPEN",
    },
  });
  assertRow(fallbackPullRequest.rows, "pull-request", "Pull request", "PR #43");
}

function returnsEmptyStateWithoutData() {
  const view = projectBranchDetails({
    thread: null,
    diff: null,
  });

  assertEqual(view.title, "Environment", "title should match Codex Desktop");
  assertEqual(
    view.emptyText,
    "Environment details will appear when the app server provides thread Git or diff data.",
    "empty text should explain unavailable environment details",
  );
  assertEqual(view.rows.length, 0, "empty state should not include rows");
  assertEqual(view.diff, null, "empty state should not include diff");
  assertEqual(view.gitStatus, null, "empty state should not include git status");
  assertEqual(view.hasData, false, "empty state should report hasData false");
}

function assertRow(
  rows: Array<{ id: string; label: string; value: string; status?: string; details?: string[] }>,
  id: string,
  label: string,
  value: string,
) {
  const row = rows.find((candidate) => candidate.id === id);
  assertNotNull(row, `expected row ${id}`);
  assertEqual(row.label, label, `row ${id} label`);
  assertEqual(row.value, value, `row ${id} value`);
  return row;
}

function assertMissingRow(
  rows: Array<{ id: string }>,
  id: string,
  message: string,
) {
  if (rows.some((candidate) => candidate.id === id)) {
    throw new Error(message);
  }
}

function gitInfoFixture(value: Record<string, unknown>): Thread["gitInfo"] {
  return value as unknown as Thread["gitInfo"];
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

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
