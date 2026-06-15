/*
 * MCP-App iframe protocol machinery, split out of tool-activity-detail.tsx.
 *
 * This module is the pure (non-React) "iframe protocol machine" for inline MCP
 * apps: widget data/view payload construction plus MCP resource/tool-result
 * frame parsing. The host<->sandbox MessageChannel bridge request/response
 * handling lives in `mcp-app-bridge.ts`, and `window.openai` bootstrap script
 * + srcDoc assembly lives in `mcp-app-sandbox-srcdoc.ts`.
 *
 * It depends only on low-level helpers (`recordObject`, `stringField`,
 * `formatUnknown`) and the MCP bridge error helpers — never on the React render
 * primitives that live in tool-activity-detail.tsx — so the dependency stays
 * strictly one-way (tool-activity-detail.tsx imports from here). The two React
 * components (`McpAppToolDetail`, `McpAppSandboxFrame`) remain in
 * tool-activity-detail.tsx, where they share the generic `LabeledCode` /
 * `RawToolOutputButton` primitives with the other tool-activity renderers.
 */
import {
  mcpAppToolInputFromArguments,
  mcpAppToolResultForWidget,
} from "./mcp-app-frame";
import type { McpAppDetailViewModel, McpAppDisplayMode } from "./mcp-app-sandbox-types";
import { mcpAppWidgetStateFromValue } from "./mcp-app-bridge";
import {
  MCP_APP_BRIDGE_HOST_SOURCE,
  MCP_APP_BRIDGE_WIDGET_ID,
  safeScriptJson,
} from "./mcp-app-sandbox-srcdoc";
export {
  handleMcpAppBridgeRequest,
  mcpAppBackgroundColorFromValue,
  mcpAppBridgeReadyFromMessage,
  mcpAppBridgeRequestFromMessage,
  mcpAppDisplayModeFromValue,
  mcpAppWidgetStateFromBridgeArgs,
  mcpAppWidgetStateFromValue,
  type HandleMcpAppBridgeRequestOptions,
  type McpAppBridgeRequest,
  type McpAppHostCallHandler,
  type McpAppHostCallRequest,
  type McpAppHostMethod,
} from "./mcp-app-bridge";
export {
  MCP_APP_HTML_MAX_BYTES,
  mcpAppCspMetaContent,
  mcpAppFrameFromResourceReadResult,
  mcpAppHtmlTooLarge,
  mcpAppToolInputFromArguments,
  mcpAppToolOutputFromResult,
  mcpAppToolResultForWidget,
  type McpAppCspViewModel,
  type McpAppFrameViewModel,
} from "./mcp-app-frame";
export {
  MCP_APP_BRIDGE_HOST_SOURCE,
  MCP_APP_BRIDGE_SOURCE,
  createMcpAppBridgeNonce,
  mcpAppSandboxSrcDoc,
} from "./mcp-app-sandbox-srcdoc";

/*
 * The `mcpApp` detail view-model shapes were extracted to
 * ./mcp-app-sandbox-types (pure type leaf) so mcp-app-bridge.ts and
 * mcp-app-sandbox-srcdoc.ts can reference them without importing back into
 * this module. Re-exported in place to keep historical import paths working.
 */
export type { McpAppDetailViewModel, McpAppDisplayMode } from "./mcp-app-sandbox-types";

export const MCP_APP_IFRAME_SANDBOX_POLICY = "allow-forms allow-scripts";

export interface McpResourceReadRequest {
  threadId?: string | null;
  server: string;
  uri: string;
}

export type ReadMcpResourceHandler = (request: McpResourceReadRequest) => Promise<unknown>;

export interface McpAppWidgetDataUpdatePayload {
  toolInput: unknown;
  toolOutput: unknown;
  toolResponseMetadata: unknown;
  toolResult: Record<string, unknown> | null;
  viewParams: unknown;
  widgetId: string;
  widgetState: Record<string, unknown> | null;
}

export interface McpAppWidgetViewPayload {
  displayMode: McpAppDisplayMode;
  isTombstone: boolean;
  viewParams: unknown;
  widgetId: string;
}

