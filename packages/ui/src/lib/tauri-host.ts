import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import type { JsonRpcMessage } from "@hicodex/codex-protocol";
import { recordHostOnboardingSignal } from "../state/onboarding";
import type { BrowserStorageLike } from "../state/image-generation-tool";

const APP_SERVER_EVENT_NAME = "hicodex://app-server-event";
const NATIVE_SHELL_EVENT_NAME = "hicodex://native-shell-event";

export interface HostStatus {
  running: boolean;
  pid?: number | null;
  codexBin?: string | null;
  codexHome: string;
  installationId?: string | null;
  firstLaunch?: boolean | null;
  defaultCwd?: string | null;
  lastError?: string | null;
}

export interface HostInstallationState {
  installationId: string;
  firstLaunch: boolean;
  installationIdPath: string;
}

export interface AppServerStartConfig {
  codexBin?: string | null;
  codexHome?: string | null;
  codexSourceDir?: string | null;
}

export interface LocalModelCatalogConfig {
  model: string;
  models?: string[] | null;
  displayName?: string | null;
  description?: string | null;
  contextWindow?: number | null;
  autoCompactTokenLimit?: number | null;
  inputModalities?: Array<"text" | "image"> | null;
}

export interface CodexAuthSummary {
  hasAuthFile: boolean;
  authMode?: string | null;
  hasApiKey: boolean;
  hasTokens: boolean;
  email?: string | null;
  planType?: string | null;
}

export interface ThreadToolHistory {
  threadId: string;
  turns: ThreadToolHistoryTurn[];
}

export interface ThreadToolHistoryTurn {
  turnId: string;
  items: unknown[];
}

export interface HostGitChangedFile {
  status: string;
  path: string;
  oldPath?: string | null;
}

export interface HostGitStatus {
  cwd: string;
  repoRoot?: string | null;
  branch?: string | null;
  sha?: string | null;
  upstream?: string | null;
  ahead: number;
  behind: number;
  changedFiles: HostGitChangedFile[];
  hasDiff: boolean;
  diff: string;
  // codex thread-env-icon — true when the cwd is a LINKED git worktree.
  isWorktree?: boolean;
}

export interface CreatePendingWorktreeRequest {
  cwd: string;
  branchName?: string | null;
  baseRef?: string | null;
}

export interface PendingWorktree {
  repoRoot: string;
  path: string;
  branchName: string;
  baseRef: string;
  baseSha: string;
}

export type HostEvent =
  | { type: "json"; value: JsonRpcMessage }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "lifecycle"; message: string }
  | { type: "error"; message: string };

export interface NativeShellAction {
  action: string;
  supported?: boolean;
  message?: string | null;
  url?: string | null;
}

export async function startAppServer(config: AppServerStartConfig): Promise<HostStatus> {
  const status = await invoke<HostStatus>("host_start_app_server", { config });
  recordHostStatusOnboardingSignal(status);
  return status;
}

export async function stopAppServer(): Promise<HostStatus> {
  const status = await invoke<HostStatus>("host_stop_app_server");
  recordHostStatusOnboardingSignal(status);
  return status;
}

export async function getHostStatus(): Promise<HostStatus> {
  const status = await invoke<HostStatus>("host_status");
  recordHostStatusOnboardingSignal(status);
  return status;
}

export function sendRaw(message: unknown): Promise<void> {
  return invoke("host_send_raw", { message });
}

export function readHostGitStatus(cwd: string): Promise<HostGitStatus> {
  return invoke("host_git_status", { cwd });
}

export function createPendingWorktree(
  request: CreatePendingWorktreeRequest,
): Promise<PendingWorktree> {
  return invoke("host_create_pending_worktree", { request });
}

