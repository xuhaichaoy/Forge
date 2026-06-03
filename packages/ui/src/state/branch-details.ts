import type { Thread } from "@hicodex/codex-protocol";
import { formatMessage } from "./i18n";

export interface BranchDetailsViewModel {
  title: string;
  emptyText: string;
  rows: BranchDetailsRow[];
  diff: BranchDetailsDiff | null;
  gitStatus: BranchDetailsGitStatus | null;
  githubStatus?: BranchDetailsGithubStatus | null;
  hasData: boolean;
}

export interface BranchDetailsRow {
  id: string;
  label: string;
  value: string;
  status?: string;
  details?: string[];
  /*
   * codex: local-conversation-thread-*.js — Environment-section PR widget (row 4);
   * click opens the PR's GitHub page. branchDetailsEntries() lifts this into a
   * RailEntryAction `{ kind: "url", url }` so right-rail's existing url handler
   * (onOpenUrl) takes over.
   */
  actionUrl?: string;
}

export interface BranchDetailsDiff {
  title: string;
  summary: string;
  changedFiles: number;
  hasDiff: boolean;
  files: BranchDetailsDiffFile[];
}

export interface BranchDetailsDiffFile {
  path: string;
  kind?: string;
}

export interface BranchDetailsProjectionInput {
  thread: Thread | null | undefined;
  diff?: BranchDetailsDiffInput | null;
  gitStatus?: BranchDetailsGitStatusInput | null;
  /*
   * codex: local-conversation-thread-*.js — Environment-section PR widget (row 4);
   * caller fetches via `host_gh_pr_status` (gh CLI). When absent, the row
   * is not emitted.
   */
  pullRequest?: BranchDetailsPullRequest | null;
}

export interface BranchDetailsPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  state: string;
}

export interface BranchDetailsDiffInput {
  diff?: string | null;
  files?: BranchDetailsDiffFileInput[] | null;
}

export interface BranchDetailsDiffFileInput {
  path: string;
  kind?: string | null;
}

// CODEX-REF: diff-unified-*.js — Codex Desktop's Changes summary row pulls
// `additions`/`deletions` from the active diff projection and threads them through
// its line-count summary component (`linesAdded` / `linesRemoved` props).
// HiCodex now mirrors that data on `BranchDetailsGitStatus` so the right rail can
// render the same `+N -N` decoration instead of "N changed files".
export interface BranchDetailsGitStatus {
  upstream?: string;
  ahead?: number;
  behind?: number;
  changedFiles?: number;
  linesAdded?: number;
  linesRemoved?: number;
  hasDiff?: boolean;
}

export interface BranchDetailsGithubStatus {
  label: string;
  status?: string;
}

export interface BranchDetailsGitStatusInput {
  branch?: string | null;
  sha?: string | null;
  upstream?: string | null;
  ahead?: number | string | null;
  behind?: number | string | null;
  changedFiles?: number | string | BranchDetailsGitChangedFileInput[] | null;
  hasDiff?: boolean | null;
  diff?: string | null;
  files?: BranchDetailsGitChangedFileInput[] | null;
  [key: string]: unknown;
}

export type BranchDetailsGitChangedFileInput =
  | string
  | BranchDetailsDiffFileInput
  | {
      path?: string | null;
      newPath?: string | null;
      new_path?: string | null;
      kind?: string | null;
      status?: string | null;
      [key: string]: unknown;
    };

