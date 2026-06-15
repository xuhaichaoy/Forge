import type { ThreadItem } from "@forge/codex-protocol";
import type { AccumulatedThreadItem } from "./render-groups";

interface WorkedForTurnLike {
  id?: string;
  status?: unknown;
  startedAt?: number | null;
  completedAt?: number | null;
  durationMs?: number | null;
}

export function workedForItemFromTurn(
  turn: WorkedForTurnLike,
  items: Array<AccumulatedThreadItem | ThreadItem>,
  hasExtraActivity = false,
  turnStatus = "",
): AccumulatedThreadItem | null {
  if (!turn.id || items.some((item) => item.type === "worked-for")) return null;

  if (!hasExtraActivity && !hasAgentActivityItem(items)) return null;

  const serverStartedAtMs = secondsTimestampToMs(turn.startedAt);
  const serverCompletedAtMs = secondsTimestampToMs(turn.completedAt);
  const startedAtMs = firstWorkItemStartedAtMs(items) ?? serverStartedAtMs;
  const answerCapMs = assistantAnswerStartedAtMs(items) ?? lastWorkItemCompletedAtMs(items);
  const working = turnStatus === "inProgress" || turnStatus === "running" || turnStatus === "active";
  const completedAtMs = working ? answerCapMs : answerCapMs ?? serverCompletedAtMs;
  const durationMs =
    startedAtMs !== null && completedAtMs !== null && completedAtMs >= startedAtMs
      ? completedAtMs - startedAtMs
      : typeof turn.durationMs === "number" && Number.isFinite(turn.durationMs) && turn.durationMs > 0
        ? turn.durationMs
        : null;

  if (startedAtMs === null && durationMs === null) return null;

  return {
    id: `worked-for:${turn.id}`,
    type: "worked-for",
    status: working ? "working" : "completed",
    ...(startedAtMs !== null ? { startedAtMs } : {}),
    ...(working ? { completedAtMs: answerCapMs } : completedAtMs !== null ? { completedAtMs } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
  };
}

function firstWorkItemStartedAtMs(items: Array<AccumulatedThreadItem | ThreadItem>): number | null {
  for (const item of items) {
    const type = String((item as Record<string, unknown>).type ?? "");
    if (type === "userMessage" || type === "hookPrompt" || type === "worked-for") continue;
    const started = (item as Record<string, unknown>).startedAtMs;
    if (typeof started === "number" && Number.isFinite(started) && started >= 0) return started;
  }
  return null;
}

function assistantAnswerStartedAtMs(items: Array<AccumulatedThreadItem | ThreadItem>): number | null {
  for (const item of items) {
    if (String((item as Record<string, unknown>).type ?? "") !== "agentMessage") continue;
    const started = (item as Record<string, unknown>).startedAtMs;
    if (typeof started === "number" && Number.isFinite(started) && started >= 0) return started;
  }
  return null;
}

function lastWorkItemCompletedAtMs(items: Array<AccumulatedThreadItem | ThreadItem>): number | null {
  let max: number | null = null;
  for (const item of items) {
    const type = String((item as Record<string, unknown>).type ?? "");
    if (type === "userMessage" || type === "hookPrompt" || type === "worked-for" || type === "agentMessage") continue;
    const completed = (item as Record<string, unknown>).completedAtMs;
    if (typeof completed === "number" && Number.isFinite(completed) && completed >= 0 && (max === null || completed > max)) {
      max = completed;
    }
  }
  return max;
}

function hasAgentActivityItem(items: Array<AccumulatedThreadItem | ThreadItem>): boolean {
  for (const item of items) {
    const type = String((item as Record<string, unknown>).type ?? "");
    if (AGENT_ACTIVITY_ITEM_TYPES.has(type)) return true;
  }
  return false;
}

const AGENT_ACTIVITY_ITEM_TYPES: ReadonlySet<string> = new Set([
  "exec",
  "commandExecution",
  "patch",
  "fileChange",
  "web-search",
  "mcp-tool-call",
  "dynamic-tool-call",
  "multi-agent-action",
  "automatic-approval-review",
  "stream-error",
  "system-error",
  "context-compaction",
  "steered",
  "user-input-response",
]);

function secondsTimestampToMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 1_000) : null;
}
