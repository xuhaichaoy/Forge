/*
 * MCP-App iframe protocol machinery, split out of tool-activity-detail.tsx.
 *
 * This module is the pure (non-React) "iframe protocol machine" for inline MCP
 * apps: the host<->sandbox MessageChannel bridge request/response handling,
 * `window.openai` bootstrap script + srcDoc assembly, CSP synthesis, widget
 * data/view payload construction, and MCP resource/tool-result frame parsing.
 *
 * It depends only on low-level helpers (`recordObject`, `stringField`,
 * `formatUnknown`) and the MCP bridge error helpers — never on the React render
 * primitives that live in tool-activity-detail.tsx — so the dependency stays
 * strictly one-way (tool-activity-detail.tsx imports from here). The two React
 * components (`McpAppToolDetail`, `McpAppSandboxFrame`) remain in
 * tool-activity-detail.tsx, where they share the generic `LabeledCode` /
 * `RawToolOutputButton` primitives with the other tool-activity renderers.
 */
import { stringField } from "../lib/format";
import {
  mcpAppBridgeError,
  serializeMcpAppBridgeError,
} from "../state/mcp-app-host";
import { recordObject } from "../state/thread-item-fields";

export interface McpAppFrameViewModel {
  csp: McpAppCspViewModel;
  html: string;
  heightPx: number;
  mimeType: string;
  prefersBorder: boolean;
  widgetDomain: string | null;
}

export interface McpAppCspViewModel {
  baseUriDomains: string[];
  connectDomains: string[];
  frameDomains: string[];
  includeDefaultDomains: boolean;
  isTrusted: boolean;
  resourceDomains: string[];
}

/*
 * The `mcpApp` variant of `ToolActivityDetailViewModel`. It lives here (rather
 * than inline in the detail-file union) so the protocol helpers below can
 * reference it without importing back from tool-activity-detail.tsx. The detail
 * file's `ToolActivityDetailViewModel` union references this exported shape.
 */
export interface McpAppDetailViewModel {
  kind: "mcpApp";
  id: string;
  running: boolean;
  name: string;
  server: string;
  tool: string;
  resourceUri: string;
  inlineFrame: McpAppFrameViewModel | null;
  toolArguments: unknown;
  toolOutput: unknown;
  toolResult: unknown;
  toolResponseMetadata: unknown;
  argumentsText: string;
  resultText: string;
  errorText: string;
  status: string;
}

export const MCP_APP_HTML_MAX_BYTES = 10_000_000;
export const MCP_APP_IFRAME_SANDBOX_POLICY = "allow-forms allow-scripts";
const MCP_APP_FRAME_MIN_HEIGHT_PX = 200;
const MCP_APP_FRAME_DEFAULT_HEIGHT_PX = 240;
const MCP_APP_FRAME_MAX_HEIGHT_PX = 720;
const MCP_APP_BRIDGE_WIDGET_ID = "hicodex-inline-widget";
export const MCP_APP_BRIDGE_SOURCE = "hicodex:mcp-app";
export const MCP_APP_BRIDGE_HOST_SOURCE = "hicodex:mcp-app-host";
const MCP_APP_SANDBOX_LOAD_ERROR = "The MCP app sandbox failed to load.";

export type McpAppDisplayMode = "inline" | "fullscreen";

export interface McpResourceReadRequest {
  threadId?: string | null;
  server: string;
  uri: string;
}

export type ReadMcpResourceHandler = (request: McpResourceReadRequest) => Promise<unknown>;

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

export function mcpAppDisplayModeFromValue(value: unknown, fallback: McpAppDisplayMode): McpAppDisplayMode {
  if (value === "inline" || value === "fullscreen") return value;
  const mode = recordObject(value).mode;
  return mode === "inline" || mode === "fullscreen" ? mode : fallback;
}

