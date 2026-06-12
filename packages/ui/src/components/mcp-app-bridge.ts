import { stringField } from "../lib/format";
import {
  mcpAppBridgeError,
  serializeMcpAppBridgeError,
} from "../state/mcp-app-host";
import { recordObject } from "../state/thread-item-fields";
import {
  MCP_APP_BRIDGE_HOST_SOURCE,
  MCP_APP_BRIDGE_SOURCE,
} from "./mcp-app-sandbox-srcdoc";
import type {
  McpAppDetailViewModel,
  McpAppDisplayMode,
} from "./mcp-app-sandbox";

const MCP_APP_FRAME_MIN_HEIGHT_PX = 200;
const MCP_APP_FRAME_MAX_HEIGHT_PX = 720;
const MCP_APP_SANDBOX_LOAD_ERROR = "The MCP app sandbox failed to load.";

export type McpAppHostMethod =
  | "callMcp"
  | "callTool"
  | "notifyBackgroundColor"
  | "notifyEnvironmentError"
  | "notifyIntrinsicHeight"
  | "notifyIntrinsicWidth"
  | "notifyNavigation"
  | "notifySecurityPolicyViolation"
  | "openExternal"
  | "requestDisplayMode"
  | "sendFollowUpMessage"
  | "sendInstrument"
  | "updateWidgetState";

export interface McpAppHostCallRequest {
  args: unknown[];
  method: McpAppHostMethod;
  resourceUri: string;
  server: string;
  threadId: string | null;
  tool: string;
  toolCallId: string;
}

export type McpAppHostCallHandler = (request: McpAppHostCallRequest) => Promise<unknown>;

export interface McpAppBridgeRequest {
  args: unknown[];
  id: string;
  method: McpAppHostMethod;
}

export interface HandleMcpAppBridgeRequestOptions {
  args: unknown[];
  detail: McpAppDetailViewModel;
  displayModeRef: { current: McpAppDisplayMode };
  id: string;
  method: McpAppHostMethod;
  onMcpAppHostCall?: McpAppHostCallHandler;
  port: MessagePort;
  resourceUri: string;
  setBackgroundColor: (backgroundColor: string | null) => void;
  setDisplayMode: (displayMode: McpAppDisplayMode) => void;
  setHeightPx: (heightPx: number) => void;
  setSandboxErrorText: (errorText: string | null) => void;
  threadId: string | null;
  widgetStateRef: { current: unknown };
}

export async function handleMcpAppBridgeRequest({
  args,
  detail,
  displayModeRef,
  id,
  method,
  onMcpAppHostCall,
  port,
  resourceUri,
  setBackgroundColor,
  setDisplayMode,
  setHeightPx,
  setSandboxErrorText,
  threadId,
  widgetStateRef,
}: HandleMcpAppBridgeRequestOptions): Promise<void> {
  try {
    const result = await resolveMcpAppBridgeRequest({
      args,
      detail,
      displayModeRef,
      method,
      onMcpAppHostCall,
      resourceUri,
      setBackgroundColor,
      setDisplayMode,
      setHeightPx,
      setSandboxErrorText,
      threadId,
      widgetStateRef,
    });
    port.postMessage({
      id,
      result,
      source: MCP_APP_BRIDGE_HOST_SOURCE,
      status: "resolve",
    });
  } catch (error) {
    port.postMessage({
      error: serializeMcpAppBridgeError(error),
      id,
      source: MCP_APP_BRIDGE_HOST_SOURCE,
      status: "reject",
    });
  }
}