export function projectBranchDetails(input: BranchDetailsProjectionInput): BranchDetailsViewModel {
  const thread = input.thread ?? null;
  const rows: BranchDetailsRow[] = [];
  const gitInfo = objectRecord(thread?.gitInfo);
  const mergedDiffInput = mergeDiffInputs(input.diff ?? null, diffInputFromGitStatus(input.gitStatus ?? null));
  const diff = projectDiff(mergedDiffInput);
  const diffText = typeof mergedDiffInput?.diff === "string" ? mergedDiffInput.diff : "";
  const gitStatus = projectGitStatus(input.gitStatus ?? null, gitInfo, diff, diffText);
  const githubStatus = projectGithubStatus(input.gitStatus ?? null);
  const hasThreadGitContext = gitInfo !== null;
  const hasGitStatusData = gitStatus !== null;
  const hasExplicitGithubStatus = explicitGithubStatusProvided(input.gitStatus ?? null);
  const shouldShowThreadContext = hasThreadGitContext || hasGitStatusData || diff !== null;

  // CODEX-REF: local-conversation-thread-*.js — Codex Desktop's "Local" row is
  // always rendered as soon as the conversation has
  // either a working directory or any thread-level Git context. Previously we gated
  // on `shouldShowThreadContext && cwd`, which produced empty Git surfaces on
  // perfectly normal sessions whose runtime had not yet emitted Git data. Codex
  // shows Local as the second of its five canonical Git rows in every snapshot.
  const hasLocalContext = Boolean(thread?.cwd) || shouldShowThreadContext;
  if (hasLocalContext) {
    // CODEX-REF: local-conversation-thread-CEeZyOcp.js (Sf→Zc) — the Environment
    // second row is the worktree/composer-mode trigger (composerMode defaults to
    // `local`, triggerVariant `summary-panel`). Codex labels it with the SHORT
    // execution-mode name `composer.mode.local.short` ("Local") and a chevron —
    // there is NO "Work locally" subtitle here ("Work locally" lives only on the
    // composer's full `composer.mode.workLocally` description line, not this rail
    // row). HiCodex previously invented `value: "Work locally"`; the row now
    // carries only the short mode label so the rendered trigger matches Codex's
    // "Local + chevron" trigger. (HiCodex has no worktree-handoff data flow, so
    // the mode cannot switch to Cloud/Worktree yet; the static `local` label is
    // the correct floor.)
    rows.push({
      id: "local",
      // codex composer.mode.local.short — Codex labels the Environment second row
      // with the SHORT execution-mode name "Local".
      label: formatMessage({ id: "composer.mode.local.short", defaultMessage: "Local" }),
      value: "",
    });
  }

  const statusRecord = objectRecord(input.gitStatus ?? null);
  const branch = firstDefined(
    nonEmptyStringField(gitInfo, "branch"),
    nonEmptyStringField(statusRecord, "branch"),
  );
  const hasCommitAction = Boolean(branch || gitStatus?.hasDiff || diff?.hasDiff);

  if (branch) {
    rows.push({
      id: "branch",
      label: formatMessage({ id: "hc.branchDetails.row.branch", defaultMessage: "Branch" }),
      value: branch,
    });
  }
  if (hasCommitAction) {
    const commitLabel = formatMessage({ id: "hc.branchDetails.row.commit", defaultMessage: "Commit" });
    rows.push({
      id: "commit",
      label: commitLabel,
      value: commitLabel,
    });
  }
  // codex: local-conversation-thread-*.js — Environment-section PR widget (row 4);
  // when the gh CLI returns an active PR for the current branch, surface it between
  // the Commit row and the GitHub status row. Click opens the PR URL.
  const pullRequest = input.pullRequest ?? null;
  if (pullRequest && pullRequest.number > 0) {
    rows.push({
      id: "pull-request",
      label: formatMessage({ id: "hc.branchDetails.row.pullRequest", defaultMessage: "Pull request" }),
      value: `${pullRequest.title} #${pullRequest.number}`,
      status: pullRequestStatusFromPr(pullRequest),
      actionUrl: pullRequest.url,
    });
  }

  // CODEX-REF: local-conversation-thread-*.js — Codex Desktop ALWAYS renders the
  // GitHub status row in the Git summary section,
  // falling back to "GitHub CLI unavailable" when no `ghStatus` payload is around.
  // We mirror that by emitting the row whenever the Git panel is rendered at all
  // (i.e. there is real Git context), even when no GitHub probe has come back yet.
  if (shouldShowThreadContext || hasExplicitGithubStatus) {
    rows.push({
      id: "github",
      label: "GitHub",
      value: githubStatus.label,
      ...(githubStatus.status ? { status: githubStatus.status } : {}),
    });
  }

  return {
    /*
     * Section title mirrors Codex Desktop's `environmentSummary` ICU entry.
     * Verified literally in local-conversation-thread-*.js:
     *   `id: "codex.localConversation.environmentSummary.title",
     *    defaultMessage: "Environment",
     *    description: "Title for the thread summary side panel environment
     *                  and branch details section"`
     * (Codex.app 26.519.41501). HiCodex keeps the internal section id as
     * `branchDetails` for historical reasons; the user-visible title is the
     * Desktop-aligned "Environment".
     */
    title: formatMessage({ id: "codex.localConversation.environmentSummary.title", defaultMessage: "Environment" }),
    emptyText: formatMessage({
      id: "hc.branchDetails.emptyText",
      defaultMessage: "Environment details will appear when the app server provides thread Git or diff data.",
    }),
    rows,
    diff,
    gitStatus,
    githubStatus,
    hasData: hasThreadGitContext || hasGitStatusData || hasExplicitGithubStatus || diff !== null,
  };
}

