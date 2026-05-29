import { formatUnknown, stringField } from "../lib/format";

import type { ConversationDetailLevel, ItemRecord, ThreadItem, ToolActivityGroupType, ToolActivityIcon, ToolActivitySummary } from "./render-group-types";
import { eventLabel } from "./event-projection";
import {
  assistantMessageText,
  commandLabel,
  commandLabelParts,
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
  options: {
    conversationDetailLevel: ConversationDetailLevel;
    workedForCollapsedByDefault?: boolean;
    /**
     * Forced group type from the caller's bucket grouping. When `pushActivityItem`
     * has aggregated cross-type mergeable items (Codex `W` segment), it sets this
     * to `"collapsed-tool-activity"` so the summary label uses the cross-type count
     * formatter ("Explored 1 file, ran 2 commands, searched web 4 times") rather
     * than the single-type label derived from `items[0]`.
     */
    groupTypeOverride?: ToolActivityGroupType;
  },
): ToolActivitySummary {
  const activityCounts = {
    approvedRequests: 0,
    deniedRequests: 0,
  };
  const counts = {
    commands: 0,
    runningCommands: 0,
    webSearchCommands: 0,
    runningWebSearchCommands: 0,
    runningFolderCreationCommands: 0,
    exploredFiles: 0,
    searches: 0,
    lists: 0,
    fileChanges: 0,
    createdFiles: 0,
    runningCreatedFiles: 0,
    stoppedCreatedFiles: 0,
    runningCreatedLineCount: 0,
    editedFiles: 0,
    runningEditedFiles: 0,
    deletedFiles: 0,
    runningDeletedFiles: 0,
    mcpCalls: 0,
    dynamicCalls: 0,
    webSearches: 0,
    reasoning: 0,
    plans: 0,
    other: 0,
    approvedRequests: 0,
    deniedRequests: 0,
  };
  const details: string[] = [];
  const activeDetails: string[] = [];
  let inProgress = false;
  let totalDurationMs = 0;
  let workedForDurationMs = 0;
  let workedForInProgress = false;
  let hasWorkedFor = false;
  const exploredReadKeys = new Set<string>();
  const mcpToolCallSources = new Map<string, number>();
  let activeDiffStats: ToolActivitySummary["activeDiffStats"] = null;
  const pushActiveDetail = (
    label: string,
    diffStats: ToolActivitySummary["activeDiffStats"] = null,
  ) => {
    activeDetails.push(label);
    activeDiffStats = diffStats;
  };

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
        if (itemInProgress) pushActiveDetail(exploration.activeLabel);
      } else {
        const skillReadLabelParts = runningSkillDefinitionReadLabelParts(item);
        const commandActivityLabel = skillReadLabelParts
          ? labelFromParts(skillReadLabelParts)
          : commandLabel(item);
        counts.commands += 1;
        if (itemInProgress) counts.runningCommands += 1;
        if (commandSearchesWebLikeCodexDesktop(item)) counts.webSearchCommands += 1;
        if (itemInProgress && commandCreatesFolderLikeCodexDesktop(item)) counts.runningFolderCreationCommands += 1;
        if (itemInProgress && commandSearchesWebLikeCodexDesktop(item)) counts.runningWebSearchCommands += 1;
        details.push(commandActivityLabel);
        if (itemInProgress) {
          if (skillReadLabelParts) pushActiveDetail(commandActivityLabel);
          else if (commandSearchesWebLikeCodexDesktop(item)) pushActiveDetail("Searching the web");
          else if (commandCreatesFolderLikeCodexDesktop(item)) pushActiveDetail("Creating folder");
          else pushActiveDetail(commandLabel(item));
        }
      }
    } else if (type === "patch") {
      counts.fileChanges += 1;
      const patch = patchSummary(item);
      counts.createdFiles += patch.created;
      counts.runningCreatedFiles += patch.runningCreated;
      counts.stoppedCreatedFiles += patch.stoppedCreated;
      counts.runningCreatedLineCount += patch.runningCreatedLineCount;
      counts.editedFiles += patch.edited;
      counts.runningEditedFiles += patch.runningEdited;
      counts.deletedFiles += patch.deleted;
      counts.runningDeletedFiles += patch.runningDeleted;
      details.push(patch.label);
      if (itemInProgress) {
        pushActiveDetail(patch.activeLabel, patch.activeDiffStats);
      }
    } else if (type === "mcp-tool-call") {
      counts.mcpCalls += 1;
      const source = mcpToolCallSourceName(item);
      if (source) mcpToolCallSources.set(source, (mcpToolCallSources.get(source) ?? 0) + 1);
      const label = `Called ${mcpServerName(item) || "mcp"}:${mcpToolName(item) || "tool"}`;
      details.push(label);
      if (itemInProgress) pushActiveDetail(label.replace(/^Called /, "Calling "));
    } else if (type === "dynamic-tool-call") {
      counts.dynamicCalls += 1;
      const label = `Called ${[stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".")}`;
      details.push(label);
      if (itemInProgress) pushActiveDetail(label.replace(/^Called /, "Calling "));
    } else if (type === "web-search") {
      counts.webSearches += 1;
      const detail = webSearchDetailText(record);
      const label = `Searched web${detail ? ` for ${detail}` : ""}`;
      details.push(label);
      if (itemInProgress) pushActiveDetail(`Searching the web${detail ? ` for ${detail}` : ""}`);
    } else if (type === "multi-agent-action") {
      const label = multiAgentActionRowLabel(item);
      details.push(label);
      if (itemInProgress) pushActiveDetail(label);
    } else if (type === "automatic-approval-review") {
      const status = stringField(record, "status");
      if (status === "approved") {
        activityCounts.approvedRequests += 1;
        counts.approvedRequests += 1;
        details.push("Approved request");
      } else if (status === "denied") {
        activityCounts.deniedRequests += 1;
        counts.deniedRequests += 1;
        details.push("Denied request");
      } else {
        counts.other += 1;
        details.push(eventLabel(item));
      }
    } else if (type === "reasoning") {
      counts.reasoning += 1;
      if (itemInProgress) pushActiveDetail("Thinking");
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

  const groupType: ToolActivityGroupType = hasWorkedFor
    ? "worked-for"
    : options.groupTypeOverride
      ?? baseToolActivityGroupType(items[0] ?? ({ type: "contextCompaction", id: "unknown" } as ThreadItem));
  const groupDurationMs = hasWorkedFor ? workedForDurationMs : totalDurationMs;
  const groupInProgress = hasWorkedFor ? workedForInProgress : inProgress;
  const itemLevelLabel = directItemActivityLabel(items, {
    conversationDetailLevel: options.conversationDetailLevel,
    groupType,
    inProgress,
  });
  const groupLabel = groupType === "multi-agent-group"
    ? multiAgentGroupLabelForItems(items)
    : activityLabel(groupType, counts, groupInProgress, groupDurationMs, activityCounts, mcpToolCallSources);
  const activeDetail = activeDetails.at(-1) ?? null;
  const label = groupType === "multi-agent-group"
    ? groupLabel
    : groupType === "worked-for"
      ? groupLabel
    : activeDetail ?? itemLevelLabel ?? groupLabel;
  const directSkillReadLabelParts = directRunningSkillDefinitionReadLabelParts(items);
  const labelParts = directItemLabelParts(items, {
    conversationDetailLevel: options.conversationDetailLevel,
    groupType,
    inProgress,
    activeDetail,
  });

  return {
    groupType,
    icon: directSkillReadLabelParts ? "skill" : activityIcon(groupType, counts),
    label,
    ...(labelParts ? { labelParts } : {}),
    activeDetail,
    activeDiffStats,
    ...(groupType === "worked-for" ? { defaultExpanded: options.workedForCollapsedByDefault !== true } : {}),
    details: dedupe(details).slice(0, 8),
    inProgress,
    totalDurationMs: groupDurationMs > 0 ? groupDurationMs : totalDurationMs > 0 ? totalDurationMs : null,
    counts,
  };
}

