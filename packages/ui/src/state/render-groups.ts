import { formatUnknown, stringField } from "../lib/format";

export type AccumulatedThreadItem = {
  id: string;
  type: string;
} & Record<string, unknown>;

type ThreadItem = AccumulatedThreadItem;

export type ConversationRenderUnit =
  | {
      kind: "message";
      key: string;
      role: "user" | "assistant";
      item: ThreadItem;
      text: string;
      userContent?: UserMessageContentPart[];
      assistantPhase?: AssistantMessagePhase;
      isStreaming?: boolean;
      renderPlaceholder?: boolean;
    }
  | {
      kind: "toolActivity";
      key: string;
      items: ThreadItem[];
      summary: ToolActivitySummary;
    }
  | {
      kind: "event";
      key: string;
      item: ThreadItem;
      label: string;
      text: string;
      tone?: EventTone;
      format?: EventFormat;
    };

export type EventTone = "info" | "warning" | "error";
export type EventFormat = "text" | "markdown" | "diff";

export interface ToolActivitySummary {
  groupType: ToolActivityGroupType;
  icon: ToolActivityIcon;
  label: string;
  activeDetail: string | null;
  details: string[];
  inProgress: boolean;
  totalDurationMs: number | null;
  counts: {
    commands: number;
    exploredFiles: number;
    searches: number;
    lists: number;
    fileChanges: number;
    createdFiles: number;
    editedFiles: number;
    deletedFiles: number;
    mcpCalls: number;
    dynamicCalls: number;
    webSearches: number;
    reasoning: number;
    plans: number;
    other: number;
  };
}

export type ToolActivityIcon =
  | "activity"
  | "clock"
  | "edit"
  | "mcp"
  | "plan"
  | "reasoning"
  | "search"
  | "terminal"
  | "web-search";

export type ToolActivityGroupType =
  | "collapsed-tool-activity"
  | "pending-mcp-tool-calls"
  | "worked-for"
  | "reasoning"
  | "todo-list"
  | "web-search-group"
  | "multi-agent-group";

export interface RailEntry {
  id: string;
  title: string;
  meta?: string;
  status?: string;
  reference?: RailEntryReference;
  action?: RailEntryAction;
}

export interface RailEntryReference {
  path: string;
  lineStart: number;
  lineEnd?: number;
}

export type RailEntryAction =
  | { kind: "file"; reference: RailEntryReference }
  | { kind: "url"; url: string }
  | { kind: "source"; itemId: string }
  | { kind: "diff" };

export type UserMessageContentPart =
  | {
      kind: "text";
      text: string;
      textElements: UserMessageTextElement[];
    }
  | {
      kind: "image";
      source: "url" | "local";
      src: string;
      label: string;
    }
  | {
      kind: "chip";
      chipKind: "mention" | "skill";
      label: string;
      path: string;
    };

export interface UserMessageTextElement {
  start: number;
  end: number;
  placeholder: string | null;
}

export type AssistantMessagePhase = "commentary" | "final_answer" | "unknown";

export interface ConversationProjection {
  units: ConversationRenderUnit[];
  progress: RailEntry[];
  artifacts: RailEntry[];
  sources: RailEntry[];
}

export interface ConversationProjectionOptions {
  isThreadRunning?: boolean;
  conversationDetailLevel?: ConversationDetailLevel;
  progressPlan?: {
    id?: string | null;
    plan: unknown[];
  } | null;
}

export type ConversationDetailLevel = "STEPS_COMMANDS" | "STEPS_PROSE";

type ItemRecord = ThreadItem & Record<string, unknown>;