// codex: composer-footer-branch-switcher-*.js — branch picker host API.
// `lastCommitMs` mirrors the `committerdate:unix * 1000` we emit on the Rust
// side; the renderer uses it to sort recents to the top.
// codex: branch-picker-extension — `isRemote` flips on for entries surfaced
// by the optional `git branch -r` pass (see `listGitBranches` options below).
export interface GitBranchInfo {
  name: string;
  lastCommitMs: number | null;
  isCurrent: boolean;
  isRemote: boolean;
}

export interface GitBranchesResponse {
  current: string | null;
  branches: GitBranchInfo[];
}

// codex: branch-picker-extension — opt-in flag mirroring Codex Desktop's
// "Remote branches" section toggle. When omitted/false the host returns only
// local refs (the original behaviour); when true it emits local + remote refs
// in one response so the renderer can render the two sections without a
// second round-trip.
export interface ListGitBranchesOptions {
  includeRemote?: boolean;
}

/**
 * codex: composer-footer-branch-switcher-*.js — `useGitCurrentBranch`
 * + `useGitRecentBranches` collapsed into a single call. When `cwd` is not a
 * git repository the host returns `{ current: null, branches: [] }` so the
 * renderer can hide the chip silently.
 *
 * codex: branch-picker-extension — pass `{ includeRemote: true }` to also
 * include `git branch -r` entries (each carries `isRemote: true`).
 */
export function listGitBranches(
  cwd: string,
  options?: ListGitBranchesOptions,
): Promise<GitBranchesResponse> {
  return invoke<GitBranchesResponse>("host_git_list_branches", {
    cwd,
    includeRemote: options?.includeRemote === true,
  });
}

/**
 * codex: composer-footer-branch-switcher-*.js — picker click handler.
 * Rejects when git refuses the checkout (uncommitted changes, missing branch,
 * etc.) so callers can surface the inline error.
 */
export function checkoutGitBranch(cwd: string, branchName: string): Promise<void> {
  return invoke("host_git_checkout_branch", { cwd, branchName });
}

// codex: branch-picker-extension — Codex Desktop `useGitDefaultBranch` hook.
// Returns the short name of the repository's default branch (typically the
// target of `origin/HEAD`); falls back to git's `init.defaultBranch` config so
// local-only repos still surface a default chip.
export interface GitDefaultBranchResponse {
  defaultBranch: string | null;
}

export function getGitDefaultBranch(cwd: string): Promise<GitDefaultBranchResponse> {
  return invoke<GitDefaultBranchResponse>("host_git_default_branch", { cwd });
}

// codex: branch-picker-extension — Codex Desktop "Create new branch" action.
// `basedOn` lets callers create a tracking branch from a remote (`git
// checkout -b feature-x origin/feature-x`); when omitted git creates the new
// branch from HEAD. Rejects on duplicate names, invalid characters, etc.
export function createGitBranch(
  cwd: string,
  branchName: string,
  basedOn?: string,
): Promise<void> {
  return invoke("host_git_create_branch", {
    request: { cwd, branchName, basedOn: basedOn ?? null },
  });
}

// codex: local-conversation-thread-*.js — PR status host API.
// Mirrors Codex Desktop's `pullRequestStatus` widget that renders inside the
// Environment section (row 4). The host runs `gh pr status --json ...` in
// `cwd`; the renderer projects the result into the row UI.
export interface GhPrInfo {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  /**
   * gh's `mergeable` enum (e.g. "MERGEABLE", "CONFLICTING", "UNKNOWN").
   * Null when gh omits the field — Codex Desktop's widget tolerates null and
   * falls through to its default copy in that case.
   */
  mergeable: string | null;
  /** `OPEN` / `CLOSED` / `MERGED` — drives the status badge color. */
  state: string;
  headRefName: string;
}

export interface GhPrStatusResponse {
  /** `git branch --show-current` snapshot so the renderer can hide the row when detached. */
  currentBranch: string | null;
  /** Null when the current branch has no PR (Codex hides the widget in that case). */
  pr: GhPrInfo | null;
}

/**
 * codex: local-conversation-thread-*.js — PR status host API.
 * Returns the current branch's PR via `gh pr status`. Throws when gh is
 * missing or the cwd is not a git repository so callers can decide between
 * silent-hide and surfaced-error UX.
 */
