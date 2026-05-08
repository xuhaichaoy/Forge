import { invoke } from "@tauri-apps/api/core";
import type { JsonRpcMessage } from "@hicodex/codex-protocol";

export interface HostStatus {
  running: boolean;
  pid?: number | null;
  codexBin?: string | null;
  codexHome: string;
  defaultCwd?: string | null;
  lastError?: string | null;
}

export interface AppServerStartConfig {
  codexBin?: string | null;
  codexHome?: string | null;
  codexSourceDir?: string | null;
}

export interface LocalModelCatalogConfig {
  model: string;
  displayName?: string | null;
  description?: string | null;
  contextWindow?: number | null;
  autoCompactTokenLimit?: number | null;
  inputModalities?: Array<"text" | "image"> | null;
}

export interface ThreadToolHistory {
  threadId: string;
  turns: ThreadToolHistoryTurn[];
}

export interface ThreadToolHistoryTurn {
  turnId: string;
  items: unknown[];
}

export type HostEvent =
  | { type: "json"; value: JsonRpcMessage }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "lifecycle"; message: string }
  | { type: "error"; message: string };

export function startAppServer(config: AppServerStartConfig): Promise<HostStatus> {
  return invoke("host_start_app_server", { config });
}

export function stopAppServer(): Promise<HostStatus> {
  return invoke("host_stop_app_server");
}

export function getHostStatus(): Promise<HostStatus> {
  return invoke("host_status");
}

export function sendRaw(message: unknown): Promise<void> {
  return invoke("host_send_raw", { message });
}

export function claimEventStream(): Promise<number> {
  return invoke("host_claim_event_stream");
}

export function pollEvents(streamId: number | null | undefined, maxEvents = 128): Promise<HostEvent[]> {
  return invoke("host_poll_events", { maxEvents, streamId });
}

export function writeLocalModelCatalog(
  codexHome: string | null | undefined,
  config: LocalModelCatalogConfig,
): Promise<string> {
  return invoke("host_write_local_model_catalog", { codexHome, config });
}

export function openFileReference(path: string, line?: number | null): Promise<void> {
  return invoke("host_open_file_reference", { path, line });
}

export type HostFileReferenceKind = "file" | "image";

export function pickFileReferences(kind: HostFileReferenceKind, multiple = true): Promise<string[]> {
  return invoke("host_pick_file_references", { kind, multiple });
}

export function readImageDataUrl(path: string): Promise<string> {
  return invoke("host_read_image_data_url", { path });
}

export function readThreadToolHistory(
  codexHome: string | null | undefined,
  threadId: string,
  threadPath?: string | null,
): Promise<ThreadToolHistory> {
  return invoke("host_read_thread_tool_history", { codexHome, threadId, threadPath });
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