export function createMcpAppBridgeNonce(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mcpAppSandboxSrcDoc(
  frame: McpAppFrameViewModel,
  detail: McpAppDetailViewModel,
  bridgeNonce = createMcpAppBridgeNonce(),
): string {
  const documentParts = mcpAppHtmlDocumentParts(frame.html);
  const injections = [
    mcpAppCspMetaTag(frame.csp, bridgeNonce),
    `<script nonce="${escapeHtmlAttribute(bridgeNonce)}">${mcpAppSandboxBootstrapScript(detail, frame, bridgeNonce)}</script>`,
  ].filter(Boolean).join("");
  return [
    documentParts.doctype,
    `<html${documentParts.htmlAttributes}>`,
    `<head>${injections}${documentParts.headContent}</head>`,
    `<body${documentParts.bodyAttributes}>${documentParts.bodyContent}</body>`,
    "</html>",
  ].join("");
}

interface McpAppHtmlDocumentParts {
  bodyAttributes: string;
  bodyContent: string;
  doctype: string;
  headContent: string;
  htmlAttributes: string;
}

function mcpAppHtmlDocumentParts(html: string): McpAppHtmlDocumentParts {
  const doctypeMatch = /^\s*(<!doctype\b[^>]*>)/iu.exec(html);
  const doctype = doctypeMatch ? doctypeMatch[1] : "<!doctype html>";
  const htmlMatch = /<html\b([^>]*)>/iu.exec(html);
  const head = mcpAppHtmlElement(html, "head");
  const body = mcpAppHtmlElement(html, "body");
  const bodyContent = body?.content ?? mcpAppHtmlWithoutDocumentShell(html, doctypeMatch?.[0] ?? "", htmlMatch?.[0] ?? "", head?.outer ?? "");
  return {
    bodyAttributes: body?.attributes ?? "",
    bodyContent,
    doctype,
    headContent: head?.content ?? "",
    htmlAttributes: htmlMatch?.[1] ?? "",
  };
}

function mcpAppHtmlElement(html: string, tagName: "body" | "head"): {
  attributes: string;
  content: string;
  outer: string;
} | null {
  const match = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "iu").exec(html);
  return match
    ? {
        attributes: match[1] ?? "",
        content: match[2] ?? "",
        outer: match[0],
      }
    : null;
}

function mcpAppHtmlWithoutDocumentShell(
  html: string,
  doctype: string,
  htmlOpen: string,
  headOuter: string,
): string {
  let body = html;
  if (doctype) body = body.replace(doctype, "");
  if (htmlOpen) body = body.replace(htmlOpen, "");
  if (headOuter) body = body.replace(headOuter, "");
  return body.replace(/<\/html\s*>/iu, "");
}

