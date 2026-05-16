export interface McpAppMcpProxyRequest {
  method: string;
  params: unknown;
}

export interface McpAppToolCallRequest {
  arguments: unknown;
  meta?: unknown;
  name: string;
}

export interface McpAppFileDownloadRequest {
  blob: Blob;
  name: string;
}

export interface McpAppFollowUpMessageRequest {
  prompt: string;
}

export interface McpAppFollowUpSource {
  server: string;
  threadId: string | null;
  tool: string;
}

export const MCP_APP_BRIDGE_INTERNAL_ERROR = -32000;
export const MCP_APP_BRIDGE_USER_CANCELLED = -32001;
export const MCP_APP_BRIDGE_METHOD_NOT_FOUND = -32601;
export const MCP_APP_BRIDGE_INVALID_PARAMS = -32602;
export const MCP_APP_BRIDGE_INTERNAL_JSON_RPC_ERROR = -32603;
const MCP_APP_BRIDGE_DEFAULT_ERROR_MESSAGE = "MCP sandbox host call failed.";
const MCP_APP_BRIDGE_USER_CANCELLED_MESSAGE = "MCP app follow-up was cancelled by the user.";

export interface McpAppBridgeErrorPayload {
  code?: number;
  message: string;
  name?: string;
}

export class McpAppBridgeError extends Error {
  code: number;

  constructor(message: string, code = MCP_APP_BRIDGE_INTERNAL_ERROR, cause?: unknown) {
    super(message);
    this.name = "McpAppBridgeError";
    this.code = code;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class McpAppBridgeUserCancelledError extends McpAppBridgeError {
  constructor(message = MCP_APP_BRIDGE_USER_CANCELLED_MESSAGE, cause?: unknown) {
    super(message, MCP_APP_BRIDGE_USER_CANCELLED, cause);
    this.name = "McpAppBridgeUserCancelledError";
  }
}

export function mcpAppBridgeError(
  message: string,
  code = MCP_APP_BRIDGE_INTERNAL_ERROR,
  cause?: unknown,
): McpAppBridgeError {
  return new McpAppBridgeError(message, code, cause);
}

export function mcpAppBridgeUserCancelledError(cause?: unknown): McpAppBridgeUserCancelledError {
  return new McpAppBridgeUserCancelledError(undefined, cause);
}

export function serializeMcpAppBridgeError(error: unknown): McpAppBridgeErrorPayload {
  if (error instanceof Error) {
    return {
      ...mcpAppBridgeErrorMetadata(error),
      message: error.message || MCP_APP_BRIDGE_DEFAULT_ERROR_MESSAGE,
      name: error.name || undefined,
    };
  }
  const record = recordObject(error);
  const message = stringField(record, "message");
  return {
    ...mcpAppBridgeErrorMetadata(record),
    message: message || MCP_APP_BRIDGE_DEFAULT_ERROR_MESSAGE,
  };
}

export function mcpAppMcpProxyRequest(value: unknown): McpAppMcpProxyRequest | null {
  const record = recordObject(value);
  const method = stringField(record, "method").trim();
  if (!method) return null;
  return { method, params: record.params };
}

export function mcpAppFileDownloadRequest(value: unknown): McpAppFileDownloadRequest | null {
  if (typeof Blob === "undefined") return null;
  const record = recordObject(value);
  const blob = record.blob;
  const name = stringField(record, "name").trim();
  if (!(blob instanceof Blob) || !name) return null;
  return { blob, name };
}

export function mcpAppFollowUpMessageRequest(value: unknown): McpAppFollowUpMessageRequest | null {
  const prompt = stringField(recordObject(value), "prompt").trim();
  return prompt ? { prompt } : null;
}

export function mcpAppFollowUpSource(value: unknown): McpAppFollowUpSource {
  const record = recordObject(value);
  return {
    server: stringField(record, "server").trim() || "mcp",
    threadId: stringField(record, "threadId").trim() || null,
    tool: stringField(record, "tool").trim() || "tool",
  };
}

export function downloadMcpAppFile({ blob, name }: McpAppFileDownloadRequest): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mcpAppToolCallRequest(value: unknown): McpAppToolCallRequest | null {
  const record = recordObject(value);
  const name = stringField(record, "name").trim();
  if (!name) return null;
  return {
    name,
    arguments: record.arguments ?? {},
    ...(Object.prototype.hasOwnProperty.call(record, "_meta") ? { meta: record._meta } : {}),
  };
}

export function mcpAppToolCallRequestFromBridgeArgs(args: unknown[]): McpAppToolCallRequest | null {
  const [nameOrRequest, argumentsValue] = args;
  if (typeof nameOrRequest === "string") {
    const name = nameOrRequest.trim();
    return name ? { name, arguments: argumentsValue ?? {} } : null;
  }
  return mcpAppToolCallRequest(nameOrRequest);
}

export function mcpAppExternalHref(value: unknown): string | null {
  const raw = typeof value === "string"
    ? value
    : stringField(recordObject(value), "href") || stringField(recordObject(value), "url");
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function mcpServerStatusFromListResult(value: unknown, server: string): Record<string, unknown> | null {
  const record = recordObject(value);
  for (const item of arrayObjects(record.data)) {
    if (stringField(item, "name") === server) return item;
  }
  return null;
}

export function mcpAppToolsListResponse(status: unknown): { tools: unknown[] } {
  const tools = recordObject(recordObject(status).tools);
  return {
    tools: Object.values(tools).filter((tool) => Boolean(tool) && !mcpAppToolAcceptsFileParams(tool)),
  };
}

export function mcpAppResourcesListResponse(status: unknown, server = ""): { resources: unknown[] } {
  if (server === "codex_apps") return { resources: [] };
  return { resources: arrayField(recordObject(status), "resources") };
}

export function mcpAppResourceTemplatesListResponse(status: unknown, server = ""): { resourceTemplates: unknown[] } {
  if (server === "codex_apps") return { resourceTemplates: [] };
  return { resourceTemplates: arrayField(recordObject(status), "resourceTemplates") };
}

export function mcpAppToolCallAllowed(status: unknown, name: string): boolean {
  const tool = mcpAppToolFromStatus(status, name);
  return !mcpAppToolAcceptsFileParams(tool);
}

function mcpAppToolFromStatus(status: unknown, name: string): unknown {
  const tools = recordObject(recordObject(status).tools);
  return tools[name]
    ?? Object.values(tools).find((tool) => {
      const toolRecord = recordObject(tool);
      return stringField(toolRecord, "name") === name || stringField(toolRecord, "title") === name;
    })
    ?? null;
}

function mcpAppToolAcceptsFileParams(tool: unknown): boolean {
  const meta = recordObject(recordObject(tool)._meta);
  return Object.prototype.hasOwnProperty.call(meta, "openai/fileParams");
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function arrayObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function mcpAppBridgeErrorMetadata(value: unknown): { code?: number; name?: string } {
  const record = recordObject(value);
  const code = record.code;
  const name = record.name;
  return {
    ...(typeof code === "number" && Number.isFinite(code) ? { code } : {}),
    ...(typeof name === "string" && name ? { name } : {}),
  };
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}
