import { stringField } from "../lib/format";
import type { ItemRecord, RailEntry, ThreadItem } from "./render-group-types";
import { itemType } from "./thread-item-fields";

interface BackgroundAgentEntry {
  threadId: string;
  displayName: string;
  model: string;
  role: string;
  status: string;
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
      const displayName = stripLeadingAt(receiver.title || previous?.displayName || shortId(threadId));
      const role = receiver.role || previous?.role || "";
      const model = receiver.model || multiAgentSpawnModel(record) || previous?.model || "";
      const status = normalizeBackgroundAgentStatus(
        state.status || stringField(record, "status") || previous?.status || "completed",
      );
      entries.set(threadId, {
        threadId,
        displayName,
        model,
        role,
        status,
        details: backgroundAgentDetails(record, state, model),
      });
    }
  }

  return Array.from(entries.values()).map((entry) => ({
    id: `background-agent:${entry.threadId}`,
    title: entry.role ? `${entry.displayName} (${entry.role})` : entry.displayName,
    status: entry.status,
    meta: entry.model ? `Uses ${entry.model}` : undefined,
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
  const role = stringField(thread, "agentRole").trim();
  return role && role !== "default" ? role : "";
}

function receiverTitle(receiver: Record<string, unknown>, thread: Record<string, unknown> | null): string {
  return (
    stringField(receiver, "agentNickname")
    || stringField(receiver, "agentName")
    || stringField(receiver, "displayName")
    || stringField(receiver, "name")
    || (thread
      ? stringField(thread, "agentNickname")
        || stringField(thread, "agentName")
        || stringField(thread, "displayName")
        || stringField(thread, "name")
        || stringField(thread, "title")
        || stringField(thread, "preview")
      : "")
  ).trim();
}

function multiAgentSpawnModel(record: ItemRecord): string {
  return multiAgentAction(record) === "spawnAgent" ? stringField(record, "model").trim() : "";
}

function multiAgentAction(record: ItemRecord): string {
  return stringField(record, "action") || stringField(record, "tool") || "agent";
}

function normalizeBackgroundAgentStatus(status: string): string {
  switch (status) {
    case "active":
    case "inProgress":
    case "in_progress":
    case "pending":
    case "pendingInit":
    case "running":
      return "active";
    case "errored":
    case "failed":
    case "notFound":
      return "failed";
    default:
      return status || "completed";
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

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}
