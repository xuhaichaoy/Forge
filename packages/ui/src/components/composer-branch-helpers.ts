import type { GitBranchInfo } from "../lib/tauri-host";

export function stripRemotePrefix(remoteName: string): string | null {
  const idx = remoteName.indexOf("/");
  if (idx < 0) return null;
  const tail = remoteName.slice(idx + 1).trim();
  return tail.length > 0 ? tail : null;
}

export interface PartitionedBranches {
  local: GitBranchInfo[];
  remote: GitBranchInfo[];
}

export function partitionBranches(
  branches: GitBranchInfo[],
  needle: string,
): PartitionedBranches {
  const lower = needle.trim().toLowerCase();
  const matches = (branch: GitBranchInfo) =>
    lower.length === 0 || branch.name.toLowerCase().includes(lower);
  const local = branches
    .filter((branch) => !branch.isRemote && matches(branch))
    .sort((left, right) => {
      if (left.isCurrent && !right.isCurrent) return -1;
      if (!left.isCurrent && right.isCurrent) return 1;
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
  const remote = branches
    .filter((branch) => branch.isRemote && matches(branch))
    .sort((left, right) => {
      const leftMs = left.lastCommitMs ?? 0;
      const rightMs = right.lastCommitMs ?? 0;
      return rightMs - leftMs;
    });
  return { local, remote };
}

export function isDefaultBranchMarker(
  branchName: string,
  defaultBranch: string | null,
): boolean {
  if (defaultBranch === null || defaultBranch.length === 0) return false;
  return branchName === defaultBranch;
}

export const __testing = {
  partitionBranches,
  isDefaultBranchMarker,
  stripRemotePrefix,
};
