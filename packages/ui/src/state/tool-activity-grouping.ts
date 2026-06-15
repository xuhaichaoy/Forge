/*
 * Tool-activity grouping projection — summary main flow. The per-domain
 * layers live in the tool-activity-grouping-{labels,exploration,patch,
 * classify,multi-agent} modules (mechanical extraction — logic moved
 * verbatim). This module keeps formatItemDetail + summarizeToolActivity and
 * the cross-type summary label builders, and re-exports the complete
 * original public API so existing importers of "./tool-activity-grouping"
 * stay untouched.
 */
import { formatUnknown, stringField } from "../lib/format";

import { formatMessage } from "./i18n";
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
  isCompletedRecord,
  isItemInProgress,
  itemText,
  itemType,
  mcpServerName,
  mcpToolName,
  statusText,
} from "./thread-item-fields";
import { webSearchActionDetail } from "./tool-activity-fields";
import {
  baseToolActivityGroupType,
  commandCreatesFolderLikeCodexDesktop,
  commandSearchesWebLikeCodexDesktop,
  mcpToolCallSourceLabel,
  mcpToolCallSourceName,
} from "./tool-activity-grouping-classify";
import {
  directRunningSkillDefinitionReadLabelParts,
  explorationDetail,
  explorationSummary,
  explorationSummaryLabel,
  runningSkillDefinitionReadLabelParts,
} from "./tool-activity-grouping-exploration";
import {
  approvedRequestRowLabel,
  calledToolLabel,
  creatingFolderLabel,
  deniedRequestRowLabel,
  exploredLabel,
  exploringLabel,
  joinConjunction,
  lowerInitial,
  searchedWebLabel,
  searchingTheWebLabel,
  thinkingLabel,
  thoughtForLabel,
  thoughtLabel,
  updatedPlanLabel,
  updatedProgressLabel,
  waitingOnMcpToolLabel,
  webSearchRowLabel,
  workedForDurationLabel,
  workedLabel,
  workingLabel,
} from "./tool-activity-grouping-labels";
import { multiAgentActionRowLabel, multiAgentGroupLabelForItems } from "./tool-activity-grouping-multi-agent";
import { fileChangeSummaryLabel, patchDetail, patchSummary } from "./tool-activity-grouping-patch";