async function resolveMcpAppBridgeRequest({
  args,
  detail,
  displayModeRef,
  method,
  onMcpAppHostCall,
  resourceUri,
  setBackgroundColor,
  setDisplayMode,
  setHeightPx,
  setSandboxErrorText,
  threadId,
  widgetStateRef,
}: Omit<HandleMcpAppBridgeRequestOptions, "id" | "port">): Promise<unknown> {
  switch (method) {
    case "notifyIntrinsicHeight": {
      const height = mcpAppIntrinsicHeightFromValue(args[0]);
      if (height !== null) setHeightPx(height);
      return {};
    }
    case "notifyBackgroundColor":
      setBackgroundColor(mcpAppBackgroundColorFromValue(args[0]));
      return {};
    case "notifyEnvironmentError":
      setSandboxErrorText(MCP_APP_SANDBOX_LOAD_ERROR);
      return {};
    case "notifyIntrinsicWidth":
    case "notifyNavigation":
    case "notifySecurityPolicyViolation":
    case "sendInstrument":
      return {};
    case "requestDisplayMode": {
      const mode = mcpAppDisplayModeFromValue(args[0], displayModeRef.current);
      displayModeRef.current = mode;
      setDisplayMode(mode);
      return { mode };
    }
    case "updateWidgetState":
      widgetStateRef.current = mcpAppWidgetStateFromBridgeArgs(args);
      return {};
    case "callMcp":
    case "callTool":
    case "openExternal":
    case "sendFollowUpMessage":
      if (!onMcpAppHostCall) throw mcpAppBridgeError("MCP app host bridge is unavailable.");
      return onMcpAppHostCall({
        args,
        method,
        resourceUri,
        server: detail.server,
        threadId,
        tool: detail.tool,
        toolCallId: detail.id,
      });
  }
}

export function mcpAppBridgeRequestFromMessage(value: unknown): McpAppBridgeRequest | null {
  const record = recordObject(value);
  if (record.source !== MCP_APP_BRIDGE_SOURCE || record.type !== "request") return null;
  const id = stringField(record, "id");
  const method = mcpAppHostMethod(record.method);
  if (!id || !method) return null;
  return {
    args: Array.isArray(record.args) ? record.args : [],
    id,
    method,
  };
}

export function mcpAppBridgeReadyFromMessage(value: unknown, bridgeNonce: string): boolean {
  const record = recordObject(value);
  return record.source === MCP_APP_BRIDGE_SOURCE
    && record.type === "ready"
    && stringField(record, "nonce") === bridgeNonce;
}

const MCP_APP_HOST_METHODS = new Set<McpAppHostMethod>([
  "callMcp",
  "callTool",
  "notifyBackgroundColor",
  "notifyEnvironmentError",
  "notifyIntrinsicHeight",
  "notifyIntrinsicWidth",
  "notifyNavigation",
  "notifySecurityPolicyViolation",
  "openExternal",
  "requestDisplayMode",
  "sendFollowUpMessage",
  "sendInstrument",
  "updateWidgetState",
]);

function mcpAppHostMethod(value: unknown): McpAppHostMethod | null {
  return typeof value === "string" && MCP_APP_HOST_METHODS.has(value as McpAppHostMethod)
    ? value as McpAppHostMethod
    : null;
}

function mcpAppIntrinsicHeightFromValue(value: unknown): number | null {
  const direct = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (direct !== null) return clampMcpAppHeight(direct);
  const record = recordObject(value);
  const height = typeof record.height === "number" && Number.isFinite(record.height)
    ? record.height
    : typeof record.intrinsicHeight === "number" && Number.isFinite(record.intrinsicHeight)
      ? record.intrinsicHeight
      : null;
  return height === null ? null : clampMcpAppHeight(height);
}

function clampMcpAppHeight(value: number): number {
  return Math.max(MCP_APP_FRAME_MIN_HEIGHT_PX, Math.min(MCP_APP_FRAME_MAX_HEIGHT_PX, Math.round(value)));
}

export function mcpAppBackgroundColorFromValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function mcpAppWidgetStateFromValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function mcpAppWidgetStateFromBridgeArgs(args: unknown[]): Record<string, unknown> | null {
  return mcpAppWidgetStateFromValue(args.length > 1 ? args[1] : args[0]);
}

export function mcpAppDisplayModeFromValue(value: unknown, fallback: McpAppDisplayMode): McpAppDisplayMode {
  if (value === "inline" || value === "fullscreen") return value;
  const mode = recordObject(value).mode;
  return mode === "inline" || mode === "fullscreen" ? mode : fallback;
}