/**
 * Source: codex-local-conversation-thread.pretty.js :3766 `wg.commandRanWithDetail` template
 * `<action>Ran</action> <detail>{command}</detail>` (and the corresponding Running / Stopped
 * variants). Only emitted for single-item collapsed-tool-activity exec rows that aren't routed
 * to exploration / web-search-command, mirroring Codex's `Cg` summary builder.
 */
function directItemLabelParts(
  items: ThreadItem[],
  {
    conversationDetailLevel,
    groupType,
    inProgress,
    activeDetail,
  }: {
    conversationDetailLevel: ConversationDetailLevel;
    groupType: ToolActivityGroupType;
    inProgress: boolean;
    activeDetail: string | null;
  },
): { action: string; detail: string } | undefined {
  if (conversationDetailLevel !== "STEPS_COMMANDS" || groupType !== "collapsed-tool-activity") {
    return undefined;
  }
  if (items.length !== 1) return undefined;
  const item = items[0];
  if (!item || itemType(item) !== "exec" || explorationSummary(item)) return undefined;
  const skillReadLabelParts = runningSkillDefinitionReadLabelParts(item);
  if (skillReadLabelParts) return skillReadLabelParts;
  if (commandSearchesWebLikeCodexDesktop(item)) return undefined;
  if (!inProgress && !isCompletedRecord(item as ItemRecord)) return undefined;
  const parts = commandLabelParts(item);
  if (activeDetail && (!parts || labelFromParts(parts) !== activeDetail)) return undefined;
  return parts ?? undefined;
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
  activityCounts: { approvedRequests: number; deniedRequests: number } = { approvedRequests: 0, deniedRequests: 0 },
  mcpToolCallSources: ReadonlyMap<string, number> = new Map(),
): string {
  if (groupType === "reasoning") return inProgress ? "Thinking" : totalDurationMs > 0 ? `Thought for ${formatDuration(totalDurationMs)}` : "Thought";
  if (groupType === "exploration") return explorationSummaryLabel(counts, inProgress) ?? (inProgress ? "Exploring" : "Explored");
  if (groupType === "todo-list") return "Updated progress";
  if (groupType === "pending-mcp-tool-calls") return "Waiting on MCP tool";
  if (groupType === "web-search-group") {
    return inProgress ? "Searching the web" : "Searched web";
  }
  if (groupType === "multi-agent-group") return inProgress ? "Working with agents" : "Updated agents";
  if (groupType === "worked-for") {
    if (totalDurationMs > 0) return `${inProgress ? "Working for" : "Worked for"} ${formatDuration(totalDurationMs)}`;
    return inProgress ? "Working" : "Worked";
  }
  if (inProgress) return "Working";
  const completedLabel = completedActivitySummaryLabel(counts, activityCounts, mcpToolCallSources);
  if (completedLabel) return completedLabel;
  if (counts.plans > 0) return "Updated plan";
  if (counts.reasoning > 0) return "Thought";
  return "Worked";
}