export function projectConversation(items: ThreadItem[], options: ConversationProjectionOptions = {}): ConversationProjection {
  const units: ConversationRenderUnit[] = [];
  let progress: RailEntry[] = [];
  const artifacts = new Map<string, RailEntry>();
  const sources = new Map<string, RailEntry>();
  const blockedMcpServers = blockedMcpServersFromItems(items);
  let activity: ThreadItem[] = [];
  let activityGroupType: ToolActivityGroupType | null = null;
  let activityGroupKey: string | null = null;

  const flushActivity = () => {
    if (activity.length === 0) return;
    const summary = summarizeToolActivity(activity, {
      conversationDetailLevel: options.conversationDetailLevel ?? "STEPS_COMMANDS",
    });
    const renderIndex = units.length;
    units.push({
      kind: "toolActivity",
      key: toolActivityRenderKey(summary.groupType, activity, renderIndex),
      items: activity,
      summary,
    });
    activity = [];
    activityGroupType = null;
    activityGroupKey = null;
  };

  for (const item of items) {
    if (itemType(item) === "todo-list") {
      const nextProgress = collectRailEntries(item, artifacts, sources);
      if (nextProgress) {
        progress = nextProgress;
      }
      continue;
    }
    if (isBlockingOutOfBandItem(item, blockedMcpServers)) {
      continue;
    }
    const nextProgress = collectRailEntries(item, artifacts, sources);
    if (nextProgress) {
      progress = nextProgress;
    }
    if (isUserMessage(item)) {
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "user",
        item,
        text: userMessageText(item),
        userContent: projectUserMessageContent(item),
      });
      continue;
    }
    if (isAssistantMessage(item)) {
      const renderPlaceholder = shouldRenderAssistantPlaceholder(item);
      const text = assistantMessageText(item);
      if (!text.trim() && !renderPlaceholder) {
        continue;
      }
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "assistant",
        item,
        text: renderPlaceholder ? "" : text,
        assistantPhase: assistantMessagePhase(item),
        renderPlaceholder,
      });
      continue;
    }
    if (isToolActivityItem(item)) {
      const nextGroupType = baseToolActivityGroupType(item);
      const nextGroupKey = toolActivityGroupKey(item, nextGroupType);
      if (activity.length > 0 && (activityGroupType !== nextGroupType || activityGroupKey !== nextGroupKey)) {
        flushActivity();
      }
      activityGroupType = nextGroupType;
      activityGroupKey = nextGroupKey;
      activity.push(item);
      continue;
    }
    flushActivity();
    units.push({
      kind: "event",
      key: item.id,
      item,
      label: eventLabel(item),
      text: eventText(item),
      tone: eventTone(item),
      format: eventFormat(item),
    });
  }

  flushActivity();

  const explicitProgress = options.progressPlan
    ? progressEntriesFromPlan(options.progressPlan.plan, options.progressPlan.id ?? "turn-plan")
    : null;

  return {
    units: withStreamingAssistantState(units, options.isThreadRunning === true),
    progress: coalesceProgress(explicitProgress ?? progress),
    artifacts: Array.from(artifacts.values()),
    sources: Array.from(sources.values()),
  };
}

function withStreamingAssistantState(
  units: ConversationRenderUnit[],
  isThreadRunning: boolean,
): ConversationRenderUnit[] {
  if (!isThreadRunning) return units;
  const lastAssistantIndex = lastAssistantMessageIndex(units);
  if (lastAssistantIndex < 0) return units;
  return units.map((unit, index) =>
    index === lastAssistantIndex && unit.kind === "message" && unit.role === "assistant"
      ? { ...unit, isStreaming: true }
      : unit
  );
}

function lastAssistantMessageIndex(units: ConversationRenderUnit[]): number {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit?.kind === "message" && unit.role === "assistant") return index;
  }
  return -1;
}

export function userMessageText(item: ThreadItem): string {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content.map(userInputPartText).filter(Boolean).join("\n");
}

export function projectUserMessageContent(item: ThreadItem): UserMessageContentPart[] {
  const record = item as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];
  return content.flatMap(projectUserInputPart);
}

export function itemText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.summary) || Array.isArray(record.content)) {
    return [...stringArray(record.summary), ...stringArray(record.content)].join("\n");
  }
  if (typeof record.aggregatedOutput === "string") return record.aggregatedOutput;
  if (typeof record.result === "string") return record.result;
  if (typeof record.error === "string") return record.error;
  return "";
}

export function assistantMessageText(item: ThreadItem): string {
  return stripRawThinkingMarkup(itemText(item));
}

function shouldRenderAssistantPlaceholder(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.renderPlaceholderWhileStreaming === true && record.completed !== true;
}

export function stripRawThinkingMarkup(value: string): string {
  let text = value.replace(/\r\n?/g, "\n");
  text = text.replaceAll(/[ \t]*\n?[ \t]*<think\b[^>]*>[\s\S]*?<\/think>[ \t]*\n?[ \t]*/gi, "\n");

  const lastDanglingClose = text.toLowerCase().lastIndexOf("</think>");
  if (lastDanglingClose >= 0) {
    text = text.slice(lastDanglingClose + "</think>".length);
  }

  text = text.replaceAll(/<think\b[^>]*>[\s\S]*$/gi, "");
  return text
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export function assistantMessagePhase(item: ThreadItem): AssistantMessagePhase {
  const phase = stringField(item as Record<string, unknown>, "phase");
  if (phase === "commentary") return "commentary";
  if (phase === "final_answer" || phase === "final") return "final_answer";
  return "unknown";
}

export function itemType(item: ThreadItem): string {
  switch (item.type) {
    case "userMessage":
      return "user-message";
    case "agentMessage":
      return "assistant-message";
    case "commandExecution":
      return "exec";
    case "fileChange":
      return "patch";
    case "mcpToolCall":
      return "mcp-tool-call";
    case "dynamicToolCall":
      return "dynamic-tool-call";
    case "collabAgentToolCall":
      return "multi-agent-action";
    case "contextCompaction":
      return "context-compaction";
    case "webSearch":
      return "web-search";
    default:
      return item.type;
  }
}

export function isThreadStatusInProgress(status: unknown): boolean {
  if (typeof status === "string") return status === "running" || status === "inProgress" || status === "active";
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  const type = record.type;
  if (type === "active" || type === "running" || type === "inProgress") return true;
  const statusValue = record.status;
  return statusValue === "active" || statusValue === "running" || statusValue === "inProgress";
}

export function isItemInProgress(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  const status = record.status;
  if (status === "inProgress" || status === "running" || status === "pending" || status === "streaming") return true;
  if (itemType(item) === "worked-for") return status === "working";
  if (item.type === "commandExecution") return record.exitCode == null && status !== "completed" && status !== "failed" && status !== "declined";
  if (item.type === "fileChange") return status === "pending" || status === "streaming";
  if (itemType(item) === "web-search") return record.completed === false;
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return status !== "completed" && status !== "failed" && status !== "errored" && status !== "cancelled";
  }
  return false;
}

