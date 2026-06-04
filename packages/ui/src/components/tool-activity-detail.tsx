import { Braces, Check, ChevronRight, Copy as CopyIcon, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  displayPath,
  execExitCode,
  multiAgentAction,
  multiAgentStatus,
  patchChanges,
  patchKind,
  patchPath,
  stripLeadingAt,
  threadSpawnSourceField,
  webSearchActionDetail,
} from "../state/tool-activity-fields";
import { desktopSkillPathInfoForCommandPath } from "../state/tool-activity-grouping";
import { AnimatedDisclosure } from "./animated-disclosure";
import { useHiCodexIntl } from "./i18n-provider";
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
  mcpAppToolOutputFromResult,
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

/*
 * MCP result.content[] 单个 block 的类型化表示（MCP spec 6 种 block：
 * text / image / audio / resource_link / embedded_resource / unknown）。
 */
export type McpResultBlock =
  | { kind: "text"; text: string; annotations?: string }
  | { kind: "image"; mimeType: string; dataUrl: string; annotations?: string }
  | { kind: "audio"; mimeType: string; dataUrl: string; annotations?: string }
  /*
   * Codex Desktop `case 'resource_link'` (local-conversation-thread-*.js):
   * label priority is `title ?? name ?? uri`; rendered as muted, **non-clickable**
   * "Read {resourceLinkName}" text — no `<a>` tag, no `target=_blank`.
   */
  | { kind: "resourceLink"; uri: string; name?: string; title?: string; annotations?: string }
  | { kind: "embeddedResource"; mimeType?: string; uri?: string; text?: string; annotations?: string }
  | { kind: "unknown"; raw: string };

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
  const detail = toolActivityDetailViewModel(item);
  const rawMcpOutput = rawMcpToolOutputForItem(item, detail.running);
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
                  <span>{change.action}</span>
                  <PatchChangePath change={change} onOpenFileReference={onOpenFileReference} />
                </div>
                {change.diff && <CodeBlock diff text={change.diff} />}
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
 * CODEX-REF: patch-item-content-*.js `oe` — the per-file patch path is rendered
 * as a `<button type="button">` (class `text-token-text-link-foreground
 * hover:underline`, with a `font-mono` full-path tooltip) whose `onClick` calls
 * `te({path, line:openLocation.line, ...openFile})` to open the file at the
 * first change line. `openLocation.line = firstAdditionLine ?? firstDeletionLine
 * ?? 1` (`E`/parse-diff-*.js: additionStart of the first hunk with additions,
 * else deletionStart of the first hunk with deletions, else 1).
 *
 * HiCodex maps this to `onOpenFileReference({ path, lineStart })`. When no
 * opener is wired (fixture-only renders, or surfaces that don't supply the
 * handler) the path stays a non-interactive `<code>` with a tooltip, mirroring
 * Codex's null branch (`G = z==null ? <button> : null`).
 */
function PatchChangePath({
  change,
  onOpenFileReference,
}: {
  change: PatchChangeViewModel;
  onOpenFileReference?: (reference: FileReference) => void;
}) {
  const { formatMessage } = useHiCodexIntl();
  if (!onOpenFileReference) {
    return <code title={formatMessage({ id: "hc.toolDetail.patch.openInEditorTooltip", defaultMessage: "{path} — Open in editor" }, { path: change.path })}>{change.path}</code>;
  }
  const lineStart = patchChangeFirstChangeLine(change.diff);
  return (
    <button
      aria-label={formatMessage({ id: "hc.toolDetail.patch.openFileAriaLabel", defaultMessage: "Open {path}" }, { path: change.path })}
      className="hc-tool-detail-change-path-button"
      title={change.path}
      type="button"
      onClick={() => onOpenFileReference({ path: change.path, lineStart })}
    >
      {change.path}
    </button>
  );
}

const PATCH_HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/u;

/*
 * CODEX-REF: parse-diff-*.js `E` — the file open location line is
 * `firstAdditionLine ?? firstDeletionLine ?? 1`, where `firstAdditionLine` is
 * the `+newStart` of the first hunk containing an addition line and
 * `firstDeletionLine` is the `-oldStart` of the first hunk containing a deletion
 * line (the hunk-header start values, not the exact +/- line offset).
 */