function completedActivitySummaryLabel(
  counts: ToolActivitySummary["counts"],
  activityCounts: { approvedRequests: number; deniedRequests: number },
  mcpToolCallSources: ReadonlyMap<string, number> = new Map(),
): string | null {
  const namedMcpCallCount = Array.from(mcpToolCallSources.values()).reduce((total, count) => total + count, 0);
  const genericMcpCalls = Math.max(0, counts.mcpCalls + counts.dynamicCalls - namedMcpCallCount);
  const segments = [
    fileChangeSummaryLabel(counts, false),
    explorationSummaryLabel(counts, false),
    requestSummarySegment("Approved", activityCounts.approvedRequests),
    requestSummarySegment("Denied", activityCounts.deniedRequests),
    webSearchCommandSummarySegment(counts.webSearchCommands),
    ordinaryCommandSummarySegment(counts),
    mcpToolCallSources.size > 0 ? `Used ${joinConjunction(Array.from(mcpToolCallSources.keys()).map(mcpToolCallSourceLabel))}` : "",
    genericMcpCalls > 0 ? `Called ${formatCount(genericMcpCalls, "tool")}` : "",
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
  if (runningSkillDefinitionReadAction(actions, item)) return null;

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
    activeLabel: activeAction ? explorationActionLabel(activeAction, true, item) : explorationSummaryLabel({ reads, searches, lists }, true) ?? "Exploring",
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
  return actions.map((action) => explorationActionLabel(action, inProgress, item)).join("\n");
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
  | { type: "read"; path: string; name: string; finished: boolean | null }
  | { type: "search"; path: string; query: string; finished: boolean | null }
  | { type: "listFiles"; path: string; finished: boolean | null };

function normalizeCommandAction(action: Record<string, unknown>): NormalizedCommandAction | null {
  const type = stringField(action, "type");
  const finished = typeof action.isFinished === "boolean" ? action.isFinished : null;
  if (type === "read") {
    const name = stringField(action, "name");
    return { type: "read", path: stringField(action, "path") || name || "file", name, finished };
  }
  if (type === "search") {
    return {
      type: "search",
      path: stringField(action, "path"),
      query: stringField(action, "query"),
      finished,
    };
  }
  if (type === "listFiles" || type === "list_files") {
    return { type: "listFiles", path: stringField(action, "path"), finished };
  }
  return null;
}

function directRunningSkillDefinitionReadLabelParts(
  items: ThreadItem[],
): { action: string; detail: string } | null {
  if (items.length !== 1) return null;
  const item = items[0];
  return item && itemType(item) === "exec" ? runningSkillDefinitionReadLabelParts(item) : null;
}

function runningSkillDefinitionReadLabelParts(item: ThreadItem): { action: string; detail: string } | null {
  const action = runningSkillDefinitionReadAction(
    commandActions(item).map(normalizeCommandAction).filter((candidate) => candidate !== null),
    item,
  );
  if (!action) return null;
  const skillInfo = skillPathInfoForAction(action, item);
  return skillInfo ? { action: "Reading", detail: `${skillInfo.skillName} skill` } : null;
}

export function isRunningSkillDefinitionRead(item: ThreadItem): boolean {
  return Boolean(runningSkillDefinitionReadAction(
    commandActions(item).map(normalizeCommandAction).filter((candidate) => candidate !== null),
    item,
  ));
}

function runningSkillDefinitionReadAction(
  actions: NormalizedCommandAction[],
  item: ThreadItem,
): Extract<NormalizedCommandAction, { type: "read" }> | null {
  for (const action of actions) {
    if (action.type !== "read" || action.finished !== false) continue;
    const skillInfo = skillPathInfoForAction(action, item);
    if (skillInfo?.isSkillDefinitionFile) return action;
  }
  return null;
}

function labelFromParts(parts: { action: string; detail: string }): string {
  return `${parts.action} ${parts.detail}`;
}

function explorationActionLabel(action: NormalizedCommandAction, inProgress: boolean, item: ThreadItem): string {
  const skillLabel = skillExplorationLabel(action, item, inProgress);
  if (skillLabel) return skillLabel;
  if (action.type === "read") {
    return `${inProgress ? "Reading" : "Read"} ${displayPath(inProgress ? action.path : action.name || action.path)}`;
  }
  if (action.type === "search") {
    if (inProgress) {
      if (action.path) return `Searching files in ${displayPath(action.path)} folder`;
      if (action.query) return `Searching for ${action.query}`;
      return "Searching files";
    }
    if (action.query && action.path) return `Searched for ${action.query} in ${displayPath(action.path)}`;
    if (action.query) return `Searched for ${action.query}`;
    return "Searched files";
  }
  return action.path
    ? `${inProgress ? "Listing" : "Listed"} files in ${displayPath(action.path)}${inProgress ? " folder" : ""}`
    : `${inProgress ? "Listing" : "Listed"} files`;
}

function skillExplorationLabel(
  action: NormalizedCommandAction,
  item: ThreadItem,
  inProgress: boolean,
): string | null {
  const skillInfo = skillPathInfoForAction(action, item);
  if (!skillInfo) return null;
  if (action.type === "read") {
    if (skillInfo.isSkillDefinitionFile && (inProgress || action.finished === false)) {
      return `Reading ${skillInfo.skillName} skill`;
    }
    return `Read ${skillInfo.skillName} skill`;
  }
  if (action.type === "listFiles") {
    return `Listed files in ${skillInfo.skillName} skill`;
  }
  const query = action.query.trim();
  return query
    ? `Searched for ${query} in ${skillInfo.skillName} skill`
    : `Searched in ${skillInfo.skillName} skill`;
}

export interface DesktopSkillPathInfo {
  skillName: string;
  isSkillDefinitionFile: boolean;
}

function skillPathInfoForAction(action: NormalizedCommandAction, item: ThreadItem): DesktopSkillPathInfo | null {
  if (!action.path) return null;
  return desktopSkillPathInfoForCommandPath(action.path, stringField(item as ItemRecord, "cwd"));
}

export function desktopSkillPathInfoForCommandPath(path: string, cwd = ""): DesktopSkillPathInfo | null {
  const normalizedPath = normalizeSearchPath(path);
  if (!normalizedPath) return null;
  if (isAbsoluteSearchPath(normalizedPath)) return parseDesktopSkillPathInfo(normalizeSearchPathSegments(normalizedPath));
  const normalizedCwd = normalizeSearchPath(cwd);
  return parseDesktopSkillPathInfo(normalizeSearchPathSegments(normalizedCwd ? `${normalizedCwd}/${normalizedPath}` : normalizedPath));
}

const DESKTOP_SKILL_ROOT_SEGMENTS = new Set([".codex", ".agents"]);
const DESKTOP_SKILL_INDIRECT_SEGMENTS = new Set(["_import", ".system"]);
const DESKTOP_SKILLS_SEGMENT = "skills";
const DESKTOP_PLUGINS_SEGMENT = "plugins";
const DESKTOP_PLUGIN_CACHE_SEGMENT = "cache";
const DESKTOP_SKILL_DEFINITION_FILE = "skill.md";

function parseDesktopSkillPathInfo(path: string): DesktopSkillPathInfo | null {
  const parts = normalizeSearchPathSegments(path).split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parseDesktopCodexSkillPath(parts) ?? parseDesktopPluginSkillPath(parts);
}

function parseDesktopCodexSkillPath(parts: string[]): DesktopSkillPathInfo | null {
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index]?.toLowerCase();
    const next = parts[index + 1]?.toLowerCase();
    if (!current || !DESKTOP_SKILL_ROOT_SEGMENTS.has(current) || next !== DESKTOP_SKILLS_SEGMENT) continue;
    const candidate = parts[index + 2] ?? "";
    const candidateLower = candidate.toLowerCase();
    const usesIndirectSegment = DESKTOP_SKILL_INDIRECT_SEGMENTS.has(candidateLower);
    const skillId = usesIndirectSegment ? parts[index + 3] ?? "" : candidate;
    if (!skillId) continue;
    const relativePathSegments = usesIndirectSegment ? parts.slice(index + 4) : parts.slice(index + 3);
    return desktopSkillPathInfo(skillId, relativePathSegments);
  }
  return null;
}