function mcpAppSandboxBootstrapScript(
  detail: McpAppDetailViewModel,
  frame: McpAppFrameViewModel,
  bridgeNonce: string,
): string {
  const payload = {
    bridgeNonce,
    displayMode: "inline",
    hostCapabilities: mcpAppHostCapabilities(frame.csp),
    source: MCP_APP_BRIDGE_SOURCE,
    hostSource: MCP_APP_BRIDGE_HOST_SOURCE,
    toolInput: mcpAppToolInputFromArguments(detail.toolArguments),
    toolOutput: detail.toolOutput ?? null,
    toolResponseMetadata: detail.toolResponseMetadata ?? null,
    viewParams: detail.toolOutput ?? null,
    widgetId: MCP_APP_BRIDGE_WIDGET_ID,
    widgetState: null,
  };
  return `
(function () {
  var initial = ${safeScriptJson(payload)};
  var hostPort = null;
  var queued = [];
  var pending = new Map();
  var nextId = 1;
  var readyTimer = null;
  function rejectPending(error) {
    pending.forEach(function (entry) { entry.reject(error); });
    pending.clear();
  }
  function postReady() {
    window.parent.postMessage({
      nonce: initial.bridgeNonce,
      source: initial.source,
      type: "ready"
    }, "*");
  }
  function startPort(port) {
    if (hostPort) return;
    hostPort = port;
    if (readyTimer !== null) {
      window.clearInterval(readyTimer);
      readyTimer = null;
    }
    hostPort.onmessage = function (event) {
      var data = event.data || {};
      if (data.source !== initial.hostSource) return;
      if (data.type === "setWidgetData") {
        applyWidgetData(data.data || {});
        return;
      }
      if (data.type === "setWidgetView") {
        applyWidgetView(data.data || {});
        return;
      }
      if (data.type === "notifyMcpAppsHostContext") {
        dispatchOpenaiEvent("openai:hostContext", data.data || {});
        return;
      }
      if (data.type === "notifyMcpAppsToolInput") {
        dispatchOpenaiEvent("openai:toolInput", data.data || {});
        return;
      }
      if (data.type === "notifyMcpAppsToolResult") {
        dispatchOpenaiEvent("openai:toolResult", data.data || {});
        return;
      }
      if (!data.id) return;
      var entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.status === "resolve") entry.resolve(data.result);
      else entry.reject(data.error || { message: "MCP sandbox host call failed." });
    };
    if (typeof hostPort.start === "function") hostPort.start();
    queued.splice(0).forEach(function (fn) { fn(); });
  }
  function callHost(method, args) {
    return new Promise(function (resolve, reject) {
      var id = String(nextId++);
      var send = function () {
        if (!hostPort) {
          queued.push(send);
          return;
        }
        pending.set(id, { resolve: resolve, reject: reject });
        hostPort.postMessage({
          args: Array.prototype.slice.call(args || []),
          id: id,
          method: method,
          source: initial.source,
          type: "request"
        });
      };
      send();
    });
  }
  function normalizeWidgetState(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function dispatchOpenaiEvent(type, detail) {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail: detail }));
    } catch (_error) {}
  }
  function applyWidgetData(data) {
    openai.toolInput = Object.prototype.hasOwnProperty.call(data, "toolInput") ? data.toolInput : null;
    openai.toolOutput = Object.prototype.hasOwnProperty.call(data, "toolOutput") ? data.toolOutput : null;
    openai.toolResponseMetadata = Object.prototype.hasOwnProperty.call(data, "toolResponseMetadata") ? data.toolResponseMetadata : null;
    openai.viewParams = Object.prototype.hasOwnProperty.call(data, "viewParams") ? data.viewParams : openai.toolOutput;
    openai.widgetId = typeof data.widgetId === "string" && data.widgetId ? data.widgetId : initial.widgetId;
    openai.widgetState = normalizeWidgetState(data.widgetState);
    dispatchOpenaiEvent("openai:setWidgetData", data);
  }
  function applyWidgetView(data) {
    var mode = data.displayMode === "fullscreen" ? "fullscreen" : "inline";
    openai.displayMode = mode;
    if (Object.prototype.hasOwnProperty.call(data, "viewParams")) openai.viewParams = data.viewParams;
    if (typeof data.widgetId === "string" && data.widgetId) openai.widgetId = data.widgetId;
    dispatchOpenaiEvent("openai:setWidgetView", data);
  }
  var openai = Object.assign({}, window.openai || {});
  openai.callMcp = function (request) { return callHost("callMcp", [request]); };
  openai.callTool = function (name, args) { return callHost("callTool", [name, args]); };
  openai.openExternal = function (request) { return callHost("openExternal", [request]); };
  openai.requestDisplayMode = function (request) { return callHost("requestDisplayMode", [request]); };
  openai.sendFollowUpMessage = function (request) { return callHost("sendFollowUpMessage", [request]); };
  openai.updateWidgetState = function () {
    var args = Array.prototype.slice.call(arguments);
    openai.widgetState = normalizeWidgetState(args.length > 1 ? args[1] : args[0]);
    return callHost("updateWidgetState", args);
  };
  openai.notifyIntrinsicHeight = function (height) { return callHost("notifyIntrinsicHeight", [height]); };
  openai.notifyIntrinsicWidth = function (width) { return callHost("notifyIntrinsicWidth", [width]); };
  openai.toolInput = initial.toolInput;
  openai.toolOutput = initial.toolOutput;
  openai.toolResponseMetadata = initial.toolResponseMetadata;
  openai.displayMode = initial.displayMode;
  openai.viewParams = initial.viewParams;
  openai.widgetId = initial.widgetId;
  openai.widgetState = initial.widgetState;
  openai.mcpApps = {
    hostCapabilities: initial.hostCapabilities,
    hostInfo: { name: "chatgpt" }
  };
  window.openai = openai;
  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (event.source !== window.parent) return;
    if (data.source !== initial.hostSource || data.type !== "init" || data.nonce !== initial.bridgeNonce) return;
    if (!event.ports || !event.ports[0]) return;
    startPort(event.ports[0]);
  });
  window.addEventListener("unload", function () {
    rejectPending({ message: "MCP sandbox host call aborted." });
    if (readyTimer !== null) window.clearInterval(readyTimer);
    if (hostPort) hostPort.close();
  });
  postReady();
  readyTimer = window.setInterval(postReady, 50);
})();`.trim();
}