export type { DesktopSkillPathInfo } from "./tool-activity-skill-path";
export {
  baseToolActivityGroupType,
  blockedMcpServersFromItems,
  isBlockingOutOfBandItem,
  isToolActivityItem,
  toolActivityGroupKey,
  toolActivityRenderKey,
} from "./tool-activity-grouping-classify";
export { desktopSkillPathInfoForCommandPath, isRunningSkillDefinitionRead } from "./tool-activity-grouping-exploration";
export { joinConjunction } from "./tool-activity-grouping-labels";

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
          else if (commandSearchesWebLikeCodexDesktop(item)) pushActiveDetail(searchingTheWebLabel());
          else if (commandCreatesFolderLikeCodexDesktop(item)) pushActiveDetail(creatingFolderLabel());
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
      const name = `${mcpServerName(item) || "mcp"}:${mcpToolName(item) || "tool"}`;
      details.push(calledToolLabel(name, false));
      if (itemInProgress) pushActiveDetail(calledToolLabel(name, true));
    } else if (type === "dynamic-tool-call") {
      counts.dynamicCalls += 1;
      const name = [stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".");
      details.push(calledToolLabel(name, false));
      if (itemInProgress) pushActiveDetail(calledToolLabel(name, true));
    } else if (type === "web-search") {
      counts.webSearches += 1;
      const detail = webSearchDetailText(record);
      details.push(webSearchRowLabel(detail, false));
      if (itemInProgress) pushActiveDetail(webSearchRowLabel(detail, true));
    } else if (type === "multi-agent-action") {
      const label = multiAgentActionRowLabel(item);
      details.push(label);
      if (itemInProgress) pushActiveDetail(label);
    } else if (type === "automatic-approval-review") {
      const status = stringField(record, "status");
      if (status === "approved") {
        activityCounts.approvedRequests += 1;
        counts.approvedRequests += 1;
        details.push(approvedRequestRowLabel());
      } else if (status === "denied") {
        activityCounts.deniedRequests += 1;
        counts.deniedRequests += 1;
        details.push(deniedRequestRowLabel());
      } else {
        counts.other += 1;
        details.push(eventLabel(item));
      }
    } else if (type === "reasoning") {
      counts.reasoning += 1;
      if (itemInProgress) pushActiveDetail(thinkingLabel());
    } else if (type === "assistant-message") {
      counts.other += 1;
      const text = assistantMessageText(item).trim();
      details.push(text || formatMessage({ id: "hc.toolActivity.assistantUpdate", defaultMessage: "Assistant update" }));
    } else if (type === "worked-for") {
      hasWorkedFor = true;
      workedForInProgress = workedForInProgress || itemInProgress;
      workedForDurationMs += durationMs(item);
    } else if (type === "plan") {
      counts.plans += 1;
      details.push(updatedPlanLabel());
    } else if (type === "todo-list") {
      counts.plans += 1;
      details.push(updatedProgressLabel());
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
  if (groupType === "reasoning") {
    if (inProgress) return thinkingLabel();
    return totalDurationMs > 0 ? thoughtForLabel(totalDurationMs) : thoughtLabel();
  }
  if (groupType === "exploration") return explorationSummaryLabel(counts, inProgress) ?? (inProgress ? exploringLabel() : exploredLabel());
  if (groupType === "todo-list") return updatedProgressLabel();
  if (groupType === "pending-mcp-tool-calls") return waitingOnMcpToolLabel();
  if (groupType === "web-search-group") {
    return inProgress ? searchingTheWebLabel() : searchedWebLabel();
  }
  // multi-agent-group never reaches activityLabel — summarizeToolActivity routes it
  // to multiAgentGroupLabelForItems (Codex `{action}{countLabel}` passthrough). The
  // old "Working with agents"/"Updated agents" fallback here was both dead and absent
  // from the Codex bundle, so it is removed.
  if (groupType === "worked-for") {
    if (totalDurationMs > 0) return workedForDurationLabel(totalDurationMs, inProgress);
    return inProgress ? workingLabel() : workedLabel();
  }
  if (inProgress) return workingLabel();
  const completedLabel = completedActivitySummaryLabel(counts, activityCounts, mcpToolCallSources);
  if (completedLabel) return completedLabel;
  if (counts.plans > 0) return updatedPlanLabel();
  if (counts.reasoning > 0) return thoughtLabel();
  return workedLabel();
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
    mcpToolCallSources.size > 0
      ? formatMessage(
          { id: "localConversation.toolActivitySummary.mcpToolCalls.sources.leading", defaultMessage: "Used {sources}" },
          { sources: joinConjunction(Array.from(mcpToolCallSources.keys()).map(mcpToolCallSourceLabel)) },
        )
      : "",
    genericMcpCalls > 0
      ? formatMessage(
          { id: "localConversation.toolActivitySummary.mcpToolCalls.leading", defaultMessage: "{count, plural, one {Called # tool} other {Called # tools}}" },
          { count: genericMcpCalls },
        )
      : "",
    counts.webSearches > 0
      ? formatMessage(
          { id: "localConversation.toolActivitySummary.webSearches.leading", defaultMessage: "{count, plural, one {Searched web # time} other {Searched web # times}}" },
          { count: counts.webSearches },
        )
      : "",
  ].filter((value): value is string => Boolean(value));
  if (segments.length === 0) return null;
  return segments.map((segment, index) => index === 0 ? segment : lowerInitial(segment)).join(", ");
}

function webSearchCommandSummarySegment(count: number): string {
  if (count <= 0) return "";
  return formatMessage(
    { id: "localConversation.toolActivitySummary.webSearchCommands.searched.leading", defaultMessage: "{count, plural, one {Searched web} other {Searched web # times}}" },
    { count },
  );
}

function ordinaryCommandSummarySegment(counts: ToolActivitySummary["counts"]): string {
  const ordinaryCommands = Math.max(0, counts.commands - counts.webSearchCommands);
  return ordinaryCommands > 0
    ? formatMessage(
        { id: "localConversation.toolActivitySummary.commands.leading", defaultMessage: "{count, plural, one {Ran # command} other {Ran # commands}}" },
        { count: ordinaryCommands },
      )
    : "";
}

function requestSummarySegment(verb: "Approved" | "Denied", count: number): string {
  if (count <= 0) return "";
  return verb === "Approved"
    ? formatMessage(
        { id: "localConversation.toolActivitySummary.approvedRequests.leading", defaultMessage: "{count, plural, one {Approved request} other {Approved # requests}}" },
        { count },
      )
    : formatMessage(
        { id: "localConversation.toolActivitySummary.deniedRequests.leading", defaultMessage: "{count, plural, one {Denied request} other {Denied # requests}}" },
        { count },
      );
}

function labelFromParts(parts: { action: string; detail: string }): string {
  return `${parts.action} ${parts.detail}`;
}

function webSearchDetailText(record: ItemRecord): string {
  const actionDetail = webSearchActionDetail(record.action);
  if (actionDetail) return actionDetail;
  return stringField(record, "query").trim();
}
