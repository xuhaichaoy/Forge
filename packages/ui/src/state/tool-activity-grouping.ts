import { formatUnknown, stringField } from "../lib/format";

import type { ConversationDetailLevel, ItemRecord, ThreadItem, ToolActivityGroupType, ToolActivityIcon, ToolActivitySummary } from "./render-group-types";
import { eventLabel } from "./event-projection";
import {
  assistantMessageText,
  commandLabel,
  commandOutputText,
  commandText,
  dedupe,
  durationMs,
  formatCount,
  formatDuration,
  isCompletedRecord,
  isItemInProgress,
  itemText,
  itemType,
  mcpElicitationServer,
  mcpServerName,
  mcpToolName,
  recordObject,
  statusText,
} from "./thread-item-fields";

export function formatItemDetail(item: ThreadItem): string {
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "exec") {
    const exploration = explorationDetail(item);
    if (exploration) return exploration;
    const command = commandText(item) || "command";
    const output = commandOutputText(item);
    return output ? `$ ${command}\n${output}` : `$ ${command}`;
  }
  if (type === "patch") {
    const patch = patchDetail(item);
    if (patch) return patch;
    return statusText(item);
  }
  if (type === "mcp-tool-call") {
    return `${mcpServerName(item) || "mcp"}:${mcpToolName(item) || "tool"}\n${formatUnknown(record.result ?? record.error ?? record.arguments ?? record.status)}`;
  }
  if (type === "dynamic-tool-call") {
    const name = [stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".");
    return `${name}\n${formatUnknown(record.contentItems ?? record.arguments ?? record.status)}`;
  }
  return itemText(item) || formatUnknown(item);
}