function mcpAppHostCapabilities(csp: McpAppCspViewModel): Record<string, unknown> {
  return {
    logging: {},
    message: {},
    openLinks: {},
    serverResources: {},
    serverTools: {},
    updateModelContext: {},
    ...(csp.isTrusted ? {
      sandbox: {
        csp: {
          baseUriDomains: csp.baseUriDomains,
          connectDomains: csp.connectDomains,
          frameDomains: csp.frameDomains,
          resourceDomains: csp.resourceDomains,
        },
      },
    } : {}),
  };
}

function safeScriptJson(value: unknown): string {
  try {
    return (JSON.stringify(value) ?? "null").replaceAll("<", "\\u003c");
  } catch {
    return "null";
  }
}

function mcpAppCspMetaTag(csp: McpAppCspViewModel, bridgeNonce: string): string {
  const content = mcpAppCspMetaContent(csp, bridgeNonce);
  return content ? `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(content)}">` : "";
}

export function mcpAppCspMetaContent(csp: McpAppCspViewModel, bridgeNonce = ""): string {
  const resourceDomains = csp.isTrusted ? csp.resourceDomains : [];
  const connectDomains = csp.isTrusted && csp.connectDomains.length > 0 ? csp.connectDomains : resourceDomains;
  const frameDomains = csp.isTrusted ? csp.frameDomains : [];
  const baseUriDomains = csp.isTrusted ? csp.baseUriDomains : [];
  const resourceSources = dedupeStrings(["data:", "blob:", ...resourceDomains]);
  const scriptSources = dedupeStrings([
    bridgeNonce ? `'nonce-${bridgeNonce}'` : "",
    "blob:",
    ...resourceDomains,
  ].filter(Boolean));
  const styleSources = dedupeStrings(resourceDomains);
  return [
    "default-src 'none'",
    `base-uri ${baseUriDomains.length > 0 ? baseUriDomains.join(" ") : "'none'"}`,
    `connect-src ${connectDomains.length > 0 ? connectDomains.join(" ") : "'none'"}`,
    "form-action 'none'",
    `font-src ${resourceSources.length > 0 ? resourceSources.join(" ") : "'none'"}`,
    `frame-src ${frameDomains.length > 0 ? frameDomains.join(" ") : "'none'"}`,
    `img-src ${resourceSources.length > 0 ? resourceSources.join(" ") : "'none'"}`,
    `media-src ${resourceSources.length > 0 ? resourceSources.join(" ") : "'none'"}`,
    "object-src 'none'",
    `script-src ${scriptSources.length > 0 ? scriptSources.join(" ") : "'none'"}`,
    `style-src ${styleSources.length > 0 ? styleSources.join(" ") : "'none'"}`,
  ].join("; ");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function mcpAppToolOutputFromResult(value: unknown): unknown {
  const record = recordObject(value);
  const structured = record.structuredContent ?? record.structured_content;
  if (isPlainObject(structured)) return structured;
  const content = Array.isArray(record.content) ? record.content : [];
  if (content.length !== 1) return null;
  const only = content[0];
  if (!only || typeof only !== "object" || Array.isArray(only)) return null;
  const text = (only as Record<string, unknown>).text;
  if (typeof text !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function mcpAppToolResultForWidget(value: unknown, metadata: unknown = null): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  const record = recordObject(value);
  const content = Array.isArray(record.content) ? record.content : [];
  const structured = record.structuredContent ?? record.structured_content;
  const meta = metadata ?? record._meta;
  return {
    content,
    ...(structured === null || structured === undefined ? {} : { structuredContent: structured }),
    ...(meta === null || meta === undefined ? {} : { _meta: meta }),
  };
}

export function mcpAppToolInputFromArguments(value: unknown): unknown {
  return isPlainObject(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const MCP_APP_HTML_MIME_TYPES = new Set(["text/html", "text/html;profile=mcp-app"]);

const EMPTY_MCP_APP_CSP: McpAppCspViewModel = {
  baseUriDomains: [],
  connectDomains: [],
  frameDomains: [],
  includeDefaultDomains: false,
  isTrusted: false,
  resourceDomains: [],
};

export function mcpAppFrameFromResourceReadResult(value: unknown): McpAppFrameViewModel | null {
  if (value === null || value === undefined) return null;
  const record = recordObject(value);
  const contents = recordArrayField(record, "contents");
  for (const content of contents) {
    const frame = mcpAppFrameFromResourceContent(content);
    if (frame) return frame;
  }

  for (const content of recordArrayField(record, "content")) {
    const frame = mcpAppFrameFromToolResultContent(content);
    if (frame) return frame;
  }
  return mcpAppFrameFromResourceContent(record);
}

export function mcpAppHtmlTooLarge(html: string): boolean {
  return mcpAppHtmlByteSize(html) > MCP_APP_HTML_MAX_BYTES;
}

function mcpAppHtmlByteSize(html: string): number {
  if (typeof Blob !== "undefined") return new Blob([html]).size;
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(html).byteLength;
  return html.length;
}

function mcpAppFrameFromToolResultContent(content: Record<string, unknown>): McpAppFrameViewModel | null {
  if (stringField(content, "type") === "embedded_resource") {
    return mcpAppFrameFromResourceContent(recordObject(content.resource));
  }
  return mcpAppFrameFromResourceContent(content);
}

function mcpAppFrameFromResourceContent(content: Record<string, unknown>): McpAppFrameViewModel | null {
  const mimeType = normalizedMcpAppMimeType(stringField(content, "mimeType") || stringField(content, "mime_type"));
  if (!mimeType) return null;
  const html = stringField(content, "text");
  if (!html) return null;
  const meta = recordObject(content._meta);
  return {
    csp: mcpAppCspFromMeta(meta),
    html,
    heightPx: mcpAppFrameHeight(meta),
    mimeType,
    prefersBorder: meta["openai/widgetPrefersBorder"] === true,
    widgetDomain: mcpAppWidgetDomain(meta),
  };
}

function normalizedMcpAppMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return MCP_APP_HTML_MIME_TYPES.has(normalized) ? normalized : "";
}

function mcpAppFrameHeight(meta: Record<string, unknown>): number {
  const value = meta["openai/widgetHeightHint"];
  const height = typeof value === "number" && Number.isFinite(value) ? value : MCP_APP_FRAME_DEFAULT_HEIGHT_PX;
  return clampMcpAppHeight(height);
}

function mcpAppWidgetDomain(meta: Record<string, unknown>): string | null {
  const ui = recordObject(meta.ui);
  return stringField(ui, "domain") || stringField(meta, "openai/widgetDomain") || null;
}

function mcpAppCspFromMeta(meta: Record<string, unknown>): McpAppCspViewModel {
  const ui = recordObject(meta.ui);
  const mcpAppCsp = recordObject(ui.csp);
  const openaiWidgetCsp = recordObject(meta["openai/widgetCSP"]);
  const hasMcpAppCsp = Object.keys(mcpAppCsp).length > 0;
  const hasOpenaiWidgetCsp = Object.keys(openaiWidgetCsp).length > 0;
  if (!hasMcpAppCsp && !hasOpenaiWidgetCsp) return EMPTY_MCP_APP_CSP;

  const resourceDomains = cspDomains(mcpAppCsp, "resourceDomains")
    ?? cspDomains(openaiWidgetCsp, "resourceDomains")
    ?? cspDomains(openaiWidgetCsp, "resource_domains")
    ?? [];
  const connectDomains = dedupeStrings([
    ...(cspDomains(mcpAppCsp, "connectDomains")
      ?? cspDomains(openaiWidgetCsp, "connectDomains")
      ?? cspDomains(openaiWidgetCsp, "connect_domains")
      ?? []),
    ...resourceDomains,
  ]);
  const frameDomains = cspDomains(mcpAppCsp, "frameDomains")
    ?? cspDomains(openaiWidgetCsp, "frameDomains")
    ?? cspDomains(openaiWidgetCsp, "frame_domains")
    ?? [];
  const baseUriDomains = cspDomains(mcpAppCsp, "baseUriDomains")
    ?? cspDomains(openaiWidgetCsp, "baseUriDomains")
    ?? cspDomains(openaiWidgetCsp, "base_uri_domains")
    ?? [];

  return {
    baseUriDomains,
    connectDomains,
    frameDomains,
    includeDefaultDomains: false,
    isTrusted: true,
    resourceDomains,
  };
}

function cspDomains(record: Record<string, unknown>, key: string): string[] | null {
  if (!(key in record)) return null;
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return dedupeStrings(value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const normalized = normalizeMcpAppCspDomain(item);
    return normalized ? [normalized] : [];
  }));
}

const MCP_APP_CSP_ESCAPED_WILDCARD_RE = /^([a-z][a-z0-9+.-]*:\/\/)?%2a(?=\.)/iu;
const MCP_APP_CSP_FORBIDDEN_RE = /[\s;,"']/u;

function normalizeMcpAppCspDomain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || MCP_APP_CSP_FORBIDDEN_RE.test(trimmed)) return null;
  if (trimmed === "blob:" || trimmed === "data:") return trimmed;
  const wildcardNormalized = trimmed.replace(MCP_APP_CSP_ESCAPED_WILDCARD_RE, "$1*");
  const urlText = /^[a-z][a-z0-9+.-]*:\/\//iu.test(wildcardNormalized)
    ? wildcardNormalized
    : `https://${wildcardNormalized}`;
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:"
    || url.hostname === "*"
    || url.username.length > 0
    || url.password.length > 0
  ) {
    return null;
  }
  const hostname = url.hostname.replace(/^%2a(?=\.)/iu, "*");
  if (hostname.includes("*") && !hostname.startsWith("*.")) return null;
  if (!isMcpAppCspHostnameAllowed(hostname)) return null;
  return `${url.protocol}//${hostname}${url.port.length > 0 ? `:${url.port}` : ""}`;
}

function isMcpAppCspHostnameAllowed(hostname: string): boolean {
  const normalized = hostname.startsWith("*.") ? hostname.slice(2) : hostname;
  const lower = normalized.toLowerCase();
  if (
    lower === "localhost"
    || lower.endsWith(".localhost")
    || lower.endsWith(".local")
    || lower.startsWith("[")
  ) {
    return false;
  }
  return !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(lower);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function recordArrayField(record: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = record[field];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}
