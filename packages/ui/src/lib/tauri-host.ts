import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { JsonRpcMessage } from "@hicodex/codex-protocol";

const APP_SERVER_EVENT_NAME = "hicodex://app-server-event";

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

export function listenEvents(handler: (event: HostEvent) => void): Promise<UnlistenFn> {
  return listen<HostEvent>(APP_SERVER_EVENT_NAME, (event) => handler(event.payload));
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

export interface LocalFileMetadata {
  isFile: boolean;
  sizeBytes?: number | null;
  mimeType?: string | null;
}

export interface ImageGenerationRequest {
  baseUrl: string;
  apiKey?: string | null;
  payload: unknown;
}

export function pickFileReferences(kind: HostFileReferenceKind, multiple = true): Promise<string[]> {
  return invoke("host_pick_file_references", { kind, multiple });
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