export function summarizeToolActivity(
  items: ThreadItem[],
  options: { conversationDetailLevel: ConversationDetailLevel; workedForCollapsedByDefault?: boolean },
): ToolActivitySummary {
  const activityCounts = {
    approvedRequests: 0,
    deniedRequests: 0,
    hooks: 0,
  };
  const counts = {
    commands: 0,
    webSearchCommands: 0,
    runningWebSearchCommands: 0,
    runningFolderCreationCommands: 0,
    exploredFiles: 0,
    searches: 0,
    lists: 0,
    fileChanges: 0,
    createdFiles: 0,
    editedFiles: 0,
    deletedFiles: 0,
    mcpCalls: 0,
    dynamicCalls: 0,
    webSearches: 0,
    reasoning: 0,
    plans: 0,
    other: 0,
  };
  const details: string[] = [];
  const activeDetails: string[] = [];
  let inProgress = false;
  let totalDurationMs = 0;
  let workedForDurationMs = 0;
  let workedForInProgress = false;
  let hasWorkedFor = false;
  const exploredReadKeys = new Set<string>();

  for (const item of items) {
    const itemInProgress = isItemInProgress(item);
    inProgress = inProgress || itemInProgress;
    const type = itemType(item);
    const record = item as ItemRecord;
    totalDurationMs += durationMs(item);
    if (type === "exec") {
      const exploration = explorationSummary(item);
      if (exploration) {
        for (const readKey of exploration.readKeys) exploredReadKeys.add(readKey);
        counts.exploredFiles = exploredReadKeys.size;
        counts.searches += exploration.searches;
        counts.lists += exploration.lists;
        details.push(exploration.label);
        if (itemInProgress) activeDetails.push(exploration.activeLabel);
      } else {
        counts.commands += 1;
        if (commandSearchesWebLikeCodexDesktop(item)) counts.webSearchCommands += 1;
        if (itemInProgress && commandCreatesFolderLikeCodexDesktop(item)) counts.runningFolderCreationCommands += 1;
        if (itemInProgress && commandSearchesWebLikeCodexDesktop(item)) counts.runningWebSearchCommands += 1;
        details.push(commandLabel(item));
        if (itemInProgress) {
          if (commandSearchesWebLikeCodexDesktop(item)) activeDetails.push("Searching the web");
          else if (commandCreatesFolderLikeCodexDesktop(item)) activeDetails.push("Creating folder");
          else activeDetails.push(commandLabel(item));
        }
      }
    } else if (type === "patch") {
      counts.fileChanges += 1;
      const patch = patchSummary(item);
      counts.createdFiles += patch.created;
      counts.editedFiles += patch.edited;
      counts.deletedFiles += patch.deleted;
      details.push(patch.label);
      if (itemInProgress) activeDetails.push(patch.activeLabel);
    } else if (type === "mcp-tool-call") {
      counts.mcpCalls += 1;
      const label = `Called ${mcpServerName(item) || "mcp"}:${mcpToolName(item) || "tool"}`;
      details.push(label);
      if (itemInProgress) activeDetails.push(label.replace(/^Called /, "Calling "));
    } else if (type === "dynamic-tool-call") {
      counts.dynamicCalls += 1;
      const label = `Called ${[stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".")}`;
      details.push(label);
      if (itemInProgress) activeDetails.push(label.replace(/^Called /, "Calling "));
    } else if (type === "web-search") {
      counts.webSearches += 1;
      const detail = webSearchDetailText(record);
      const label = `Searched web${detail ? ` for ${detail}` : ""}`;
      details.push(label);
      if (itemInProgress) activeDetails.push(`Searching the web${detail ? ` for ${detail}` : ""}`);
    } else if (type === "multi-agent-action") {
      const label = multiAgentActionRowLabel(item);
      details.push(label);
      if (itemInProgress) activeDetails.push(label);
    } else if (type === "automatic-approval-review") {
      const status = stringField(record, "status");
      if (status === "approved") {
        activityCounts.approvedRequests += 1;
        details.push("Approved request");
      } else if (status === "denied") {
        activityCounts.deniedRequests += 1;
        details.push("Denied request");
      } else {
        counts.other += 1;
        details.push(eventLabel(item));
      }
    } else if (type === "hook") {
      activityCounts.hooks += 1;
      const label = "Ran hook";
      details.push(label);
      if (itemInProgress) activeDetails.push("Running hook");
    } else if (type === "reasoning") {
      counts.reasoning += 1;
      if (itemInProgress) activeDetails.push("Thinking");
    } else if (type === "assistant-message") {
      counts.other += 1;
      const text = assistantMessageText(item).trim();
      details.push(text || "Assistant update");
    } else if (type === "worked-for") {
      hasWorkedFor = true;
      workedForInProgress = workedForInProgress || itemInProgress;
      workedForDurationMs += durationMs(item);
    } else if (type === "plan") {
      counts.plans += 1;
      details.push("Updated plan");
    } else if (type === "todo-list") {
      counts.plans += 1;
      details.push("Updated progress");
    } else {
      counts.other += 1;
      details.push(eventLabel(item));
    }
  }

  const groupType = hasWorkedFor
    ? "worked-for"
    : baseToolActivityGroupType(items[0] ?? ({ type: "contextCompaction", id: "unknown" } as ThreadItem));
  const groupDurationMs = hasWorkedFor ? workedForDurationMs : totalDurationMs;
  const groupInProgress = hasWorkedFor ? workedForInProgress : inProgress;
  const itemLevelLabel = directItemActivityLabel(items, {
    conversationDetailLevel: options.conversationDetailLevel,
    groupType,
    inProgress,
  });
  const groupLabel = groupType === "multi-agent-group"
    ? multiAgentGroupLabelForItems(items)
    : activityLabel(groupType, counts, groupInProgress, groupDurationMs, activityCounts);
  const activeDetail = activeDetails.at(-1) ?? null;
  const label = groupType === "multi-agent-group"
    ? groupLabel
    : groupType === "worked-for"
      ? groupLabel
    : activeDetail ?? itemLevelLabel ?? groupLabel;

  return {
    groupType,
    icon: activityIcon(groupType, counts),
    label,
    activeDetail,
    ...(groupType === "worked-for" ? { defaultExpanded: options.workedForCollapsedByDefault !== true } : {}),
    details: dedupe(details).slice(0, 8),
    inProgress,
    totalDurationMs: groupDurationMs > 0 ? groupDurationMs : totalDurationMs > 0 ? totalDurationMs : null,
    counts,
  };
}

