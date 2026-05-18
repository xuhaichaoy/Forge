import type { Thread } from "@hicodex/codex-protocol";

export interface BranchDetailsViewModel {
  title: string;
  emptyText: string;
  rows: BranchDetailsRow[];
  diff: BranchDetailsDiff | null;
  hasData: boolean;
}

export interface BranchDetailsRow {
  id: string;
  label: string;
  value: string;
}

export interface BranchDetailsDiff {
  title: string;
  summary: string;
  files: BranchDetailsDiffFile[];
}

export interface BranchDetailsDiffFile {
  path: string;
  kind?: string;
}

export interface BranchDetailsProjectionInput {
  thread: Thread | null | undefined;
  diff?: BranchDetailsDiffInput | null;
}

export interface BranchDetailsDiffInput {
  diff?: string | null;
  files?: BranchDetailsDiffFileInput[] | null;
}

export interface BranchDetailsDiffFileInput {
  path: string;
  kind?: string | null;
}

export function projectBranchDetails(input: BranchDetailsProjectionInput): BranchDetailsViewModel {
  const thread = input.thread ?? null;
  const rows: BranchDetailsRow[] = [];
  const diff = projectDiff(input.diff ?? null);

  const gitInfo = objectRecord(thread?.gitInfo);
  const hasThreadGitContext = gitInfo !== null;
  const shouldShowThreadContext = hasThreadGitContext || diff !== null;

  if (shouldShowThreadContext && thread?.cwd) {
    rows.push({
      id: "cwd",
      label: "Working directory",
      value: thread.cwd,
    });
  }

  const branch = stringField(gitInfo, "branch");
  const sha = stringField(gitInfo, "sha");
  const originUrl = stringField(gitInfo, "originUrl");

  if (branch) {
    rows.push({
      id: "branch",
      label: "Branch",
      value: branch,
    });
  }
  if (sha) {
    rows.push({
      id: "commit",
      label: "Commit",
      value: shortSha(sha),
    });
  }
  if (originUrl) {
    rows.push({
      id: "origin",
      label: "Origin",
      value: originUrl,
    });
  }

  const status = statusText(thread?.status);
  if (shouldShowThreadContext && status) {
    rows.push({
      id: "status",
      label: "Thread status",
      value: status,
    });
  }

  return {
    title: "Git",
    emptyText: "Git details will appear when the app server provides thread Git or diff data.",
    rows,
    diff,
    hasData: hasThreadGitContext || diff !== null,
  };
}

function projectDiff(input: BranchDetailsDiffInput | null): BranchDetailsDiff | null {
  if (!input) return null;

  const files = dedupeFiles(input.files ?? []);
  const diffText = typeof input.diff === "string" ? input.diff.trim() : "";
  const changedFileCount = files.length || countDiffFiles(diffText);

  if (changedFileCount === 0 && !diffText) return null;

  return {
    title: "Diff",
    summary: changedFileCount > 0 ? formatCount(changedFileCount, "changed file") : "Diff available",
    files,
  };
}

function dedupeFiles(files: BranchDetailsDiffFileInput[]): BranchDetailsDiffFile[] {
  const result: BranchDetailsDiffFile[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const path = file.path.trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push({
      path,
      ...(file.kind ? { kind: file.kind } : {}),
    });
  }
  return result;
}

function statusText(status: unknown): string {
  if (typeof status === "string") return status;
  const record = objectRecord(status);
  if (!record) return "";
  const type = record.type;
  if (typeof type === "string") return type;
  const value = record.status;
  return typeof value === "string" ? value : "";
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function shortSha(sha: string): string {
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function countDiffFiles(diff: string): number {
  if (!diff) return 0;
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const parts = line.split(" ");
    const path = parts[3]?.replace(/^b\//, "");
    if (path) files.add(path);
  }
  return files.size;
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