function parseDesktopPluginSkillPath(parts: string[]): DesktopSkillPathInfo | null {
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]?.toLowerCase() !== DESKTOP_PLUGINS_SEGMENT) continue;
    const pluginId = desktopPluginIdFromPath(parts, index);
    if (!pluginId) continue;
    const skillsIndex = parts.findIndex((part, partIndex) =>
      partIndex > index && part.toLowerCase() === DESKTOP_SKILLS_SEGMENT
    );
    const skillId = skillsIndex >= 0 ? parts[skillsIndex + 1] ?? "" : "";
    if (!skillId) continue;
    return desktopSkillPathInfo(skillId, parts.slice(skillsIndex + 2));
  }
  return null;
}

function desktopPluginIdFromPath(parts: string[], pluginsIndex: number): string | null {
  const next = parts[pluginsIndex + 1] ?? "";
  if (!next) return null;
  return next.toLowerCase() === DESKTOP_PLUGIN_CACHE_SEGMENT ? parts[pluginsIndex + 3] ?? null : next;
}

function desktopSkillPathInfo(skillId: string, relativePathSegments: string[]): DesktopSkillPathInfo {
  const firstSegment = relativePathSegments[0]?.toLowerCase();
  return {
    skillName: desktopSkillDisplayName(skillId.replaceAll("_", "-")),
    isSkillDefinitionFile: relativePathSegments.length === 1 && firstSegment === DESKTOP_SKILL_DEFINITION_FILE,
  };
}