function directItemActivityLabel(
  items: ThreadItem[],
  {
    conversationDetailLevel,
    groupType,
    inProgress,
  }: {
    conversationDetailLevel: ConversationDetailLevel;
    groupType: ToolActivityGroupType;
    inProgress: boolean;
  },
): string | null {
  if (conversationDetailLevel !== "STEPS_COMMANDS" || groupType !== "collapsed-tool-activity" || inProgress || items.length !== 1) {
    return null;
  }
  const item = items[0];
  if (!item || itemType(item) !== "exec" || explorationSummary(item)) return null;
  if (commandSearchesWebLikeCodexDesktop(item)) return null;
  return commandLabel(item);
}

function activityIcon(groupType: ToolActivityGroupType, counts: ToolActivitySummary["counts"]): ToolActivityIcon {
  if (groupType === "reasoning") return "reasoning";
  if (groupType === "exploration") return "search";
  if (groupType === "worked-for") return "clock";
  if (groupType === "pending-mcp-tool-calls") return "mcp";
  if (groupType === "todo-list" || counts.plans > 0) return "plan";
  if (groupType === "web-search-group") return "web-search";
  if (counts.webSearches > 0 || counts.webSearchCommands > 0 || counts.runningWebSearchCommands > 0) return "web-search";
  if (counts.exploredFiles > 0 || counts.searches > 0 || counts.lists > 0) return "search";
  if (counts.fileChanges > 0) return "edit";
  if (counts.commands > 0 || counts.dynamicCalls > 0) return "terminal";
  if (counts.mcpCalls > 0) return "mcp";
  return "activity";
}

function activityLabel(
  groupType: ToolActivityGroupType,
  counts: ToolActivitySummary["counts"],
  inProgress: boolean,
  totalDurationMs: number,
  activityCounts: { approvedRequests: number; deniedRequests: number; hooks?: number } = { approvedRequests: 0, deniedRequests: 0 },
): string {
  if (groupType === "reasoning") return inProgress ? "Thinking" : totalDurationMs > 0 ? `Thought for ${formatDuration(totalDurationMs)}` : "Thought";
  if (groupType === "exploration") return explorationSummaryLabel(counts, inProgress) ?? (inProgress ? "Exploring" : "Explored");
  if (groupType === "todo-list") return "Updated progress";
  if (groupType === "pending-mcp-tool-calls") return "Waiting on MCP tool";
  if (groupType === "web-search-group") return inProgress ? "Searching the web" : "Searched web";
  if (groupType === "multi-agent-group") return inProgress ? "Working with agents" : "Updated agents";
  if (groupType === "worked-for") {
    if (totalDurationMs > 0) return `${inProgress ? "Working for" : "Worked for"} ${formatDuration(totalDurationMs)}`;
    return inProgress ? "Working" : "Worked";
  }
  if (inProgress) return "Working";
  const completedLabel = completedActivitySummaryLabel(counts, activityCounts);
  if (completedLabel) return completedLabel;
  if (counts.plans > 0) return "Updated plan";
  if (counts.reasoning > 0) return "Thought";
  return "Worked";
}

