import { stringField } from "../lib/format";
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

export const MCP_APP_HTML_MAX_BYTES = 10_000_000;

const MCP_APP_FRAME_MIN_HEIGHT_PX = 200;
const MCP_APP_FRAME_DEFAULT_HEIGHT_PX = 240;
const MCP_APP_FRAME_MAX_HEIGHT_PX = 720;

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

function clampMcpAppHeight(value: number): number {
  return Math.max(MCP_APP_FRAME_MIN_HEIGHT_PX, Math.min(MCP_APP_FRAME_MAX_HEIGHT_PX, Math.round(value)));
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

const MCP_APP_HTML_MIME_TYPES = new Set(["text/html", "text/html;profile=mcp-app"]);

const EMPTY_MCP_APP_CSP: McpAppCspViewModel = {
  baseUriDomains: [],
  connectDomains: [],
  frameDomains: [],
  includeDefaultDomains: false,
  isTrusted: false,
  resourceDomains: [],
};

const MCP_APP_CSP_ESCAPED_WILDCARD_RE = /^([a-z][a-z0-9+.-]*:\/\/)?%2a(?=\.)/iu;
const MCP_APP_CSP_FORBIDDEN_RE = /[\s;,"']/u;
