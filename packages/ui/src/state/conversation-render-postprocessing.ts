import type { ConversationRenderUnit, ItemRecord, ThreadItem } from "./render-group-types";
import { isItemInProgress, itemType } from "./thread-item-fields";

/*
 * codex split-items-into-render-groups-*.js `Ne` + `K`: batch runs of CONSECUTIVE
 * standalone `dynamic-tool-call` thread items into one `dynamicToolCallGroup`.
 * `K` forms a group when `items.length > 1`, plus the active terminal
 * `keepLatestLiveActivityInGroup` case for dynamic app-control tools whose
 * Desktop metadata marks `continuesLiveActivityBetweenCalls`. A lone completed
 * call still renders standalone. Linear scan, mirroring `Ne`.
 */
export function groupConsecutiveDynamicToolCalls(
  units: ConversationRenderUnit[],
  options: { keepLatestLiveActivityInGroup?: boolean } = {},
): ConversationRenderUnit[] {
  const result: ConversationRenderUnit[] = [];
  let index = 0;
  while (index < units.length) {
    const unit = units[index];
    if (unit?.kind === "threadItem" && itemType(unit.item) === "dynamic-tool-call") {
      const run: ThreadItem[] = [];
      let end = index;
      while (end < units.length) {
        const candidate = units[end];
        if (candidate?.kind === "threadItem" && itemType(candidate.item) === "dynamic-tool-call") {
          run.push(candidate.item);
          end += 1;
        } else {
          break;
        }
      }
      const shouldKeepLatestLiveActivityInGroup = options.keepLatestLiveActivityInGroup === true
        && end === units.length
        && shouldContinueDynamicLiveActivityBetweenCalls(run[run.length - 1]);
      if (run.length > 1 || shouldKeepLatestLiveActivityInGroup) {
        result.push({
          kind: "dynamicToolCallGroup",
          key: `dynamic-tool-call-group:${run[0]?.id ?? index}`,
          items: run,
        });
        index = end;
        continue;
      }
    }
    if (unit) result.push(unit);
    index += 1;
  }
  return result;
}

function shouldContinueDynamicLiveActivityBetweenCalls(item: ThreadItem | undefined): boolean {
  if (!item) return false;
  const record = item as ItemRecord;
  const namespace = stringValue(record.namespace ?? record.toolNamespace ?? record.tool_namespace);
  const tool = stringValue(record.tool ?? record.toolName ?? record.tool_name ?? record.functionName ?? record.function_name);
  return namespace === "codex_app" && (tool === "list_threads" || tool === "read_thread");
}

export function withStreamingAssistantState(
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