function completedActivitySummaryLabel(
  counts: ToolActivitySummary["counts"],
  activityCounts: { approvedRequests: number; deniedRequests: number; hooks?: number },
): string | null {
  const segments = [
    fileChangeSummaryLabel(counts, false),
    explorationSummaryLabel(counts, false),
    requestSummarySegment("Approved", activityCounts.approvedRequests),
    requestSummarySegment("Denied", activityCounts.deniedRequests),
    activityCounts.hooks && activityCounts.hooks > 0 ? `Ran ${formatCount(activityCounts.hooks, "hook")}` : "",
    webSearchCommandSummarySegment(counts.webSearchCommands),
    ordinaryCommandSummarySegment(counts),
    counts.mcpCalls + counts.dynamicCalls > 0 ? `Called ${formatCount(counts.mcpCalls + counts.dynamicCalls, "tool")}` : "",
    counts.webSearches > 0 ? `Searched web ${formatCount(counts.webSearches, "time")}` : "",
  ].filter((value): value is string => Boolean(value));
  if (segments.length === 0) return null;
  return segments.map((segment, index) => index === 0 ? segment : lowerInitial(segment)).join(", ");
}

function webSearchCommandSummarySegment(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "Searched web" : `Searched web ${count} times`;
}

function ordinaryCommandSummarySegment(counts: ToolActivitySummary["counts"]): string {
  const ordinaryCommands = Math.max(0, counts.commands - counts.webSearchCommands);
  return ordinaryCommands > 0 ? `Ran ${formatCount(ordinaryCommands, "command")}` : "";
}

function requestSummarySegment(verb: "Approved" | "Denied", count: number): string {
  return count > 0 ? `${verb} ${formatCount(count, "request")}` : "";
}

interface ExplorationSummary {
  reads: number;
  readKeys: string[];
  searches: number;
  lists: number;
  label: string;
  activeLabel: string;
}

