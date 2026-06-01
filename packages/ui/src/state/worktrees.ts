import type { Thread } from "@hicodex/codex-protocol";
import * as tauriHost from "../lib/tauri-host";
import type { CommandPanelEntry } from "./command-panel";
import {
  HICODEX_DESKTOP_CONFIG_KEYS,
  readMigratedStorageValue,
} from "./hicodex-desktop-namespace";
import type { BrowserStorageLike } from "./image-generation-tool";
import type { I18nMessageDescriptor, I18nValues } from "./i18n";

type FormatMessage = (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;

export type ComposerWorkMode = "local" | "worktree" | "cloud";

export interface WorktreeModeOption {
  id: ComposerWorkMode;
  label: string;
  description: string;
  status: "ready" | "selected" | "disabled";
  disabledReason?: string;
}

export interface HostGitStatus {
  cwd: string;
  repoRoot: string | null;
  branch: string | null;
  sha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changedFiles: Array<HostGitChangedFile | string>;
  hasDiff: boolean;
  diff: string | null;
  // codex thread-env-icon — true when the cwd is a LINKED git worktree
  // (explicit field so it types as boolean, not the index signature's unknown).
  isWorktree?: boolean;
  [key: string]: unknown;
}

export interface HostGitChangedFile {
  status: string;
  path: string;
  oldPath?: string | null;
  kind?: string | null;
  [key: string]: unknown;
}

export interface PendingWorktree {
  repoRoot: string;
  path: string;
  branchName: string;
  baseRef: string | null;
  baseSha: string;
}

export interface CreatePendingWorktreeRequest {
  cwd: string;
  branchName?: string | null;
  baseRef?: string | null;
}

export interface WorktreeHostApi {
  createPendingWorktree?: (request: CreatePendingWorktreeRequest) => Promise<PendingWorktree>;
  isTauriRuntime: () => boolean;
  readHostGitStatus?: (cwd: string) => Promise<HostGitStatus>;
}

export interface WorktreeSettingsProjectionInput {
  activeThread: Thread | null;
  cloudWorkspacesAvailable?: boolean;
  connected: boolean;
  gitDiffError?: string | null;
  gitDiffResult?: unknown;
  hostGitStatus?: HostGitStatus | null;
  hostGitStatusError?: string | null;
  mode: ComposerWorkMode;
  pendingWorktree?: PendingWorktree | null;
  tauriRuntimeAvailable?: boolean;
  workspace: string;
}

export const LEGACY_COMPOSER_WORK_MODE_STORAGE_KEY = "hicodex.composerWorkMode";
export const COMPOSER_WORK_MODE_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.composerWorkMode;

const HOST_WORKTREE_DISABLED_REASON = "Tauri host Git status is unavailable for this workspace.";
const CLOUD_DISABLED_REASON = "No cloud workspace handoff is connected in HiCodex.";
const tauriHostExports = tauriHost as unknown as {
  createPendingWorktree?: (request: CreatePendingWorktreeRequest) => Promise<PendingWorktree>;
  readHostGitStatus?: (cwd: string) => Promise<HostGitStatus>;
};

export const DEFAULT_WORKTREE_HOST_API: WorktreeHostApi = {
  createPendingWorktree: tauriHostExports.createPendingWorktree,
  isTauriRuntime: tauriHost.isTauriRuntime,
  readHostGitStatus: tauriHostExports.readHostGitStatus,
};

export function loadComposerWorkMode(storage: BrowserStorageLike | null): ComposerWorkMode {
  try {
    return normalizeComposerWorkMode(readMigratedStorageValue(
      storage,
      COMPOSER_WORK_MODE_STORAGE_KEY,
      [LEGACY_COMPOSER_WORK_MODE_STORAGE_KEY],
    ));
  } catch {
    return "local";
  }
}

export function saveComposerWorkMode(
  storage: BrowserStorageLike | null,
  mode: ComposerWorkMode,
): ComposerWorkMode {
  const normalized = normalizeComposerWorkMode(mode);
  try {
    storage?.setItem(COMPOSER_WORK_MODE_STORAGE_KEY, normalized);
  } catch {
    // Local storage is optional; the caller still keeps the in-memory mode.
  }
  return normalized;
}

export function normalizeComposerWorkMode(value: unknown): ComposerWorkMode {
  return value === "worktree" || value === "cloud" ? value : "local";
}

export function composerWorkModeLabel(mode: ComposerWorkMode, formatMessage?: FormatMessage): string {
  const fm = (id: string, defaultMessage: string): string =>
    formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage;
  switch (mode) {
    case "worktree":
      return fm("composer.mode.worktreeSegment", "Worktree");
    case "cloud":
      return fm("composer.mode.runInCloud", "Cloud");
    default:
      return fm("composer.mode.workLocally", "Work locally");
  }
}

export function composerWorkModeTitle(mode: ComposerWorkMode): string {
  switch (mode) {
    case "worktree":
      return "Create an isolated worktree before starting work";
    case "cloud":
      return "Use a cloud workspace for this task";
    default:
      return "Use the selected local project folder";
  }
}

export function projectWorktreeModeOptions(input: {
  cloudWorkspacesAvailable?: boolean;
  hostGitStatus?: HostGitStatus | null;
  mode: ComposerWorkMode;
  tauriRuntimeAvailable?: boolean;
}): WorktreeModeOption[] {
  const worktreeReady = worktreeModeAvailable(input);
  const cloudReady = input.cloudWorkspacesAvailable === true;
  return [
    {
      id: "local",
      label: composerWorkModeLabel("local"),
      description: "Use the selected project folder for new local Codex threads.",
      status: input.mode === "local" ? "selected" : "ready",
    },
    {
      id: "worktree",
      label: composerWorkModeLabel("worktree"),
      description: "Prepare an isolated git worktree for the next task.",
      status: !worktreeReady ? "disabled" : input.mode === "worktree" ? "selected" : "ready",
      disabledReason: worktreeReady ? undefined : HOST_WORKTREE_DISABLED_REASON,
    },
    {
      id: "cloud",
      label: composerWorkModeLabel("cloud"),
      description: "Hand the next task to a cloud workspace.",
      status: !cloudReady ? "disabled" : input.mode === "cloud" ? "selected" : "ready",
      disabledReason: cloudReady ? undefined : CLOUD_DISABLED_REASON,
    },
  ];
}

export function worktreeModeAvailable(input: {
  hostGitStatus?: HostGitStatus | null;
  tauriRuntimeAvailable?: boolean;
}): boolean {
  return input.tauriRuntimeAvailable === true && Boolean(input.hostGitStatus?.repoRoot?.trim());
}

export function selectableComposerWorkMode(
  requested: ComposerWorkMode,
  options: WorktreeModeOption[],
): ComposerWorkMode {
  return options.find((option) => option.id === requested && option.status !== "disabled")?.id ?? "local";
}

export async function readCurrentHostGitStatus(
  cwd: string,
  hostApi: WorktreeHostApi = DEFAULT_WORKTREE_HOST_API,
): Promise<HostGitStatus | null> {
  const normalizedCwd = cwd.trim();
  if (!normalizedCwd || !hostApi.isTauriRuntime() || !hostApi.readHostGitStatus) return null;
  return hostApi.readHostGitStatus(normalizedCwd);
}

export async function createHostPendingWorktree(
  request: CreatePendingWorktreeRequest,
  hostApi: WorktreeHostApi = DEFAULT_WORKTREE_HOST_API,
): Promise<PendingWorktree> {
  const cwd = request.cwd.trim();
  if (!cwd) throw new Error("Select a Git workspace before creating a worktree.");
  if (!hostApi.isTauriRuntime()) throw new Error("Tauri runtime is required to create a worktree.");
  if (!hostApi.createPendingWorktree) throw new Error("Tauri host createPendingWorktree is unavailable.");
  return hostApi.createPendingWorktree({
    cwd,
    branchName: request.branchName?.trim() || null,
    baseRef: request.baseRef?.trim() || null,
  });
}

export function projectWorktreesSettingsEntries(
  input: WorktreeSettingsProjectionInput,
): CommandPanelEntry[] {
  const options = projectWorktreeModeOptions({
    cloudWorkspacesAvailable: input.cloudWorkspacesAvailable,
    hostGitStatus: input.hostGitStatus,
    mode: input.mode,
    tauriRuntimeAvailable: input.tauriRuntimeAvailable,
  });
  const threadGit = threadGitInfo(input.activeThread);
  const diff = gitDiffSummary(input.gitDiffResult);
  const hostGit = hostGitSummary(input.hostGitStatus);
  const cwd = input.activeThread?.cwd || input.workspace || "";
  const worktreeReady = worktreeModeAvailable({
    hostGitStatus: input.hostGitStatus,
    tauriRuntimeAvailable: input.tauriRuntimeAvailable,
  });

  return [
    ...options.map((option): CommandPanelEntry => ({
      id: `worktrees:mode:${option.id}`,
      title: option.label,
      kind: "status",
      status: option.status,
      meta: option.disabledReason ?? option.description,
      disabled: option.status === "disabled",
      details: [
        option.description,
        option.status === "disabled"
          ? "HiCodex can only create a pending worktree after the native host confirms this cwd is inside a Git repository."
          : "Selecting this mode creates a real pending worktree path through the native host; thread facts still come from app-server.",
      ],
    })),
    {
      id: "worktrees:git-context",
      title: input.hostGitStatus ? "Current Git status" : "Current Git context",
      kind: "status",
      status: input.hostGitStatus
        ? hostGit.status
        : input.connected ? gitContextStatus(threadGit, diff, input.gitDiffError) : "offline",
      meta: input.hostGitStatus?.repoRoot || cwd || "No workspace selected",
      details: input.hostGitStatus
        ? hostGit.details
        : fallbackGitDetails({
            diff,
            error: input.gitDiffError,
            hostError: input.hostGitStatusError,
            threadGit,
          }),
    },
    {
      id: "worktrees:pending-worktree",
      title: "Pending worktree",
      kind: "status",
      status: input.pendingWorktree ? "pending" : worktreeReady ? "ready" : "blocked",
      meta: input.pendingWorktree?.path
        || (worktreeReady ? "Ready to create a pending worktree from this Git repo" : HOST_WORKTREE_DISABLED_REASON),
      disabled: !input.pendingWorktree && !worktreeReady,
      details: pendingWorktreeDetails(input.pendingWorktree, worktreeReady),
    },
  ];
}

function fallbackGitDetails({
  diff,
  error,
  hostError,
  threadGit,
}: {
  diff: ReturnType<typeof gitDiffSummary>;
  error?: string | null;
  hostError?: string | null;
  threadGit: ReturnType<typeof threadGitInfo>;
}): string[] {
  return [
    `Branch: ${threadGit.branch || "unknown"}`,
    `Commit: ${shortSha(threadGit.sha) || "unknown"}`,
    `Origin: ${threadGit.originUrl || "unknown"}`,
    hostError ? `Host Git status unavailable: ${hostError}` : "Host Git status unavailable; showing protocol/overlay fallback.",
    error
      ? `gitDiffToRemote failed: ${error}`
      : `Remote diff: ${diff.label}`,
  ];
}

function pendingWorktreeDetails(
  pending: PendingWorktree | null | undefined,
  worktreeReady: boolean,
): string[] {
  if (!pending) {
    return [
      worktreeReady
        ? "No pending worktree has been created yet."
        : "No pending worktree path is available until the host confirms a Git repository.",
      "New thread creation must use the returned path as cwd; HiCodex does not synthesize thread Git facts.",
    ];
  }
  return [
    `Path: ${pending.path}`,
    `Branch: ${pending.branchName || "unknown"}`,
    `Base ref: ${pending.baseRef || "default"}`,
    `Base commit: ${shortSha(pending.baseSha) || "unknown"}`,
    `Repo root: ${pending.repoRoot}`,
  ];
}

function gitContextStatus(
  gitInfo: ReturnType<typeof threadGitInfo>,
  diff: ReturnType<typeof gitDiffSummary>,
  error: string | null | undefined,
): string {
  if (error) return "git check failed";
  if (diff.changedFiles > 0 || diff.hasDiff) return "changes detected";
  if (gitInfo.branch || gitInfo.sha || gitInfo.originUrl) return "git-backed";
  return "no git data";
}

function hostGitSummary(status: HostGitStatus | null | undefined): {
  details: string[];
  status: string;
} {
  if (!status) return { details: [], status: "unavailable" };
  const changedFiles = hostChangedFilesCount(status);
  const hasDiff = status.hasDiff || changedFiles > 0 || Boolean(status.diff?.trim());
  const repoRoot = status.repoRoot?.trim() || "";
  const aheadBehind = formatAheadBehind(status.ahead, status.behind);
  return {
    status: !repoRoot ? "no git repository" : hasDiff ? "changes detected" : "clean",
    details: [
      `Cwd: ${status.cwd || "unknown"}`,
      `Repo root: ${repoRoot || "unknown"}`,
      `Branch: ${status.branch || "unknown"}`,
      `Commit: ${shortSha(status.sha ?? "") || "unknown"}`,
      `Upstream: ${status.upstream || "none"}`,
      `Ahead/behind: ${aheadBehind}`,
      `Changed files: ${changedFiles}`,
      "Source: Tauri host",
    ],
  };
}

function threadGitInfo(thread: Thread | null): {
  branch: string;
  originUrl: string;
  sha: string;
} {
  const gitInfo = recordObject(thread?.gitInfo);
  return {
    branch: stringField(gitInfo, "branch"),
    originUrl: stringField(gitInfo, "originUrl"),
    sha: stringField(gitInfo, "sha"),
  };
}

function gitDiffSummary(value: unknown): {
  changedFiles: number;
  hasDiff: boolean;
  label: string;
} {
  const record = recordObject(value);
  const diff = stringField(record, "diff");
  const changedFiles = diffFileCount(diff);
  const hasDiff = diff.trim().length > 0;
  if (changedFiles > 0) {
    return {
      changedFiles,
      hasDiff,
      label: `${changedFiles} changed file${changedFiles === 1 ? "" : "s"}`,
    };
  }
  return {
    changedFiles: 0,
    hasDiff,
    label: hasDiff ? "diff available" : "clean or unavailable",
  };
}

function hostChangedFilesCount(status: HostGitStatus): number {
  if (Array.isArray(status.changedFiles)) return status.changedFiles.length;
  return diffFileCount(status.diff ?? "");
}

function formatAheadBehind(ahead: number, behind: number): string {
  const safeAhead = Number.isFinite(ahead) ? ahead : 0;
  const safeBehind = Number.isFinite(behind) ? behind : 0;
  if (safeAhead === 0 && safeBehind === 0) return "even";
  return `${safeAhead} ahead / ${safeBehind} behind`;
}

function diffFileCount(diff: string): number {
  if (!diff) return 0;
  const paths = new Set<string>();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const path = line.split(" ")[3]?.replace(/^b\//, "").trim();
    if (path) paths.add(path);
  }
  return paths.size;
}

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function shortSha(sha: string): string {
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}