/*
 * codex: local-conversation-thread-*.js — Environment-section PR status badge
 * (row 4); maps the gh CLI `state` / `isDraft` pair to a short status token
 * reused by the rail row's right-side chip ("Draft" / "Merged" / "Closed" / "Open").
 */
function pullRequestStatusFromPr(pr: BranchDetailsPullRequest): string {
  if (pr.isDraft) return "Draft";
  const normalized = pr.state.toUpperCase();
  if (normalized === "MERGED") return "Merged";
  if (normalized === "CLOSED") return "Closed";
  return "Open";
}

function explicitGithubStatusProvided(input: BranchDetailsGitStatusInput | null): boolean {
  const record = objectRecord(input);
  if (!record) return false;
  return Boolean(
    objectRecord(record.ghStatus)
      ?? objectRecord(record.githubStatus)
      ?? objectRecord(record.github),
  );
}

function mergeDiffInputs(
  primary: BranchDetailsDiffInput | null,
  fallback: BranchDetailsDiffInput | null,
): BranchDetailsDiffInput | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const primaryDiff = typeof primary.diff === "string" && primary.diff.trim() ? primary.diff : null;
  const fallbackDiff = typeof fallback.diff === "string" && fallback.diff.trim() ? fallback.diff : null;
  const primaryFiles = primary.files && primary.files.length > 0 ? primary.files : null;
  const fallbackFiles = fallback.files && fallback.files.length > 0 ? fallback.files : null;
  return {
    diff: primaryDiff ?? fallbackDiff,
    files: primaryFiles ?? fallbackFiles,
  };
}

function diffInputFromGitStatus(input: BranchDetailsGitStatusInput | null): BranchDetailsDiffInput | null {
  const record = objectRecord(input);
  if (!record) return null;
  const diff = stringField(record, "diff");
  const files = fileInputsFromUnknown(record.files) ?? fileInputsFromUnknown(record.changedFiles);
  if (!diff && (!files || files.length === 0)) return null;
  return {
    ...(diff ? { diff } : {}),
    ...(files && files.length > 0 ? { files } : {}),
  };
}

function projectDiff(input: BranchDetailsDiffInput | null): BranchDetailsDiff | null {
  if (!input) return null;

  const files = dedupeFiles(input.files ?? []);
  const diffText = typeof input.diff === "string" ? input.diff.trim() : "";
  const changedFileCount = files.length || countDiffFiles(diffText);
  const hasDiff = changedFileCount > 0 || diffText.length > 0;

  if (!hasDiff) return null;

  return {
    title: formatMessage({ id: "hc.branchDetails.diff.title", defaultMessage: "Diff" }),
    summary: changedFileCount > 0
      ? changedFilesSummary(changedFileCount)
      // codex codex.unifiedDiff.reviewChangedFiles — empty-diff CTA copy.
      : formatMessage({ id: "codex.unifiedDiff.reviewChangedFiles", defaultMessage: "Review changed files" }),
    changedFiles: changedFileCount,
    hasDiff,
    files,
  };
}

