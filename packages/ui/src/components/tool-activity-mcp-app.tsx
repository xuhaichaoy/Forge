import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnknown } from "../lib/format";
import { useForgeIntl } from "./i18n-provider";
import {
  createMcpAppBridgeNonce,
  handleMcpAppBridgeRequest,
  MCP_APP_BRIDGE_HOST_SOURCE,
  MCP_APP_IFRAME_SANDBOX_POLICY,
  mcpAppBridgeReadyFromMessage,
  mcpAppBridgeRequestFromMessage,
  mcpAppCspMetaContent,
  mcpAppFrameFromResourceReadResult,
  mcpAppHtmlTooLarge,
  mcpAppSandboxSrcDoc,
  mcpAppWidgetDataKey,
  mcpAppWidgetViewKey,
  postMcpAppWidgetDataToPort,
  postMcpAppWidgetViewToPort,
  type McpAppDetailViewModel,
  type McpAppDisplayMode,
  type McpAppFrameViewModel,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./mcp-app-sandbox";
import {
  LabeledCode,
  RawToolOutputButton,
} from "./tool-activity-code";

export function McpAppToolDetail({
  detail,
  onMcpAppHostCall,
  onReadMcpResource,
  rawOutput,
  threadId,
}: {
  detail: McpAppDetailViewModel;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  rawOutput: { heading: string; text: string } | null;
  threadId: string | null;
}) {
  const { formatMessage } = useForgeIntl();
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
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- 故意省略 inlineFrame：inlineFrameKey 是其内容代理键（detail 投影逐渲染新引用），整对象入依赖会令 effect 每渲染重跑
  }, [detail.id, detail.resourceUri, detail.server, inlineFrameKey, onReadMcpResource, threadId]);

  const frame = resourceState.frame;
  const frameTooLarge = frame ? mcpAppHtmlTooLarge(frame.html) : false;
  const fallbackText = detail.errorText || detail.resultText || resourceState.fallbackText;
  const showRawOutput = rawOutput && resourceState.status !== "loading";

  return (
    <section className={`hc-tool-detail-stack mcp-app ${detail.running ? "is-running" : ""}`}>
      <div className="hc-mcp-app-header">
        <span className="hc-tool-detail-source">{formatMessage({ id: "hc.toolDetail.mcpApp.sourceBadge", defaultMessage: "MCP app" })}</span>
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
        <div className="hc-tool-detail-row error">{formatMessage({ id: "codex.mcpTool.mcpAppTooLarge", defaultMessage: "Failed to load MCP app: HTML exceeds the maximum supported size." })}</div>
      ) : resourceState.status === "loading" ? (
        <div
          aria-label={formatMessage({ id: "codex.mcpTool.mcpAppLoading", defaultMessage: "Loading MCP app" })}
          className="hc-mcp-app-loading"
          data-mcp-app-loading="true"
          role="status"
        />
      ) : resourceState.status === "error" ? (
        <div className="hc-tool-detail-row error">{formatMessage({ id: "codex.mcpTool.mcpAppLoadFailed", defaultMessage: "Failed to load MCP app: {message}" }, { message: resourceState.errorText })}</div>
      ) : (
        <div className="hc-tool-detail-row">{formatMessage({ id: "codex.mcpTool.mcpAppNoContent", defaultMessage: "MCP app returned no HTML content" })}</div>
      )}
      {!frame && fallbackText && <LabeledCode label={detail.errorText ? formatMessage({ id: "hc.toolDetail.errorLabel", defaultMessage: "Error" }) : formatMessage({ id: "hc.toolDetail.resultLabel", defaultMessage: "Result" })} text={fallbackText} />}
      {showRawOutput && <RawToolOutputButton heading={rawOutput.heading} inlineApp={Boolean(frame && !frameTooLarge)} text={rawOutput.text} />}
    </section>
  );
}

function McpAppSandboxFrame({
  detail,
  frame,
  onMcpAppHostCall,
  threadId,
}: {
  detail: McpAppDetailViewModel;
  frame: McpAppFrameViewModel;
  onMcpAppHostCall?: McpAppHostCallHandler;
  threadId: string | null;
}) {
  const { formatMessage } = useForgeIntl();
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
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- detail.id/frame.html 是 nonce 的有意重生成键：内容更换时强制产生新 bridge nonce（连带 srcDoc 重建）
  const bridgeNonce = useMemo(() => createMcpAppBridgeNonce(), [detail.id, frame.html]);
  const srcDoc = useMemo(() => mcpAppSandboxSrcDoc(frame, detail, bridgeNonce), [bridgeNonce, detail, frame]);
  const widgetDataKey = useMemo(() => mcpAppWidgetDataKey(detail), [detail]);
  const widgetViewKey = useMemo(() => mcpAppWidgetViewKey(detail, displayMode), [detail, displayMode]);
  const cspMetaContent = mcpAppCspMetaContent(frame.csp, bridgeNonce);

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
    let hostPort: MessagePort | null = null;

    const startBridge = () => {
      if (hostPort) return;
      const channel = new MessageChannel();
      hostPort = channel.port1;
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
        nonce: bridgeNonce,
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
    };

    const handleReady = (event: MessageEvent) => {
      if (event.source !== frameWindow || !mcpAppBridgeReadyFromMessage(event.data, bridgeNonce)) return;
      startBridge();
    };
    window.addEventListener("message", handleReady);

    return () => {
      window.removeEventListener("message", handleReady);
      if (hostPortRef.current === hostPort) hostPortRef.current = null;
      if (hostPort) hostPort.onmessage = null;
      hostPort?.close();
    };
  }, [
    bridgeNonce,
    detail,
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
    return <div className="hc-tool-detail-row error">{formatMessage({ id: "codex.mcpTool.mcpAppLoadFailed", defaultMessage: "Failed to load MCP app: {message}" }, { message: sandboxErrorText })}</div>;
  }

  return (
    <div
      className={`hc-mcp-app-frame-shell ${displayMode === "fullscreen" ? "is-fullscreen" : ""}`}
      data-mcp-app-display-mode={displayMode}
    >
      {displayMode === "fullscreen" && (
        <button
          aria-label={formatMessage({ id: "hc.toolDetail.mcpApp.exitFullscreenAriaLabel", defaultMessage: "Exit fullscreen MCP app" })}
          className="hc-mcp-app-fullscreen-exit"
          title={formatMessage({ id: "hc.toolDetail.mcpApp.exitFullscreenTooltip", defaultMessage: "Exit fullscreen" })}
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
        sandbox={MCP_APP_IFRAME_SANDBOX_POLICY}
        srcDoc={srcDoc}
        style={{ backgroundColor: backgroundColor ?? undefined, height: heightPx }}
        title={formatMessage({ id: "hc.toolDetail.mcpApp.iframeTitle", defaultMessage: "{name} MCP app" }, { name: detail.name })}
        onLoad={() => setFrameLoadNonce((current) => current + 1)}
      />
    </div>
  );
}
