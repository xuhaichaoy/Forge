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