export function formatItemDetail(item: ThreadItem): string {
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "exec") {
    const exploration = explorationDetail(item);
    if (exploration) return exploration;
    const command = stringField(record, "command") || "command";
    const output = stringField(record, "aggregatedOutput");
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

function summarizeToolActivity(
  items: ThreadItem[],
  options: { conversationDetailLevel: ConversationDetailLevel },
): ToolActivitySummary {
  const counts = {
    commands: 0,
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

  for (const item of items) {
    const itemInProgress = isItemInProgress(item);
    inProgress = inProgress || itemInProgress;
    const type = itemType(item);
    const record = item as ItemRecord;
    totalDurationMs += durationMs(item);
    if (type === "exec") {
      const exploration = explorationSummary(item);
      if (exploration) {
        counts.exploredFiles += exploration.reads;
        counts.searches += exploration.searches;
        counts.lists += exploration.lists;
        details.push(exploration.label);
        if (itemInProgress) activeDetails.push(exploration.activeLabel);
      } else {
        counts.commands += 1;
        details.push(commandLabel(item));
        if (itemInProgress) activeDetails.push(commandLabel(item));
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
    } else if (type === "reasoning") {
      counts.reasoning += 1;
      details.push(itemInProgress ? "Thinking" : "Thought");
      if (itemInProgress) activeDetails.push("Thinking");
    } else if (type === "worked-for") {
      details.push(activityLabel("worked-for", counts, itemInProgress, durationMs(item)));
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

  const groupType = baseToolActivityGroupType(items[0] ?? ({ type: "contextCompaction", id: "unknown" } as ThreadItem));
  const itemLevelLabel = directItemActivityLabel(items, {
    conversationDetailLevel: options.conversationDetailLevel,
    groupType,
    inProgress,
  });
  const groupLabel = groupType === "multi-agent-group"
    ? multiAgentGroupLabelForItems(items)
    : activityLabel(groupType, counts, inProgress, totalDurationMs);
  const activeDetail = activeDetails.at(-1) ?? null;
  const label = groupType === "multi-agent-group"
    ? groupLabel
    : activeDetail ?? itemLevelLabel ?? groupLabel;

  return {
    groupType,
    icon: activityIcon(groupType, counts),
    label,
    activeDetail,
    details: dedupe(details).slice(0, 8),
    inProgress,
    totalDurationMs: totalDurationMs > 0 ? totalDurationMs : null,
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
  return commandLabel(item);
}

function activityIcon(groupType: ToolActivityGroupType, counts: ToolActivitySummary["counts"]): ToolActivityIcon {
  if (groupType === "reasoning") return "reasoning";
  if (groupType === "worked-for") return "clock";
  if (groupType === "pending-mcp-tool-calls") return "mcp";
  if (groupType === "todo-list" || counts.plans > 0) return "plan";
  if (groupType === "web-search-group") return "web-search";
  if (counts.webSearches > 0) return "web-search";
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
): string {
  if (groupType === "reasoning") return inProgress ? "Thinking" : totalDurationMs > 0 ? `Thought for ${formatDuration(totalDurationMs)}` : "Thought";
  if (groupType === "todo-list") return "Updated progress";
  if (groupType === "pending-mcp-tool-calls") return "Waiting on MCP tool";
  if (groupType === "web-search-group") return inProgress ? "Searching the web" : "Searched web";
  if (groupType === "multi-agent-group") return inProgress ? "Working with agents" : "Updated agents";
  if (groupType === "worked-for") {
    if (totalDurationMs > 0) return `${inProgress ? "Working for" : "Worked for"} ${formatDuration(totalDurationMs)}`;
    return inProgress ? "Working" : "Worked";
  }
  if (inProgress) return "Working";
  const fileChangeLabel = fileChangeSummaryLabel(counts, false);
  if (fileChangeLabel) return fileChangeLabel;
  const explorationLabel = explorationSummaryLabel(counts, false);
  if (explorationLabel) return explorationLabel;
  if (counts.commands > 0) return `Ran ${formatCount(counts.commands, "command")}`;
  if (counts.mcpCalls + counts.dynamicCalls > 0) return `Called ${formatCount(counts.mcpCalls + counts.dynamicCalls, "tool")}`;
  if (counts.webSearches > 0) return `Searched web ${formatCount(counts.webSearches, "time")}`;
  if (counts.plans > 0) return "Updated plan";
  if (counts.reasoning > 0) return "Thought";
  return "Worked";
}

interface ExplorationSummary {
  reads: number;
  searches: number;
  lists: number;
  label: string;
  activeLabel: string;
}

function explorationSummary(item: ThreadItem): ExplorationSummary | null {
  const actions = commandActions(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return null;

  const reads = actions.filter((action) => action.type === "read").length;
  const searches = actions.filter((action) => action.type === "search").length;
  const lists = actions.filter((action) => action.type === "listFiles").length;
  if (reads + searches + lists === 0) return null;

  const activeAction = actions[actions.length - 1];
  return {
    reads,
    searches,
    lists,
    label: explorationSummaryLabel({ reads, searches, lists }, false) ?? "Explored",
    activeLabel: activeAction ? explorationActionLabel(activeAction, true) : explorationSummaryLabel({ reads, searches, lists }, true) ?? "Exploring",
  };
}

function explorationDetail(item: ThreadItem): string {
  const actions = commandActions(item).map(normalizeCommandAction).filter((action) => action !== null);
  if (actions.length === 0) return "";
  const inProgress = isItemInProgress(item);
  return actions.map((action) => explorationActionLabel(action, inProgress)).join("\n");
}

function commandActions(item: ThreadItem): Record<string, unknown>[] {
  const actions = (item as ItemRecord).commandActions;
  return Array.isArray(actions)
    ? actions.filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
    : [];
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
    const diff = stringField(change, "diff");
    return diff ? `${label}\n${diff}` : label;
  }).join("\n\n");
}

function patchChanges(item: ThreadItem): Record<string, unknown>[] {
  const changes = (item as ItemRecord).changes;
  return Array.isArray(changes)
    ? changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object")
    : [];
}

function patchKind(change: Record<string, unknown>): "add" | "delete" | "update" {
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

function collectRailEntries(
  item: ThreadItem,
  artifacts: Map<string, RailEntry>,
  sources: Map<string, RailEntry>,
): RailEntry[] | null {
  const record = item as ItemRecord;
  const plan = itemType(item) === "todo-list" && Array.isArray(record.plan) ? record.plan : null;
  let progress: RailEntry[] | null = null;
  if (plan) {
    progress = progressEntriesFromPlan(plan, `todo:${item.id}`);
  }

  for (const path of filePathsFromItem(item)) {
    const reference = fileReferenceFromPath(path);
    setArtifact(artifacts, path, {
      id: path,
      title: reference.path.split("/").filter(Boolean).pop() ?? reference.path,
      meta: path,
      status: statusText(item),
      reference,
      action: { kind: "file", reference },
    });
  }

  if (item.type === "agentMessage") {
    for (const artifact of artifactsFromText(itemText(item))) {
      setArtifact(artifacts, artifactKey(artifact), artifact);
    }
  }

  if (itemType(item) === "generated-image" || itemType(item) === "imageGeneration") {
    const imageSrc = stringField(record, "src") || stringField(record, "url");
    if (imageSrc) {
      const url = imageEventSource(record);
      setArtifact(artifacts, `image:${imageSrc}`, {
        id: `image:${imageSrc}`,
        title: imageArtifactTitle(imageSrc),
        meta: imageSrc,
        status: statusText(item),
        action: { kind: "url", url },
      });
    }
  }

  if (item.type === "mcpToolCall") {
    const server = mcpServerName(item);
    if (server !== "node_repl") {
      const title = `${server || "mcp"}:${mcpToolName(item) || "tool"}`;
      sources.set(`mcp:${title}`, {
        id: `mcp:${title}`,
        title,
        meta: "MCP tool",
        status: statusText(item),
        action: { kind: "source", itemId: item.id },
      });
    }
  }

  if (itemType(item) === "web-search") {
    const query = stringField(record, "query") || "web search";
    sources.set(`web:${query}`, {
      id: `web:${query}`,
      title: query,
      meta: "Web search",
      status: statusText(item),
      action: { kind: "source", itemId: item.id },
    });
  }

  return progress;
}

function progressEntriesFromPlan(plan: unknown[], idPrefix: string): RailEntry[] {
  return plan.map((raw, index) => {
    const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const title = stringField(entry, "step") || stringField(entry, "title") || stringField(entry, "text") || `Task ${index + 1}`;
    return {
      id: `${idPrefix}:${index}`,
      title,
      status: stringField(entry, "status") || "planned",
    };
  });
}

function isUserMessage(item: ThreadItem): boolean {
  return itemType(item) === "user-message";
}

function isAssistantMessage(item: ThreadItem): boolean {
  return itemType(item) === "assistant-message";
}

function isToolActivityItem(item: ThreadItem): boolean {
  if (itemType(item) === "multi-agent-action") return true;
  return [
    "reasoning",
    "worked-for",
    "plan",
    "exec",
    "patch",
    "mcp-tool-call",
    "dynamic-tool-call",
    "web-search",
  ].includes(itemType(item));
}

function baseToolActivityGroupType(item: ThreadItem): ToolActivityGroupType {
  const type = itemType(item);
  if (type === "reasoning") return "reasoning";
  if (type === "worked-for") return "worked-for";
  if (type === "web-search") return "web-search-group";
  if (type === "multi-agent-action") return "multi-agent-group";
  if (shouldUsePendingMcpToolGroup(item)) return "pending-mcp-tool-calls";
  return "collapsed-tool-activity";
}

function toolActivityGroupKey(item: ThreadItem, groupType: ToolActivityGroupType): string {
  if (groupType === "multi-agent-group") {
    if (isItemInProgress(item)) return `${groupType}:${item.id}`;
    return `${groupType}:${multiAgentAction(item)}:${multiAgentStatus(item)}`;
  }
  return groupType;
}

function toolActivityRenderKey(groupType: ToolActivityGroupType, items: ThreadItem[], renderIndex: number): string {
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

function isBlockingOutOfBandItem(item: ThreadItem, blockedMcpServers: Set<string>): boolean {
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

function mcpServerName(item: ThreadItem): string {
  return mcpInvocationField(item, "server");
}

function mcpToolName(item: ThreadItem): string {
  return mcpInvocationField(item, "tool");
}

function mcpInvocationField(item: ThreadItem, field: "server" | "tool"): string {
  const record = item as ItemRecord;
  const direct = stringField(record, field);
  if (direct) return direct;
  const invocation = record.invocation && typeof record.invocation === "object"
    ? record.invocation as Record<string, unknown>
    : null;
  return invocation ? stringField(invocation, field) : "";
}

function isPendingApprovalItem(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.approvalRequestId == null && record.approval_request_id == null) return false;
  const type = itemType(item);
  if (type === "exec") return isItemInProgress(item);
  if (type === "patch") return isItemInProgress(item);
  return false;
}

function isCompletedRecord(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.completed === true || record.status === "completed";
}

function blockedMcpServersFromItems(items: ThreadItem[]): Set<string> {
  const servers = new Set<string>();
  for (const item of items) {
    if (itemType(item) !== "mcp-server-elicitation" || isCompletedRecord(item)) continue;
    const server = mcpElicitationServer(item);
    if (server) servers.add(server);
  }
  return servers;
}

function mcpElicitationServer(item: ThreadItem): string {
  const record = item as ItemRecord;
  const direct = stringField(record, "server") || stringField(record, "serverName");
  if (direct) return direct;
  const elicitation = record.elicitation && typeof record.elicitation === "object"
    ? record.elicitation as Record<string, unknown>
    : null;
  if (!elicitation) return "";
  const genericServer = stringField(elicitation, "serverName") || stringField(elicitation, "server");
  if (genericServer) return genericServer;
  const approval = elicitation.approval && typeof elicitation.approval === "object"
    ? elicitation.approval as Record<string, unknown>
    : null;
  return approval ? stringField(approval, "connector_id") || stringField(approval, "connectorId") : "";
}

function userInputPartText(part: unknown): string {
  if (!part || typeof part !== "object") return formatUnknown(part);
  const record = part as Record<string, unknown>;
  if (record.type === "text") return stringField(record, "text");
  if (record.type === "image" || record.type === "localImage") return "";
  if (record.type === "mention") return `@${stringField(record, "name") || stringField(record, "path")}`;
  if (record.type === "skill") return `$${stringField(record, "name") || stringField(record, "path")}`;
  return `[${stringField(record, "type") || "input"}]`;
}

function projectUserInputPart(part: unknown): UserMessageContentPart[] {
  if (!part || typeof part !== "object") {
    const text = formatUnknown(part);
    return text ? [{ kind: "text", text, textElements: [] }] : [];
  }
  const record = part as Record<string, unknown>;
  switch (record.type) {
    case "text": {
      const text = stringField(record, "text");
      return text ? [{ kind: "text", text, textElements: textElements(record.text_elements) }] : [];
    }
    case "image": {
      const url = stringField(record, "url");
      return url ? [{ kind: "image", source: "url", src: url, label: imageLabel(url) }] : [];
    }
    case "localImage": {
      const path = stringField(record, "path");
      return path ? [{ kind: "image", source: "local", src: path, label: imageLabel(path) }] : [];
    }
    case "mention": {
      const path = stringField(record, "path");
      const label = stringField(record, "name") || path;
      return label || path ? [{ kind: "chip", chipKind: "mention", label: label || path, path }] : [];
    }
    case "skill": {
      const path = stringField(record, "path");
      const label = stringField(record, "name") || path;
      return label || path ? [{ kind: "chip", chipKind: "skill", label: label || path, path }] : [];
    }
    default: {
      const text = userInputPartText(part);
      return text ? [{ kind: "text", text, textElements: [] }] : [];
    }
  }
}

function textElements(value: unknown): UserMessageTextElement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const range = record.byteRange && typeof record.byteRange === "object"
      ? record.byteRange as Record<string, unknown>
      : null;
    const start = typeof range?.start === "number" ? range.start : null;
    const end = typeof range?.end === "number" ? range.end : null;
    if (start === null || end === null) return [];
    return [{
      start,
      end,
      placeholder: typeof record.placeholder === "string" ? record.placeholder : null,
    }];
  });
}

function imageLabel(value: string): string {
  const path = value.trim();
  if (!path || /^(?:data|blob):/i.test(path)) return "User attachment";
  const segment = path.split(/[/?#]/).filter(Boolean).pop();
  return segment ? decodeURIComponentSafe(segment) : "User attachment";
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
    if (query) return query;
    const queries = Array.isArray(record.queries)
      ? record.queries.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : [])
      : [];
    if (queries.length > 1) return `${queries[0]} ...`;
    return queries[0] ?? "";
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

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

function multiAgentGroupLabelForItems(items: ThreadItem[]): string {
  const first = items[0];
  if (!first) return "Updated agents";
  const receiverCount = uniqueMultiAgentReceiverThreadIds(items).length;
  const countLabel = receiverCount > 0 ? ` ${formatCount(receiverCount, "agent")}` : "";
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
  const raw = Array.isArray(record.receiverThreadIds)
    ? record.receiverThreadIds
    : Array.isArray(record.receiverThreads)
      ? record.receiverThreads
      : [];
  return raw.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
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

function eventLabel(item: ThreadItem): string {
  const type = itemType(item);
  if (type === "userInput" || type === "user-input") return isCompletedRecord(item) ? "User input request" : "User input requested";
  if (type === "user-input-response") return "User input response";
  if (type === "mcp-server-elicitation") return "MCP server elicitation";
  if (type === "permission-request") return "Permission request";
  if (type === "turn-diff") return "Diff";
  if (type === "automation-update") return "Automation update";
  if (type === "automatic-approval-review") return "Auto-review";
  if (type === "multi-agent-action") return "Subagent action";
  if (type === "plan-implementation") return "Plan implementation";
  if (type === "remote-task-created") return "Remote task created";
  if (type === "context-compaction") return "Context compaction";
  if (type === "personality-changed") return "Personality changed";
  if (type === "forked-from-conversation") return "Forked conversation";
  if (type === "model-changed") return "Model changed";
  if (type === "model-rerouted") return "Model rerouted";
  if (type === "system-error") return "System error";
  if (type === "stream-error") return "Stream error";
  if (type === "imageView") return "Viewed image";
  if (type === "imageGeneration" || type === "generated-image") return "Generated image";
  if (type === "enteredReviewMode") return "Entered review";
  if (type === "exitedReviewMode") return "Exited review";
  if (type === "proposed-plan") return "Plan";
  return type;
}

function eventText(item: ThreadItem): string {
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "userInput" || type === "user-input") {
    return eventLines(userInputQuestionLines(record)) || itemText(item) || formatUnknown(item);
  }
  if (type === "user-input-response") {
    return eventLines(questionAnswerLines(record.questionsAndAnswers)) || itemText(item) || formatUnknown(item);
  }
  if (type === "mcp-server-elicitation") {
    return eventLines([
      `Status: ${completedStatus(item, "pending")}`,
      `Action: ${stringField(record, "action") || "none"}`,
    ]);
  }
  if (type === "permission-request") {
    return eventLines([
      `Status: ${completedStatus(item, "pending")}`,
      `Reason: ${stringField(record, "reason") || "Not provided"}`,
      `Response: ${permissionResponseText(record.response)}`,
    ]);
  }
  if (type === "turn-diff") {
    return stringField(record, "unifiedDiff") || stringField(record, "diff") || itemText(item) || formatUnknown(item);
  }
  if (type === "automation-update") {
    const result = recordObject(record.result);
    return eventLines([
      `Mode: ${stringField(result, "mode") || "pending"}`,
      `Automation ID: ${stringField(result, "automationId") || stringField(result, "automation_id") || "pending"}`,
    ]);
  }
  if (type === "automatic-approval-review") {
    return eventLines([
      `Status: ${stringField(record, "status") || "pending"}`,
      keyValueLine("Risk", record.riskLevel),
      keyValueLine("Rationale", record.rationale),
    ]);
  }
  if (type === "multi-agent-action") {
    const receiverThreads = multiAgentReceiverThreadIds(item);
    return eventLines([
      keyValueLine("Action", multiAgentAction(item)),
      keyValueLine("Status", multiAgentStatus(item)),
      receiverThreads.length === 0 ? "" : `Receiver threads: ${receiverThreads.length}`,
      keyValueLine("Prompt", record.prompt),
    ]);
  }
  if (type === "plan-implementation") {
    return eventLines([
      `Status: ${record.isCompleted === true ? "completed" : completedStatus(item, "running")}`,
      scalarText(record.planContent),
    ]);
  }
  if (type === "remote-task-created") {
    return eventLines([`Task ID: ${stringField(record, "taskId") || stringField(record, "task_id") || "unknown"}`]);
  }
  if (type === "context-compaction") {
    return eventLines([
      keyValueLine("Source", record.source),
      `Status: ${completedStatus(item, "running")}`,
    ]);
  }
  if (type === "personality-changed") {
    return eventLines([keyValueLine("Personality", record.personality)]);
  }
  if (type === "forked-from-conversation") {
    return eventLines([`Source conversation: ${stringField(record, "sourceConversationId") || stringField(record, "source_conversation_id") || "unknown"}`]);
  }
  if (type === "model-changed") {
    return modelTransitionText(record) || itemText(item) || formatUnknown(item);
  }
  if (type === "model-rerouted") {
    return eventLines([
      modelTransitionText(record),
      keyValueLine("Reason", record.reason),
    ]) || itemText(item) || formatUnknown(item);
  }
  if (type === "system-error") {
    return itemText(item) || scalarText(record.message) || scalarText(record.error) || formatUnknown(item);
  }
  if (type === "stream-error") {
    return eventLines([
      scalarText(record.content) || scalarText(record.message) || scalarText(record.error),
      scalarText(record.additionalDetails) || scalarText(record.additional_details),
    ]) || formatUnknown(item);
  }
  if (type === "generated-image" || type === "imageGeneration") {
    const src = imageEventSource(record);
    if (src) return `![Generated image](${markdownImageTarget(src)})`;
    return eventLines([
      keyValueLine("Status", record.status),
      keyValueLine("Image", src),
    ]) || itemText(item) || formatUnknown(item);
  }
  if (type === "imageView") {
    return eventLines([keyValueLine("Image", record.path ?? record.url ?? record.src)]) || itemText(item) || formatUnknown(item);
  }
  if (type === "proposed-plan") {
    return itemText(item) || scalarText(record.content) || formatUnknown(item);
  }
  return itemText(item) || formatUnknown(item);
}

function eventTone(item: ThreadItem): EventTone | undefined {
  const type = itemType(item);
  if (type === "system-error" || type === "stream-error") return "error";
  if (type === "permission-request" && !isCompletedRecord(item)) return "warning";
  return undefined;
}

function eventFormat(item: ThreadItem): EventFormat | undefined {
  const type = itemType(item);
  if (type === "turn-diff") return "diff";
  if ((type === "generated-image" || type === "imageGeneration") && imageEventSource(item as ItemRecord)) {
    return "markdown";
  }
  return undefined;
}

function userInputQuestionLines(record: ItemRecord): string[] {
  return recordArray(record.questions).flatMap((question) => {
    const text = stringField(question, "question") || stringField(question, "label") || scalarText(question);
    return text ? [`- ${text}`] : [];
  });
}

function questionAnswerLines(value: unknown): string[] {
  return recordArray(value).flatMap((questionAndAnswer) => {
    const question = stringField(questionAndAnswer, "question");
    const answers = Array.isArray(questionAndAnswer.answers)
      ? questionAndAnswer.answers.map(scalarText).filter(Boolean)
      : [];
    const lines = question ? [`- ${question}`] : [];
    lines.push(...answers.map((answer) => `  - ${answer}`));
    return lines;
  });
}

function completedStatus(item: ThreadItem, incompleteStatus: string): string {
  if (isCompletedRecord(item)) return "completed";
  return stringField(item, "status") || incompleteStatus;
}

function permissionResponseText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value.trim() || "granted";
  return "granted";
}

function modelTransitionText(record: ItemRecord): string {
  const from = stringField(record, "fromModel") || stringField(record, "from_model");
  const to = stringField(record, "toModel") || stringField(record, "to_model");
  if (!from && !to) return "";
  return `${from || "unknown"} -> ${to || "unknown"}`;
}

function imageEventSource(record: ItemRecord): string {
  const src = stringField(record, "src") || stringField(record, "url") || stringField(record, "path") || stringField(record, "savedPath");
  if (!src) return "";
  if (/^(?:data|blob|https?|file):/i.test(src)) return src;
  if (src.startsWith("/")) return `file://${encodeURI(src)}`;
  return src;
}

function imageArtifactTitle(value: string): string {
  if (/^(?:data|blob):/i.test(value)) return "Generated image";
  try {
    const url = new URL(value);
    const filename = url.pathname.split("/").filter(Boolean).pop();
    return filename ? decodeURIComponent(filename) : url.hostname || "Generated image";
  } catch {
    const filename = value.split(/[/?#]/).filter(Boolean).pop();
    return filename || "Generated image";
  }
}

function markdownImageTarget(value: string): string {
  return /[\s()<>]/.test(value) ? `<${value.replaceAll(">", "%3E")}>` : value;
}

function keyValueLine(label: string, value: unknown): string {
  const text = scalarText(value);
  return text ? `${label}: ${text}` : "";
}

function eventLines(lines: string[]): string {
  return lines.map((line) => line.trimEnd()).filter((line) => line.trim().length > 0).join("\n");
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return formatUnknown(value);
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function filePathsFromItem(item: ThreadItem): string[] {
  const record = item as ItemRecord;
  const paths: string[] = [];
  if (typeof record.path === "string") paths.push(record.path);
  if (typeof record.savedPath === "string") paths.push(record.savedPath);
  const changes = Array.isArray(record.changes) ? record.changes : [];
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    for (const key of ["path", "file", "filePath", "oldPath", "newPath"]) {
      const value = (change as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) paths.push(value);
    }
  }
  return dedupe(paths);
}

function artifactsFromText(text: string): RailEntry[] {
  const entries: RailEntry[] = [];
  const targets = [
    ...orderedMatches(text, /\[[^\]]+]\(([^)]+)\)/g, 1),
    ...orderedMatches(text, /https?:\/\/[^\s)]+/g, 0),
    ...orderedMatches(text, /`([^`]+\.[A-Za-z0-9]{1,8})`/g, 1),
  ].sort((left, right) => left.index - right.index).map((match) => match.target);
  for (const target of dedupe(targets)) {
    if (!target || target.startsWith("#")) continue;
    if (target.startsWith("http://") || target.startsWith("https://")) {
      entries.push({
        id: `website:${target}`,
        title: urlTitle(target),
        meta: target,
        status: "website",
        action: { kind: "url", url: target },
      });
      continue;
    }
    if (looksLikeFilePath(target)) {
      const reference = fileReferenceFromPath(target);
      entries.push({
        id: target,
        title: reference.path.split("/").filter(Boolean).pop() ?? reference.path,
        meta: target,
        status: "referenced",
        reference,
        action: { kind: "file", reference },
      });
    }
  }
  return entries;
}

function fileReferenceFromPath(value: string): RailEntryReference {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(?::(\d+)(?:-(\d+))?)$/);
  if (!match || !match[1] || !match[2]) return { path: trimmed, lineStart: 1 };
  return {
    path: match[1],
    lineStart: Number(match[2]),
    ...(match[3] ? { lineEnd: Number(match[3]) } : {}),
  };
}

function orderedMatches(text: string, pattern: RegExp, group: number): Array<{ index: number; target: string }> {
  return Array.from(text.matchAll(pattern)).map((match) => ({
    index: match.index ?? 0,
    target: match[group] ?? "",
  }));
}

function setArtifact(artifacts: Map<string, RailEntry>, key: string, entry: RailEntry): void {
  if (artifacts.has(key)) return;
  artifacts.set(key, entry);
}

function artifactKey(entry: RailEntry): string {
  if (entry.status === "website") return `website:${entry.meta ?? entry.id}`;
  return entry.meta ?? entry.id;
}

function looksLikeFilePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /^[\w.-]+\/[\w./-]+\.[\w-]+$/.test(value);
}

function urlTitle(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost"
      ? `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`
      : url.hostname;
  } catch {
    return value;
  }
}

function commandLabel(item: ThreadItem): string {
  const command = stringField(item, "command");
  if (!command) return isItemInProgress(item) ? "Running command" : "Ran command";
  return `${isItemInProgress(item) ? "Running" : "Ran"} ${command}`;
}

function durationMs(item: ThreadItem): number {
  const record = item as ItemRecord;
  const value = record.durationMs;
  if (itemType(item) === "worked-for") {
    const started = typeof record.startedAtMs === "number" && Number.isFinite(record.startedAtMs) ? record.startedAtMs : null;
    const completed = typeof record.completedAtMs === "number" && Number.isFinite(record.completedAtMs) ? record.completedAtMs : null;
    if (started !== null && completed !== null && completed > started) return completed - started;
  }
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function statusText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.status === "string") return record.status;
  if (typeof record.exitCode === "number") return record.exitCode === 0 ? "completed" : `exit ${record.exitCode}`;
  if (isItemInProgress(item)) return "inProgress";
  return "completed";
}

function coalesceProgress(entries: RailEntry[]): RailEntry[] {
  const seen = new Set<string>();
  const result: RailEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.title}:${entry.meta ?? ""}:${entry.status ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.slice(-12);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : formatUnknown(item));
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