export function postMcpAppWidgetDataToPort({
  detail,
  lastWidgetDataKeyRef,
  port,
  widgetState,
}: {
  detail: McpAppDetailViewModel;
  lastWidgetDataKeyRef: { current: string };
  port: MessagePort;
  widgetState: unknown;
}): void {
  const payload = mcpAppWidgetDataUpdatePayload(detail, widgetState);
  const payloadKey = safeScriptJson(payload);
  if (lastWidgetDataKeyRef.current === payloadKey) return;
  lastWidgetDataKeyRef.current = payloadKey;
  port.postMessage({
    data: payload,
    source: MCP_APP_BRIDGE_HOST_SOURCE,
    type: "setWidgetData",
  });

  const toolInput = mcpAppToolInputNotificationPayload(payload.toolInput);
  if (toolInput) {
    port.postMessage({
      data: toolInput,
      source: MCP_APP_BRIDGE_HOST_SOURCE,
      type: "notifyMcpAppsToolInput",
    });
  }

  if (payload.toolResult) {
    port.postMessage({
      data: payload.toolResult,
      source: MCP_APP_BRIDGE_HOST_SOURCE,
      type: "notifyMcpAppsToolResult",
    });
  }
}

export function postMcpAppWidgetViewToPort({
  detail,
  displayMode,
  lastWidgetViewKeyRef,
  port,
}: {
  detail: McpAppDetailViewModel;
  displayMode: McpAppDisplayMode;
  lastWidgetViewKeyRef: { current: string };
  port: MessagePort;
}): void {
  const payload = mcpAppWidgetViewPayload(detail, displayMode);
  const payloadKey = safeScriptJson(payload);
  if (lastWidgetViewKeyRef.current === payloadKey) return;
  lastWidgetViewKeyRef.current = payloadKey;
  port.postMessage({
    data: payload,
    source: MCP_APP_BRIDGE_HOST_SOURCE,
    type: "setWidgetView",
  });
  port.postMessage({
    data: mcpAppHostContextPayload(displayMode),
    source: MCP_APP_BRIDGE_HOST_SOURCE,
    type: "notifyMcpAppsHostContext",
  });
}

export function mcpAppWidgetDataKey(
  detail: McpAppDetailViewModel,
): string {
  return safeScriptJson(mcpAppWidgetDataUpdatePayload(detail, null));
}

export function mcpAppWidgetViewKey(
  detail: McpAppDetailViewModel,
  displayMode: McpAppDisplayMode,
): string {
  return safeScriptJson(mcpAppWidgetViewPayload(detail, displayMode));
}

export function mcpAppWidgetDataUpdatePayload(
  detail: McpAppDetailViewModel,
  widgetState: unknown,
): McpAppWidgetDataUpdatePayload {
  return {
    toolInput: mcpAppToolInputFromArguments(detail.toolArguments),
    toolOutput: detail.toolOutput ?? null,
    toolResponseMetadata: detail.toolResponseMetadata ?? null,
    toolResult: mcpAppToolResultForWidget(detail.toolResult, detail.toolResponseMetadata),
    viewParams: detail.toolOutput ?? null,
    widgetId: MCP_APP_BRIDGE_WIDGET_ID,
    widgetState: mcpAppWidgetStateFromValue(widgetState),
  };
}

function mcpAppToolInputNotificationPayload(value: unknown): { arguments: unknown } | null {
  return value === null || value === undefined ? null : { arguments: value };
}

export function mcpAppWidgetViewPayload(
  detail: McpAppDetailViewModel,
  displayMode: McpAppDisplayMode,
): McpAppWidgetViewPayload {
  return {
    displayMode,
    isTombstone: false,
    viewParams: detail.toolOutput ?? null,
    widgetId: MCP_APP_BRIDGE_WIDGET_ID,
  };
}

function mcpAppHostContextPayload(displayMode: McpAppDisplayMode): Record<string, unknown> {
  return { displayMode };
}