export function ghPrStatus(cwd: string): Promise<GhPrStatusResponse> {
  return invoke<GhPrStatusResponse>("host_gh_pr_status", { cwd });
}

/*
 * Patch revert / reapply bridge. Mirrors Codex Desktop's `revertChanges` /
 * `reapplyChanges` toolbar handler — see docs/dev/codex-alignment-unified-diff.md
 * and the `host_apply_patch_action` Tauri command for the host-side semantics.
 *
 * The result shape matches Codex `failure.result` so the renderer can hand it
 * straight to `<UnifiedDiffFailureDialog/>` when `errorCode != null` or any of
 * the three path lists is non-empty.
 */
export interface PatchActionRequest {
  action: "revert" | "reapply";
  diff: string;
  cwd: string;
}

export interface PatchActionExecOutput {
  output: string;
}

export interface PatchActionResult {
  action: "revert" | "reapply";
  appliedPaths: string[];
  skippedPaths: string[];
  conflictedPaths: string[];
  execOutput?: PatchActionExecOutput | null;
  errorCode?: string | null;
}

export function applyPatchAction(request: PatchActionRequest): Promise<PatchActionResult> {
  return invoke<PatchActionResult>("host_apply_patch_action", { request });
}

export function listenEvents(handler: (event: HostEvent) => void): Promise<UnlistenFn> {
  return listen<HostEvent>(APP_SERVER_EVENT_NAME, (event) => handler(event.payload));
}

export function listenNativeShellEvents(handler: (event: NativeShellAction) => void): Promise<UnlistenFn> {
  return listen<NativeShellAction>(NATIVE_SHELL_EVENT_NAME, (event) => handler(event.payload));
}

export interface NativeFileDropEvent {
  type: DragDropEvent["type"];
  paths: string[];
  position?: { x: number; y: number };
}

export function listenNativeFileDropEvents(handler: (event: NativeFileDropEvent) => void): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) return Promise.resolve(null);
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    handler({
      type: payload.type,
      paths: "paths" in payload ? payload.paths : [],
      position: "position" in payload ? { x: payload.position.x, y: payload.position.y } : undefined,
    });
  });
}

export function writeLocalModelCatalog(
  codexHome: string | null | undefined,
  config: LocalModelCatalogConfig,
): Promise<string> {
  return invoke("host_write_local_model_catalog", { codexHome, config });
}

export function readCodexAuthSummary(
  codexHome: string | null | undefined,
): Promise<CodexAuthSummary> {
  return invoke("host_read_codex_auth_summary", { codexHome });
}

export async function readInstallationState(
  codexHome: string | null | undefined,
): Promise<HostInstallationState> {
  const state = await invoke<HostInstallationState>("host_read_installation_state", { codexHome });
  recordHostOnboardingSignal(state, browserStorage());
  return state;
}

export function openFileReference(path: string, line?: number | null): Promise<void> {
  return invoke("host_open_file_reference", { path, line });
}

// codex workspace-file-context-menu-*.js `workspace-file-reveal-path` — reveal a
// file/folder in the OS file manager (Finder / Explorer / file manager).
export function revealPath(path: string): Promise<void> {
  return invoke("host_reveal_path", { path });
}

// codex threadHeader.openInNewWindow — open the thread in a second app window.
export function openThreadWindow(threadId: string): Promise<void> {
  return invoke("host_open_thread_window", { threadId });
}

// codex newWindow (⌘⇧N) — open a fresh app window; the new window starts a new chat on startup.
export function openNewWindow(): Promise<void> {
  return invoke("host_open_new_window");
}

export async function openExternalUrl(url: string): Promise<void> {
  const href = normalizedExternalUrl(url);
  if (!href) throw new Error("external URL must use http or https");
  if (isTauriRuntime()) {
    await invoke("host_open_external_url", { url: href });
    return;
  }
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("failed to open external URL");
}

