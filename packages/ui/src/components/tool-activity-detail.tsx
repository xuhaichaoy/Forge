import { useState } from "react";
import { formatUnknown, stringField } from "../lib/format";
import {
  assistantMessageText,
  commandOutputText,
  commandText,
  formatItemDetail,
  humanReadableToolLabel,
  isItemInProgress,
  itemText,
  itemType,
  mcpAppResourceUri,
  mcpServerName,
  mcpSourceTitle,
  mcpToolName,
  type AccumulatedThreadItem,
} from "../state/render-groups";
import {
  patchChanges,
  patchKind,
  patchPath,
} from "../state/tool-activity-fields";
import { AutoReviewDetail } from "./auto-review-detail";
import { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";
import { ExecShellDetail } from "./exec-shell-detail";
import { useHiCodexIntl, type HiCodexIntlContextValue } from "./i18n-provider";
import {
  mcpDisplayResultBlocks,
  mcpResultBlocks,
  mcpStructuredResultText,
  mcpToolErrorText,
  toolResultText,
  type McpResultBlock,
} from "./tool-activity-mcp-result";
import {
  CodeBlock,
  LabeledCode,
  RawToolOutputButton,
  rawMcpToolOutputForItem,
} from "./tool-activity-code";
import { McpAppToolDetail } from "./tool-activity-mcp-app";
import { McpResultBlocksView } from "./tool-activity-mcp-blocks";
import {
  execFooter,
  execSummaryLabel,
  normalizeDesktopShellCommand,
} from "./tool-activity-exec-summary";
import {
  localizePatchChangeAction,
  patchAction,
  PatchChangePath,
  patchChangeForm,
  type PatchChangeViewModel,
} from "./tool-activity-patch-detail";
import {
  multiAgentRows,
  type MultiAgentRowPart,
  type MultiAgentRowViewModel,
} from "./tool-activity-multi-agent";
import { webSearchDetail, webSearchFaviconUrl } from "./tool-activity-web-search";

export { execShellCopyText, initialExecShellExpanded } from "./exec-shell-detail";
export type { ExecShellCopyTarget } from "./exec-shell-detail";
export { normalizeDesktopShellCommand } from "./tool-activity-exec-summary";
export type { McpResultBlock } from "./tool-activity-mcp-result";
export { multiAgentAgentColor, multiAgentRowText } from "./tool-activity-multi-agent";
export type { MultiAgentRowPart, MultiAgentRowViewModel } from "./tool-activity-multi-agent";
export { patchChangeFirstChangeLine } from "./tool-activity-patch-detail";
export { webSearchFaviconUrl } from "./tool-activity-web-search";

type ToolDetailFormatMessage = HiCodexIntlContextValue["formatMessage"];
import {
  mcpAppFrameFromResourceReadResult,
  mcpAppToolOutputFromResult,
  type McpAppDetailViewModel,
  type McpAppHostCallHandler,
  type ReadMcpResourceHandler,
} from "./mcp-app-sandbox";
import type { FileReference } from "./file-reference-types";
import type { OpenThreadHandler } from "./open-thread";

type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

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
      /* per-command lifecycle start (ItemStartedNotification.startedAtMs, stamped
         by the reducer) — drives the live "for {elapsed}" running timer.
         Optional: older items / test fixtures may omit it. */
      startedAtMs?: number | null;
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
      structuredResultText?: string;
      errorText: string;
      status: string;
      /** Typed view of MCP result.content[] blocks. */
      resultBlocks?: McpResultBlock[];
    }
  | McpAppDetailViewModel
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
      kind: "autoReview";
      id: string;
      running: boolean;
      title: string;
      body: string;
      highRiskDenied: boolean;
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
                    // per-change body — "Contents deleted" for a delete, else "No changes".
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
    // codex: local-conversation-thread-*.js — Codex
    // Desktop renders the tool item summary as just an icon + tool name +
    // chevron. "Completed / in-progress" is conveyed by a shimmer on the
    // label wrapper, not by a `MCP · completed` text badge.
    // For MCP results, Codex renders text blocks
    // directly with `max-h-48 overflow-auto whitespace-pre-wrap` — there is
    // no "Result" or "plaintext" label and no Show-N-more-lines toggle.
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
        {/* content blocks 多类型渲染（MCP spec 6 种 block）。 */}
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
           * codex: an MCP tool error renders inside the shared alert/callout
           * (alert-CoBPbdcu `yc`) at level="danger" fullWidth — NOT a "Error"-
           * labeled code block. The message sits in `text-size-chat max-h-48
           * overflow-auto whitespace-pre-wrap` inside a danger-tinted box.
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

/*
 * MCP result.content[] 多 block 渲染器（MCP spec 6 种 block 类型分别渲染）。
 * 每个 block 末尾可有 annotations 行（"Annotations: …"）。
 */
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

export function toolActivityDetailViewModel(item: ThreadItem, formatMessage?: ToolDetailFormatMessage): ToolActivityDetailViewModel {
  const type = itemType(item);
  const record = item as ItemRecord;
  const running = isItemInProgress(item);
  const status = statusLabel(record.status);
  if (type === "exec") {
    const summary = execSummaryLabel(record, running, formatMessage);
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
      startedAtMs: typeof record.startedAtMs === "number" && Number.isFinite(record.startedAtMs) ? record.startedAtMs : null,
    };
  }
  if (type === "patch") {
    const form = patchChangeForm(stringField(record, "status"), running);
    return {
      kind: "patch",
      id: item.id,
      running,
      changes: patchChanges(record).map((change) => {
        const changeKind = patchKind(change);
        return {
          action: patchAction(changeKind, form),
          kind: changeKind,
          path: patchPath(change),
          diff: stringField(change, "diff"),
        };
      }),
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
        errorText: mcpToolErrorText(record, server, tool),
        status,
      };
    }
    if (running && result == null) {
      return {
        kind: "pendingTool",
        id: item.id,
        running,
        name,
        source: mcpSourceTitle(server),
        // Codex's in-progress tool row (NS with completed:false) shows the
        // human-readable, sentence-cased tool name — no "Calling" verb prefix.
        label: humanReadableToolLabel(tool),
        status: status || "pending",
      };
    }
    const rawResultBlocks = mcpResultBlocks(record.result);
    const structuredResultText = mcpStructuredResultText(record.result);
    const resultBlocks = mcpDisplayResultBlocks(rawResultBlocks, structuredResultText);
    return {
      kind: "tool",
      id: item.id,
      running,
      name,
      toolKind: "MCP",
      argumentsText: formatUnknown(record.arguments ?? invocation.arguments),
      resultText: toolResultText(record.result),
      ...(structuredResultText ? { structuredResultText } : {}),
      errorText: mcpToolErrorText(record, server, tool),
      status,
      ...(resultBlocks.length > 0 ? { resultBlocks } : {}),
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
      kind: "autoReview",
      id: item.id,
      running,
      title: autoReviewTitle(record, formatMessage),
      body: autoReviewBody(record, formatMessage),
      highRiskDenied: stringField(record, "status") === "denied" && stringField(record, "riskLevel") === "high",
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
      rows: multiAgentRows(record, formatMessage),
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

function statusLabel(status: unknown): string {
  if (typeof status === "string") return status;
  if (status === null || status === undefined) return "";
  return formatUnknown(status);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