function projectGitStatus(
  input: BranchDetailsGitStatusInput | null,
  gitInfo: Record<string, unknown> | null,
  diff: BranchDetailsDiff | null,
  diffText: string,
): BranchDetailsGitStatus | null {
  const statusRecord = objectRecord(input);
  const upstream = firstDefined(
    nonEmptyStringField(statusRecord, "upstream"),
    nonEmptyStringField(gitInfo, "upstream"),
  );
  const ahead = firstDefined(numberField(statusRecord, "ahead"), numberField(gitInfo, "ahead"));
  const behind = firstDefined(numberField(statusRecord, "behind"), numberField(gitInfo, "behind"));
  const changedFiles = firstDefined(
    changedFilesField(statusRecord),
    changedFilesField(gitInfo),
    diff ? diff.changedFiles : undefined,
  );
  const hasDiff = firstDefined(
    booleanField(statusRecord, "hasDiff"),
    booleanField(gitInfo, "hasDiff"),
    diff ? diff.hasDiff : undefined,
  );
  // CODEX-REF: diff-unified-*.js — Codex Desktop reads `additions` / `deletions`
  // from the active diff projection and forwards them to its line-count summary
  // component (`linesAdded` / `linesRemoved` props). HiCodex receives either explicit
  // counts in `gitStatus` or a raw unified-diff string; we coalesce both into the
  // viewmodel so the Changes row can render `+N -N` without inventing data.
  const linesAdded = firstDefined(
    diffLineCountField(statusRecord, ["linesAdded", "additions", "added", "insertions"]),
    diffLineCountField(gitInfo, ["linesAdded", "additions", "added", "insertions"]),
    countDiffLines(diffText, "+"),
  );
  const linesRemoved = firstDefined(
    diffLineCountField(statusRecord, ["linesRemoved", "deletions", "removed"]),
    diffLineCountField(gitInfo, ["linesRemoved", "deletions", "removed"]),
    countDiffLines(diffText, "-"),
  );
  if (
    upstream === undefined
    && ahead === undefined
    && behind === undefined
    && changedFiles === undefined
    && hasDiff === undefined
    && linesAdded === undefined
    && linesRemoved === undefined
  ) {
    return null;
  }
  return {
    ...(upstream !== undefined ? { upstream } : {}),
    ...(ahead !== undefined ? { ahead } : {}),
    ...(behind !== undefined ? { behind } : {}),
    ...(changedFiles !== undefined ? { changedFiles } : {}),
    ...(linesAdded !== undefined ? { linesAdded } : {}),
    ...(linesRemoved !== undefined ? { linesRemoved } : {}),
    ...(hasDiff !== undefined ? { hasDiff } : {}),
  };
}

