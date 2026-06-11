import type { ThreadGoal } from "@hicodex/codex-protocol";
import { isRecord, stringField } from "../lib/format";
import type { AccumulatedThreadItem } from "./render-groups";

interface ThreadItemStatusProjectionInput {
  items: AccumulatedThreadItem[];
  hookRunsByTurn: Record<string, unknown[]>;
  threadGoal: ThreadGoal | null;
  threadGoalTurnId: string | null;
}

export function projectRuntimeItemStatus({
  items,
  hookRunsByTurn,
  threadGoal,
  threadGoalTurnId,
}: ThreadItemStatusProjectionInput): AccumulatedThreadItem[] {
  const hookBlockedItems = projectHookBlockedOntoUserMessages(items, hookRunsByTurn);
  const goalItems = threadGoal
    ? projectCompletedThreadGoalOntoAssistantMessages(
        projectThreadGoalOntoUserMessages(hookBlockedItems, threadGoal, threadGoalTurnId),
        threadGoal,
        threadGoalTurnId,
      )
    : hookBlockedItems;
  return projectHookStatsOntoAssistantMessages(goalItems, hookRunsByTurn);
}

function projectSingleTargetItemMarker(
  items: AccumulatedThreadItem[],
  targetIndex: number,
  valueKey: string,
  turnKey: string,
  setValue: unknown,
  setTurn: unknown,
): AccumulatedThreadItem[] {
  let changed = false;
  const next = items.map((item, index) => {
    const record = item as Record<string, unknown>;
    if (index === targetIndex) {
      if (record[valueKey] === setValue && record[turnKey] === setTurn) return item;
      changed = true;
      return {
        ...item,
        [valueKey]: setValue,
        [turnKey]: setTurn,
      };
    }
    if (record[valueKey] === undefined && record[turnKey] === undefined) return item;
    const cleaned = { ...item } as AccumulatedThreadItem;
    delete (cleaned as Record<string, unknown>)[valueKey];
    delete (cleaned as Record<string, unknown>)[turnKey];
    changed = true;
    return cleaned;
  });
  return changed ? next : items;
}

function projectThreadGoalOntoUserMessages(
  items: AccumulatedThreadItem[],
  goal: ThreadGoal,
  turnId: string | null,
): AccumulatedThreadItem[] {
  return projectSingleTargetItemMarker(
    items,
    threadGoalTargetUserMessageIndex(items, turnId),
    "_threadGoal",
    "_threadGoalTurnId",
    goal,
    turnId,
  );
}

export function clearThreadGoalProjection(items: AccumulatedThreadItem[]): AccumulatedThreadItem[] {
  return projectSingleTargetItemMarker(
    items,
    -1,
    "_threadGoal",
    "_threadGoalTurnId",
    undefined,
    undefined,
  );
}

function projectCompletedThreadGoalOntoAssistantMessages(
  items: AccumulatedThreadItem[],
  goal: ThreadGoal,
  turnId: string | null,
): AccumulatedThreadItem[] {
  const targetIndex = isCompletedThreadGoal(goal)
    ? threadGoalTargetAssistantMessageIndex(items, turnId)
    : -1;
  return projectSingleTargetItemMarker(
    items,
    targetIndex,
    "_completedThreadGoal",
    "_completedThreadGoalTurnId",
    goal,
    turnId,
  );
}

function projectHookStatsOntoAssistantMessages(
  items: AccumulatedThreadItem[],
  hookRunsByTurn: Record<string, unknown[]>,
): AccumulatedThreadItem[] {
  let changed = false;
  const next = items.map((item) => {
    const record = item as Record<string, unknown>;
    if (!isAssistantMessageThreadItem(item)) {
      if (record.hookStats === undefined) return item;
      const cleaned = { ...item } as AccumulatedThreadItem;
      delete (cleaned as Record<string, unknown>).hookStats;
      changed = true;
      return cleaned;
    }
    const turnId = itemTurnId(item);
    const stats = turnId ? hookStatsFromRuns(hookRunsByTurn[turnId]) : null;
    if (!stats) {
      if (record.hookStats === undefined) return item;
      const cleaned = { ...item } as AccumulatedThreadItem;
      delete (cleaned as Record<string, unknown>).hookStats;
      changed = true;
      return cleaned;
    }
    if (hookStatsEqual(record.hookStats, stats)) return item;
    changed = true;
    return { ...item, hookStats: stats };
  });
  return changed ? next : items;
}

