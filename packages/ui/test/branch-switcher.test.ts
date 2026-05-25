// codex: branch-picker-extension — sanity tests for the branch-picker
// partition + default-branch helpers. We bypass the React portal rendering
// path (the dropdown is portal-mounted to <body> via a runtime click) and
// instead assert that the pure helpers feeding the renderer:
//   1. group locals before remotes,
//   2. keep current branch on top of the local list,
//   3. surface the default-branch marker only when names match.
import { __testing, type PartitionedBranches } from "../src/components/composer-footer-branch-switcher";
import type { GitBranchInfo } from "../src/lib/tauri-host";

export default function runBranchSwitcherTests(): void {
  partitionsLocalAndRemoteBranches();
  keepsCurrentBranchAtTopOfLocalList();
  filtersBranchesByQuery();
  marksDefaultBranchOnlyWhenNamesMatch();
  stripsRemotePrefixForCheckoutCreation();
}

function partitionsLocalAndRemoteBranches(): void {
  const branches: GitBranchInfo[] = [
    fixture("main", { isCurrent: true, lastCommitMs: 3 }),
    fixture("feature-a", { lastCommitMs: 1 }),
    fixture("origin/main", { isRemote: true, lastCommitMs: 4 }),
    fixture("origin/feature-b", { isRemote: true, lastCommitMs: 2 }),
  ];
  const partitioned: PartitionedBranches = __testing.partitionBranches(branches, "");
  assertEqual(partitioned.local.length, 2, "local section should only carry non-remote refs");
  assertEqual(partitioned.local[0]?.name, "main", "current branch should bubble to the top of locals");
  assertEqual(partitioned.local[1]?.name, "feature-a", "remaining locals should follow committerdate-desc order");
  assertEqual(partitioned.remote.length, 2, "remote section should carry only remote refs");
  assertEqual(partitioned.remote[0]?.name, "origin/main", "remote refs should sort by committerdate desc (newest first)");
  assertEqual(
    partitioned.remote.every((branch) => branch.isRemote),
    true,
    "remote section should not leak local refs",
  );
}

function keepsCurrentBranchAtTopOfLocalList(): void {
  const branches: GitBranchInfo[] = [
    fixture("feature-old", { lastCommitMs: 9 }),
    fixture("feature-new", { lastCommitMs: 8, isCurrent: true }),
    fixture("feature-mid", { lastCommitMs: 7 }),
  ];
  const partitioned = __testing.partitionBranches(branches, "");
  assertEqual(
    partitioned.local[0]?.name,
    "feature-new",
    "current branch should beat newer-commit branches in the local list",
  );
}

function filtersBranchesByQuery(): void {
  const branches: GitBranchInfo[] = [
    fixture("main"),
    fixture("feature-alpha"),
    fixture("feature-beta"),
    fixture("origin/feature-alpha", { isRemote: true }),
    fixture("origin/main", { isRemote: true }),
  ];
  const filtered = __testing.partitionBranches(branches, "alpha");
  assertEqual(filtered.local.length, 1, "needle should narrow local section to alpha");
  assertEqual(filtered.local[0]?.name, "feature-alpha", "alpha needle should pick feature-alpha locally");
  assertEqual(filtered.remote.length, 1, "needle should narrow remote section to alpha");
  assertEqual(
    filtered.remote[0]?.name,
    "origin/feature-alpha",
    "alpha needle should pick the remote tracking branch",
  );
}

function marksDefaultBranchOnlyWhenNamesMatch(): void {
  assertEqual(
    __testing.isDefaultBranchMarker("main", "main"),
    true,
    "default chip should appear on the matching branch",
  );
  assertEqual(
    __testing.isDefaultBranchMarker("feature", "main"),
    false,
    "default chip should never apply to a non-default branch",
  );
  assertEqual(
    __testing.isDefaultBranchMarker("main", null),
    false,
    "missing default branch should suppress the chip",
  );
  assertEqual(
    __testing.isDefaultBranchMarker("main", ""),
    false,
    "empty default branch string should suppress the chip",
  );
}

function stripsRemotePrefixForCheckoutCreation(): void {
  assertEqual(
    __testing.stripRemotePrefix("origin/feature-x"),
    "feature-x",
    "remote prefix should be stripped for local tracking",
  );
  assertEqual(
    __testing.stripRemotePrefix("upstream/release/2024"),
    "release/2024",
    "only the first slash should be consumed (preserves namespaced branches)",
  );
  assertEqual(
    __testing.stripRemotePrefix("orphan"),
    null,
    "a remote ref without a slash should produce null",
  );
  assertEqual(
    __testing.stripRemotePrefix("origin/"),
    null,
    "an empty trailing segment should produce null",
  );
}

function fixture(name: string, overrides: Partial<GitBranchInfo> = {}): GitBranchInfo {
  return {
    name,
    isCurrent: false,
    isRemote: false,
    lastCommitMs: null,
    ...overrides,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}