function diffLineCountField(record: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = normalizeCount(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

// CODEX-REF: diff-unified-*.js — Codex Desktop computes added/removed counts upstream
// and ships them as numbers; when the runtime only hands us a raw unified-diff string
// we approximate the same counts by scanning for body lines starting with `+`/`-`
// (skipping the `+++`/`---` file headers).
function countDiffLines(diffText: string, marker: "+" | "-"): number | undefined {
  if (!diffText) return undefined;
  const header = marker === "+" ? "+++" : "---";
  let count = 0;
  let found = false;
  for (const line of diffText.split("\n")) {
    if (!line || line[0] !== marker) continue;
    if (line.startsWith(header)) continue;
    found = true;
    count += 1;
  }
  return found ? count : undefined;
}

// CODEX-REF: local-conversation-thread-*.js — Codex Desktop ALWAYS renders the GitHub
// row inside the Git summary panel; only the
// label rotates between the five `gitSummary.*` i18n strings depending on the
// observed `ghStatus`. When no ghStatus payload is available yet the Desktop falls
// back to "GitHub CLI unavailable" rather than skipping the row, which matches the
// "happy path on a machine without `gh`".
function githubCliUnavailableLabel(): string {
  // codex codex.localConversation.gitSummary.githubCliUnavailable.
  return formatMessage({
    id: "codex.localConversation.gitSummary.githubCliUnavailable",
    defaultMessage: "GitHub CLI unavailable",
  });
}

function projectGithubStatus(input: BranchDetailsGitStatusInput | null): BranchDetailsGithubStatus {
  const record = objectRecord(input);
  const githubRecord = record
    ? firstDefined(
        objectRecord(record.ghStatus),
        objectRecord(record.githubStatus),
        objectRecord(record.github),
      )
    : null;
  if (!githubRecord) {
    return { label: githubCliUnavailableLabel(), status: "unavailable" };
  }

  if (githubRecord.isInstalled === false) {
    return { label: githubCliUnavailableLabel(), status: "unavailable" };
  }
  if (githubRecord.isAuthenticated === false) {
    return {
      // codex codex.localConversation.gitSummary.githubCliSignedOut.
      label: formatMessage({
        id: "codex.localConversation.gitSummary.githubCliSignedOut",
        defaultMessage: "GitHub CLI not authenticated",
      }),
      status: "signed out",
    };
  }
  if (githubRecord.isLoading === true || githubRecord.isPending === true || githubRecord.status === "loading") {
    return {
      // codex codex.localConversation.gitSummary.checkingPullRequest.
      label: formatMessage({
        id: "codex.localConversation.gitSummary.checkingPullRequest",
        defaultMessage: "Checking pull request",
      }),
      status: "loading",
    };
  }
  if (githubRecord.isError === true || githubRecord.status === "error") {
    return {
      // codex codex.localConversation.gitSummary.pullRequestUnavailable.
      label: formatMessage({
        id: "codex.localConversation.gitSummary.pullRequestUnavailable",
        defaultMessage: "Pull request status unavailable",
      }),
      status: "unavailable",
    };
  }
  const pullRequestNumber = firstDefined(
    numberField(githubRecord, "number"),
    numberField(objectRecord(githubRecord.pullRequestStatus), "number"),
  );
  if (pullRequestNumber !== undefined) {
    return {
      // codex codex.localConversation.gitSummary.pullRequestTabTitle — "PR #{number}".
      label: formatMessage(
        { id: "codex.localConversation.gitSummary.pullRequestTabTitle", defaultMessage: "PR #{number}" },
        { number: pullRequestNumber },
      ),
      status: "available",
    };
  }
  if (githubRecord.isInstalled === true && githubRecord.isAuthenticated === true) {
    return {
      // codex codex.localConversation.gitSummary.createPullRequest.
      label: formatMessage({
        id: "codex.localConversation.gitSummary.createPullRequest",
        defaultMessage: "Create pull request",
      }),
      status: "available",
    };
  }
  return { label: githubCliUnavailableLabel(), status: "unavailable" };
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function nonEmptyStringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = stringField(record, key).trim();
  return value ? value : undefined;
}

function numberField(record: Record<string, unknown> | null, key: string): number | undefined {
  return normalizeCount(record?.[key]);
}

function booleanField(record: Record<string, unknown> | null, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function changedFilesField(record: Record<string, unknown> | null): number | undefined {
  if (!record) return undefined;
  return normalizeCount(record.changedFiles) ?? normalizeCount(record.changed_files);
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  if (Array.isArray(value)) return fileInputsFromUnknown(value)?.length ?? value.length;
  return undefined;
}

function fileInputsFromUnknown(value: unknown): BranchDetailsDiffFileInput[] | null {
  if (!Array.isArray(value)) return null;
  const files: BranchDetailsDiffFileInput[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const path = item.trim();
      if (path) files.push({ path });
      continue;
    }
    const record = objectRecord(item);
    if (!record) continue;
    const path = nonEmptyStringField(record, "path")
      ?? nonEmptyStringField(record, "newPath")
      ?? nonEmptyStringField(record, "new_path");
    if (!path) continue;
    files.push({
      path,
      kind: nonEmptyStringField(record, "kind") ?? nonEmptyStringField(record, "status") ?? null,
    });
  }
  return files;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
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

function changedFilesSummary(count: number): string {
  // HiCodex's "N changed file(s)" diff summary phrasing has no exact Codex i18n
  // entry (Codex's `codex.unifiedDiff.filesChanged` reads "# files changed"); keep
  // the HiCodex wording as a self-hosted ICU plural so the en-US summary is byte
  // identical and zh gets a localized form.
  return formatMessage(
    {
      id: "hc.branchDetails.diff.changedFiles",
      defaultMessage: "{count, plural, one {# changed file} other {# changed files}}",
    },
    { count },
  );
}