export type HostFileReferenceKind = "file" | "image";

export interface LocalFileMetadata {
  isFile: boolean;
  sizeBytes?: number | null;
  mimeType?: string | null;
}

export interface SpreadsheetPreview {
  rows: string[][];
  truncated: boolean;
}

export interface DocumentPreview {
  paragraphs: string[];
  truncated: boolean;
}

export interface ImageGenerationRequest {
  baseUrl: string;
  apiKey?: string | null;
  codexHome?: string | null;
  payload: unknown;
  threadId?: string | null;
}

export function pickFileReferences(kind: HostFileReferenceKind, multiple = true): Promise<string[]> {
  return invoke("host_pick_file_references", { kind, multiple });
}

export function pickWorkspaceFolder(): Promise<string | null> {
  return invoke("host_pick_workspace_folder");
}

export function readImageDataUrl(path: string): Promise<string> {
  return invoke("host_read_image_data_url", { path });
}

export function readFileMetadata(path: string): Promise<LocalFileMetadata> {
  return invoke("host_read_file_metadata", { path });
}

export function readTextFile(path: string, maxBytes?: number): Promise<string> {
  return invoke("host_read_text_file", { path, maxBytes });
}

// CODEX-REF: open-workspace-file-*.js — Codex loads xlsx
// bytes into its WASM viewer; HiCodex's simplified preview needs the same
// bytes for SheetJS in the renderer. Returns base64 so the IPC bridge stays
// JSON-safe.
export function readFileBytesBase64(path: string, maxBytes?: number): Promise<string> {
  return invoke("host_read_file_bytes_base64", { path, maxBytes });
}

export function readSpreadsheetPreview(path: string, maxRows?: number, maxCols?: number): Promise<SpreadsheetPreview> {
  return invoke("host_read_spreadsheet_preview", { path, maxRows, maxCols });
}

export function readDocumentPreview(
  path: string,
  maxParagraphs?: number,
  maxCharsPerParagraph?: number,
): Promise<DocumentPreview> {
  return invoke("host_read_document_preview", { path, maxParagraphs, maxCharsPerParagraph });
}

export function findRolloutForThread(
  threadId: string,
  codexHome?: string | null,
): Promise<string | null> {
  return invoke("host_find_rollout_for_thread", { codexHome, threadId });
}

export function readThreadToolHistory(
  codexHome: string | null | undefined,
  threadId: string,
  threadPath?: string | null,
): Promise<ThreadToolHistory> {
  return invoke("host_read_thread_tool_history", { codexHome, threadId, threadPath });
}

export function generateImageWithHost(request: ImageGenerationRequest): Promise<unknown> {
  return invoke("host_generate_image", { request });
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtimeWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
  return Boolean(runtimeWindow.__TAURI_INTERNALS__ || runtimeWindow.__TAURI__);
}

export function convertLocalFileSrc(path: string): string {
  return convertFileSrc(path);
}

function recordHostStatusOnboardingSignal(status: HostStatus): void {
  recordHostOnboardingSignal(status, browserStorage());
}

function browserStorage(): BrowserStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizedExternalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * codex: workspace-directory-tree-*.js — single non-recursive list of a
 * directory's direct children. Renderer drives recursion via expand events;
 * Codex Desktop keys the corresponding query on `{ hostId, root, dirPath,
 * includeHidden, refreshKey }` and applies `staleTime = FIVE_SECONDS`.
 */
export type WorkspaceDirEntry = {
  type: "directory" | "file";
  path: string;
  name: string;
};

export async function workspaceListDir(params: {
  root: string;
  dirPath: string;
  includeHidden: boolean;
}): Promise<WorkspaceDirEntry[]> {
  const response = await invoke<{ entries: WorkspaceDirEntry[] }>("host_workspace_list_dir", {
    root: params.root,
    dirPath: params.dirPath,
    includeHidden: params.includeHidden,
  });
  return response.entries;
}