const DESKTOP_TITLE_INITIALISMS = new Set([
  "GH",
  "IA",
  "MCP",
  "API",
  "CI",
  "CLI",
  "LLM",
  "PDF",
  "PR",
  "UI",
  "URL",
  "SQL",
  "TW",
  "GPU",
  "CPU",
]);
const DESKTOP_TITLE_OVERRIDES = new Map([
  ["openai", "OpenAI"],
  ["openapi", "OpenAPI"],
  ["github", "GitHub"],
  ["pagerduty", "PagerDuty"],
  ["datadog", "DataDog"],
  ["sqlite", "SQLite"],
  ["fastapi", "FastAPI"],
]);
const DESKTOP_LOWER_TITLE_WORDS = new Set(["and", "or", "to", "up", "with"]);

function desktopSkillDisplayName(value: string): string {
  return value.split(":").map((part) => desktopTitleCase(part)).join(": ");
}

function desktopTitleCase(value: string): string {
  return value
    .replace(/[_-]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .map((word, index) => desktopTitleWord(word, index))
    .join(" ");
}

function desktopTitleWord(word: string, index: number): string {
  const initialism = desktopInitialism(word);
  if (initialism) return initialism;
  const lower = word.toLowerCase();
  return DESKTOP_TITLE_OVERRIDES.get(lower)
    ?? (index > 0 && DESKTOP_LOWER_TITLE_WORDS.has(lower) ? lower : upperFirst(lower));
}

function desktopInitialism(word: string): string | null {
  const upper = word.toUpperCase();
  if (DESKTOP_TITLE_INITIALISMS.has(upper)) return upper;
  if (!word.toLowerCase().endsWith("s")) return null;
  const singular = word.slice(0, -1).toUpperCase();
  return DESKTOP_TITLE_INITIALISMS.has(singular) ? `${singular}s` : null;
}

function upperFirst(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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
  /*
   * Codex Desktop joins the exploration header counts with a plain ", " and NO
   * conjunction word — the ICU string `localConversationTurn.exploration.accordion
   * .count.separator` has defaultMessage exactly ", " (described as "Separator
   * between counts in the exploration header"). So 3 parts render
   * "Explored 1 file, 2 searches, 3 lists", not the Oxford-comma "..., and ..."
   * form. (The `formatList({type:"conjunction"})` join in the same chunk is used
   * only for the cross-type web-search/MCP summary — see `completedActivitySummaryLabel`
   * — and is intentionally left on `joinConjunction`.) Order stays files -> searches -> lists.
   */
  const parts = [
    reads > 0 ? formatCount(reads, "file") : "",
    searches > 0 ? formatCount(searches, "search") : "",
    lists > 0 ? formatCount(lists, "list") : "",
  ].filter(Boolean);
  return `${inProgress ? "Exploring" : "Explored"} ${parts.join(", ")}`;
}

function joinConjunction(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (typeof Intl !== "undefined" && typeof Intl.ListFormat === "function") {
    try {
      return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(parts);
    } catch {
      /* fall through to fallback below */
    }
  }
  // Fallback for environments without Intl.ListFormat: "a, b, and c"
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

interface PatchSummary {
  created: number;
  runningCreated: number;
  stoppedCreated: number;
  runningCreatedLineCount: number;
  edited: number;
  runningEdited: number;
  deleted: number;
  runningDeleted: number;
  label: string;
  activeLabel: string;
  activeDiffStats: ToolActivitySummary["activeDiffStats"];
}

function patchSummary(item: ThreadItem): PatchSummary {
  const changes = patchChanges(item);
  let created = 0;
  let runningCreated = 0;
  let stoppedCreated = 0;
  let runningCreatedLineCount = 0;
  let edited = 0;
  let runningEdited = 0;
  let deleted = 0;
  let runningDeleted = 0;
  const stopped = patchStoppedLikeCodexDesktop(item);
  for (const change of changes) {
    const kind = patchKind(change);
    const success = patchSuccess(item);
    const running = success === null;
    if (kind === "add") {
      created += 1;
      if (running && stopped) stoppedCreated += 1;
      else if (running) {
        runningCreated += 1;
        runningCreatedLineCount += patchCreatedLineCount(change);
      }
    } else if (kind === "delete") {
      deleted += 1;
      if (running) runningDeleted += 1;
    } else {
      edited += 1;
      if (running) runningEdited += 1;
    }
  }

  const lastChange = changes[changes.length - 1] ?? null;
  const lastKind = lastChange ? patchKind(lastChange) : "update";
  const lastPath = lastChange ? patchPath(lastChange) : "";
  const activeDiffStats = lastChange ? patchDiffStats(lastChange) : null;
  return {
    created,
    runningCreated,
    stoppedCreated,
    runningCreatedLineCount,
    edited,
    runningEdited,
    deleted,
    runningDeleted,
    label: fileChangeSummaryLabel({
      createdFiles: created,
      runningCreatedFiles: runningCreated,
      stoppedCreatedFiles: stoppedCreated,
      runningCreatedLineCount,
      editedFiles: edited,
      runningEditedFiles: runningEdited,
      deletedFiles: deleted,
      runningDeletedFiles: runningDeleted,
    }, false) ?? "Edited files",
    activeLabel: patchActionLabel(lastKind, lastPath, true),
    activeDiffStats,
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

function patchSuccess(item: ThreadItem): boolean | null {
  const record = item as ItemRecord;
  const success = record.success;
  if (typeof success === "boolean") return success;
  const status = stringField(record, "status") || stringField(record, "executionStatus");
  if (status === "success" || status === "succeeded") return true;
  if (status === "failed" || status === "error" || status === "errored") return false;
  // Desktop patch grouping branches on `success`; replayed HiCodex patch
  // payloads can carry only a terminal status, so normalize that after
  // preserving explicit failure states.
  if (success !== null && isCompletedRecord(item)) return true;
  return null;
}

function patchStoppedLikeCodexDesktop(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  const status = stringField(record, "_turnStatus") || stringField(record, "status") || stringField(record, "executionStatus");
  return status === "cancelled" || status === "canceled" || status === "interrupted";
}

function patchCreatedLineCount(change: Record<string, unknown>): number {
  const content = stringField(change, "content");
  if (content) return lineCount(content);
  const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
  if (!diff) return 0;
  return diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
}

function patchDiffStats(change: Record<string, unknown>): ToolActivitySummary["activeDiffStats"] {
  const diff = stringField(change, "diff") || stringField(change, "unifiedDiff") || stringField(change, "patch");
  if (!diff) {
    const content = stringField(change, "content");
    const added = content ? lineCount(content) : 0;
    return added > 0 ? { linesAdded: added, linesRemoved: 0 } : null;
  }
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) linesAdded += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) linesRemoved += 1;
  }
  return linesAdded > 0 || linesRemoved > 0 ? { linesAdded, linesRemoved } : null;
}

function lineCount(value: string): number {
  const normalized = value.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
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
  counts: Pick<ToolActivitySummary["counts"], "createdFiles" | "editedFiles" | "deletedFiles">
    & Partial<Pick<ToolActivitySummary["counts"], "runningCreatedFiles" | "stoppedCreatedFiles" | "runningCreatedLineCount" | "runningEditedFiles" | "runningDeletedFiles">>,
  inProgress: boolean,
): string | null {
  const runningCreated = counts.runningCreatedFiles ?? 0;
  const stoppedCreated = counts.stoppedCreatedFiles ?? 0;
  const runningCreatedLineCount = counts.runningCreatedLineCount ?? 0;
  const runningEdited = counts.runningEditedFiles ?? 0;
  const runningDeleted = counts.runningDeletedFiles ?? 0;
  const completedCreated = Math.max(0, counts.createdFiles - runningCreated - stoppedCreated);
  const completedEdited = Math.max(0, counts.editedFiles - runningEdited);
  const completedDeleted = Math.max(0, counts.deletedFiles - runningDeleted);
  const segments = [
    completedCreated > 0 ? fileChangeSegment(inProgress ? "Creating" : "Created", completedCreated, "file") : "",
    stoppedCreated > 0 ? fileChangeSegment("Stopped creating", stoppedCreated, "file") : "",
    runningCreated > 0
      ? `${fileChangeSegment("Creating", runningCreated, "file")}${runningCreatedLineCount > 0 ? ` • writing ${formatCount(runningCreatedLineCount, "line")}` : ""}`
      : "",
    completedEdited > 0 ? fileChangeSegment(inProgress ? "Editing" : "Edited", completedEdited, "file") : "",
    runningEdited > 0 ? fileChangeSegment("Editing", runningEdited, "file") : "",
    completedDeleted > 0 ? fileChangeSegment(inProgress ? "Deleting" : "Deleted", completedDeleted, "file") : "",
    runningDeleted > 0 ? fileChangeSegment("Deleting", runningDeleted, "file") : "",
  ].filter(Boolean);
  if (segments.length === 0) return null;
  return segments.map((segment, index) => index === 0 ? segment : lowerInitial(segment)).join(", ");
}

function fileChangeSegment(verb: string, count: number, noun: string): string {
  return `${verb} ${formatCount(count, noun)}`;
}

function displayPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\/+/u, "").replace(/\\/gu, "/");
  if (!trimmed) return "file";
  return trimmed;
}

