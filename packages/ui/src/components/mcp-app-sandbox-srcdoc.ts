import {
  mcpAppCspMetaContent,
  mcpAppToolInputFromArguments,
  type McpAppCspViewModel,
  type McpAppFrameViewModel,
} from "./mcp-app-frame";
import type { McpAppDetailViewModel } from "./mcp-app-sandbox-types";

export const MCP_APP_BRIDGE_WIDGET_ID = "forge-inline-widget";
export const MCP_APP_BRIDGE_SOURCE = "forge:mcp-app";
export const MCP_APP_BRIDGE_HOST_SOURCE = "forge:mcp-app-host";

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

export function safeScriptJson(value: unknown): string {
  try {
    return (JSON.stringify(value) ?? "null").replaceAll("<", "\\u003c");
  } catch {
    return "null";
  }
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

function mcpAppCspMetaTag(csp: McpAppCspViewModel, bridgeNonce: string): string {
  const content = mcpAppCspMetaContent(csp, bridgeNonce);
  return content ? `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(content)}">` : "";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
