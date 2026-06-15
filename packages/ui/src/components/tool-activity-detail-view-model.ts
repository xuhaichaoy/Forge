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
import { autoReviewBody, autoReviewTitle } from "./auto-review-view-model";
import type { ForgeIntlContextValue } from "./i18n-provider";
import {
  mcpAppFrameFromResourceReadResult,
  mcpAppToolOutputFromResult,
  type McpAppDetailViewModel,
} from "./mcp-app-sandbox";
import {
  mcpDisplayResultBlocks,
  mcpResultBlocks,
  mcpStructuredResultText,
  mcpToolErrorText,
  toolResultText,
  type McpResultBlock,
} from "./tool-activity-mcp-result";
import {
  execFooter,
  execSummaryLabel,
  normalizeDesktopShellCommand,
} from "./tool-activity-exec-summary";
import {
  patchAction,
  patchChangeForm,
  type PatchChangeViewModel,
} from "./tool-activity-patch-detail";
import {
  multiAgentRows,
  type MultiAgentRowViewModel,
} from "./tool-activity-multi-agent";
import { webSearchDetail, webSearchFaviconUrl } from "./tool-activity-web-search";

type ToolDetailFormatMessage = ForgeIntlContextValue["formatMessage"];
type ThreadItem = AccumulatedThreadItem;
type ItemRecord = ThreadItem & Record<string, unknown>;

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
