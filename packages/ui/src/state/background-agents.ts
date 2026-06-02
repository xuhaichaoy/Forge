import { stringField } from "../lib/format";
import type { ItemRecord, RailDiffStats, RailEntry, ThreadItem } from "./render-group-types";
import { itemType } from "./thread-item-fields";

interface BackgroundAgentEntry {
  threadId: string;
  displayName: string;
  model: string;
  role: string;
  status: string;
  diffStats: RailDiffStats | null;
  details: string[];
}

interface AgentState {
  status: string;
  message: string;
}

export function projectBackgroundAgentRailEntries(items: ThreadItem[]): RailEntry[] {
  const entries = new Map<string, BackgroundAgentEntry>();
  for (const item of items) {
    if (itemType(item) !== "multi-agent-action") continue;
    const record = item as ItemRecord;
    for (const threadId of multiAgentReceiverThreadIds(record)) {
      const previous = entries.get(threadId);
      const receiver = multiAgentReceiverInfo(record, threadId);
      const state = multiAgentState(record, threadId);
      const displayName = stripLeadingAt(receiver.title || previous?.displayName || agentFallbackName(threadId));
      const role = receiver.role || previous?.role || "";
      const model = receiver.model || multiAgentSpawnModel(record) || previous?.model || "";
      const status = normalizeBackgroundAgentStatus(
        state.status || stringField(record, "status") || previous?.status || "completed",
      );
      if (multiAgentAction(record) === "closeAgent" || status === "hidden") {
        entries.delete(threadId);
        continue;
      }
      const diffStats = multiAgentReceiverDiffStats(record, threadId) ?? previous?.diffStats ?? null;
      entries.set(threadId, {
        threadId,
        displayName,
        model,
        role,
        status,
        diffStats,
        details: backgroundAgentDetails(record, state, model),
      });
    }
  }

  return Array.from(entries.values()).map((entry) => ({
    id: `background-agent:${entry.threadId}`,
    title: entry.role ? `${entry.displayName} (${entry.role})` : entry.displayName,
    status: entry.status,
    meta: entry.model ? `Uses ${entry.model}` : undefined,
    diffStats: entry.diffStats ?? undefined,
    details: entry.details,
    action: {
      kind: "thread",
      threadId: entry.threadId,
      displayName: entry.displayName,
      model: entry.model || null,
      role: entry.role || null,
    },
  }));
}

function multiAgentReceiverThreadIds(record: ItemRecord): string[] {
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
  return Array.from(ids);
}

function multiAgentReceiverInfo(record: ItemRecord, threadId: string): { model: string; role: string; title: string } {
  if (!Array.isArray(record.receiverThreads)) return { model: "", role: "", title: "" };
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    const thread = receiverRecord.thread;
    const threadRecord = thread && typeof thread === "object" ? thread as Record<string, unknown> : null;
    return {
      model: stringField(receiverRecord, "model") || (threadRecord ? stringField(threadRecord, "model") : ""),
      role: multiAgentRole(receiverRecord) || (threadRecord ? multiAgentRole(threadRecord) : ""),
      title: receiverTitle(receiverRecord, threadRecord),
    };
  }
  return { model: "", role: "", title: "" };
}

function multiAgentReceiverDiffStats(record: ItemRecord, threadId: string): RailDiffStats | null {
  const direct = diffStatsFromCandidate(record, threadId);
  if (direct) return direct;
  if (!Array.isArray(record.receiverThreads)) return null;
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    return diffStatsFromCandidate(receiverRecord, threadId) ?? null;
  }
  return null;
}

function diffStatsFromCandidate(candidate: Record<string, unknown>, threadId: string): RailDiffStats | null {
  const keyedStats = keyedObject(candidate.diffStats, threadId);
  const explicitStats = statsFromObject(keyedStats ?? candidate.diffStats)
    ?? statsFromObject(candidate.repoAndDiffStats)
    ?? statsFromObject(candidate.diffSummary);
  if (explicitStats) return explicitStats;

  const thread = objectField(candidate, "thread");
  const threadStats = thread
    ? statsFromObject(thread.diffStats)
      ?? statsFromObject(thread.repoAndDiffStats)
      ?? statsFromLatestTurn(thread)
      ?? statsFromUnifiedDiff(
        stringField(thread, "diff")
        || stringField(thread, "turnDiff")
        || stringField(thread, "unifiedDiff"),
      )
    : null;
  if (threadStats) return threadStats;

  return statsFromUnifiedDiff(
    stringField(candidate, "diff")
    || stringField(candidate, "turnDiff")
    || stringField(candidate, "unifiedDiff"),
  );
}

