import { useState } from "react";
import type { AccumulatedThreadItem } from "../state/render-groups";
import { AutoReviewDetail } from "./auto-review-detail";
import { ExecShellDetail } from "./exec-shell-detail";
import type { FileReference } from "./file-reference-types";
import { useHiCodexIntl } from "./i18n-provider";
import {
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./mcp-app-sandbox";
import { McpAppToolDetail } from "./tool-activity-mcp-app";
import { McpResultBlocksView } from "./tool-activity-mcp-blocks";
import {
  CodeBlock,
  LabeledCode,
  RawToolOutputButton,
  rawMcpToolOutputForItem,
} from "./tool-activity-code";
import {
  toolActivityDetailViewModel,
} from "./tool-activity-detail-view-model";
import {
  localizePatchChangeAction,
  PatchChangePath,
} from "./tool-activity-patch-detail";
import type { OpenThreadHandler } from "./open-thread";

export { execShellCopyText, initialExecShellExpanded } from "./exec-shell-detail";
export type { ExecShellCopyTarget } from "./exec-shell-detail";
export { normalizeDesktopShellCommand } from "./tool-activity-exec-summary";
export type { McpResultBlock } from "./tool-activity-mcp-result";
export { multiAgentAgentColor, multiAgentRowText } from "./tool-activity-multi-agent";
export type { MultiAgentRowPart, MultiAgentRowViewModel } from "./tool-activity-multi-agent";
export { patchChangeFirstChangeLine } from "./tool-activity-patch-detail";
export { webSearchFaviconUrl } from "./tool-activity-web-search";
export {
  toolActivityDetailViewModel,
} from "./tool-activity-detail-view-model";
export type {
  ToolActivityDetailViewModel,
} from "./tool-activity-detail-view-model";

/*
 * The MCP-App iframe protocol machinery now lives in ./mcp-app-sandbox. Re-export
 * the symbols that external consumers (the unit tests and the components that
 * wire up the MCP host bridge) historically imported from this module, so their
 * import paths stay byte-identical after the split.
 */
export {
  MCP_APP_HTML_MAX_BYTES,
  MCP_APP_IFRAME_SANDBOX_POLICY,
  createMcpAppBridgeNonce,
  mcpAppBackgroundColorFromValue,
  mcpAppCspMetaContent,
  mcpAppDisplayModeFromValue,
  mcpAppFrameFromResourceReadResult,
  mcpAppHtmlTooLarge,
  mcpAppSandboxSrcDoc,
  mcpAppToolInputFromArguments,
  mcpAppToolOutputFromResult,
  mcpAppToolResultForWidget,
  mcpAppWidgetDataUpdatePayload,
  mcpAppWidgetStateFromBridgeArgs,
  mcpAppWidgetStateFromValue,
  mcpAppWidgetViewPayload,
} from "./mcp-app-sandbox";
export type {
  McpAppCspViewModel,
  McpAppDisplayMode,
  McpAppFrameViewModel,
  McpAppHostCallHandler,
  McpAppHostCallRequest,
  McpAppHostMethod,
  McpAppWidgetDataUpdatePayload,
  McpAppWidgetViewPayload,
  McpResourceReadRequest,
  ReadMcpResourceHandler,
} from "./mcp-app-sandbox";

type ThreadItem = AccumulatedThreadItem;

export function ToolActivityDetail({
  forceExecExpanded = false,
  hideToolTitle = false,
  item,
  onMcpAppHostCall,
  onReadMcpResource,
  onOpenFileReference,
  onOpenThreadId,
  threadId = null,
}: {
  forceExecExpanded?: boolean;
  /*
   * codex: a standalone MCP tool-call renders the tool label ONCE in its
   * collapsible summary row; the disclosure body holds the result only (no
   * repeated title). `hideToolTitle` lets that caller drop the in-body title.
   */
  hideToolTitle?: boolean;
  item: ThreadItem;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  onOpenFileReference?: (reference: FileReference) => void;
  onOpenThreadId?: OpenThreadHandler;
  threadId?: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
  const detail = toolActivityDetailViewModel(item, formatMessage);
  const rawMcpOutput = rawMcpToolOutputForItem(item, detail.running, formatMessage);
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
                  aria-label={formatMessage({ id: "hc.toolDetail.multiAgent.openAgentAriaLabel", defaultMessage: "Open agent {label}" }, { label: part.label })}
                  className="hc-tool-detail-agent hc-tool-detail-agent-button"
                  key={`${row.key}:agent:${part.threadId}`}
                  style={{ color: part.color }}
                  title={part.title
                    ? formatMessage({ id: "hc.toolDetail.multiAgent.openAgentTitleWithDetail", defaultMessage: "Open agent {label}. {title}" }, { label: part.label, title: part.title })
                    : formatMessage({ id: "hc.toolDetail.multiAgent.openAgentAriaLabel", defaultMessage: "Open agent {label}" }, { label: part.label })}
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
  if (detail.kind === "autoReview") {
    return <AutoReviewDetail detail={detail} />;
  }
  if (detail.kind === "patch") {
    return (
      <section className={`hc-tool-detail-stack patch ${detail.running ? "is-running" : ""}`}>
        {detail.changes.length > 0
          ? detail.changes.map((change, index) => (
              <div className="hc-tool-detail-change" key={`${change.path}:${index}`}>
                <div className="hc-tool-detail-change-title">
                  <span>{localizePatchChangeAction(change.action, change.kind, formatMessage)}</span>
                  <PatchChangePath change={change} onOpenFileReference={onOpenFileReference} />
                </div>
                {change.diff
                  ? <CodeBlock diff text={change.diff} />
                  : (
                    // codex patch-item-content: a change with no unified diff shows a
                    // per-change body: "Contents deleted" for a delete, else "No changes".
                    <div className="hc-tool-detail-row">
                      {change.kind === "delete"
                        ? formatMessage({ id: "hc.toolDetail.patch.contentsDeleted", defaultMessage: "Contents deleted" })
                        : formatMessage({ id: "hc.toolDetail.patch.noFileChanges", defaultMessage: "No changes" })}
                    </div>
                  )}
              </div>
            ))
          : (
            <div className="hc-tool-detail-row">
              {/* Current protocol payloads do not expose a specific patch error code here. */}
              {/* Aligns with Codex `codex.patch.change.noChanges` = "No changes". */}
              {formatMessage({ id: "hc.toolDetail.patch.noFileChanges", defaultMessage: "No changes" })}
            </div>
          )}
      </section>
    );
  }
  if (detail.kind === "tool") {
    // codex: local-conversation-thread-*.js - Codex Desktop renders the tool
    // item summary as just an icon, tool name, and chevron. Status is conveyed
    // by row shimmer rather than an explicit "MCP completed" text badge.
    return (
      <section className={`hc-tool-detail-stack tool ${detail.running ? "is-running" : ""}`}>
        {!hideToolTitle && (
          <div className="hc-tool-detail-line">
            <span className="hc-tool-detail-title">{detail.name}</span>
          </div>
        )}
        {detail.toolKind !== "MCP" && detail.argumentsText && (
          <LabeledCode label={formatMessage({ id: "hc.toolDetail.tool.parametersLabel", defaultMessage: "Parameters" })} text={detail.argumentsText} />
        )}
        {detail.resultBlocks && detail.resultBlocks.length > 0 ? (
          <McpResultBlocksView blocks={detail.resultBlocks} />
        ) : (
          detail.resultText
            ? <div className="hc-mcp-result-text-body">{detail.resultText}</div>
            : detail.toolKind === "MCP" && !detail.structuredResultText && !detail.errorText
              ? <p className="hc-tool-detail-row">{formatMessage({ id: "codex.mcpTool.noResult", defaultMessage: "Tool returned no content" })}</p>
              : null
        )}
        {detail.structuredResultText && <CodeBlock text={detail.structuredResultText} />}
        {detail.errorText && (
          /*
           * codex: an MCP tool error renders inside the shared alert/callout at
           * level="danger" fullWidth, not as an "Error"-labeled code block.
           */
          <div className="hc-tool-error-callout" role="alert">
            <div className="hc-tool-error-callout-body">{detail.errorText}</div>
          </div>
        )}
        {rawMcpOutput && <RawToolOutputButton heading={rawMcpOutput.heading} text={rawMcpOutput.text} />}
      </section>
    );
  }
  if (detail.kind === "mcpApp") {
    return (
      <McpAppToolDetail
        detail={detail}
        onMcpAppHostCall={onMcpAppHostCall}
        onReadMcpResource={onReadMcpResource}
        rawOutput={rawMcpOutput}
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