export function patchChangeFirstChangeLine(diff: string): number {
  let firstAdditionLine: number | null = null;
  let firstDeletionLine: number | null = null;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  let hunkHasAddition = false;
  let hunkHasDeletion = false;
  for (const rawLine of diff.split(/\r?\n/u)) {
    const header = PATCH_HUNK_HEADER_RE.exec(rawLine);
    if (header) {
      hunkOldStart = Number(header[1]);
      hunkNewStart = Number(header[2]);
      hunkHasAddition = false;
      hunkHasDeletion = false;
      continue;
    }
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    if (rawLine.startsWith("+")) {
      if (!hunkHasAddition && firstAdditionLine === null) firstAdditionLine = hunkNewStart;
      hunkHasAddition = true;
    } else if (rawLine.startsWith("-")) {
      if (!hunkHasDeletion && firstDeletionLine === null) firstDeletionLine = hunkOldStart;
      hunkHasDeletion = true;
    }
  }
  return firstAdditionLine ?? firstDeletionLine ?? 1;
}

/*
 * MCP result.content[] 多 block 渲染器（MCP spec 6 种 block 类型分别渲染）。
 * 每个 block 末尾可有 annotations 行（"Annotations: …"）。
 */
function McpResultBlocksView({ blocks }: { blocks: McpResultBlock[] }) {
  return (
    <div className="hc-mcp-result-blocks">
      {blocks.map((block, index) => (
        <McpResultBlockView block={block} index={index} key={`${block.kind}:${index}`} />
      ))}
    </div>
  );
}