function statsFromLatestTurn(thread: Record<string, unknown>): RailDiffStats | null {
  if (!Array.isArray(thread.turns) || thread.turns.length === 0) return null;
  for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
    const turn = thread.turns[index];
    if (!turn || typeof turn !== "object") continue;
    const turnRecord = turn as Record<string, unknown>;
    const stats = statsFromObject(turnRecord.diffStats)
      ?? statsFromUnifiedDiff(
        stringField(turnRecord, "diff")
        || stringField(turnRecord, "turnDiff")
        || stringField(turnRecord, "unifiedDiff"),
      );
    if (stats) return stats;
  }
  return null;
}

function statsFromObject(value: unknown): RailDiffStats | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const linesAdded = numberField(record, "linesAdded")
    ?? numberField(record, "additions")
    ?? numberField(record, "added")
    ?? numberField(record, "totalAdditions");
  const linesRemoved = numberField(record, "linesRemoved")
    ?? numberField(record, "deletions")
    ?? numberField(record, "deleted")
    ?? numberField(record, "totalDeletions");
  return normalizeDiffStats(linesAdded, linesRemoved);
}

function statsFromUnifiedDiff(diff: string): RailDiffStats | null {
  if (!diff.trim()) return null;
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      linesAdded += 1;
    } else if (line.startsWith("-")) {
      linesRemoved += 1;
    }
  }
  return normalizeDiffStats(linesAdded, linesRemoved);
}

function normalizeDiffStats(
  linesAdded: number | null | undefined,
  linesRemoved: number | null | undefined,
): RailDiffStats | null {
  const added = Math.max(0, Math.trunc(linesAdded ?? 0));
  const removed = Math.max(0, Math.trunc(linesRemoved ?? 0));
  if (added === 0 && removed === 0) return null;
  return { linesAdded: added, linesRemoved: removed };
}

function keyedObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === "object" ? nested as Record<string, unknown> : null;
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const field = value[key];
  return field && typeof field === "object" ? field as Record<string, unknown> : null;
}

function numberField(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function multiAgentState(record: ItemRecord, threadId: string): AgentState {
  const states = record.agentsStates;
  if (!states || typeof states !== "object") return { status: "", message: "" };
  const state = (states as Record<string, unknown>)[threadId];
  if (typeof state === "string") return { status: state, message: "" };
  if (!state || typeof state !== "object") return { status: "", message: "" };
  const stateRecord = state as Record<string, unknown>;
  return {
    status: stringField(stateRecord, "status"),
    message: stringField(stateRecord, "message"),
  };
}

function multiAgentRole(thread: Record<string, unknown>): string {
  const role = (stringField(thread, "agentRole") || threadSpawnSourceField(thread, "agent_role", "agentRole")).trim();
  return role && role !== "default" ? role : "";
}

function receiverTitle(receiver: Record<string, unknown>, thread: Record<string, unknown> | null): string {
  return (
    stringField(receiver, "agentNickname")
    || threadSpawnSourceField(receiver, "agent_nickname", "agentNickname")
    || stringField(receiver, "agentName")
    || stringField(receiver, "displayName")
    || stringField(receiver, "name")
    || (thread
      ? stringField(thread, "agentNickname")
        || threadSpawnSourceField(thread, "agent_nickname", "agentNickname")
        || stringField(thread, "agentName")
        || stringField(thread, "displayName")
        || stringField(thread, "name")
        || stringField(thread, "title")
        || stringField(thread, "preview")
      : "")
  ).trim();
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

function multiAgentSpawnModel(record: ItemRecord): string {
  return multiAgentAction(record) === "spawnAgent" ? stringField(record, "model").trim() : "";
}

function multiAgentAction(record: ItemRecord): string {
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function normalizeBackgroundAgentStatus(status: string): string {
  switch (status) {
    case "pendingInit":
      return "waiting";
    case "active":
    case "inProgress":
    case "in_progress":
    case "pending":
    case "running":
      return "active";
    case "completed":
    case "done":
      return "done";
    case "interrupted":
    case "errored":
    case "failed":
    case "notFound":
    case "shutdown":
    case "closed":
      return "hidden";
    default:
      return status || "done";
  }
}

function backgroundAgentDetails(record: ItemRecord, state: AgentState, model: string): string[] {
  const action = multiAgentAction(record);
  const prompt = stringField(record, "prompt").trim();
  return [
    action ? `Action: ${action}` : "",
    model ? `Model: ${model}` : "",
    prompt ? `Prompt: ${prompt}` : "",
    state.message ? `State: ${state.message}` : "",
  ].filter(Boolean);
}

function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function agentFallbackName(id: string): string {
  return id ? `agent-${id.slice(0, 8)}` : "agent";
}