function lowerInitial(value: string): string {
  return value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
}
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

function mcpToolCallSourceName(item: ThreadItem): string | null {
  return pendingMcpToolCallSourceKey(item) === "browser-use" ? "browser-use" : null;
}

function mcpToolCallSourceLabel(source: string): string {
  return source === "browser-use" ? "the browser" : source;
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

function agentFallbackName(id: string): string {
  return id ? `agent-${id.slice(0, 8)}` : "agent";
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
  const target = receivers.length > 0
    ? receivers.map((id) => stripLeadingAt(multiAgentReceiverTitle(item, id) || agentFallbackName(id))).join(", ")
    : "agent";
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

function multiAgentReceiverTitle(item: ThreadItem, threadId: string): string {
  const record = item as ItemRecord;
  if (!Array.isArray(record.receiverThreads)) return "";
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    const thread = receiverRecord.thread;
    const threadRecord = thread && typeof thread === "object" ? thread as Record<string, unknown> : null;
    return (
      stringField(receiverRecord, "agentNickname")
      || threadSpawnSourceField(receiverRecord, "agent_nickname", "agentNickname")
      || (threadRecord
        ? stringField(threadRecord, "agentNickname")
          || threadSpawnSourceField(threadRecord, "agent_nickname", "agentNickname")
        : "")
    ).trim();
  }
  return "";
}

function threadSpawnSourceField(thread: Record<string, unknown>, snakeKey: string, camelKey: string): string {
  const source = thread.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const sourceRecord = source as Record<string, unknown>;
  const direct = stringField(sourceRecord, camelKey);
  if (direct) return direct;
  const subAgent = sourceRecord.subAgent;
  if (!subAgent || typeof subAgent !== "object" || Array.isArray(subAgent)) return "";
  const threadSpawn = (subAgent as Record<string, unknown>).thread_spawn;
  if (!threadSpawn || typeof threadSpawn !== "object" || Array.isArray(threadSpawn)) return "";
  return stringField(threadSpawn as Record<string, unknown>, snakeKey)
    || stringField(threadSpawn as Record<string, unknown>, camelKey);
}

function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
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
