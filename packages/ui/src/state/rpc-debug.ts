import type { RpcDebugEvent } from "../lib/codex-json-rpc-client";
import { formatUnknown } from "../lib/format";
import type { CommandPanelEntry } from "./command-panel";

const MAX_DEBUG_PAYLOAD_CHARS = 1_200;

export function appendRpcDebugEvent(events: RpcDebugEvent[], event: RpcDebugEvent, limit = 120): RpcDebugEvent[] {
  return [...events, event].slice(-limit);
}

export function projectRpcDebugEntries(events: RpcDebugEvent[]): CommandPanelEntry[] {
  return events.slice(-80).reverse().map((event): CommandPanelEntry => ({
    id: `rpc:${event.id}`,
    title: rpcDebugTitle(event),
    kind: "status",
    status: rpcDebugStatus(event),
    meta: rpcDebugMeta(event),
    details: rpcDebugDetails(event),
    action: {
      type: "copyText",
      title: "Copy RPC event",
      label: "RPC event",
      text: JSON.stringify(event, null, 2),
    },
  }));
}

export function rpcDebugPanelMessage(events: RpcDebugEvent[]): string {
  if (events.length === 0) return "No JSON-RPC or host events recorded in this app session.";
  return `${Math.min(events.length, 80)} recent JSON-RPC / host event(s). Select an entry to copy the raw event.`;
}

function rpcDebugTitle(event: RpcDebugEvent): string {
  if (event.method) return `${rpcDebugKindLabel(event.kind)} ${event.method}`;
  if (event.requestId !== undefined) return `${rpcDebugKindLabel(event.kind)} ${String(event.requestId)}`;
  return rpcDebugKindLabel(event.kind);
}

function rpcDebugKindLabel(kind: RpcDebugEvent["kind"]): string {
  switch (kind) {
    case "client-request":
      return "→ request";
    case "client-notification":
      return "→ notify";
    case "client-response":
      return "→ response";
    case "client-error":
      return "→ error";
    case "client-cancel":
      return "× cancel";
    case "server-response":
      return "← response";
    case "server-error":
      return "← error";
    case "server-request":
      return "← request";
    case "server-notification":
      return "← notify";
    case "host-error":
      return "host error";
    case "host-event":
      return "host";
  }
}

function rpcDebugStatus(event: RpcDebugEvent): string {
  if (event.level && event.level !== "info") return event.level;
  if (event.requestId !== undefined) return `id ${String(event.requestId)}`;
  return event.kind;
}

function rpcDebugMeta(event: RpcDebugEvent): string {
  return new Date(event.at).toLocaleTimeString();
}

function rpcDebugDetails(event: RpcDebugEvent): string[] {
  const details: string[] = [];
  if (event.message) details.push(event.message);
  if (event.payload !== undefined) details.push(truncatePayload(formatUnknown(event.payload)));
  return details.length > 0 ? details : ["No payload."];
}

function truncatePayload(value: string): string {
  return value.length > MAX_DEBUG_PAYLOAD_CHARS ? `${value.slice(0, MAX_DEBUG_PAYLOAD_CHARS - 3)}...` : value;
}
