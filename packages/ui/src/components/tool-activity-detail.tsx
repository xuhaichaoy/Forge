import { Check, ChevronRight, Copy as CopyIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatUnknown, stringField } from "../lib/format";
import {
  mcpAppBridgeError,
  serializeMcpAppBridgeError,
} from "../state/mcp-app-host";
import {
  assistantMessageText,
  commandOutputText,
  commandText,
  formatItemDetail,
  isItemInProgress,
  itemText,
  itemType,
  mcpAppResourceUri,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
  type AccumulatedThreadItem,
} from "../state/render-groups";
import type { OpenThreadHandler } from "./open-thread";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

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
const MCP_APP_BRIDGE_WIDGET_ID = "hicodex-inline-widget";
const MCP_APP_BRIDGE_SOURCE = "hicodex:mcp-app";
const MCP_APP_BRIDGE_HOST_SOURCE = "hicodex:mcp-app-host";
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

export type ToolActivityDetailViewModel =
  | {
      kind: "execSummary";
      id: string;
      running: boolean;
      label: string;
    }
  | {
      kind: "exec";
      id: string;
      running: boolean;
      command: string;
      cwd: string;
      output: string;
      status: string;
      footer: string;
    }
  | {
      kind: "patch";
      id: string;
      running: boolean;
      changes: PatchChangeViewModel[];
      status: string;
    }
  | {
      kind: "tool";
      id: string;
      running: boolean;
      name: string;
      toolKind: "MCP" | "Tool";
      argumentsText: string;
      resultText: string;
      errorText: string;
      status: string;
    }
  | {
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
  | {
      kind: "pendingTool";
      id: string;
      running: boolean;
      name: string;
      source: string;
      label: string;
      status: string;
    }
  | {
      kind: "webSearch";
      id: string;
      running: boolean;
      detail: string;
      faviconUrl: string | null;
    }
  | {
      kind: "multiAgent";
      id: string;
      running: boolean;
      rows: MultiAgentRowViewModel[];
    }
  | {
      kind: "assistant";
      id: string;
      running: boolean;
      text: string;
    }
  | {
      kind: "text";
      id: string;
      running: boolean;
      title: string;
      text: string;
    };

export interface MultiAgentRowViewModel {
  key: string;
  parts: MultiAgentRowPart[];
  text: string;
}

export type MultiAgentRowPart =
  | { kind: "text"; text: string }
  | { kind: "prompt"; text: string }
  | {
      kind: "agent";
      color: string;
      label: string;
      threadId: string;
      title: string | null;
      model: string | null;
      role: string | null;
    };

export function multiAgentRowText(parts: MultiAgentRowPart[]): string {
  return parts.map((part) => part.kind === "agent" ? part.label : part.text).join("");
}

export function multiAgentAgentColor(threadId: string): string {
  const palette = [
    "#2f7a63",
    "#6f5fb5",
    "#b05d35",
    "#2d75a8",
    "#8a5a2b",
    "#2f7b8f",
    "#9a4f74",
    "#5d7334",
  ];
  let hash = 0;
  for (let index = 0; index < threadId.length; index += 1) {
    hash = (hash * 31 + threadId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0];
}

export interface PatchChangeViewModel {
  action: "Created" | "Deleted" | "Edited";
  path: string;
  diff: string;
}

export function ToolActivityDetail({
  forceExecExpanded = false,
  item,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenThreadId,
  threadId = null,
}: {
  forceExecExpanded?: boolean;
  item: ThreadItem;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenThreadId?: OpenThreadHandler;
  threadId?: string | null;
}) {
  const detail = toolActivityDetailViewModel(item);
  if (detail.kind === "webSearch") {
    return (
      <div className="hc-tool-detail-row hc-tool-detail-web-search-row">
        {detail.faviconUrl && (
          <img
            alt=""
            className="hc-tool-detail-web-search-favicon"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            src={detail.faviconUrl}
          />
        )}
        <span>{detail.detail}</span>
      </div>
    );
  }
  if (detail.kind === "multiAgent") {
    return (
      <>
        {detail.rows.map((row) => (
          <div className="hc-tool-detail-row" key={row.key}>
            {row.parts.map((part, index) => {
              if (part.kind === "text") return <span key={`${row.key}:text:${index}`}>{part.text}</span>;
              if (part.kind === "prompt") return <MultiAgentPrompt key={`${row.key}:prompt:${index}`} text={part.text} />;
              if (!onOpenThreadId) {
                return (
                  <span
                    className="hc-tool-detail-agent"
                    key={`${row.key}:agent:${part.threadId}`}
                    style={{ color: part.color }}
                    title={part.title ?? undefined}
                  >
                    {part.label}
                  </span>
                );
              }
              return (
                <button
                  className="hc-tool-detail-agent hc-tool-detail-agent-button"
                  key={`${row.key}:agent:${part.threadId}`}
                  style={{ color: part.color }}
                  title={part.title ?? undefined}
                  type="button"
                  onClick={() => onOpenThreadId(part.threadId, {
                    displayName: part.label,
                    model: part.model,
                    role: part.role,
                  })}
                >
                  {part.label}
                </button>
              );
            })}
          </div>
        ))}
      </>
    );
  }
  if (detail.kind === "assistant") {
    return <div className="hc-tool-detail-prose">{detail.text}</div>;
  }
  if (detail.kind === "execSummary") {
    return (
      <div className={`hc-tool-detail-row hc-tool-detail-command-row ${detail.running ? "is-running" : ""}`}>
        {detail.label}
      </div>
    );
  }
  if (detail.kind === "exec") {
    return <ExecShellDetail detail={detail} forceExpanded={forceExecExpanded} />;
  }
  if (detail.kind === "patch") {
    return (
      <section className={`hc-tool-detail-stack patch ${detail.running ? "is-running" : ""}`}>
        {detail.changes.length > 0
          ? detail.changes.map((change, index) => (
              <div className="hc-tool-detail-change" key={`${change.path}:${index}`}>
                <div className="hc-tool-detail-change-title">
                  <span>{change.action}</span>
                  <code>{change.path}</code>
                </div>
                {change.diff && <CodeBlock diff text={change.diff} />}
              </div>
            ))
          : <div className="hc-tool-detail-row">No file changes were provided.</div>}
      </section>
    );
  }
  if (detail.kind === "tool") {
    return (
      <section className={`hc-tool-detail-stack tool ${detail.running ? "is-running" : ""}`}>
        <div className="hc-tool-detail-line">
          <span className="hc-tool-detail-title">{detail.name}</span>
          <small>{detail.toolKind}{detail.status ? ` · ${detail.status}` : ""}</small>
        </div>
        {detail.argumentsText && <LabeledCode label="Parameters" text={detail.argumentsText} />}
        {detail.resultText && <LabeledCode label="Result" text={detail.resultText} />}
        {detail.errorText && <LabeledCode label="Error" text={detail.errorText} />}
      </section>
    );
  }
  if (detail.kind === "mcpApp") {
    return (
      <McpAppToolDetail
        detail={detail}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        threadId={threadId}
      />
    );
  }
  if (detail.kind === "pendingTool") {
    return (
      <div
        className={`hc-tool-detail-row hc-tool-detail-tool-row ${detail.running ? "is-running" : ""}`}
        title={detail.name}
      >
        <span className="hc-tool-detail-source">{detail.source}</span>
        <span className="hc-tool-detail-tool-label">{detail.label}</span>
      </div>
    );
  }
  return (
    <section className={`hc-tool-detail-stack text ${detail.running ? "is-running" : ""}`}>
      <div className="hc-tool-detail-line">
        <span className="hc-tool-detail-title">{detail.title}</span>
      </div>
      <CodeBlock text={detail.text || "..."} />
    </section>
  );
}

function McpAppToolDetail({
  detail,
  onMcpAppHostCall,
  onReadMcpResource,
  threadId,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  threadId: string | null;
}) {
  const inlineFrame = detail.inlineFrame;
  const inlineFrameKey = inlineFrame
    ? `${inlineFrame.mimeType}:${inlineFrame.heightPx}:${inlineFrame.prefersBorder ? "1" : "0"}:${inlineFrame.html}`
    : "";
  const [resourceState, setResourceState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    frame: McpAppFrameViewModel | null;
    fallbackText: string;
    errorText: string;
  }>(() => ({
    status: inlineFrame ? "ready" : "idle",
    frame: inlineFrame,
    fallbackText: "",
    errorText: "",
  }));

  useEffect(() => {
    if (inlineFrame) {
      setResourceState({
        status: "ready",
        frame: inlineFrame,
        fallbackText: "",
        errorText: "",
      });
      return;
    }
    if (!onReadMcpResource || !detail.resourceUri) {
      setResourceState({
        status: "idle",
        frame: null,
        fallbackText: "",
        errorText: "",
      });
      return;
    }

    let cancelled = false;
    setResourceState({
      status: "loading",
      frame: null,
      fallbackText: "",
      errorText: "",
    });
    void onReadMcpResource({
      threadId,
      server: detail.server,
      uri: detail.resourceUri,
    }).then(
      (value) => {
        if (cancelled) return;
        setResourceState({
          status: "ready",
          frame: mcpAppFrameFromResourceReadResult(value),
          fallbackText: formatUnknown(value),
          errorText: "",
        });
      },
      (error) => {
        if (cancelled) return;
        setResourceState({
          status: "error",
          frame: null,
          fallbackText: "",
          errorText: error instanceof Error ? error.message : formatUnknown(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [detail.id, detail.resourceUri, detail.server, inlineFrameKey, onReadMcpResource, threadId]);

  const frame = resourceState.frame;
  const frameTooLarge = frame ? mcpAppHtmlTooLarge(frame.html) : false;
  const fallbackText = detail.errorText || detail.resultText || resourceState.fallbackText;

  return (
    <section className={`hc-tool-detail-stack mcp-app ${detail.running ? "is-running" : ""}`}>
      <div className="hc-mcp-app-header">
        <span className="hc-tool-detail-source">MCP app</span>
        <span className="hc-tool-detail-title" title={detail.name}>{detail.name}</span>
        <small>{detail.status}</small>
      </div>
      <div className="hc-mcp-app-uri" title={detail.resourceUri}>{detail.resourceUri}</div>
      {frame && !frameTooLarge ? (
        <McpAppSandboxFrame
          detail={detail}
          frame={frame}
          onMcpAppHostCall={onMcpAppHostCall}
          threadId={threadId}
        />
      ) : frameTooLarge ? (
        <div className="hc-tool-detail-row error">Failed to load MCP app: HTML exceeds the maximum supported size.</div>
      ) : resourceState.status === "loading" ? (
        <div
          aria-label="Loading MCP app"
          className="hc-mcp-app-loading"
          data-mcp-app-loading="true"
          role="status"
        />
      ) : resourceState.status === "error" ? (
        <div className="hc-tool-detail-row error">Failed to load MCP app: {resourceState.errorText}</div>
      ) : (
        <div className="hc-tool-detail-row">MCP app returned no HTML content</div>
      )}
      {detail.argumentsText && <LabeledCode label="Parameters" text={detail.argumentsText} />}
      {!frame && fallbackText && <LabeledCode label={detail.errorText ? "Error" : "Result"} text={fallbackText} />}
    </section>
  );
}

function McpAppSandboxFrame({
  detail,
  frame,
  onMcpAppHostCall,
  threadId,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
  frame: McpAppFrameViewModel;
  onMcpAppHostCall?: McpAppHostCallHandler;
  threadId: string | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const displayModeRef = useRef<McpAppDisplayMode>("inline");
  const hostPortRef = useRef<MessagePort | null>(null);
  const lastWidgetDataKeyRef = useRef("");
  const lastWidgetViewKeyRef = useRef("");
  const widgetStateRef = useRef<unknown>(null);
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<McpAppDisplayMode>("inline");
  const [frameLoadNonce, setFrameLoadNonce] = useState(0);
  const [heightPx, setHeightPx] = useState(frame.heightPx);
  const [sandboxErrorText, setSandboxErrorText] = useState<string | null>(null);
  const srcDoc = useMemo(() => mcpAppSandboxSrcDoc(frame, detail), [detail, frame]);
  const widgetDataKey = useMemo(() => mcpAppWidgetDataKey(detail), [detail]);
  const widgetViewKey = useMemo(() => mcpAppWidgetViewKey(detail, displayMode), [detail, displayMode]);
  const cspMetaContent = mcpAppCspMetaContent(frame.csp);

  useEffect(() => {
    setBackgroundColor(null);
    setDisplayMode("inline");
    displayModeRef.current = "inline";
    setHeightPx(frame.heightPx);
    setSandboxErrorText(null);
    lastWidgetDataKeyRef.current = "";
    lastWidgetViewKeyRef.current = "";
    widgetStateRef.current = null;
  }, [detail.id, frame.heightPx, srcDoc]);

  useEffect(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || typeof MessageChannel === "undefined") return;
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      const request = mcpAppBridgeRequestFromMessage(event.data);
      if (!request) return;
      void handleMcpAppBridgeRequest({
        args: request.args,
        detail,
        id: request.id,
        method: request.method,
        onMcpAppHostCall,
        port: channel.port1,
        resourceUri: detail.resourceUri,
        setDisplayMode,
        setBackgroundColor,
        setHeightPx,
        setSandboxErrorText,
        displayModeRef,
        threadId,
        widgetStateRef,
      });
    };
    channel.port1.start();
    hostPortRef.current = channel.port1;
    frameWindow.postMessage({
      source: MCP_APP_BRIDGE_HOST_SOURCE,
      type: "init",
    }, "*", [channel.port2]);
    postMcpAppWidgetDataToPort({
      detail,
      lastWidgetDataKeyRef,
      port: channel.port1,
      widgetState: widgetStateRef.current,
    });
    postMcpAppWidgetViewToPort({
      detail,
      displayMode: displayModeRef.current,
      lastWidgetViewKeyRef,
      port: channel.port1,
    });
    return () => {
      if (hostPortRef.current === channel.port1) hostPortRef.current = null;
      channel.port1.onmessage = null;
      channel.port1.close();
    };
  }, [
    detail,
    frameLoadNonce,
    onMcpAppHostCall,
    threadId,
  ]);

  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  useEffect(() => {
    const port = hostPortRef.current;
    if (!port) return;
    postMcpAppWidgetDataToPort({
      detail,
      lastWidgetDataKeyRef,
      port,
      widgetState: widgetStateRef.current,
    });
  }, [detail, frameLoadNonce, widgetDataKey]);

  useEffect(() => {
    const port = hostPortRef.current;
    if (!port) return;
    postMcpAppWidgetViewToPort({
      detail,
      displayMode,
      lastWidgetViewKeyRef,
      port,
    });
  }, [detail, displayMode, frameLoadNonce, widgetViewKey]);

  if (sandboxErrorText) {
    return <div className="hc-tool-detail-row error">Failed to load MCP app: {sandboxErrorText}</div>;
  }

  return (
    <div
      className={`hc-mcp-app-frame-shell ${displayMode === "fullscreen" ? "is-fullscreen" : ""}`}
      data-mcp-app-display-mode={displayMode}
    >
      {displayMode === "fullscreen" && (
        <button
          aria-label="Exit fullscreen MCP app"
          className="hc-mcp-app-fullscreen-exit"
          title="Exit fullscreen"
          type="button"
          onClick={() => {
            displayModeRef.current = "inline";
            setDisplayMode("inline");
          }}
        >
          <X aria-hidden size={16} />
        </button>
      )}
      <iframe
        className="hc-mcp-app-frame"
        data-csp-base-uri-domains={frame.csp.baseUriDomains.length > 0 ? frame.csp.baseUriDomains.join(" ") : undefined}
        data-csp-connect-domains={frame.csp.connectDomains.length > 0 ? frame.csp.connectDomains.join(" ") : undefined}
        data-csp-enforced={cspMetaContent ? "best-effort" : undefined}
        data-csp-frame-domains={frame.csp.frameDomains.length > 0 ? frame.csp.frameDomains.join(" ") : undefined}
        data-csp-resource-domains={frame.csp.resourceDomains.length > 0 ? frame.csp.resourceDomains.join(" ") : undefined}
        data-csp-trusted={frame.csp.isTrusted ? "true" : undefined}
        data-display-mode={displayMode}
        data-mcp-app-frame="true"
        data-mcp-app-host-bridge="message-channel"
        data-prefers-border={frame.prefersBorder ? "true" : undefined}
        data-widget-domain={frame.widgetDomain ?? undefined}
        ref={iframeRef}
        referrerPolicy="no-referrer"
        sandbox="allow-downloads allow-forms allow-popups allow-scripts"
        srcDoc={srcDoc}
        style={{ backgroundColor: backgroundColor ?? undefined, height: heightPx }}
        title={`${detail.name} MCP app`}
        onLoad={() => setFrameLoadNonce((current) => current + 1)}
      />
    </div>
  );
}

interface McpAppBridgeRequest {
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

interface HandleMcpAppBridgeRequestOptions {
  args: unknown[];
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
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

async function handleMcpAppBridgeRequest({
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
      widgetStateRef.current = mcpAppWidgetStateFromValue(args.at(-1));
      return {};
    case "sendFollowUpMessage":
      throw mcpAppBridgeError("MCP app follow-up messages are not supported yet.");
    case "callMcp":
    case "callTool":
    case "openExternal":
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

function mcpAppBridgeRequestFromMessage(value: unknown): McpAppBridgeRequest | null {
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

function postMcpAppWidgetDataToPort({
  detail,
  lastWidgetDataKeyRef,
  port,
  widgetState,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
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

function postMcpAppWidgetViewToPort({
  detail,
  displayMode,
  lastWidgetViewKeyRef,
  port,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
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

function mcpAppWidgetDataKey(
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
): string {
  return safeScriptJson(mcpAppWidgetDataUpdatePayload(detail, null));
}

function mcpAppWidgetViewKey(
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
  displayMode: McpAppDisplayMode,
): string {
  return safeScriptJson(mcpAppWidgetViewPayload(detail, displayMode));
}

export function mcpAppWidgetDataUpdatePayload(
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
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
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
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

export function mcpAppSandboxSrcDoc(
  frame: McpAppFrameViewModel,
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
): string {
  const injections = [
    mcpAppCspMetaTag(frame.csp),
    `<script>${mcpAppSandboxBootstrapScript(detail, frame)}</script>`,
  ].filter(Boolean).join("");
  if (!injections) return frame.html;
  if (/<head\b[^>]*>/iu.test(frame.html)) {
    return frame.html.replace(/<head\b[^>]*>/iu, (match) => `${match}${injections}`);
  }
  if (/<html\b[^>]*>/iu.test(frame.html)) {
    return frame.html.replace(/<html\b[^>]*>/iu, (match) => `${match}<head>${injections}</head>`);
  }
  return `${injections}${frame.html}`;
}

function mcpAppSandboxBootstrapScript(
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>,
  frame: McpAppFrameViewModel,
): string {
  const payload = {
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
  function rejectPending(error) {
    pending.forEach(function (entry) { entry.reject(error); });
    pending.clear();
  }
  function startPort(port) {
    hostPort = port;
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
    openai.widgetState = normalizeWidgetState(args.length > 0 ? args[args.length - 1] : null);
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
    if (data.source !== initial.hostSource || data.type !== "init") return;
    if (!event.ports || !event.ports[0]) return;
    startPort(event.ports[0]);
  });
  window.addEventListener("unload", function () {
    rejectPending({ message: "MCP sandbox host call aborted." });
    if (hostPort) hostPort.close();
  });
  window.parent.postMessage({ source: initial.source, type: "ready" }, "*");
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

function mcpAppCspMetaTag(csp: McpAppCspViewModel): string {
  const content = mcpAppCspMetaContent(csp);
  return content ? `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(content)}">` : "";
}

export function mcpAppCspMetaContent(csp: McpAppCspViewModel): string {
  if (!csp.isTrusted) return "";
  const resourceDomains = csp.resourceDomains;
  const connectDomains = csp.connectDomains.length > 0 ? csp.connectDomains : resourceDomains;
  const frameDomains = csp.frameDomains;
  const baseUriDomains = csp.baseUriDomains;
  const resourceSources = dedupeStrings(["'self'", "data:", "blob:", ...resourceDomains]);
  const scriptSources = dedupeStrings(["'unsafe-inline'", "'unsafe-eval'", "blob:", ...resourceDomains]);
  const styleSources = dedupeStrings(["'unsafe-inline'", ...resourceDomains]);
  return [
    "default-src 'none'",
    `base-uri ${baseUriDomains.length > 0 ? baseUriDomains.join(" ") : "'none'"}`,
    `connect-src ${dedupeStrings(["'self'", ...connectDomains]).join(" ")}`,
    `font-src ${resourceSources.join(" ")}`,
    `frame-src ${frameDomains.length > 0 ? frameDomains.join(" ") : "'none'"}`,
    `img-src ${resourceSources.join(" ")}`,
    `media-src ${resourceSources.join(" ")}`,
    `script-src ${scriptSources.join(" ")}`,
    `style-src ${styleSources.join(" ")}`,
  ].join("; ");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function ExecShellDetail({
  detail,
  forceExpanded = false,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>;
  forceExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(() => initialExecShellExpanded(detail));
  const [copiedTarget, setCopiedTarget] = useState<ExecShellCopyTarget | null>(null);
  const hasBody = Boolean(detail.output || detail.footer);
  const bodyOpen = forceExpanded || detail.running || expanded;
  const output = detail.output || (!detail.running && detail.footer ? "No output" : "");

  useEffect(() => {
    setExpanded(initialExecShellExpanded(detail));
  }, [detail.id]);

  const copyTarget = (target: ExecShellCopyTarget) => {
    const text = execShellCopyText(detail, target);
    void writeClipboardText(text).then((copied) => {
      if (!copied) return;
      setCopiedTarget(target);
      setTimeout(() => {
        setCopiedTarget((current) => current === target ? null : current);
      }, 1500);
    });
  };

  const commandContent = (
    <>
      <span>$</span>
      <code>{detail.command}</code>
      {hasBody && !forceExpanded && <ChevronRight className={bodyOpen ? "is-open" : ""} size={14} />}
    </>
  );

  return (
    <section
      className={`hc-exec-shell ${detail.running ? "is-running" : ""}`}
      data-shell-state={bodyOpen ? "expanded" : "collapsed"}
    >
      <div className="hc-exec-shell-title">Shell</div>
      <ExecShellCopyButton
        className="hc-exec-shell-copy-all"
        copied={copiedTarget === "all"}
        label={copiedTarget === "all" ? "Copied" : "Copy command and output"}
        onClick={() => copyTarget("all")}
      />
      <div className="hc-exec-shell-command-row">
        {hasBody && !forceExpanded ? (
          <button
            aria-expanded={bodyOpen}
            className="hc-exec-shell-command hc-exec-shell-toggle"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {commandContent}
          </button>
        ) : (
          <div className="hc-exec-shell-command">{commandContent}</div>
        )}
        <ExecShellCopyButton
          className="hc-exec-shell-command-copy"
          copied={copiedTarget === "command"}
          label={copiedTarget === "command" ? "Copied" : "Copy command"}
          onClick={() => copyTarget("command")}
        />
      </div>
      {bodyOpen && detail.cwd && <div className="hc-exec-shell-cwd">{detail.cwd}</div>}
      {bodyOpen && output && (
        <div className="hc-exec-shell-output-wrap">
          <pre className="hc-exec-shell-output">
            <code>{output}</code>
          </pre>
          <ExecShellCopyButton
            className="hc-exec-shell-output-copy"
            copied={copiedTarget === "output"}
            label={copiedTarget === "output" ? "Copied" : "Copy output"}
            onClick={() => copyTarget("output")}
          />
        </div>
      )}
      {bodyOpen && detail.footer && (
        <div className="hc-exec-shell-footer">
          {detail.footer === "Success" && <Check aria-hidden size={12} />}
          <span>{detail.footer}</span>
        </div>
      )}
    </section>
  );
}

export type ExecShellCopyTarget = "all" | "command" | "output";

function ExecShellCopyButton({
  className,
  copied,
  label,
  onClick,
}: {
  className: string;
  copied: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`hc-exec-shell-copy-button ${className} ${copied ? "is-copied" : ""}`}
      title={label}
      type="button"
      onClick={onClick}
    >
      {copied ? <Check aria-hidden size={13} /> : <CopyIcon aria-hidden size={13} />}
    </button>
  );
}

export function execShellCopyText(
  detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>,
  target: ExecShellCopyTarget = "all",
): string {
  if (target === "command") return detail.command;
  if (target === "output") return detail.output;
  return [`$ ${detail.command}`, detail.output].filter(Boolean).join("\n");
}

function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return Promise.resolve(false);
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );
}

export function initialExecShellExpanded(detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>): boolean {
  return detail.running;
}

function MultiAgentPrompt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      className={`hc-tool-detail-prompt ${expanded ? "is-expanded" : ""}`}
      type="button"
      onClick={() => setExpanded((value) => !value)}
    >
      {text}
    </button>
  );
}

export function toolActivityDetailViewModel(item: ThreadItem): ToolActivityDetailViewModel {
  const type = itemType(item);
  const record = item as ItemRecord;
  const running = isItemInProgress(item);
  const status = statusLabel(record.status);
  if (type === "exec") {
    const summary = execSummaryLabel(record, running);
    if (summary) {
      return {
        kind: "execSummary",
        id: item.id,
        running,
        label: summary,
      };
    }
    return {
      kind: "exec",
      id: item.id,
      running,
      command: normalizeDesktopShellCommand(commandText(item)) || "command",
      cwd: stringField(record, "cwd"),
      output: commandOutputText(item),
      status,
      footer: execFooter(record, running),
    };
  }
  if (type === "patch") {
    return {
      kind: "patch",
      id: item.id,
      running,
      changes: patchChanges(record).map((change) => ({
        action: patchAction(patchKind(change)),
        path: patchPath(change),
        diff: stringField(change, "diff"),
      })),
      status,
    };
  }
  if (type === "mcp-tool-call") {
    const server = mcpServerName(item) || "mcp";
    const tool = mcpToolName(item) || "tool";
    const name = `${server}:${tool}`;
    const invocation = recordObject(record.invocation);
    const resourceUri = mcpAppResourceUri(item);
    const result = record.result;
    if (resourceUri) {
      const resultRecord = recordObject(result);
      return {
        kind: "mcpApp",
        id: item.id,
        running,
        name,
        server,
        tool,
        resourceUri,
        inlineFrame: mcpAppFrameFromResourceReadResult(result),
        toolArguments: record.arguments ?? invocation.arguments ?? null,
        toolOutput: mcpAppToolOutputFromResult(result),
        toolResult: result ?? null,
        toolResponseMetadata: resultRecord._meta ?? null,
        argumentsText: formatUnknown(record.arguments ?? invocation.arguments),
        resultText: toolResultText(result),
        errorText: formatUnknown(record.error),
        status,
      };
    }
    if (running) {
      return {
        kind: "pendingTool",
        id: item.id,
        running,
        name,
        source: mcpSourceTitle(server),
        label: `Calling ${tool}`,
        status: status || "pending",
      };
    }
    return {
      kind: "tool",
      id: item.id,
      running,
      name,
      toolKind: "MCP",
      argumentsText: formatUnknown(record.arguments ?? invocation.arguments),
      resultText: toolResultText(record.result),
      errorText: formatUnknown(record.error),
      status,
    };
  }
  if (type === "dynamic-tool-call") {
    const name = [stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".");
    return {
      kind: "tool",
      id: item.id,
      running,
      name,
      toolKind: "Tool",
      argumentsText: formatUnknown(record.arguments),
      resultText: formatUnknown(record.result ?? record.contentItems),
      errorText: formatUnknown(record.error),
      status,
    };
  }
  if (type === "automatic-approval-review") {
    return {
      kind: "text",
      id: item.id,
      running,
      title: "Auto-review",
      text: autoReviewText(record),
    };
  }
  if (type === "hook") {
    return {
      kind: "text",
      id: item.id,
      running,
      title: "Hook",
      text: hookText(record),
    };
  }
  if (type === "web-search") {
    return {
      kind: "webSearch",
      id: item.id,
      running,
      detail: webSearchDetail(record),
      faviconUrl: webSearchFaviconUrl(record),
    };
  }
  if (type === "multi-agent-action") {
    return {
      kind: "multiAgent",
      id: item.id,
      running,
      rows: multiAgentRows(record),
    };
  }
  if (type === "assistant-message") {
    return {
      kind: "assistant",
      id: item.id,
      running,
      text: assistantMessageText(item),
    };
  }
  return {
    kind: "text",
    id: item.id,
    running,
    title: itemType(item),
    text: formatItemDetail(item) || itemText(item) || formatUnknown(item),
  };
}

function autoReviewText(record: ItemRecord): string {
  return [
    `Status: ${stringField(record, "status") || "pending"}`,
    stringField(record, "riskLevel") ? `Risk: ${stringField(record, "riskLevel")}` : "",
    stringField(record, "rationale") ? `Rationale: ${stringField(record, "rationale")}` : "",
  ].filter(Boolean).join("\n");
}

function hookText(record: ItemRecord): string {
  const run = recordObject(record.run);
  return [
    `Status: ${stringField(run, "status") || stringField(record, "status") || "completed"}`,
    stringField(record, "key") ? `Key: ${stringField(record, "key")}` : "",
    stringField(run, "command") ? `Command: ${stringField(run, "command")}` : "",
  ].filter(Boolean).join("\n");
}

function LabeledCode({ label, text }: { label: string; text: string }) {
  return (
    <div className="hc-tool-detail-section">
      <div className="hc-tool-detail-section-label">{label}</div>
      <CodeBlock text={text} />
    </div>
  );
}

function CodeBlock({ text, diff = false }: { text: string; diff?: boolean }) {
  return (
    <pre className={diff ? "is-diff" : undefined}>
      <code>{diff ? renderDiffText(text) : text}</code>
    </pre>
  );
}

function renderDiffText(text: string): ReactNode[] {
  return text.split("\n").map((line, index) => {
    const className = line.startsWith("+")
      ? "hc-diff-add"
      : line.startsWith("-")
        ? "hc-diff-remove"
        : line.startsWith("@@")
          ? "hc-diff-hunk"
          : "hc-diff-context";
    return <span className={className} key={index}>{line || " "}</span>;
  });
}

function statusLabel(status: unknown): string {
  if (typeof status === "string") return status;
  if (status === null || status === undefined) return "";
  return formatUnknown(status);
}

function execFooter(record: ItemRecord, running: boolean): string {
  if (running) return "";
  if (record.executionStatus === "interrupted") return "Stopped";
  const exitCode = execExitCode(record);
  if (exitCode === 0) return "Success";
  if (exitCode !== null) return `Exit code ${exitCode}`;
  return "Exit code unknown";
}

export function normalizeDesktopShellCommand(value: string): string {
  const command = value.trim().replace(/^\$\s+/u, "");
  const normalized = stripDesktopShellQuotes(stripDesktopShellPrompt(command));
  const shellMatch = /^(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/u.exec(normalized);
  if (shellMatch) return stripDesktopShellCommandArgument(shellMatch[1]?.trim() ?? "");
  const trailingShellMatch = /(?:\/bin\/zsh|\/bin\/bash|zsh|bash)\s+-lc\s+([\s\S]+)$/u.exec(command);
  return stripDesktopShellCommandArgument(
    trailingShellMatch
      ? trailingShellMatch[1]?.trim() ?? ""
      : normalized,
  );
}

function stripDesktopShellCommandArgument(value: string): string {
  let text = stripDesktopShellQuotes(value).trim();
  if (
    (text.startsWith("'") && !text.endsWith("'"))
    || (text.startsWith('"') && !text.endsWith('"'))
  ) {
    text = text.slice(1).trim();
  }
  if (
    (!text.startsWith("'") && text.endsWith("'"))
    || (!text.startsWith('"') && text.endsWith('"'))
  ) {
    text = text.slice(0, -1).trim();
  }
  return stripDesktopShellQuotes(text).trim();
}

function stripDesktopShellPrompt(value: string): string {
  let text = value.trim().replace(/^\$\s+/u, "");
  text = text.replaceAll("'\"'\"'", "'").replaceAll("\\'", "'").replaceAll('\\"', '"');
  let changed = true;
  while (changed) {
    changed = false;
    if (
      (text.startsWith("'") && text.endsWith("'"))
      || (text.startsWith('"') && text.endsWith('"'))
    ) {
      text = text.slice(1, -1).trim();
      changed = true;
    }
  }
  return text.replace(/^['"]+/u, "").replace(/['"]+$/u, "").trim();
}

function stripDesktopShellQuotes(value: string): string {
  let text = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (text.startsWith("$'") && text.endsWith("'")) {
      text = text.slice(2, -1).replaceAll("\\'", "'");
      changed = true;
      continue;
    }
    if (
      (text.startsWith("'") && text.endsWith("'"))
      || (text.startsWith('"') && text.endsWith('"'))
    ) {
      text = text
        .slice(1, -1)
        .replaceAll("'\"'\"'", "'")
        .replaceAll('\\"', '"');
      changed = true;
    }
  }
  return text;
}

function execSummaryLabel(record: ItemRecord, running: boolean): string {
  const action = execSummaryAction(record);
  if (!action) return "";
  if (action.type === "read") {
    if (running && !action.finished) return "";
    return `${action.finished === false ? "Reading" : "Read"} ${displayPath(action.path)}`;
  }
  if (action.type === "search") {
    const verb = running || action.finished === false ? "Searching" : "Searched";
    const query = action.query.trim();
    const path = action.path.trim();
    if (query && path) return `${verb} for ${query} in ${displayPath(path)}`;
    if (query) return `${verb} for ${query}`;
    if (path) return `${verb} ${displayPath(path)}`;
    return `${verb} files`;
  }
  if (action.type === "list_files") {
    const verb = running || action.finished === false ? "Listing" : "Listed";
    return action.path.trim() ? `${verb} files in ${displayPath(action.path)}` : `${verb} files`;
  }
  return "";
}

type ExecSummaryAction =
  | { type: "read"; path: string; finished: boolean | null }
  | { type: "search"; path: string; query: string; finished: boolean | null }
  | { type: "list_files"; path: string; finished: boolean | null };

function execSummaryAction(record: ItemRecord): ExecSummaryAction | null {
  const direct = normalizeExecSummaryAction(recordObject(record.parsedCmd));
  if (direct) return direct;
  const actions = Array.isArray(record.commandActions)
    ? record.commandActions
    : Array.isArray(record.parsedCmd) ? record.parsedCmd : [];
  for (const raw of actions) {
    const action = normalizeExecSummaryAction(recordObject(raw));
    if (action) return action;
  }
  return null;
}

function normalizeExecSummaryAction(record: Record<string, unknown>): ExecSummaryAction | null {
  const type = stringField(record, "type");
  const finished = typeof record.isFinished === "boolean" ? record.isFinished : null;
  if (type === "read") {
    const path = stringField(record, "path") || stringField(record, "name");
    return path ? { type, path, finished } : null;
  }
  if (type === "search") {
    return {
      type,
      path: stringField(record, "path"),
      query: stringField(record, "query"),
      finished,
    };
  }
  if (type === "list_files" || type === "listFiles") {
    return {
      type: "list_files",
      path: stringField(record, "path"),
      finished,
    };
  }
  return null;
}

function displayPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  if (!trimmed) return "file";
  return trimmed.length > 80 ? `...${trimmed.slice(-77)}` : trimmed;
}

function execExitCode(record: ItemRecord): number | null {
  if (typeof record.exitCode === "number" && Number.isFinite(record.exitCode)) return record.exitCode;
  const output = recordObject(record.output);
  return typeof output.exitCode === "number" && Number.isFinite(output.exitCode) ? output.exitCode : null;
}

function webSearchDetail(record: ItemRecord): string {
  const action = webSearchActionDetail(record.action);
  const query = stringField(record, "query").trim();
  return action || query || (isItemInProgress(record) ? "Searching the web" : "Searched web");
}

function webSearchActionDetail(action: unknown): string {
  if (!action || typeof action !== "object") return "";
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "search") {
    const query = stringField(record, "query").trim();
    if (query) return cleanWebSearchQuery(query);
    const queries = Array.isArray(record.queries)
      ? record.queries.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : [])
      : [];
    if (queries.length > 1) return `${cleanWebSearchQuery(queries[0] ?? "")} ...`;
    return cleanWebSearchQuery(queries[0] ?? "");
  }
  if (type === "openPage") return stringField(record, "url").trim();
  if (type === "findInPage") {
    const pattern = stringField(record, "pattern").trim();
    const url = stringField(record, "url").trim();
    if (pattern && url) return `'${pattern}' in ${url}`;
    return pattern ? `'${pattern}'` : url;
  }
  return "";
}

const WEB_SEARCH_SITE_RE = /\bsite:([^\s]+)/giu;
const WEB_SEARCH_OR_RE = /\bOR\b/gu;

function cleanWebSearchQuery(query: string): string {
  const domains: string[] = [];
  const withoutSites = query.replace(WEB_SEARCH_SITE_RE, (match, domain: string) => {
    const normalized = normalizedSearchDomain(domain);
    if (!normalized) return match;
    if (!domains.includes(normalized)) domains.push(normalized);
    return "";
  });
  if (domains.length === 0) return query;
  const terms = withoutSites.replace(WEB_SEARCH_OR_RE, " ").replace(/\s+/gu, " ").trim();
  return terms ? `${terms} | ${domains.join(" · ")}` : query;
}

function normalizedSearchDomain(domain: string): string | null {
  try {
    return new URL(`https://${domain}`).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
}

const WEB_SEARCH_URL_RE = /\bhttps?:\/\/[^\s"'<>]+/iu;
const WEB_SEARCH_SITE_SINGLE_RE = /\bsite:([^\s]+)/iu;

export function webSearchFaviconUrl(record: ItemRecord): string | null {
  const actionUrl = webSearchActionUrl(record.action);
  if (actionUrl) return webSearchFaviconGoogleUrl(actionUrl);
  for (const query of webSearchFaviconQueryCandidates(record)) {
    const url = webSearchQueryUrl(query);
    if (url) return webSearchFaviconGoogleUrl(url);
  }
  return null;
}

function webSearchActionUrl(action: unknown): URL | null {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type !== "openPage" && type !== "findInPage") return null;
  return parseWebSearchUrl(stringField(record, "url"));
}

function webSearchFaviconQueryCandidates(record: ItemRecord): string[] {
  const action = recordObject(record.action);
  if (stringField(action, "type") === "search") {
    return [
      stringField(action, "query"),
      ...arrayStringItems(action.queries),
      stringField(record, "query"),
    ].filter((value) => value.trim().length > 0);
  }
  const query = stringField(record, "query");
  return query.trim() ? [query] : [];
}

function webSearchQueryUrl(query: string): URL | null {
  const siteMatch = WEB_SEARCH_SITE_SINGLE_RE.exec(query);
  const candidate = siteMatch?.[1] ?? WEB_SEARCH_URL_RE.exec(query)?.[0] ?? "";
  return parseWebSearchUrl(candidate);
}

function parseWebSearchUrl(value: string): URL | null {
  const cleaned = trimSearchUrlCandidate(value);
  if (!cleaned) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+\-.]*:\/\//iu.test(cleaned) ? cleaned : `https://${cleaned}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function trimSearchUrlCandidate(value: string): string {
  return value.trim().replace(/^[("'`]+|[)"'`,.;!?]+$/gu, "");
}

function webSearchFaviconGoogleUrl(url: URL): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(webSearchFaviconDomain(url.hostname))}&sz=32`;
}

function webSearchFaviconDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const secondLevel = parts.at(-2);
  const topLevel = parts.at(-1);
  if (topLevel?.length === 2 && secondLevel != null && secondLevel.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function arrayStringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => typeof item === "string" ? [item] : []) : [];
}

function toolResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  if (stringField(record, "type") === "error") return stringField(record, "error") || formatUnknown(value);
  const content = Array.isArray(record.content)
    ? record.content.map(toolResultContentText).filter(Boolean).join("\n\n")
    : "";
  const structured = record.structuredContent ?? record.structured_content;
  const structuredText = structured === null || structured === undefined ? "" : formatUnknown(structured);
  return [content, structuredText].filter(Boolean).join("\n\n") || formatUnknown(value);
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
  return `${url.protocol}//${hostname}${url.port.length > 0 ? `:${url.port}` : ""}`;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function toolResultContentText(value: unknown): string {
  if (!value || typeof value !== "object") return formatUnknown(value);
  const record = value as Record<string, unknown>;
  const type = stringField(record, "type");
  if (type === "text") return stringField(record, "text");
  if (type === "image") return `Image output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "image"}`;
  if (type === "audio") return `Audio output: ${stringField(record, "mimeType") || stringField(record, "mime_type") || "audio"}`;
  if (type === "resource_link") return `Resource: ${stringField(record, "title") || stringField(record, "name") || stringField(record, "uri")}`;
  if (type === "embedded_resource") {
    const resource = recordObject(record.resource);
    const title = stringField(resource, "title") || stringField(resource, "name") || stringField(resource, "uri") || "resource";
    const text = stringField(resource, "text");
    return text ? `Resource: ${title}\n\n${text}` : `Resource: ${title}`;
  }
  return formatUnknown(value);
}

function multiAgentRows(record: ItemRecord): MultiAgentRowViewModel[] {
  const receiverIds = multiAgentReceiverThreadIds(record);
  const action = multiAgentAction(record);
  const status = multiAgentStatus(record);
  const prompt = stringField(record, "prompt").trim();
  if (receiverIds.length === 0) {
    return [textMultiAgentRow(`row-generic-${record.id}`, multiAgentRowVerb(action, status))];
  }

  const rows: MultiAgentRowViewModel[] = receiverIds.map((threadId) => {
    const agent = multiAgentAgentPart(record, threadId);
    const stateSuffix = multiAgentStateSuffix(record, threadId);
    if (action === "spawnAgent" && status === "completed" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
        "Created ",
        agent,
        " with the instructions: ",
        { kind: "prompt", text: prompt },
      ]);
    }
    if (action === "sendInput" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
        `${multiAgentSendInputPromptVerb(status)} `,
        agent,
        ": ",
        { kind: "prompt", text: prompt },
      ]);
    }
    return agentMultiAgentRow(`row-${record.id}-${threadId}`, [
      `${multiAgentRowVerb(action, status)} `,
      agent,
      stateSuffix,
    ]);
  });

  if (action !== "spawnAgent" && action !== "sendInput" && prompt) {
    rows.push(agentMultiAgentRow(`meta-prompt-${record.id}`, ["Input: ", { kind: "prompt", text: prompt }]));
  }
  return rows;
}

function textMultiAgentRow(key: string, text: string): MultiAgentRowViewModel {
  const parts: MultiAgentRowPart[] = [{ kind: "text", text }];
  return { key, parts, text };
}

function agentMultiAgentRow(key: string, rawParts: Array<string | MultiAgentRowPart>): MultiAgentRowViewModel {
  const parts = rawParts.flatMap((part) => {
    if (typeof part !== "string") return [part];
    return part ? [{ kind: "text" as const, text: part }] : [];
  });
  return { key, parts, text: multiAgentRowText(parts) };
}

function multiAgentReceiverThreadIds(record: ItemRecord): string[] {
  const ids = new Set<string>();
  const direct = Array.isArray(record.receiverThreadIds) ? record.receiverThreadIds : [];
  for (const value of direct) {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const thread of record.receiverThreads) {
      const id = objectField(thread, "threadId") ?? objectField(thread, "id");
      if (id) ids.add(id);
    }
  }
  const states = record.agentsStates;
  if (states && typeof states === "object") {
    for (const id of Object.keys(states)) {
      if (id.trim()) ids.add(id.trim());
    }
  }
  return Array.from(ids).sort();
}

function multiAgentAction(record: ItemRecord): string {
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function multiAgentStatus(record: ItemRecord): string {
  return stringField(record, "status") || "completed";
}

function multiAgentAgentPart(record: ItemRecord, threadId: string): MultiAgentRowPart {
  const receiver = multiAgentReceiverInfo(record, threadId);
  const label = stripLeadingAt(receiver.title || shortId(threadId));
  const roleLabel = receiver.role ? `${label} (${receiver.role})` : label;
  const model = receiver.model || multiAgentSpawnModel(record);
  return {
    kind: "agent",
    color: multiAgentAgentColor(threadId),
    label: roleLabel,
    threadId,
    title: model ? `Uses ${model}` : null,
    model: model || null,
    role: receiver.role || null,
  };
}

function multiAgentReceiverInfo(record: ItemRecord, threadId: string): { model: string; role: string; title: string } {
  if (!Array.isArray(record.receiverThreads)) return { model: "", role: "", title: "" };
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    const thread = receiverRecord.thread;
    const threadRecord = thread && typeof thread === "object" ? thread as Record<string, unknown> : null;
    return {
      model: stringField(receiverRecord, "model") || (threadRecord ? stringField(threadRecord, "model") : ""),
      role: multiAgentRole(receiverRecord) || (threadRecord ? multiAgentRole(threadRecord) : ""),
      title: receiverTitle(receiverRecord, threadRecord),
    };
  }
  return { model: "", role: "", title: "" };
}

function multiAgentRole(thread: Record<string, unknown>): string {
  const raw = stringField(thread, "agentRole");
  const role = raw.trim();
  return role && role !== "default" ? role : "";
}

function receiverTitle(receiver: Record<string, unknown>, thread: Record<string, unknown> | null): string {
  return (
    stringField(receiver, "agentNickname")
    || stringField(receiver, "agentName")
    || stringField(receiver, "displayName")
    || stringField(receiver, "name")
    || (thread
      ? stringField(thread, "agentNickname")
        || stringField(thread, "agentName")
        || stringField(thread, "displayName")
        || stringField(thread, "name")
        || stringField(thread, "title")
        || stringField(thread, "preview")
      : "")
  ).trim();
}

function multiAgentSpawnModel(record: ItemRecord): string {
  return multiAgentAction(record) === "spawnAgent" ? stringField(record, "model").trim() : "";
}

function multiAgentStateSuffix(record: ItemRecord, threadId: string): string {
  const action = multiAgentAction(record);
  if (action === "closeAgent" || action === "resumeAgent") return "";
  const states = record.agentsStates;
  if (!states || typeof states !== "object") return "";
  const state = (states as Record<string, unknown>)[threadId];
  if (!state || typeof state !== "object") return "";
  const stateRecord = state as Record<string, unknown>;
  const status = multiAgentStateStatusLabel(stringField(stateRecord, "status"));
  if (!status) return "";
  const message = stringField(stateRecord, "message").trim();
  return message ? ` (${status}: ${message})` : ` (${status})`;
}

function multiAgentStateStatusLabel(status: string): string {
  switch (status) {
    case "pendingInit":
      return "pending init";
    case "notFound":
      return "not found";
    default:
      return status;
  }
}

function multiAgentRowVerb(action: string, status: string): string {
  if (action === "sendInput" && status === "completed") return "Messaged";
  if (action === "sendInput" && status === "failed") return "Failed messaging";
  if (action === "sendInput") return "Messaging";
  if (action === "spawnAgent" && status === "completed") return "Spawned";
  if (action === "spawnAgent" && status === "failed") return "Failed spawning";
  if (action === "spawnAgent") return "Spawning";
  if (action === "resumeAgent" && status === "completed") return "Resumed";
  if (action === "resumeAgent" && status === "failed") return "Failed resuming";
  if (action === "resumeAgent") return "Resuming";
  if (action === "closeAgent" && status === "completed") return "Closed";
  if (action === "closeAgent" && status === "failed") return "Failed closing";
  if (action === "closeAgent") return "Closing";
  return status === "inProgress" ? "Working with agents" : "Updated agents";
}

function multiAgentSendInputPromptVerb(status: string): string {
  if (status === "failed") return "Failed to message";
  if (status === "completed") return "Messaged";
  return "Messaging";
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArrayField(record: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = record[field];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function objectField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function stripLeadingAt(value: string): string {
  return value.trim().startsWith("@") ? value.trim().slice(1) : value.trim();
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function patchChanges(record: ItemRecord): Record<string, unknown>[] {
  if (Array.isArray(record.changes)) {
    return record.changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (!record.changes || typeof record.changes !== "object") return [];
  return Object.entries(record.changes as Record<string, unknown>).flatMap(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const change = value as Record<string, unknown>;
    return [{ ...change, path: stringField(change, "path") || path }];
  });
}

function patchKind(change: Record<string, unknown>): "add" | "delete" | "update" {
  const directType = stringField(change, "type");
  if (directType === "add" || directType === "delete") return directType;
  if (directType === "update") return "update";
  const kind = change.kind;
  if (typeof kind === "string") return kind === "add" || kind === "delete" ? kind : "update";
  if (kind && typeof kind === "object") {
    const type = stringField(kind, "type");
    return type === "add" || type === "delete" ? type : "update";
  }
  return "update";
}

function patchAction(kind: "add" | "delete" | "update"): PatchChangeViewModel["action"] {
  if (kind === "add") return "Created";
  if (kind === "delete") return "Deleted";
  return "Edited";
}

function patchPath(change: Record<string, unknown>): string {
  return stringField(change, "path") || stringField(change, "newPath") || stringField(change, "oldPath") || "file";
}
