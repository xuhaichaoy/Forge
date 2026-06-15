/*
 * Group classification & key layer of the tool-activity grouping projection,
 * extracted verbatim from tool-activity-grouping.ts (mechanical split): which
 * items are tool activity, their base group type, bucket/render keys, the
 * blocking out-of-band / pending-MCP rules and the exec command classifiers.
 */
import { stringField } from "../lib/format";

import { formatMessage } from "./i18n";
import type { ItemRecord, ThreadItem, ToolActivityGroupType } from "./render-group-types";
import {
  commandText,
  isCompletedRecord,
  isItemInProgress,
  itemType,
  mcpElicitationServer,
  mcpServerName,
  mcpToolName,
} from "./thread-item-fields";
import { execExitCode, multiAgentAction, multiAgentStatus } from "./tool-activity-fields";
import { explorationSummary } from "./tool-activity-grouping-exploration";

export function isToolActivityItem(item: ThreadItem): boolean {
  if (itemType(item) === "multi-agent-action") return true;
  if (itemType(item) === "automatic-approval-review") return isCompletedApprovalReviewActivity(item);
  return [
    "reasoning",
    "worked-for",
    "plan",
    "exec",
    "patch",
    "mcp-tool-call",
    "web-search",
  ].includes(itemType(item));
}

function isCompletedApprovalReviewActivity(item: ThreadItem): boolean {
  const status = stringField(item as ItemRecord, "status");
  return status === "approved" || status === "denied";
}

export function baseToolActivityGroupType(item: ThreadItem): ToolActivityGroupType {
  const type = itemType(item);
  if (type === "reasoning") return "reasoning";
  if (type === "worked-for") return "worked-for";
  if (type === "web-search") return "web-search-group";
  if (type === "multi-agent-action") return "multi-agent-group";
  if (shouldUsePendingMcpToolGroup(item)) return "pending-mcp-tool-calls";
  if (type === "exec" && explorationSummary(item)) return "exploration";
  return "collapsed-tool-activity";
}

const CURL_MUTATING_REQUEST_FLAG_RE = /(?:^|\s)(?:-X\s*|--request(?:=|\s+))(?:POST|PUT|PATCH|DELETE)\b/iu;
const CURL_MUTATING_BODY_LONG_FLAG_RE = /(?:^|\s)(?:--data(?:-[^\s=]+)?|--json|--form|--upload-file)(?:=|\s|$)/u;
const CURL_MUTATING_BODY_SHORT_FLAG_RE = /(?:^|\s)-(?:d|F|T)(?:=|\s|$)/u;