function explorationSummary(item: ThreadItem): ExplorationSummary | null {
  const actions = commandActions(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return null;

  const readKeys = dedupe(actions.flatMap((action) => action.type === "read" ? [explorationReadKey(action.path, item)] : []));
  const reads = readKeys.length;
  const searches = actions.filter((action) => action.type === "search").length;
  const lists = actions.filter((action) => action.type === "listFiles").length;
  if (reads + searches + lists === 0) return null;

  const activeAction = actions[actions.length - 1];
  return {
    reads,
    readKeys,
    searches,
    lists,
    label: explorationSummaryLabel({ reads, searches, lists }, false) ?? "Explored",
    activeLabel: activeAction ? explorationActionLabel(activeAction, true) : explorationSummaryLabel({ reads, searches, lists }, true) ?? "Exploring",
  };
}

function explorationReadKey(path: string, item: ThreadItem): string {
  const normalizedPath = normalizeSearchPath(path);
  if (!normalizedPath) return `unknown:${item.id}`;
  if (isAbsoluteSearchPath(normalizedPath)) return normalizeSearchPathSegments(normalizedPath);
  const cwd = normalizeSearchPath(stringField(item as ItemRecord, "cwd"));
  return normalizeSearchPathSegments(cwd ? `${cwd}/${normalizedPath}` : normalizedPath);
}

function normalizeSearchPath(value: string): string {
  return value.trim().replace(/^file:\/\//u, "").replace(/\\/gu, "/").replace(/^\.\/+/u, "");
}

function isAbsoluteSearchPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//u.test(value);
}

function normalizeSearchPathSegments(value: string): string {
  const driveMatch = /^[A-Za-z]:\//u.exec(value);
  const prefix = driveMatch ? driveMatch[0] : value.startsWith("/") ? "/" : "";
  const withoutPrefix = prefix ? value.slice(prefix.length) : value;
  const parts: string[] = [];
  for (const part of withoutPrefix.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${prefix}${parts.join("/")}`;
}

function explorationDetail(item: ThreadItem): string {
  const actions = commandActions(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return "";
  const inProgress = isItemInProgress(item);
  return actions.map((action) => explorationActionLabel(action, inProgress)).join("\n");
}

function commandActions(item: ThreadItem): Record<string, unknown>[] {
  const record = item as ItemRecord;
  const actions = record.commandActions;
  const normalizedActions = Array.isArray(actions)
    ? actions.filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
    : [];
  if (normalizedActions.length > 0) return normalizedActions;

  const parsedCmd = record.parsedCmd;
  if (Array.isArray(parsedCmd)) {
    return parsedCmd.filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object");
  }
  return parsedCmd && typeof parsedCmd === "object" ? [parsedCmd as Record<string, unknown>] : [];
}

type NormalizedCommandAction =
  | { type: "read"; path: string }
  | { type: "search"; path: string; query: string }
  | { type: "listFiles"; path: string };

function normalizeCommandAction(action: Record<string, unknown>): NormalizedCommandAction | null {
  const type = stringField(action, "type");
  if (type === "read") {
    return { type: "read", path: stringField(action, "path") || stringField(action, "name") || "file" };
  }
  if (type === "search") {
    return {
      type: "search",
      path: stringField(action, "path"),
      query: stringField(action, "query"),
    };
  }
  if (type === "listFiles" || type === "list_files") {
    return { type: "listFiles", path: stringField(action, "path") };
  }
  return null;
}

function explorationActionLabel(action: NormalizedCommandAction, inProgress: boolean): string {
  if (action.type === "read") {
    return `${inProgress ? "Reading" : "Read"} ${displayPath(action.path)}`;
  }
  if (action.type === "search") {
    if (action.path) return `${inProgress ? "Searching" : "Searched"} files in ${displayPath(action.path)}`;
    if (action.query) return `${inProgress ? "Searching" : "Searched"} for ${action.query}`;
    return `${inProgress ? "Searching" : "Searched"} files`;
  }
  return action.path
    ? `${inProgress ? "Listing" : "Listed"} files in ${displayPath(action.path)}`
    : `${inProgress ? "Listing" : "Listed"} files`;
}

function explorationSummaryLabel(
  counts: Pick<ToolActivitySummary["counts"], "exploredFiles" | "searches" | "lists"> | { reads: number; searches: number; lists: number },
  inProgress: boolean,
): string | null {
  const reads = "reads" in counts ? counts.reads : counts.exploredFiles;
  const searches = counts.searches;
  const lists = counts.lists;
  if (reads === 0 && searches === 0 && lists === 0) return null;
  if (reads === 0 && searches === 0 && lists > 0) return inProgress ? "Listing files" : "Listed files";
  const details = [
    reads > 0 ? formatCount(reads, "file") : "",
    searches > 0 ? formatCount(searches, "search") : "",
    lists > 0 ? formatCount(lists, "list") : "",
  ].filter(Boolean).join(", ");
  return `${inProgress ? "Exploring" : "Explored"} ${details}`;
}

interface PatchSummary {
  created: number;
  edited: number;
  deleted: number;
  label: string;
  activeLabel: string;
}

function patchSummary(item: ThreadItem): PatchSummary {
  const changes = patchChanges(item);
  let created = 0;
  let edited = 0;
  let deleted = 0;
  for (const change of changes) {
    const kind = patchKind(change);
    if (kind === "add") created += 1;
    else if (kind === "delete") deleted += 1;
    else edited += 1;
  }

  const lastChange = changes[changes.length - 1] ?? null;
  const lastKind = lastChange ? patchKind(lastChange) : "update";
  const lastPath = lastChange ? patchPath(lastChange) : "";
  return {
    created,
    edited,
    deleted,
    label: fileChangeSummaryLabel({ createdFiles: created, editedFiles: edited, deletedFiles: deleted }, false) ?? "Edited files",
    activeLabel: patchActionLabel(lastKind, lastPath, true),
  };
}

function patchDetail(item: ThreadItem): string {
  const inProgress = isItemInProgress(item);
  return patchChanges(item).map((change) => {
    const label = patchActionLabel(patchKind(change), patchPath(change), inProgress);
    const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
    return diff ? `${label}\n${diff}` : label;
  }).join("\n\n");
}

function patchChanges(item: ThreadItem): Record<string, unknown>[] {
  const changes = (item as ItemRecord).changes;
  if (Array.isArray(changes)) {
    return changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes as Record<string, unknown>).flatMap(([path, value]) => {
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
  if (typeof kind === "string") {
    return kind === "add" || kind === "delete" ? kind : "update";
  }
  if (kind && typeof kind === "object") {
    const type = stringField(kind, "type");
    return type === "add" || type === "delete" ? type : "update";
  }
  return "update";
}

function patchPath(change: Record<string, unknown>): string {
  return stringField(change, "path") || stringField(change, "newPath") || stringField(change, "oldPath") || "file";
}

function patchActionLabel(kind: "add" | "delete" | "update", path: string, inProgress: boolean): string {
  const target = displayPath(path || "file");
  if (kind === "add") return `${inProgress ? "Creating" : "Created"} ${target}`;
  if (kind === "delete") return `${inProgress ? "Deleting" : "Deleted"} ${target}`;
  return `${inProgress ? "Editing" : "Edited"} ${target}`;
}

function fileChangeSummaryLabel(
  counts: Pick<ToolActivitySummary["counts"], "createdFiles" | "editedFiles" | "deletedFiles">,
  inProgress: boolean,
): string | null {
  const segments = [
    counts.createdFiles > 0 ? fileChangeSegment(inProgress ? "Creating" : "Created", counts.createdFiles, "file") : "",
    counts.editedFiles > 0 ? fileChangeSegment(inProgress ? "Editing" : "Edited", counts.editedFiles, "file") : "",
    counts.deletedFiles > 0 ? fileChangeSegment(inProgress ? "Deleting" : "Deleted", counts.deletedFiles, "file") : "",
  ].filter(Boolean);
  if (segments.length === 0) return null;
  return segments.map((segment, index) => index === 0 ? segment : lowerInitial(segment)).join(", ");
}

function fileChangeSegment(verb: string, count: number, noun: string): string {
  return `${verb} ${formatCount(count, noun)}`;
}

function displayPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  if (!trimmed) return "file";
  return trimmed.length > 80 ? `...${trimmed.slice(-77)}` : trimmed;
}

function lowerInitial(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}
export function isToolActivityItem(item: ThreadItem): boolean {
  if (itemType(item) === "multi-agent-action") return true;
  if (itemType(item) === "automatic-approval-review") return isCompletedApprovalReviewActivity(item);
  if (itemType(item) === "hook") return true;
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

function commandSearchesWebLikeCodexDesktop(item: ThreadItem): boolean {
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

function commandCreatesFolderLikeCodexDesktop(item: ThreadItem): boolean {
  return /^\s*mkdir(?:\s|$)/u.test(commandText(item));
}

function execExitCode(item: ThreadItem): number | null {
  const record = item as ItemRecord;
  if (typeof record.exitCode === "number" && Number.isFinite(record.exitCode)) return record.exitCode;
  const output = recordObject(record.output);
  return typeof output.exitCode === "number" && Number.isFinite(output.exitCode) ? output.exitCode : null;
}

export function toolActivityGroupKey(item: ThreadItem, groupType: ToolActivityGroupType): string {
  if (groupType === "pending-mcp-tool-calls") {
    return `${groupType}:${mcpServerName(item) || "mcp"}`;
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
  const first = items[0];
  const last = items[items.length - 1];
  if (!first) return `${groupType}:unknown:${renderIndex}`;
  if (groupType === "web-search-group") {
    return `${groupType}:${stringField(first, "query") || "unknown"}:${renderIndex}`;
  }
  if (groupType === "multi-agent-group") {
    return `${groupType}:${multiAgentAction(first)}:${multiAgentStatus(first)}:${first.id ?? renderIndex}`;
  }
  return `${groupType}:${first?.id ?? "unknown"}:${last?.id ?? items.length}`;
}

export function isBlockingOutOfBandItem(item: ThreadItem, blockedMcpServers: Set<string>): boolean {
  const type = itemType(item);
  if (type === "userInput" || type === "user-input") return !isCompletedRecord(item);
  if (type === "mcp-server-elicitation") return !isCompletedRecord(item);
  if (type === "permission-request") return !isCompletedRecord(item);
  if (type === "auto-review-interruption-warning") return true;
  if (isPendingApprovalItem(item)) return true;
  if (type === "mcp-tool-call" && isItemInProgress(item)) {
    const server = mcpServerName(item);
    return Boolean(server && blockedMcpServers.has(server));
  }
  return false;
}

function shouldUsePendingMcpToolGroup(item: ThreadItem): boolean {
  return itemType(item) === "mcp-tool-call" && isItemInProgress(item) && !isDesktopInlineMcpTool(item);
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
function webSearchDetailText(record: ItemRecord): string {
  const actionDetail = webSearchActionDetail(record.action);
  if (actionDetail) return actionDetail;
  return stringField(record, "query").trim();
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

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function multiAgentGroupLabelForItems(items: ThreadItem[]): string {
  const first = items[0];
  if (!first) return "Updated agents";
  // Terminal replay rows can occasionally lack receiverThreadIds, so keep a
  // conservative item-count fallback for the header count.
  const receiverCount = uniqueMultiAgentReceiverThreadIds(items).length;
  const inferredCount = receiverCount > 0 ? receiverCount : items.length;
  const countLabel = inferredCount > 0 ? ` ${formatCount(inferredCount, "agent")}` : "";
  return `${multiAgentHeaderVerb(multiAgentAction(first), multiAgentStatus(first))}${countLabel}`;
}

function multiAgentActionRowLabel(item: ThreadItem): string {
  const action = multiAgentAction(item);
  const status = multiAgentStatus(item);
  const receivers = multiAgentReceiverThreadIds(item);
  const target = receivers.length > 0 ? receivers.map(shortId).join(", ") : "agent";
  const prompt = stringField(item as ItemRecord, "prompt").trim();
  const verb = multiAgentRowVerb(action, status);
  if (prompt && action === "spawnAgent" && status === "completed") {
    return `Created ${target} with the instructions: ${prompt}`;
  }
  if (prompt && action === "sendInput") {
    return `${multiAgentSendInputPromptVerb(status)} ${target}: ${prompt}`;
  }
  return `${verb} ${target}`;
}

function uniqueMultiAgentReceiverThreadIds(items: ThreadItem[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    for (const id of multiAgentReceiverThreadIds(item)) ids.add(id);
  }
  return Array.from(ids);
}

function multiAgentReceiverThreadIds(item: ThreadItem): string[] {
  const record = item as ItemRecord;
  const ids = new Set<string>();
  const direct = Array.isArray(record.receiverThreadIds) ? record.receiverThreadIds : [];
  for (const value of direct) {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const receiver of record.receiverThreads) {
      if (!receiver || typeof receiver !== "object") continue;
      const receiverRecord = receiver as Record<string, unknown>;
      const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
      if (id.trim()) ids.add(id.trim());
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

function multiAgentAction(item: ThreadItem): string {
  const record = item as ItemRecord;
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function multiAgentStatus(item: ThreadItem): string {
  return stringField(item as ItemRecord, "status") || "completed";
}

function multiAgentHeaderVerb(action: string, status: string): string {
  if (action === "spawnAgent") {
    if (status === "inProgress") return "Spawning";
    if (status === "failed") return "Failed to spawn";
    return "Spawned";
  }
  if (action === "sendInput") {
    if (status === "inProgress") return "Messaging";
    if (status === "failed") return "Failed to message";
    return "Messaged";
  }
  if (action === "resumeAgent") {
    if (status === "inProgress") return "Resuming";
    if (status === "failed") return "Failed to resume";
    return "Resumed";
  }
  if (action === "closeAgent") {
    if (status === "inProgress") return "Closing";
    if (status === "failed") return "Failed to close";
    return "Closed";
  }
  return status === "inProgress" ? "Working with agents" : "Updated agents";
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
  return multiAgentHeaderVerb(action, status);
}

function multiAgentSendInputPromptVerb(status: string): string {
  if (status === "failed") return "Failed to message";
  if (status === "completed") return "Messaged";
  return "Messaging";
}
