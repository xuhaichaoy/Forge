import type { ConversationProjection, ConversationProjectionOptions, ConversationRenderUnit, ItemRecord, RailEntry, ThreadItem, ToolActivityGroupType } from "./render-group-types";
import { projectBackgroundAgentRailEntries } from "./background-agents";
import { projectBackgroundTerminalRailEntries } from "./background-terminals";
import { eventFormat, eventLabel, eventText, eventTone } from "./event-projection";
import { collectRailEntries, progressEntriesFromPlan } from "./rail-projection";
import {
  assistantMessagePhase,
  assistantMessageText,
  coalesceProgress,
  isCompletedRecord,
  itemType,
  mcpElicitationServer,
  mcpServerName,
} from "./thread-item-fields";
import {
  baseToolActivityGroupType,
  blockedMcpServersFromItems,
  isBlockingOutOfBandItem,
  isToolActivityItem,
  summarizeToolActivity,
  toolActivityGroupKey,
  toolActivityRenderKey,
} from "./tool-activity-grouping";
import { projectUserMessageContent, userMessageText } from "./user-message-content";

export function projectConversation(items: ThreadItem[], options: ConversationProjectionOptions = {}): ConversationProjection {
  const units: ConversationRenderUnit[] = [];
  let progress: RailEntry[] = [];
  const artifacts = new Map<string, RailEntry>();
  const sources = new Map<string, RailEntry>();
  const blockedMcpServers = blockedMcpServersFromItems(items);
  const agentBodyAssistantIds = agentBodyAssistantMessageIds(items);
  const workedForCollapsedByDefaultIds = workedForIdsWithTrailingAssistant(items);
  let activity: ThreadItem[] = [];
  let activityGroupType: ToolActivityGroupType | null = null;
  let activityGroupKey: string | null = null;

  const pushActivityItem = (item: ThreadItem, forcedGroupType?: ToolActivityGroupType) => {
    const baseGroupType = forcedGroupType ?? baseToolActivityGroupType(item);
    const nextGroupType = baseGroupType === "reasoning" && activityGroupType === "exploration"
      ? "exploration"
      : baseGroupType;
    const nextGroupKey = toolActivityGroupKey(item, nextGroupType);
    if (nextGroupType === "worked-for" && activity.length > 0) {
      flushActivity();
    }
    if (activity.length > 0 && (activityGroupType !== nextGroupType || activityGroupKey !== nextGroupKey)) {
      flushActivity();
    }
    activityGroupType = nextGroupType;
    activityGroupKey = nextGroupKey;
    activity.push(item);
  };

  const flushActivity = () => {
    if (activity.length === 0) return;
    const summary = summarizeToolActivity(activity, {
      conversationDetailLevel: options.conversationDetailLevel ?? "STEPS_COMMANDS",
      workedForCollapsedByDefault: activity.some((item) => workedForCollapsedByDefaultIds.has(item.id)),
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

  const pushConversationItem = (item: ThreadItem, options: { forceAgentBody?: boolean } = {}) => {
    if (shouldSkipConversationItem(item)) {
      return;
    }
    if (itemType(item) === "todo-list") {
      const nextProgress = collectRailEntries(item, artifacts, sources);
      if (nextProgress) {
        progress = nextProgress;
      }
      return;
    }
    if (isBlockingOutOfBandItem(item, blockedMcpServers)) {
      return;
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
      return;
    }
    if (isAssistantMessage(item)) {
      if (options.forceAgentBody === true || agentBodyAssistantIds.has(item.id)) {
        pushActivityItem(item, "collapsed-tool-activity");
        return;
      }
      const renderPlaceholder = shouldRenderAssistantPlaceholder(item);
      const text = assistantMessageText(item);
      if (!text.trim() && !renderPlaceholder) {
        return;
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
      return;
    }
    if (isToolActivityItem(item)) {
      pushActivityItem(item);
      return;
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
  };

  const segments = conversationSegments(items);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? [];
    if (!segment.some(isUserMessage)) {
      for (const item of segment) pushConversationItem(item);
      continue;
    }
    const split = splitTurnItems(segment, turnStatusForSegment(segment, {
      isLastSegment: index === segments.length - 1,
      isThreadRunning: options.isThreadRunning === true,
    }));

    if (split.todoListItem) {
      pushConversationItem(split.todoListItem);
    }

    for (const item of split.modelChangedItems) pushConversationItem(item);
    for (const item of split.preUserItems) pushConversationItem(item);
    for (const item of split.userItems) pushConversationItem(item);
    for (const item of split.modelReroutedItems) pushConversationItem(item);
    for (const item of split.agentItems) pushConversationItem(item, { forceAgentBody: true });
    for (const item of split.automationUpdateItems) pushConversationItem(item);
    if (split.systemEventItem) pushConversationItem(split.systemEventItem);
    if (split.assistantItem) pushConversationItem(split.assistantItem);
    for (const item of split.toolOutputItems) pushConversationItem(item);
    for (const item of split.postAssistantItems) pushConversationItem(item, { forceAgentBody: true });
    for (const item of split.mcpServerElicitationItems) pushConversationItem(item);
    for (const item of split.permissionRequestItems) pushConversationItem(item);
    if (split.approvalItem) pushConversationItem(split.approvalItem);
    if (split.userInputItem) pushConversationItem(split.userInputItem);
    if (split.proposedPlanItem) pushConversationItem(split.proposedPlanItem);
    if (split.planImplementationItem) pushConversationItem(split.planImplementationItem);
    if (split.unifiedDiffItem) pushConversationItem(split.unifiedDiffItem);
    for (const item of split.remoteTaskCreatedItems) pushConversationItem(item);
    for (const item of split.personalityChangedItems) pushConversationItem(item);
    for (const item of split.forkedFromConversationItems) pushConversationItem(item);
  }

  flushActivity();

  const explicitProgress = options.progressPlan
    ? progressEntriesFromPlan(options.progressPlan.plan, options.progressPlan.id ?? "turn-plan")
    : null;

  return {
    units: withStreamingAssistantState(units, options.isThreadRunning === true),
    progress: coalesceProgress(explicitProgress ?? progress),
    artifacts: Array.from(artifacts.values()),
    backgroundAgents: projectBackgroundAgentRailEntries(items),
    backgroundTerminals: projectBackgroundTerminalRailEntries(items),
    sources: Array.from(sources.values()),
  };
}

export interface DesktopTurnSplit {
  preUserItems: ThreadItem[];
  userItems: ThreadItem[];
  agentItems: ThreadItem[];
  automationUpdateItems: ThreadItem[];
  assistantItem: ThreadItem | null;
  toolOutputItems: ThreadItem[];
  postAssistantItems: ThreadItem[];
  systemEventItem: ThreadItem | null;
  unifiedDiffItem: ThreadItem | null;
  remoteTaskCreatedItems: ThreadItem[];
  personalityChangedItems: ThreadItem[];
  forkedFromConversationItems: ThreadItem[];
  modelChangedItems: ThreadItem[];
  modelReroutedItems: ThreadItem[];
  todoListItem: ThreadItem | null;
  proposedPlanItem: ThreadItem | null;
  planImplementationItem: ThreadItem | null;
  mcpServerElicitationItems: ThreadItem[];
  permissionRequestItems: ThreadItem[];
  approvalItem: ThreadItem | null;
  userInputItem: ThreadItem | null;
}

export function splitTurnItems(items: ThreadItem[], turnStatus: string = "completed"): DesktopTurnSplit {
  let approvalItem: ThreadItem | null = null;
  let userInputItem: ThreadItem | null = null;
  const preUserItems: ThreadItem[] = [];
  const userItems: ThreadItem[] = [];
  let assistantItem: ThreadItem | null = null;
  let todoListItem: ThreadItem | null = null;
  let proposedPlanItem: ThreadItem | null = null;
  let planImplementationItem: ThreadItem | null = null;
  const mcpServerElicitationItems: ThreadItem[] = [];
  const permissionRequestItems: ThreadItem[] = [];
  const blockedMcpServers = new Set<string>();
  const agentItems: ThreadItem[] = [];
  const automationUpdateItems: ThreadItem[] = [];
  const toolOutputItems: ThreadItem[] = [];
  const postAssistantItems: ThreadItem[] = [];
  const remoteTaskCreatedItems: ThreadItem[] = [];
  const personalityChangedItems: ThreadItem[] = [];
  const forkedFromConversationItems: ThreadItem[] = [];
  const modelChangedItems: ThreadItem[] = [];
  const modelReroutedItems: ThreadItem[] = [];
  const hasFutureUserOrAgentItem: boolean[] = new Array(items.length);
  let hasFutureRenderable = false;
  let hasTurnStarted = false;
  let unifiedDiffItem: ThreadItem | null = null;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    hasFutureUserOrAgentItem[index] = hasFutureRenderable;
    const item = items[index];
    if (item && (isUserMessage(item) || isDesktopAgentRenderableItem(item))) {
      hasFutureRenderable = true;
    }
  }

  for (const [index, item] of items.entries()) {
    const type = itemType(item);
    if (type === "user-message" && hasHeartbeatTrigger(item)) {
      userItems.push(item);
      continue;
    }
    if (!hasTurnStarted && type === "user-message") {
      userItems.push(item);
      continue;
    }
    if (!hasTurnStarted && type === "hook") {
      preUserItems.push(item);
      continue;
    }

    hasTurnStarted = true;

    if (type === "turn-diff") {
      unifiedDiffItem = item;
      continue;
    }
    if (type === "todo-list") {
      todoListItem = item;
      continue;
    }
    if (type === "proposed-plan") {
      proposedPlanItem = item;
      continue;
    }
    if (type === "remote-task-created") {
      remoteTaskCreatedItems.push(item);
      continue;
    }
    if (type === "personality-changed") {
      personalityChangedItems.push(item);
      continue;
    }
    if (type === "forked-from-conversation") {
      forkedFromConversationItems.push(item);
      continue;
    }
    if (type === "model-changed") {
      modelChangedItems.push(item);
      continue;
    }
    if (type === "model-rerouted") {
      modelReroutedItems.push(item);
      continue;
    }
    if (type === "plan-implementation") {
      planImplementationItem = item;
      continue;
    }
    if (type === "mcp-server-elicitation") {
      if (!isCompletedRecord(item)) {
        const server = mcpElicitationServer(item);
        if (server) blockedMcpServers.add(server);
      }
      mcpServerElicitationItems.push(item);
      continue;
    }
    if (type === "permission-request") {
      permissionRequestItems.push(item);
      continue;
    }
    if (isApprovalRequestBackedTool(item)) {
      approvalItem = item;
      continue;
    }
    if ((type === "userInput" || type === "user-input") && !isCompletedRecord(item)) {
      userInputItem = item;
      continue;
    }
    if (type === "hook") {
      if (hasFutureUserOrAgentItem[index]) {
        agentItems.push(item);
      } else {
        postAssistantItems.push(item);
      }
      continue;
    }
    if (type === "user-message") {
      agentItems.push(item);
      continue;
    }
    if (type === "generated-image" || type === "imageGeneration") {
      toolOutputItems.push(item);
      continue;
    }
    if (type === "automation-update") {
      automationUpdateItems.push(item);
      continue;
    }
    if (type === "auto-review-interruption-warning") {
      postAssistantItems.push(item);
      continue;
    }
    if (isDesktopAgentRenderableItem(item)) {
      agentItems.push(item);
    }
  }

  const trailingApprovalReviewItems = takeTrailingAutomaticApprovalReviewItems(agentItems);
  const filteredAgentItems = agentItems.filter((item) =>
    itemType(item) !== "mcp-tool-call"
    || isCompletedRecord(item)
    || !blockedMcpServers.has(mcpServerName(item))
  );
  const finalAgentItem = filteredAgentItems[filteredAgentItems.length - 1];
  const finalAssistantItem = finalAgentItem && isAssistantMessage(finalAgentItem) ? finalAgentItem : null;
  const finalAssistantHasContent = finalAssistantItem ? hasAssistantOutput(finalAssistantItem) : false;

  if (finalAssistantItem) {
    filteredAgentItems.pop();
    postAssistantItems.push(...trailingApprovalReviewItems);
  } else {
    filteredAgentItems.push(...trailingApprovalReviewItems);
  }

  const lastAgentItem = filteredAgentItems[filteredAgentItems.length - 1];
  const systemEventItem = turnStatus !== "in_progress" && !finalAssistantHasContent && isSystemErrorItem(lastAgentItem)
    ? lastAgentItem ?? null
    : null;
  if (systemEventItem) {
    filteredAgentItems.pop();
  }

  assistantItem = finalAssistantItem;

  return {
    preUserItems,
    userItems,
    agentItems: filteredAgentItems,
    automationUpdateItems: assistantItem == null ? automationUpdateItems : [],
    assistantItem,
    toolOutputItems,
    postAssistantItems,
    systemEventItem,
    unifiedDiffItem,
    remoteTaskCreatedItems,
    personalityChangedItems,
    forkedFromConversationItems,
    modelChangedItems,
    modelReroutedItems,
    todoListItem,
    proposedPlanItem,
    planImplementationItem,
    mcpServerElicitationItems,
    permissionRequestItems,
    approvalItem,
    userInputItem,
  };
}

function shouldSkipConversationItem(item: ThreadItem): boolean {
  if (itemType(item) !== "multi-agent-action") return false;
  const record = item as ItemRecord;
  return record.tool === "wait" || record.action === "wait";
}

function agentBodyAssistantMessageIds(items: ThreadItem[]): Set<string> {
  const ids = new Set<string>();
  for (const segment of conversationSegments(items)) {
    const workedForIndex = segment.findIndex((item) => itemType(item) === "worked-for");
    if (workedForIndex < 0) continue;
    const finalAssistantIndex = findLastIndex(segment, isAssistantMessage);
    if (finalAssistantIndex < 0) continue;
    for (let index = 0; index < finalAssistantIndex; index += 1) {
      const item = segment[index];
      if (item && isAssistantMessage(item)) ids.add(item.id);
    }
  }
  return ids;
}

function workedForIdsWithTrailingAssistant(items: ThreadItem[]): Set<string> {
  const ids = new Set<string>();
  for (const segment of conversationSegments(items)) {
    const finalAssistantIndex = findLastIndex(segment, isAssistantMessage);
    if (finalAssistantIndex < 0) continue;
    for (let index = 0; index < finalAssistantIndex; index += 1) {
      const item = segment[index];
      if (item && itemType(item) === "worked-for") ids.add(item.id);
    }
  }
  return ids;
}

function conversationSegments(items: ThreadItem[]): ThreadItem[][] {
  const segments: ThreadItem[][] = [];
  let current: ThreadItem[] = [];
  for (const item of items) {
    if (isUserMessage(item) && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function turnStatusForSegment(
  segment: ThreadItem[],
  options: { isLastSegment: boolean; isThreadRunning: boolean },
): string {
  if (options.isLastSegment && options.isThreadRunning) return "in_progress";
  for (const item of segment) {
    const status = (item as ItemRecord)._turnStatus;
    if (typeof status === "string" && status.length > 0) return status;
  }
  return "completed";
}

function isDesktopAgentRenderableItem(item: ThreadItem): boolean {
  const type = itemType(item);
  if (type === "web-search") {
    const record = item as ItemRecord;
    return stringValue(record.query).trim().length > 0 || Boolean(record.action);
  }
  return [
    "assistant-message",
    "exec",
    "patch",
    "dynamic-tool-call",
    "mcp-tool-call",
    "automatic-approval-review",
    "multi-agent-action",
    "stream-error",
    "system-error",
    "context-compaction",
    "reasoning",
    "steered",
    "user-input-response",
    "worked-for",
  ].includes(type);
}

function hasHeartbeatTrigger(item: ThreadItem): boolean {
  return (item as ItemRecord).heartbeatTrigger != null;
}

function isApprovalRequestBackedTool(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.approvalRequestId == null && record.approval_request_id == null) return false;
  const type = itemType(item);
  if (type === "patch") return record.success == null && !isCompletedRecord(item);
  if (type !== "exec") return false;
  const output = record.output && typeof record.output === "object" ? record.output as Record<string, unknown> : null;
  return record.exitCode == null && output?.exitCode == null && !isCompletedRecord(item);
}

function takeTrailingAutomaticApprovalReviewItems(items: ThreadItem[]): ThreadItem[] {
  const trailing: ThreadItem[] = [];
  for (;;) {
    const item = items[items.length - 1];
    if (!item || itemType(item) !== "automatic-approval-review") break;
    items.pop();
    trailing.unshift(item);
  }
  return trailing;
}

function hasAssistantOutput(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return assistantMessageText(item).trim().length > 0 || record.structuredOutput != null || record.structured_output != null;
}

function isSystemErrorItem(item: ThreadItem | undefined): item is ThreadItem {
  return Boolean(item) && itemType(item as ThreadItem) === "system-error";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function withStreamingAssistantState(
  units: ConversationRenderUnit[],
  isThreadRunning: boolean,
): ConversationRenderUnit[] {
  if (!isThreadRunning) return units;
  const lastAssistantIndex = lastStreamingAssistantMessageIndex(units);
  if (lastAssistantIndex < 0) return units;
  return units.map((unit, index) =>
    index === lastAssistantIndex && unit.kind === "message" && unit.role === "assistant"
      ? { ...unit, isStreaming: true }
      : unit
  );
}

function lastStreamingAssistantMessageIndex(units: ConversationRenderUnit[]): number {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit?.kind === "toolActivity" && unit.summary.inProgress) return -1;
    if (unit?.kind === "message" && unit.role === "assistant") {
      return isAssistantMessageStreamingCandidate(unit.item) ? index : -1;
    }
  }
  return -1;
}

function isAssistantMessageStreamingCandidate(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  if (record.renderPlaceholderWhileStreaming === true && record.completed !== true) return true;
  if (record.completed === false) return true;
  const status = record.status;
  return status === "inProgress" || status === "running" || status === "streaming";
}

function shouldRenderAssistantPlaceholder(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.renderPlaceholderWhileStreaming === true && record.completed !== true;
}

function isUserMessage(item: ThreadItem): boolean {
  return itemType(item) === "user-message";
}

function isAssistantMessage(item: ThreadItem): boolean {
  return itemType(item) === "assistant-message";
}