function AutoReviewDetail({ detail }: { detail: Extract<ToolActivityDetailViewModel, { kind: "autoReview" }> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={`hc-tool-detail-stack auto-review ${detail.running ? "is-running" : ""}`}>
      <button
        aria-expanded={expanded}
        className="group/collapsed-tool-activity group/summary inline-flex w-fit max-w-full cursor-interaction items-center gap-1 self-start text-left"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {detail.highRiskDenied && (
            <TriangleAlert aria-hidden className="icon-xs shrink-0 text-token-editor-warning-foreground" />
          )}
          <span
            className={`block min-w-0 max-w-full truncate ${
              detail.highRiskDenied
                ? "text-token-editor-warning-foreground"
                : "text-token-foreground/30 group-hover/collapsed-tool-activity:text-token-foreground"
            } ${detail.running ? "hc-status-event-shimmer" : ""}`}
          >
            {detail.title}
          </span>
        </span>
        <span
          className={`inline-chevron flex-shrink-0 text-token-input-placeholder-foreground opacity-0 group-hover/summary:opacity-100 ${
            expanded ? "opacity-100" : ""
          }`}
        >
          <ChevronRight aria-hidden className={`icon-2xs text-current transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} />
        </span>
      </button>
      <AnimatedDisclosure
        className="hc-tool-details-motion"
        innerClassName="hc-tool-details"
        open={expanded}
      >
        <p className="hc-tool-detail-prose max-w-[80ch] whitespace-pre-wrap pt-1 text-size-chat leading-relaxed">
          {detail.body}
        </p>
      </AnimatedDisclosure>
    </section>
  );
}

function McpResultBlockView({ block, index }: { block: McpResultBlock; index: number }) {
  const { formatMessage } = useHiCodexIntl();
  switch (block.kind) {
    case "text":
      // codex: local-conversation-thread-*.js — MCP text blocks render in a
      // code-style container (rounded-lg border bg-token-text-code-block-background)
      // with a sticky `plaintext` header (codex.mcpTool.textBlock.plaintextTitle),
      // NOT a bare box. (The earlier "plain div, no chrome" note misread a
      // different max-h-48 variant.)
      return <McpPlaintextCard text={mcpTextBlockDisplayText(block)} />;
    case "image":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-image">
          <img alt={formatMessage({ id: "hc.toolDetail.mcp.imageResultAlt", defaultMessage: "MCP image result" })} className="hc-mcp-result-image-thumb" src={block.dataUrl} />
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    case "audio":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-audio">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={block.dataUrl} />
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    case "resourceLink": {
      /*
       * Codex Desktop (`local-conversation-thread-*.js`):
       *   defaultMessage: `Read {resourceLinkName}`,
       *   resourceLinkName: title ?? name ?? uri
       * Rendered as a muted `<div>` — explicitly NOT clickable, no `<a href>`
       * and no `target="_blank"`. HiCodex previously opened the URI as an
       * external link in a new browser tab, which leaks app-server-controlled
       * URIs to the OS and diverges from Codex's read-only semantics.
       */
      const label = block.title || block.name || block.uri;
      return (
        <div className="hc-mcp-result-block hc-mcp-result-resource-link">
          <div className="hc-mcp-result-resource-link-text">{formatMessage({ id: "codex.mcpTool.resourceLink.reading", defaultMessage: "Read {resourceLinkName}" }, { resourceLinkName: label })}</div>
          {block.annotations && <small className="hc-mcp-result-annotations">{formatMessage({ id: "codex.mcpTool.contentBlock.annotationsLine", defaultMessage: "Annotations: {annotations}" }, { annotations: block.annotations })}</small>}
        </div>
      );
    }
    case "embeddedResource":
      return (
        <div className="hc-mcp-result-block hc-mcp-result-embedded-resource">
          {block.uri && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.uriLabel", defaultMessage: "URI" })}</span><code>{block.uri}</code>
            </div>
          )}
          {block.mimeType && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.mimeTypeLabel", defaultMessage: "MIME type" })}</span><code>{block.mimeType}</code>
            </div>
          )}
          {block.annotations && (
            <div className="hc-mcp-result-resource-meta">
              <span>{formatMessage({ id: "codex.mcpTool.embeddedResource.annotationsLabel", defaultMessage: "Annotations" })}</span><span>{block.annotations}</span>
            </div>
          )}
          {block.text && <LabeledCode label={formatMessage({ id: "codex.mcpTool.embeddedResource.contentLabel", defaultMessage: "Content" })} text={block.text} />}
        </div>
      );
    case "unknown":
    default:
      return (
        <div className="hc-mcp-result-block hc-mcp-result-unknown">
          <CodeBlock text={block.raw} />
        </div>
      );
  }
}

function mcpTextBlockDisplayText(block: Extract<McpResultBlock, { kind: "text" }>): string {
  return block.annotations ? `${block.text}\nAnnotations: ${block.annotations}` : block.text;
}

/*
 * codex: local-conversation-thread-*.js — MCP text content blocks render in a
 * CODE-STYLE container, not a bare box: a
 * `rounded-lg border border-token-input-background bg-token-text-code-block-background`
 * card with a sticky header `flex items-center justify-between py-1 ps-2 pe-2
 * font-sans text-sm text-token-description-foreground select-none` whose title is
 * `codex.mcpTool.textBlock.plaintextTitle` (defaultMessage "plaintext"), above the
 * scrollable `max-h-48` text body. (The header's right slot is an empty `flex`
 * placeholder in Desktop.)
 */
function McpPlaintextCard({ text }: { text: string }) {
  const { formatMessage } = useHiCodexIntl();
  return (
    <div className="hc-mcp-result-text">
      <div className="hc-mcp-result-text-header">
        <span className="hc-mcp-result-text-title">
          {formatMessage({ id: "codex.mcpTool.textBlock.plaintextTitle", defaultMessage: "plaintext" })}
        </span>
        <span className="hc-mcp-result-text-header-actions" aria-hidden="true" />
      </div>
      <div className="hc-mcp-plaintext-body">{text}</div>
    </div>
  );
}

function McpAppToolDetail({
  detail,
  onMcpAppHostCall,
  onReadMcpResource,
  rawOutput,
  threadId,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
  onMcpAppHostCall?: McpAppHostCallHandler;
  onReadMcpResource?: ReadMcpResourceHandler;
  rawOutput: { heading: string; text: string } | null;
  threadId: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
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
  detail: Extract<ToolActivityDetailViewModel, { kind: "mcpApp" }>;
  frame: McpAppFrameViewModel;
  onMcpAppHostCall?: McpAppHostCallHandler;
  threadId: string | null;
}) {
  const { formatMessage } = useHiCodexIntl();
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

/*
 * codex: the embedded exec header (`Nv` `he`) labels the block by SHELL TYPE,
 * derived from the command's leading program — `Lv(Av(command))`. `Av` (= `jv` +
 * `Mv`) extracts the first token's basename (after quote-stripping + path split)
 * and maps a known shell executable to its shell type (`x` = the `mm` map); `Lv`
 * maps that type to a display name (`y` = the `hm` map), defaulting to "Shell".
 * So normal commands (git/npm/…) show "Shell"; a bare shell invocation
 * (bash/zsh/pwsh/sh/cmd, incl. `.exe`) shows that shell's name.
 */
const EXEC_SHELL_EXECUTABLES: Record<string, string> = {
  bash: "bash",
  "bash.exe": "bash",
  "git-bash.exe": "bash",
  cmd: "cmd",
  "cmd.exe": "cmd",
  powershell: "powershell",
  "powershell.exe": "powershell",
  pwsh: "powershell",
  "pwsh.exe": "powershell",
  sh: "sh",
  "sh.exe": "sh",
  zsh: "zsh",
  "zsh.exe": "zsh",
};
const EXEC_SHELL_DISPLAY_NAMES: Record<string, string> = {
  bash: "bash",
  cmd: "cmd",
  powershell: "PowerShell",
  sh: "sh",
  zsh: "zsh",
};

function execShellBasename(token: string): string {
  // codex Mv: e.split(/[/\\]/).at(-1) ?? e
  const parts = token.split(/[/\\]/);
  return parts[parts.length - 1] || token;
}

function execShellProgramName(command: string): string | null {
  // codex jv: trim → unwrap a leading quote → first whitespace token → basename
  let t = command.trim();
  if (t.length === 0) return null;
  const quoted = t.match(/^(['"])(.*?)\1/);
  const inner = quoted?.[2];
  if (inner != null) {
    if (quoted![0].length === t.length) {
      t = inner.trim();
    } else {
      return execShellBasename(inner);
    }
  }
  const token = t.match(/^\S+/)?.[0];
  return token == null ? null : execShellBasename(token);
}

function execShellTypeLabel(command: string): string {
  const program = execShellProgramName(command);
  const shellType = program == null ? null : EXEC_SHELL_EXECUTABLES[program.toLowerCase()] ?? null;
  return shellType == null ? "Shell" : EXEC_SHELL_DISPLAY_NAMES[shellType];
}

function ExecShellDetail({
  detail,
  forceExpanded = false,
}: {
  detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>;
  forceExpanded?: boolean;
}) {
  const { formatMessage } = useHiCodexIntl();
  const [expanded, setExpanded] = useState(() => initialExecShellExpanded(detail));
  const [copiedTarget, setCopiedTarget] = useState<ExecShellCopyTarget | null>(null);
  /*
   * CODEX-REF: local-conversation-thread-*.js — exec command-line clamp:
   *   useState(null) tracks the expanded command id;
   *   apply `line-clamp-2` until expanded;
   *   one click permanently expands, with no reverse collapse.
   * `forceExpanded` 场景 (e.g. file preview panel) 期望命令本身也直接全显，
   * 因此初始值跟随 forceExpanded。
   */
  const [commandExpanded, setCommandExpanded] = useState<boolean>(forceExpanded);
  const bodyOpen = forceExpanded || detail.running || expanded;
  const output = detail.output || (!detail.running && detail.footer ? formatMessage({ id: "codex.shell.noOutput", defaultMessage: "No output" }) : "");

  /*
   * Keep running output pinned to the newest line — but ONLY when the user is
   * already at the bottom. codex: local-conversation-thread `Xp` recomputes an
   * at-bottom flag on every scroll (`scrollHeight - scrollTop - clientHeight <=
   * Yp`, Yp=24) and the content-change effect bails when not at bottom, so a
   * manual scroll-up is never yanked back down.
   */
  const outputRef = useRef<HTMLPreElement | null>(null);
  const outputAtBottomRef = useRef<boolean>(true);
  const onOutputScroll = () => {
    const el = outputRef.current;
    if (!el) return;
    outputAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
  };
  useEffect(() => {
    if (!detail.running || !bodyOpen) return;
    const el = outputRef.current;
    if (!el || !outputAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [bodyOpen, detail.output, detail.running]);

  useEffect(() => {
    setExpanded(initialExecShellExpanded(detail));
    setCommandExpanded(forceExpanded);
  }, [detail.id, forceExpanded]);

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
    /*
     * Codex embedded Nv renders one continuous monospace run `$ {command}`, no
     * separate $ span and NO chevron — the command row is not a body disclosure.
     */
    <code>$ {detail.command}</code>
  );

  return (
    <section
      className={`hc-exec-shell ${detail.running ? "is-running" : ""}`}
      data-shell-state={bodyOpen ? "expanded" : "collapsed"}
    >
      {/*
       * Codex Nv embedded card = a flex column `[he, ve, ye]`. For embedded:
       * `he` (the shell-TYPE header below) renders, the full `ve` header bar
       * (shellName + cwd + copy-shell-contents + collapse/expand) is gated to
       * variant==="default" so in-thread cards omit it, and the body `ye` shows
       * UNCONDITIONALLY (`<div className="relative overflow-hidden">{me}</div>`,
       * no collapse). Card-level copy is omitted (Codex exposes only the scoped
       * per-command / per-output copy); the command row's only click affordance
       * is un-clamping its own `line-clamp-2` (F = () => b(D)), NOT a body toggle.
       */}
      {!forceExpanded && (
        /*
         * codex `he` (embedded only): a muted shell-TYPE label row above the
         * command — `Lv(Av(command))`, i.e. "Shell" for normal commands or the
         * shell name (bash/zsh/PowerShell/…) when the command is a bare shell.
         */
        <div className="hc-exec-shell-header">
          <span>{execShellTypeLabel(detail.command)}</span>
        </div>
      )}
      <div className="hc-exec-shell-command-row">
        {!forceExpanded ? (
          <button
            className="hc-exec-shell-command hc-exec-shell-toggle"
            type="button"
            data-command-expanded={commandExpanded || undefined}
            onClick={() => {
              /*
               * Codex `Nv` 的 F = () => b(D) —— 点击命令一次性把 y 设为 D，
               * `line-clamp-2` 永久解除（无反向折叠）。命令点击只解夹紧自身，
               * 不再控制 output/footer 的可见性。
               */
              setCommandExpanded(true);
            }}
          >
            {commandContent}
          </button>
        ) : (
          <div className="hc-exec-shell-command" data-command-expanded={commandExpanded || undefined}>
            {commandContent}
          </div>
        )}
        <ExecShellCopyButton
          className="hc-exec-shell-command-copy"
          copied={copiedTarget === "command"}
          label={copiedTarget === "command" ? formatMessage({ id: "copyButton.copied", defaultMessage: "Copied" }) : formatMessage({ id: "codex.shell.copyCommand", defaultMessage: "Copy command" })}
          onClick={() => copyTarget("command")}
        />
      </div>
      {/*
       * Codex embedded Nv: the output block `ue` is a sibling of the command row
       * inside `pe = <div className="relative">…</div>` and renders
       * UNCONDITIONALLY (only gated on whether there IS output text — `W = w ? a :
       * l ? "" : E`). It is NOT hidden behind a body toggle, so HiCodex shows it
       * whenever `output` is present rather than gating on `bodyOpen`.
       */}
      {output && (
        <div className="hc-exec-shell-output-wrap">
          <pre className="hc-exec-shell-output" ref={outputRef} onScroll={onOutputScroll}>
            <code>{output}</code>
          </pre>
          <ExecShellCopyButton
            className="hc-exec-shell-output-copy"
            copied={copiedTarget === "output"}
            label={copiedTarget === "output" ? formatMessage({ id: "copyButton.copied", defaultMessage: "Copied" }) : formatMessage({ id: "codex.shell.copyOutput", defaultMessage: "Copy output" })}
            onClick={() => copyTarget("output")}
          />
        </div>
      )}
      {/* Codex embedded: the footer (zv) is the second child of the card wrapper and always renders. */}
      {renderExecFooter(detail)}
    </section>
  );
}

/*
 * Derive a compact footer state from the existing exec view model. Newer data
 * can set a structured status; older fixtures still arrive as footer strings.
 */
function renderExecFooter(detail: Extract<ToolActivityDetailViewModel, { kind: "exec" }>): ReactNode {
  if (detail.running) {
    return <div aria-hidden="true" className="hc-exec-shell-footer" data-exec-status="in-progress" />;
  }
  if (!detail.footer) return null;
  const isSuccess = detail.footer === "Success";
  const isStopped = detail.footer === "Stopped";
  const isExitCodeFailure = detail.footer.startsWith("Exit code ") && detail.footer !== "Exit code unknown";
  const status = isStopped
    ? "interrupted"
    : isSuccess
      ? "success"
      : isExitCodeFailure
        ? "failed"
        : "unknown";
  return (
    <div className="hc-exec-shell-footer" data-exec-status={status}>
      {/* codex `zv` exec footer: only the success branch carries an icon (a check); Stopped/Exit-code are text-only. */}
      {isSuccess && <Check aria-hidden className="hc-exec-footer-icon-success" size={12} />}
      <span>{detail.footer}</span>
    </div>
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
      startedAtMs: typeof record.startedAtMs === "number" && Number.isFinite(record.startedAtMs) ? record.startedAtMs : null,
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
      title: autoReviewTitle(record),
      body: autoReviewBody(record),
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

function autoReviewTitle(record: ItemRecord): string {
  const status = stringField(record, "status");
  if (status === "approved") return "Auto-review approved";
  if (status === "denied") return stringField(record, "riskLevel") === "high" ? "Auto-review denied high risk" : "Auto-review denied";
  if (status === "timedOut") return "Auto-review timed out";
  if (status === "aborted") return "Auto-review stopped";
  return "Auto-reviewing";
}

function autoReviewBody(record: ItemRecord): string {
  const rationale = stringField(record, "rationale").trim();
  if (rationale) return rationale;
  const status = stringField(record, "status");
  if (status === "inProgress") {
    return "A carefully prompted reviewer agent is reviewing this request before Codex runs it.";
  }
  if (status === "aborted") {
    return "A carefully prompted reviewer agent stopped reviewing this request before Codex ran it.";
  }
  if (status === "timedOut") {
    return "A carefully prompted reviewer agent timed out before Codex ran this request.";
  }
  return "A carefully prompted reviewer agent reviewed this request.";
}

function rawMcpToolOutputForItem(item: ThreadItem, running: boolean): { heading: string; text: string } | null {
  if (itemType(item) !== "mcp-tool-call") return null;
  const record = item as ItemRecord;
  if (running && record.result == null) return null;
  const server = mcpServerName(item) || "mcp";
  const tool = mcpToolName(item) || "tool";
  const invocation = recordObject(record.invocation);
  const fallbackInvocation = {
    server: stringField(record, "server") || server,
    tool: stringField(record, "tool") || tool,
    arguments: record.arguments ?? null,
  };
  return {
    heading: `Raw ${server}.${tool} tool call output`,
    text: formatJsonForRawMcpOutput({
      callId: stringField(record, "callId") || record.id,
      invocation: Object.keys(invocation).length > 0 ? invocation : fallbackInvocation,
      durationMs: typeof record.durationMs === "number" && Number.isFinite(record.durationMs) ? record.durationMs : null,
      result: record.result ?? null,
    }),
  };
}

function formatJsonForRawMcpOutput(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, rawValue) => typeof rawValue === "bigint" ? rawValue.toString() : rawValue, 2) ?? "null";
  } catch {
    return formatUnknown(value);
  }
}

function RawToolOutputButton({ heading, inlineApp = false, text }: { heading: string; inlineApp?: boolean; text: string }) {
  const { formatMessage } = useHiCodexIntl();
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const dialog = open ? (
    <div
      className="hc-tool-raw-output-overlay"
      onClick={() => setOpen(false)}
    >
      <section
        aria-label={heading}
        aria-modal="true"
        className="hc-tool-raw-output-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // codex: Radix dialog closes on Escape; match it (the other HiCodex dialogs do).
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header>
          <h2>{heading}</h2>
          <button
            aria-label={formatMessage({ id: "hc.toolDetail.rawOutput.closeAriaLabel", defaultMessage: "Close raw tool call output" })}
            type="button"
            autoFocus
            onClick={() => setOpen(false)}
          >
            <X size={15} />
          </button>
        </header>
        <div className="hc-tool-raw-output-body">
          <CodeBlock text={text} />
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className={`hc-tool-raw-output ${inlineApp ? "is-inline-app" : ""}`}>
      <button
        aria-label={formatMessage({ id: "codex.mcpTool.rawOutputTriggerTooltip", defaultMessage: "Show raw tool call output" })}
        className="hc-tool-raw-output-trigger"
        title={formatMessage({ id: "codex.mcpTool.rawOutputTriggerTooltip", defaultMessage: "Show raw tool call output" })}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Braces size={13} />
      </button>
      {dialog && (typeof document === "undefined" ? dialog : createPortal(dialog, document.body))}
    </div>
  );
}

function LabeledCode({ label, text }: { label: string; text: string }) {
  return (
    <div className="hc-tool-detail-section">
      <div className="hc-tool-detail-section-label">{label}</div>
      <CodeBlock text={text} />
    </div>
  );
}

/* Fold long tool arguments/results behind a short preview. */
function CollapsibleLabeledCode({
  label,
  text,
  defaultCollapsed = true,
  collapseThresholdLines = 6,
}: {
  label: string;
  text: string;
  defaultCollapsed?: boolean;
  collapseThresholdLines?: number;
}) {
  const { formatMessage } = useHiCodexIntl();
  const lines = text.split(/\r?\n/);
  const isLong = lines.length > collapseThresholdLines;
  const [collapsed, setCollapsed] = useState(defaultCollapsed && isLong);
  const displayed = collapsed ? lines.slice(0, collapseThresholdLines).join("\n") : text;
  const hiddenCount = lines.length - collapseThresholdLines;
  return (
    <div className="hc-tool-detail-section">
      <div className="hc-tool-detail-section-label">
        <span>{label}</span>
        {isLong && (
          <button
            aria-expanded={!collapsed}
            className="hc-tool-detail-collapsible-toggle"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed
              ? formatMessage({ id: "hc.toolDetail.code.showMoreLines", defaultMessage: "Show {count} more lines" }, { count: hiddenCount })
              : formatMessage({ id: "hc.toolDetail.code.showLess", defaultMessage: "Show less" })}
          </button>
        )}
      </div>
      <CodeBlock text={collapsed && isLong ? `${displayed}\n…` : text} />
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
  const skillLabel = execSkillSummaryLabel(action, stringField(record, "cwd"), running);
  if (skillLabel) return skillLabel;
  if (action.type === "read") {
    if (running && !action.finished) return "";
    return `${action.finished === false ? "Reading" : "Read"} ${displayPath(action.name || action.path)}`;
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

function execSkillSummaryLabel(action: ExecSummaryAction, cwd: string, running: boolean): string {
  if (action.type === "read") {
    const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
    if (!skillInfo) return "";
    if (skillInfo.isSkillDefinitionFile && (running || action.finished === false)) {
      return `Reading ${skillInfo.skillName} skill`;
    }
    return `Read ${skillInfo.skillName} skill`;
  }
  if (action.type === "list_files") {
    const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
    return skillInfo ? `Listed files in ${skillInfo.skillName} skill` : "";
  }
  const skillInfo = desktopSkillPathInfoForCommandPath(action.path, cwd);
  if (!skillInfo) return "";
  const query = action.query.trim();
  return query
    ? `Searched for ${query} in ${skillInfo.skillName} skill`
    : `Searched in ${skillInfo.skillName} skill`;
}

type ExecSummaryAction =
  | { type: "read"; path: string; name: string; finished: boolean | null }
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
    return path ? { type, path, name: stringField(record, "name"), finished } : null;
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

function webSearchDetail(record: ItemRecord): string {
  const action = webSearchActionDetail(record.action);
  const query = stringField(record, "query").trim();
  return action || query || (isItemInProgress(record) ? "Searching the web" : "Searched web");
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

/* Parse MCP result.content[] into typed render blocks. */
function mcpResultBlocks(value: unknown): McpResultBlock[] {
  const record = recordObject(value);
  const content = Array.isArray(record.content) ? record.content : [];
  return content.flatMap((rawBlock): McpResultBlock[] => {
    if (!rawBlock || typeof rawBlock !== "object") {
      return [{ kind: "unknown", raw: formatUnknown(rawBlock) }];
    }
    const blockRecord = rawBlock as Record<string, unknown>;
    const blockType = stringField(blockRecord, "type");
    const annotations = formatAnnotations(blockRecord.annotations);
    switch (blockType) {
      case "text": {
        const text = stringField(blockRecord, "text");
        return text ? [{ kind: "text", text, annotations }] : [];
      }
      case "image": {
        const mimeType = stringField(blockRecord, "mimeType") || "image/png";
        const data = stringField(blockRecord, "data");
        if (!data) return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
        const dataUrl = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
        return [{ kind: "image", mimeType, dataUrl, annotations }];
      }
      case "audio": {
        const mimeType = stringField(blockRecord, "mimeType") || "audio/mpeg";
        const data = stringField(blockRecord, "data");
        if (!data) return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
        const dataUrl = data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
        return [{ kind: "audio", mimeType, dataUrl, annotations }];
      }
      case "resource_link":
      case "resourceLink": {
        /*
         * Codex prefers `title` over `name` when both are present
         * (local-conversation-thread-*.js `n.title ?? n.name ?? n.uri`).
         */
        const uri = stringField(blockRecord, "uri");
        const name = stringField(blockRecord, "name");
        const title = stringField(blockRecord, "title");
        return uri ? [{ kind: "resourceLink", uri, name, title, annotations }] : [];
      }
      case "embedded_resource":
      case "embeddedResource":
      case "resource": {
        /*
         * Codex `case 'embedded_resource'`:
         *   let e = n.resource.text ?? n.resource.blob ?? "";
         * `blob` is base64-encoded binary; falling back keeps the content
         * pane non-empty when the server returned a binary payload.
         */
        const resource = recordObject(blockRecord.resource);
        const text = stringField(resource, "text") || stringField(resource, "blob") || undefined;
        return [{
          kind: "embeddedResource",
          mimeType: stringField(resource, "mimeType") || undefined,
          uri: stringField(resource, "uri") || undefined,
          text,
          annotations: formatAnnotations(resource.annotations),
        }];
      }
      case "unknown":
        return [{ kind: "unknown", raw: formatUnknown(blockRecord.raw ?? blockRecord) }];
      default:
        return [{ kind: "unknown", raw: formatUnknown(blockRecord) }];
    }
  });
}

function formatAnnotations(value: unknown): string | undefined {
  /*
   * Codex Desktop's annotation formatter (local-conversation-thread-*.js)
   * extracts three known MCP annotation fields — `audience`, `priority`,
   * `lastModified` — and joins them with "; ". Any other JSON keys (which
   * the MCP spec leaves implementation-defined) are intentionally dropped.
   *
   *   function ix(e) {
   *     if (e == null) return null;
   *     const t = [];
   *     if (e.audience != null && e.audience.length > 0) t.push(`audience=${e.audience.join(", ")}`);
   *     if (e.priority != null) t.push(`priority=${String(e.priority)}`);
   *     if (e.lastModified != null) t.push(`lastModified=${e.lastModified}`);
   *     return t.length === 0 ? null : t.join("; ");
   *   }
   *
   * Previous HiCodex behavior dumped the entire annotations object via
   * `formatUnknown` (multi-line JSON), which Codex never displays.
   */
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  const audience = record.audience;
  if (Array.isArray(audience) && audience.length > 0) {
    parts.push(`audience=${audience.filter((entry) => typeof entry === "string").join(", ")}`);
  }
  if (record.priority != null) {
    parts.push(`priority=${String(record.priority)}`);
  }
  if (record.lastModified != null) {
    parts.push(`lastModified=${String(record.lastModified)}`);
  }
  return parts.length === 0 ? undefined : parts.join("; ");
}

function toolResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  if (stringField(record, "type") === "error") return "";
  const isProtocolMcpResult = Array.isArray(record.content)
    || "structuredContent" in record
    || "structured_content" in record
    || "_meta" in record;
  if (isProtocolMcpResult) {
    return Array.isArray(record.content)
      ? record.content.map(toolResultContentText).filter(Boolean).join("\n\n")
      : "";
  }
  return formatUnknown(value);
}

function mcpToolErrorText(record: Record<string, unknown>, server = "", tool = ""): string {
  const result = recordObject(record.result);
  let errorText = "";
  if (stringField(result, "type") === "error") {
    errorText = stringField(result, "error") || stringField(recordObject(result.rawError), "message") || formatUnknown(result);
    return computerUseMcpToolErrorText(server, tool, errorText);
  }
  const error = record.error;
  if (error === null || error === undefined) return "";
  const message = stringField(recordObject(error), "message");
  errorText = message || formatUnknown(error);
  return computerUseMcpToolErrorText(server, tool, errorText);
}

function computerUseMcpToolErrorText(server: string, tool: string, errorText: string): string {
  if (normalizeMcpName(server) !== "computeruse") return errorText;
  if (!/timeout|timed out|awaiting tools\/call/i.test(errorText)) return errorText;
  return [
    errorText,
    "",
    `Computer Use diagnostics: ${server || "computer-use"}:${tool || "tool"} timed out in the downstream MCP tools/call path. Check helper signatures, Screen Recording, Accessibility, app approvals, MCP startup or restart state, and whether a native prompt is blocking the helper.`,
  ].join("\n");
}

function normalizeMcpName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mcpStructuredResultText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const record = recordObject(value);
  const structured = record.structuredContent ?? record.structured_content;
  if (structured === null || structured === undefined) return "";
  return formatUnknown(structured);
}

function mcpDisplayResultBlocks(blocks: McpResultBlock[], structuredResultText: string): McpResultBlock[] {
  if (!structuredResultText || blocks.length !== 1) return blocks;
  const [block] = blocks;
  if (block?.kind !== "text" || block.annotations) return blocks;
  return parseJsonText(block.text) === structuredResultText ? [] : blocks;
}

function parseJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return "";
  try {
    return formatUnknown(JSON.parse(trimmed));
  } catch {
    return "";
  }
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
    if (action === "spawnAgent" && status !== "failed" && prompt) {
      // Codex renders "Created {agent} with the instructions: {instructions}"
      // (multiAgentAction.row) as soon as the agent is spawned — while the
      // group header still reads "Spawning N agents" AND after completion.
      // Only the failed state falls back to the "Failed spawning" verb row.
      // HiCodex previously gated this on status === "completed", so an
      // in-progress spawn showed a bare "Spawning" verb instead of the named
      // instructions row. Re-verified vs Codex Desktop v26.519.81530.
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

function multiAgentAgentPart(record: ItemRecord, threadId: string): MultiAgentRowPart {
  const receiver = multiAgentReceiverInfo(record, threadId);
  const label = stripLeadingAt(receiver.title || agentFallbackName(threadId));
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
  const role = (stringField(thread, "agentRole") || threadSpawnSourceField(thread, "agent_role", "agentRole")).trim();
  return role && role !== "default" ? role : "";
}

function receiverTitle(receiver: Record<string, unknown>, thread: Record<string, unknown> | null): string {
  return (
    stringField(receiver, "agentNickname")
    || threadSpawnSourceField(receiver, "agent_nickname", "agentNickname")
    || stringField(receiver, "agentName")
    || stringField(receiver, "displayName")
    || stringField(receiver, "name")
    || (thread
      ? stringField(thread, "agentNickname")
        || threadSpawnSourceField(thread, "agent_nickname", "agentNickname")
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

function objectField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function agentFallbackName(id: string): string {
  return id ? `agent-${id.slice(0, 8)}` : "agent";
}

function patchAction(kind: "add" | "delete" | "update"): PatchChangeViewModel["action"] {
  if (kind === "add") return "Created";
  if (kind === "delete") return "Deleted";
  return "Edited";
}