function projectHookBlockedOntoUserMessages(
  items: AccumulatedThreadItem[],
  hookRunsByTurn: Record<string, unknown[]>,
): AccumulatedThreadItem[] {
  let changed = false;
  const next = items.map((item) => {
    const record = item as Record<string, unknown>;
    const turnId = typeof record._turnId === "string" ? record._turnId : "";
    const isUser = record.type === "userMessage";
    const isBlocked = isUser && turnId ? hookRunsBlockUserPrompt(hookRunsByTurn[turnId]) : false;
    if (isBlocked) {
      if (
        record.deliveryStatus === "not-sent"
        && record.hookBlocked === true
        && record._hookBlockedProjection === true
      ) {
        return item;
      }
      changed = true;
      return {
        ...item,
        deliveryStatus: "not-sent",
        hookBlocked: true,
        _hookBlockedProjection: true,
      };
    }
    if (record._hookBlockedProjection !== true) return item;
    const cleaned = { ...item } as AccumulatedThreadItem;
    delete (cleaned as Record<string, unknown>).deliveryStatus;
    delete (cleaned as Record<string, unknown>).hookBlocked;
    delete (cleaned as Record<string, unknown>)._hookBlockedProjection;
    changed = true;
    return cleaned;
  });
  return changed ? next : items;
}

function hookRunsBlockUserPrompt(runs: unknown[] | undefined): boolean {
  if (!runs || runs.length === 0) return false;
  return runs.some((value) => {
    const run = recordParam(value);
    if (!run) return false;
    return stringField(run, "eventName") === "userPromptSubmit" && stringField(run, "status") === "blocked";
  });
}

function hookStatsFromRuns(runs: unknown[] | undefined): Record<string, unknown> | null {
  if (!runs || runs.length === 0) return null;
  let blockedCount = 0;
  let errorCount = 0;
  const entries: Array<{ kind: string; text: string }> = [];
  for (const value of runs) {
    const run = recordParam(value);
    if (!run) continue;
    const status = stringField(run, "status");
    if (status === "blocked") blockedCount += 1;
    if (status === "failed") errorCount += 1;
    const rawEntries = Array.isArray(run.entries) ? run.entries : [];
    for (const rawEntry of rawEntries) {
      const entry = recordParam(rawEntry);
      if (!entry) continue;
      const kind = stringField(entry, "kind");
      if (kind !== "error" && kind !== "feedback" && kind !== "stop") continue;
      entries.push({ kind, text: stringField(entry, "text") });
    }
  }
  return {
    count: runs.length,
    blockedCount,
    errorCount,
    entries,
  };
}

function hookStatsEqual(left: unknown, right: Record<string, unknown>): boolean {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const leftRecord = left as Record<string, unknown>;
  if (leftRecord.count !== right.count) return false;
  if (leftRecord.blockedCount !== right.blockedCount) return false;
  if (leftRecord.errorCount !== right.errorCount) return false;
  const leftEntries = Array.isArray(leftRecord.entries) ? leftRecord.entries : [];
  const rightEntries = Array.isArray(right.entries) ? right.entries : [];
  if (leftEntries.length !== rightEntries.length) return false;
  for (let index = 0; index < leftEntries.length; index += 1) {
    const leftEntry = recordParam(leftEntries[index]);
    const rightEntry = recordParam(rightEntries[index]);
    if (!leftEntry || !rightEntry) return false;
    if (leftEntry.kind !== rightEntry.kind || leftEntry.text !== rightEntry.text) return false;
  }
  return true;
}

function isCompletedThreadGoal(goal: ThreadGoal): boolean {
  return goal.status === "complete";
}

function threadGoalTargetUserMessageIndex(items: AccumulatedThreadItem[], turnId: string | null): number {
  if (turnId) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && isUserMessageThreadItem(item) && itemTurnId(item) === turnId) return index;
    }
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && isUserMessageThreadItem(item)) return index;
  }
  return -1;
}

function threadGoalTargetAssistantMessageIndex(items: AccumulatedThreadItem[], turnId: string | null): number {
  if (turnId) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && isAssistantMessageThreadItem(item) && itemTurnId(item) === turnId) return index;
    }
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && isAssistantMessageThreadItem(item) && !isNonCompletedTurnItem(item)) return index;
  }
  return -1;
}

function itemTurnId(item: AccumulatedThreadItem | undefined | null): string | null {
  if (!item) return null;
  const value = (item as Record<string, unknown>)._turnId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function recordParam(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isUserMessageThreadItem(item: AccumulatedThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "userMessage";
}

function isAssistantMessageThreadItem(item: AccumulatedThreadItem): boolean {
  return String((item as Record<string, unknown>).type ?? "") === "agentMessage";
}

function isNonCompletedTurnItem(item: AccumulatedThreadItem): boolean {
  const status = (item as Record<string, unknown>)._turnStatus;
  return typeof status === "string" && status.length > 0 && status !== "completed";
}
