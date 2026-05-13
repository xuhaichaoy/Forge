import type {
  ConversationProjection,
  ConversationProjectionOptions,
  ConversationRenderUnit,
  ItemRecord,
  RailEntry,
  ThreadItem,
  ToolActivityGroupType,
} from "./render-group-types";
import { assistantArtifactsForTurn } from "./assistant-artifacts";
import { projectBackgroundAgentRailEntries } from "./background-agents";
import { projectBackgroundTerminalRailEntries } from "./background-terminals";
import { eventFormat, eventLabel, eventText, eventTone } from "./event-projection";
import {
  collectRailEntries,
  progressEntriesFromPlan,
  type ArtifactFileCandidateIndex,
} from "./rail-projection";
import {
  assistantMessagePhase,
  assistantMessageText,
  coalesceProgress,
  isCompletedRecord,
  isItemInProgress,
  itemType,
  mcpAppResourceUri,
  mcpAppResourceUriFromServerStatuses,
  mcpElicitationServer,
  mcpServerName,
  mcpToolName,
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
import { hiCodexImageToolOutputUrl } from "./image-generation-tool";
import { projectUserMessageContent, userMessageText } from "./user-message-content";

export function projectConversation(rawItems: ThreadItem[], options: ConversationProjectionOptions = {}): ConversationProjection {
  const items = withMcpAppResourceUris(rawItems, options.mcpServerStatuses);
  const units: ConversationRenderUnit[] = [];
  let progress: RailEntry[] = [];
  const artifacts = new Map<string, RailEntry>();
  const sources = new Map<string, RailEntry>();
  const fileCandidates: ArtifactFileCandidateIndex = new Map();
  const blockedMcpServers = blockedMcpServersFromItems(items);
  const workedForCollapsedByDefaultIds = workedForIdsWithTrailingAssistant(items);
  let activity: ThreadItem[] = [];
  let activityGroupType: ToolActivityGroupType | null = null;
  let activityGroupKey: string | null = null;
  const conversationDetailLevel = options.conversationDetailLevel ?? "STEPS_COMMANDS";

  /*
   * Codex Desktop `W` function (split-items-into-render-groups-C1Yh6v3t.js) aggregates
   * exploration / patch / exec / hook / mcp-tool-call / web-search into one segment
   * bucket per `G` predicate, then wraps that bucket as a single `collapsed-tool-activity`
   * with cross-type counts (webSearchCount, commandCount, exploredFileCount, …). The
   * `Ge` function additionally folds reasoning items into the current exploration buffer.
   *
   * We approximate the same behavior here: groupTypes that Codex's `G` accepts are mapped
   * onto the same merged bucket so consecutive items don't split into separate render
   * rows. Reasoning still joins the current merged bucket (or a standalone exploration
   * if already in one). Standalone groupTypes (`worked-for` / `multi-agent-group` /
   * `pending-mcp-tool-calls` / `todo-list`) keep their independent bucket.
   */
  const MERGEABLE_ACTIVITY_GROUP_TYPES: ReadonlySet<ToolActivityGroupType> = new Set([
    "collapsed-tool-activity",
    "exploration",
    "web-search-group",
  ]);

  const pushActivityItem = (item: ThreadItem, forcedGroupType?: ToolActivityGroupType) => {
    const baseGroupType = forcedGroupType ?? baseToolActivityGroupType(item);
    const currentIsMergeable = activityGroupType !== null
      && MERGEABLE_ACTIVITY_GROUP_TYPES.has(activityGroupType);
    const incomingIsMergeable = MERGEABLE_ACTIVITY_GROUP_TYPES.has(baseGroupType);

    // Codex `Ge` :7782 — real reasoning items are silently absorbed into the active
    // exploration buffer (so the buffer keeps building) and `Jw` :7881 then renders
    // each reasoning entry as `null`. Synthetic `thinking-placeholder` items, however,
    // ARE the live "Thinking" UX (Codex `ZT` :8384) and must end up in their own
    // `reasoning`-typed bucket so `ToolActivityView` routes them to
    // `ReasoningActivityView`.
    if (baseGroupType === "reasoning") {
      const isThinkingPlaceholder = (item as Record<string, unknown>)._syntheticKind === "thinking-placeholder";
      if (isThinkingPlaceholder) {
        if (activity.length > 0) flushActivity();
        activityGroupType = "reasoning";
        activityGroupKey = toolActivityGroupKey(item, "reasoning");
        activity.push(item);
        return;
      }
      // Real reasoning item: append to the current mergeable bucket so the
      // exploration / collapsed-tool-activity summary keeps building, but the item
      // itself is hidden in `toolActivityDetailItems` so it never renders as a row.
      if (currentIsMergeable) {
        activity.push(item);
      }
      // Otherwise drop — no row, no JSON fallback.
      return;
    }

    // Mergeable item joining a mergeable bucket (Codex `W` :line-2 segment aggregation).
    if (currentIsMergeable && incomingIsMergeable) {
      if (activityGroupType !== baseGroupType) {
        // Heterogeneous mix — promote the bucket to `collapsed-tool-activity` so the
        // summary builder produces a cross-type count label
        // ("Explored 1 file, ran 2 commands, searched web 4 times").
        activityGroupType = "collapsed-tool-activity";
        activityGroupKey = `merged-activity:${activityGroupKey ?? toolActivityGroupKey(item, "collapsed-tool-activity")}`;
      }
      activity.push(item);
      return;
    }

    // Otherwise the new item starts (or continues) a bucket of its own type.
    const nextGroupKey = toolActivityGroupKey(item, baseGroupType);
    if (baseGroupType === "worked-for" && activity.length > 0) {
      flushActivity();
    }
    if (activity.length > 0 && (activityGroupType !== baseGroupType || activityGroupKey !== nextGroupKey)) {
      flushActivity();
    }
    activityGroupType = baseGroupType;
    activityGroupKey = nextGroupKey;
    activity.push(item);
  };

  const flushActivity = (context: { isCurrentToolActivity?: boolean } = {}) => {
    if (activity.length === 0) return;
    if (shouldKeepSingleActivityAsThreadItem(activity, {
      conversationDetailLevel,
      isCurrentToolActivity: context.isCurrentToolActivity === true,
    })) {
      const [item] = activity;
      if (item) units.push(threadItemRenderUnit(item));
      activity = [];
      activityGroupType = null;
      activityGroupKey = null;
      return;
    }
    const summary = summarizeToolActivity(activity, {
      conversationDetailLevel: options.conversationDetailLevel ?? "STEPS_COMMANDS",
      workedForCollapsedByDefault: activity.some((item) => workedForCollapsedByDefaultIds.has(item.id)),
      /*
       * If `pushActivityItem` promoted the bucket to a cross-type
       * `collapsed-tool-activity` (Codex `W` :line-2 segment aggregation), preserve that
       * group type so the summary builder produces the cross-type count label.
       */
      groupTypeOverride: activityGroupType ?? undefined,
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

  const pushConversationItem = (
    item: ThreadItem,
    options: { assistantArtifacts?: RailEntry[] } = {},
  ) => {
    if (shouldSkipConversationItem(item)) {
      return;
    }
    if (itemType(item) === "todo-list") {
      const nextProgress = collectRailEntries(item, artifacts, sources, fileCandidates);
      if (nextProgress) {
        progress = nextProgress;
      }
      return;
    }
    if (isBlockingOutOfBandItem(item, blockedMcpServers)) {
      return;
    }
    const nextProgress = collectRailEntries(item, artifacts, sources, fileCandidates);
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
        ...(options.assistantArtifacts && options.assistantArtifacts.length > 0
          ? { artifacts: options.assistantArtifacts }
          : {}),
        assistantPhase: assistantMessagePhase(item),
        renderPlaceholder,
      });
      return;
    }
    if (hiCodexImageToolOutputUrl(item)) {
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
      return;
    }
    if (isToolActivityItem(item)) {
      pushActivityItem(item);
      return;
    }
    if (shouldRenderStandaloneThreadItem(item)) {
      flushActivity();
      units.push(threadItemRenderUnit(item));
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
    const turnStatus = turnStatusForSegment(segment, {
      isLastSegment: index === segments.length - 1,
      isThreadRunning: options.isThreadRunning === true,
    });
    const assistantArtifactsForItem = (item: ThreadItem) => {
      const itemIndex = segment.indexOf(item);
      const itemsThroughAssistant = itemIndex >= 0 ? segment.slice(0, itemIndex + 1) : segment;
      return assistantArtifactsForTurn(
        itemsThroughAssistant,
        assistantMessageText(item),
        artifacts.values(),
        fileCandidates,
      );
    };

    if (!segment.some(isUserMessage)) {
      for (const item of segment) {
        pushConversationItem(
          item,
          isAssistantMessage(item) ? { assistantArtifacts: assistantArtifactsForItem(item) } : {},
        );
      }
      continue;
    }
    const split = splitTurnItems(segment, turnStatus);

    if (split.todoListItem) {
      pushConversationItem(split.todoListItem);
    }

    for (const item of split.modelChangedItems) pushConversationItem(item);
    for (const item of split.preUserItems) pushConversationItem(item);
    for (const item of split.userItems) pushConversationItem(item);
    for (const item of split.modelReroutedItems) pushConversationItem(item);
    for (const item of split.agentItems) {
      pushConversationItem(
        item,
        isAssistantMessage(item) ? { assistantArtifacts: assistantArtifactsForItem(item) } : {},
      );
    }
    for (const item of split.automationUpdateItems) pushConversationItem(item);
    if (split.systemEventItem) pushConversationItem(split.systemEventItem);
    if (split.assistantItem) {
      pushConversationItem(split.assistantItem, {
        assistantArtifacts: assistantArtifactsForItem(split.assistantItem),
      });
    }
    for (const item of split.toolOutputItems) pushConversationItem(item);
    for (const item of split.postAssistantItems) pushConversationItem(item);
    for (const item of split.mcpServerElicitationItems) pushConversationItem(item);
    for (const item of split.permissionRequestItems) pushConversationItem(item);
    if (split.approvalItem) pushConversationItem(split.approvalItem);
    if (split.userInputItem) pushConversationItem(split.userInputItem);
    if (split.proposedPlanItem) pushConversationItem(split.proposedPlanItem);
    if (shouldRenderDesktopThinkingPlaceholder(split, turnStatus)) {
      pushConversationItem(desktopThinkingPlaceholderItem(segment, split));
    }
    if (split.planImplementationItem) pushConversationItem(split.planImplementationItem);
    if (split.unifiedDiffItem) pushConversationItem(split.unifiedDiffItem);
    for (const item of split.remoteTaskCreatedItems) pushConversationItem(item);
    for (const item of split.personalityChangedItems) pushConversationItem(item);
    for (const item of split.forkedFromConversationItems) pushConversationItem(item);
  }

  flushActivity({ isCurrentToolActivity: options.isThreadRunning === true });

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

function withMcpAppResourceUris(items: ThreadItem[], mcpServerStatuses: unknown): ThreadItem[] {
  if (!mcpServerStatuses) return items;
  let changed = false;
  const next = items.map((item) => {
    if (itemType(item) !== "mcp-tool-call" || mcpAppResourceUri(item)) return item;
    const resourceUri = mcpAppResourceUriFromServerStatuses(
      mcpServerStatuses,
      mcpServerName(item),
      mcpToolName(item),
    );
    if (!resourceUri) return item;
    changed = true;
    return { ...item, mcpAppResourceUri: resourceUri };
  });
  return changed ? next : items;
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
    if (hiCodexImageToolOutputUrl(item)) {
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

function shouldRenderDesktopThinkingPlaceholder(
  split: DesktopTurnSplit,
  turnStatus: string,
): boolean {
  /*
   * Mirrors Codex Desktop `oT` (local-conversation-thread.pretty.js :8000-8002)
   * combined with `Ge` (split-items-into-render-groups-C1Yh6v3t.js): the live
   * "Thinking" placeholder is shown when the turn is in progress AND nothing
   * else (exploring/planning/blocking request/active web search/assistant with
   * output / running non-reasoning agent step) is already telling the user the
   * model is busy.
   *
   * In particular, Codex's `Ge` explicitly sets
   * `isAnyNonExploringAgentItemInProgress = false` when the last agent item is
   * an in-progress reasoning event (the `if (e.item.type === 'reasoning' && ...)
   * o = false` branch). Reasoning items are folded into the exploration buffer
   * or dropped — they never count as "an agent item in progress" that should
   * suppress the thinking row. Without this carve-out, HiCodex's
   * `event-unit.tsx` (`Jw`-parity: real reasoning units return `null`) would
   * leave the entire process area visually empty while the model is reasoning.
   */
  if (turnStatus !== "in_progress") return false;
  if (hasBlockingRequest(split)) return false;
  if (split.proposedPlanItem && isItemInProgress(split.proposedPlanItem)) return false;
  if (split.assistantItem && hasAssistantOutput(split.assistantItem)) return false;
  return !split.agentItems.some((item) =>
    itemType(item) !== "reasoning" && isItemInProgress(item),
  );
}

function hasBlockingRequest(split: DesktopTurnSplit): boolean {
  return Boolean(
    split.approvalItem
    || split.userInputItem
    || split.mcpServerElicitationItems.some((item) => !isCompletedRecord(item))
    || split.permissionRequestItems.some((item) => !isCompletedRecord(item)),
  );
}

function desktopThinkingPlaceholderItem(segment: ThreadItem[], split: DesktopTurnSplit): ThreadItem {
  const anchor = split.userItems[split.userItems.length - 1] ?? segment[0];
  const turnId = segment.map((item) => (item as ItemRecord)._turnId).find((id): id is string =>
    typeof id === "string" && id.length > 0
  ) ?? null;
  const anchorId = anchor?.id || turnId || "active-turn";
  return {
    id: `thinking-placeholder:${anchorId}`,
    type: "reasoning",
    status: "inProgress",
    completed: false,
    ...(turnId ? { _turnId: turnId } : {}),
    _syntheticKind: "thinking-placeholder",
  };
}

function shouldKeepSingleActivityAsThreadItem(
  items: ThreadItem[],
  context: { conversationDetailLevel: "STEPS_COMMANDS" | "STEPS_PROSE"; isCurrentToolActivity: boolean },
): boolean {
  if (items.length !== 1) return false;
  const item = items[0];
  if (!item) return false;
  const type = itemType(item);
  if (type === "automatic-approval-review" || type === "hook") return true;
  return (
    type === "exec"
    && context.conversationDetailLevel !== "STEPS_PROSE"
    && context.isCurrentToolActivity !== true
  );
}

function shouldRenderStandaloneThreadItem(item: ThreadItem): boolean {
  const type = itemType(item);
  return type === "dynamic-tool-call" || type === "automatic-approval-review";
}

function threadItemRenderUnit(
  item: ThreadItem,
): Extract<ConversationRenderUnit, { kind: "threadItem" }> {
  return {
    kind: "threadItem",
    key: threadItemRenderKey(item),
    item,
  };
}

function threadItemRenderKey(item: ThreadItem): string {
  const type = itemType(item);
  const id = typeof item.id === "string" && item.id.length > 0
    ? item.id
    : typeof (item as Record<string, unknown>).callId === "string" && String((item as Record<string, unknown>).callId).length > 0
      ? String((item as Record<string, unknown>).callId)
      : "unknown";
  return `item:${type}:${id}`;
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
    if (unit?.kind === "threadItem" && isItemInProgress(unit.item)) return -1;
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
