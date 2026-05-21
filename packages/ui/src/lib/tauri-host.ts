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

/*
 * Patch revert / reapply bridge. Mirrors Codex Desktop's `revertChanges` /
 * `reapplyChanges` toolbar handler — see docs/codex-source-evidence.md §34 and
 * the `host_apply_patch_action` Tauri command for the host-side semantics.
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

// CODEX-REF: webview/assets/open-workspace-file-DOOUD1lA.js — Codex loads xlsx
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