export function commandSearchesWebLikeCodexDesktop(item: ThreadItem): boolean {
  const command = commandText(item);
  if (!/^\s*curl(?:\s|$)/u.test(command)) return false;
  if (
    CURL_MUTATING_REQUEST_FLAG_RE.test(command)
    || CURL_MUTATING_BODY_LONG_FLAG_RE.test(command)
    || CURL_MUTATING_BODY_SHORT_FLAG_RE.test(command)
  ) {
    return false;
  }
  const urls = command.match(/\bhttps?:\/\/[^\s'"<>]+/giu);
  if (!urls) return false;
  const hasExternalUrl = urls.some(isExternalWebUrlLikeCodexDesktop);
  if (!hasExternalUrl) return false;
  return isItemInProgress(item) || execExitCode(item) === 0;
}

function isExternalWebUrlLikeCodexDesktop(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== "localhost" && !hostname.startsWith("127.");
  } catch {
    return false;
  }
}

export function commandCreatesFolderLikeCodexDesktop(item: ThreadItem): boolean {
  return /^\s*mkdir(?:\s|$)/u.test(commandText(item));
}

export function toolActivityGroupKey(item: ThreadItem, groupType: ToolActivityGroupType): string {
  if (groupType === "pending-mcp-tool-calls") {
    return `${groupType}:${pendingMcpToolCallSourceKey(item)}`;
  }
  if (groupType === "multi-agent-group") {
    // Codex Desktop's `K` rollup only groups terminal multi-agent actions.
    // In-progress rows stay item-scoped so a started call can be replaced by
    // its completed item instead of being hidden inside a synthetic batch.
    if (multiAgentStatus(item) === "inProgress") {
      return `${groupType}:${multiAgentAction(item)}:inProgress:${item.id}`;
    }
    return `${groupType}:${multiAgentAction(item)}:${multiAgentStatus(item)}`;
  }
  return groupType;
}

export function toolActivityRenderKey(groupType: ToolActivityGroupType, items: ThreadItem[], renderIndex: number): string {
  /*
   * The render key must stay STABLE across re-projections of the same bucket
   * while items stream in. The earlier `${first.id}:${last.id}` /
   * `${...}:${renderIndex}` shapes changed every time another item joined the
   * bucket (last.id slid forward) or another unit appeared before it in the
   * conversation (renderIndex shifted). React then unmounted + remounted the
   * whole `<ToolActivityView>`, wiping its `viewState`/timer state and forcing
   * a layout repaint — the visible "flicker" the user reported below the
   * streaming model output.
   *
   * Anchor each bucket to its first item's id (the bucket's stable identity at
   * creation time) plus the group type. The collapsed/expanded state and any
   * children that React reconciles inside still see fresh `items`/`summary`
   * props every render, so streaming updates still flow through — just
   * without a remount.
   */
  const first = items[0];
  if (!first) return `${groupType}:unknown:${renderIndex}`;
  if (groupType === "web-search-group") {
    return `${groupType}:${first.id ?? stringField(first, "query") ?? "unknown"}`;
  }
  if (groupType === "multi-agent-group") {
    return `${groupType}:${multiAgentAction(first)}:${multiAgentStatus(first)}:${first.id ?? renderIndex}`;
  }
  return `${groupType}:${first.id ?? "unknown"}`;
}

export function isBlockingOutOfBandItem(item: ThreadItem, blockedMcpServers: Set<string>): boolean {
  const type = itemType(item);
  if (type === "userInput" || type === "user-input") return !isCompletedRecord(item);
  if (type === "mcp-server-elicitation") return !isCompletedRecord(item);
  if (type === "permission-request") return !isCompletedRecord(item);
  if (isPendingApprovalItem(item)) return true;
  if (type === "mcp-tool-call" && isItemInProgress(item)) {
    const server = mcpServerName(item);
    return Boolean(server && blockedMcpServers.has(server));
  }
  return false;
}

function shouldUsePendingMcpToolGroup(item: ThreadItem): boolean {
  return itemType(item) === "mcp-tool-call"
    && isItemInProgress(item)
    && !isDesktopInlineMcpTool(item);
}

function pendingMcpToolCallSourceKey(item: ThreadItem): string {
  const source = stringField(item as ItemRecord, "source");
  if (source === "browser-use" || mcpServerName(item) === "browser-use") return "browser-use";
  const server = mcpServerName(item);
  return `server:${server || "mcp"}`;
}

export function mcpToolCallSourceName(item: ThreadItem): string | null {
  return pendingMcpToolCallSourceKey(item) === "browser-use" ? "browser-use" : null;
}

export function mcpToolCallSourceLabel(source: string): string {
  // codex: local-conversation-thread-*.js — browser-use source label is localized
  // via `localConversation.toolActivitySummary.mcpToolCalls.source.browser`.
  return source === "browser-use"
    ? formatMessage({ id: "localConversation.toolActivitySummary.mcpToolCalls.source.browser", defaultMessage: "the browser" })
    : source;
}

function isDesktopInlineMcpTool(item: ThreadItem): boolean {
  const server = mcpServerName(item);
  const tool = mcpToolName(item);
  return server === "computer-use" || (server === "node_repl" && (tool === "js" || tool === "js_reset"));
}

function isPendingApprovalItem(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.approvalRequestId == null && record.approval_request_id == null) return false;
  const type = itemType(item);
  if (type === "exec") return isItemInProgress(item);
  if (type === "patch") return isItemInProgress(item);
  return false;
}

export function blockedMcpServersFromItems(items: ThreadItem[]): Set<string> {
  const servers = new Set<string>();
  for (const item of items) {
    if (itemType(item) !== "mcp-server-elicitation" || isCompletedRecord(item)) continue;
    const server = mcpElicitationServer(item);
    if (server) servers.add(server);
  }
  return servers;
}
