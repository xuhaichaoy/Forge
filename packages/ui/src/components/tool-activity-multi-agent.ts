import { stringField } from "../lib/format";
import {
  multiAgentAction,
  multiAgentStatus,
  stripLeadingAt,
  threadSpawnSourceField,
} from "../state/tool-activity-fields";
import type { AccumulatedThreadItem } from "../state/render-groups";
import type { HiCodexIntlContextValue } from "./i18n-provider";

type MultiAgentFormatMessage = HiCodexIntlContextValue["formatMessage"];
type MultiAgentRecord = AccumulatedThreadItem & Record<string, unknown>;

export interface MultiAgentRowViewModel {
  key: string;
  parts: MultiAgentRowPart[];
  text: string;
}

export type MultiAgentRowPart =
  | { kind: "text"; text: string }
  | { kind: "prompt"; text: string }
  | {
      kind: "agent";
      color: string;
      label: string;
      threadId: string;
      title: string | null;
      model: string | null;
      role: string | null;
    };

export function multiAgentRows(record: MultiAgentRecord, formatMessage?: MultiAgentFormatMessage): MultiAgentRowViewModel[] {
  const receiverIds = multiAgentReceiverThreadIds(record);
  const action = multiAgentAction(record);
  const status = multiAgentStatus(record);
  const prompt = stringField(record, "prompt").trim();
  if (receiverIds.length === 0) {
    return [textMultiAgentRow(`row-generic-${record.id}`, multiAgentRowVerb(action, status, formatMessage))];
  }

  const rows: MultiAgentRowViewModel[] = receiverIds.map((threadId) => {
    const agent = multiAgentAgentPart(record, threadId);
    const stateSuffix = multiAgentStateSuffix(record, threadId, formatMessage);
    if (action === "spawnAgent" && status !== "failed" && prompt) {
      // Codex renders this row as soon as the agent is spawned, while the
      // group header still reads "Spawning N agents" and after completion.
      // Only the failed state falls back to the "Failed spawning" verb row.
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, localizeRowParts(
        formatMessage,
        "localConversation.multiAgentAction.row.spawn.createdWithInstructions",
        "Created {agent} with the instructions: {instructions}",
        { agent, instructions: { kind: "prompt", text: prompt } },
      ));
    }
    if (action === "sendInput" && prompt) {
      return agentMultiAgentRow(`row-${record.id}-${threadId}`, localizeRowParts(
        formatMessage,
        "localConversation.multiAgentAction.row.sendInput.messagedWithPrompt",
        "{action} {agent}: {prompt}",
        { action: multiAgentSendInputPromptVerb(status, formatMessage), agent, prompt: { kind: "prompt", text: prompt } },
      ));
    }
    return agentMultiAgentRow(`row-${record.id}-${threadId}`, localizeRowParts(
      formatMessage,
      "localConversation.multiAgentAction.row.agent",
      "{action} {agent}{stateSuffix}",
      { action: multiAgentRowVerb(action, status, formatMessage), agent, stateSuffix },
    ));
  });

  if (action !== "spawnAgent" && action !== "sendInput" && prompt) {
    rows.push(agentMultiAgentRow(`meta-prompt-${record.id}`, localizeRowParts(
      formatMessage,
      "localConversation.multiAgentAction.meta.prompt",
      "Input: {prompt}",
      { prompt: { kind: "prompt", text: prompt } },
    )));
  }
  return rows;
}

export function multiAgentRowText(parts: MultiAgentRowPart[]): string {
  return parts.map((part) => part.kind === "agent" ? part.label : part.text).join("");
}

export function multiAgentAgentColor(threadId: string): string {
  const palette = [
    "#2f7a63",
    "#6f5fb5",
    "#b05d35",
    "#2d75a8",
    "#8a5a2b",
    "#2f7b8f",
    "#9a4f74",
    "#5d7334",
  ];
  let hash = 0;
  for (let index = 0; index < threadId.length; index += 1) {
    hash = (hash * 31 + threadId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length] ?? palette[0];
}

function localizeRowParts(
  formatMessage: MultiAgentFormatMessage | undefined,
  id: string,
  defaultMessage: string,
  slots: Record<string, MultiAgentRowPart | string>,
): Array<string | MultiAgentRowPart> {
  const values: Record<string, string> = {};
  const partBySentinel = new Map<string, MultiAgentRowPart>();
  let i = 0;
  for (const [name, slot] of Object.entries(slots)) {
    if (typeof slot === "string") {
      values[name] = slot;
      continue;
    }
    const sentinel = `\u0000${i++}\u0000`;
    values[name] = sentinel;
    partBySentinel.set(sentinel, slot);
  }
  const text = formatMessage
    ? formatMessage({ id, defaultMessage }, values)
    : defaultMessage.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? `{${key}}`);
  const out: Array<string | MultiAgentRowPart> = [];
  const sentinelRe = /\u0000\d+\u0000/;
  let rest = text;
  let match: RegExpExecArray | null;
  while ((match = sentinelRe.exec(rest))) {
    if (match.index > 0) out.push(rest.slice(0, match.index));
    const part = partBySentinel.get(match[0]);
    if (part) out.push(part);
    rest = rest.slice(match.index + match[0].length);
  }
  if (rest) out.push(rest);
  return out;
}

function textMultiAgentRow(key: string, text: string): MultiAgentRowViewModel {
  const parts: MultiAgentRowPart[] = [{ kind: "text", text }];
  return { key, parts, text };
}

function agentMultiAgentRow(key: string, rawParts: Array<string | MultiAgentRowPart>): MultiAgentRowViewModel {
  const parts = rawParts.flatMap((part) => {
    if (typeof part !== "string") return [part];
    return part ? [{ kind: "text" as const, text: part }] : [];
  });
  return { key, parts, text: multiAgentRowText(parts) };
}

function multiAgentReceiverThreadIds(record: MultiAgentRecord): string[] {
  const ids = new Set<string>();
  const direct = Array.isArray(record.receiverThreadIds) ? record.receiverThreadIds : [];
  for (const value of direct) {
    if (typeof value === "string" && value.trim()) ids.add(value.trim());
  }
  if (Array.isArray(record.receiverThreads)) {
    for (const thread of record.receiverThreads) {
      const id = objectField(thread, "threadId") ?? objectField(thread, "id");
      if (id) ids.add(id);
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

function multiAgentAgentPart(record: MultiAgentRecord, threadId: string): MultiAgentRowPart {
  const receiver = multiAgentReceiverInfo(record, threadId);
  const label = stripLeadingAt(receiver.title || agentFallbackName(threadId));
  const roleLabel = receiver.role ? `${label} (${receiver.role})` : label;
  const model = receiver.model || multiAgentSpawnModel(record);
  return {
    kind: "agent",
    color: multiAgentAgentColor(threadId),
    label: roleLabel,
    threadId,
    title: model ? `Uses ${model}` : null,
    model: model || null,
    role: receiver.role || null,
  };
}

function multiAgentReceiverInfo(record: MultiAgentRecord, threadId: string): { model: string; role: string; title: string } {
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

function multiAgentSpawnModel(record: MultiAgentRecord): string {
  return multiAgentAction(record) === "spawnAgent" ? stringField(record, "model").trim() : "";
}

function multiAgentStateSuffix(record: MultiAgentRecord, threadId: string, formatMessage?: MultiAgentFormatMessage): string {
  const action = multiAgentAction(record);
  if (action === "closeAgent" || action === "resumeAgent") return "";
  const states = record.agentsStates;
  if (!states || typeof states !== "object") return "";
  const state = (states as Record<string, unknown>)[threadId];
  if (!state || typeof state !== "object") return "";
  const stateRecord = state as Record<string, unknown>;
  const status = multiAgentStateStatusLabel(stringField(stateRecord, "status"), formatMessage);
  if (!status) return "";
  const message = stringField(stateRecord, "message").trim();
  return message ? ` (${status}: ${message})` : ` (${status})`;
}

const MULTI_AGENT_STATE_STATUS_I18N: Record<string, { id: string; defaultMessage: string }> = {
  pendingInit: { id: "localConversation.multiAgentAction.agentState.pendingInit", defaultMessage: "pending init" },
  notFound: { id: "localConversation.multiAgentAction.agentState.notFound", defaultMessage: "not found" },
  running: { id: "localConversation.multiAgentAction.agentState.running", defaultMessage: "running" },
  completed: { id: "localConversation.multiAgentAction.agentState.completed", defaultMessage: "completed" },
  errored: { id: "localConversation.multiAgentAction.agentState.errored", defaultMessage: "errored" },
  interrupted: { id: "localConversation.multiAgentAction.agentState.interrupted", defaultMessage: "interrupted" },
  shutdown: { id: "localConversation.multiAgentAction.agentState.shutdown", defaultMessage: "shutdown" },
};

function multiAgentStateStatusLabel(status: string, formatMessage?: MultiAgentFormatMessage): string {
  const descriptor = MULTI_AGENT_STATE_STATUS_I18N[status];
  if (descriptor) return formatMessage ? formatMessage(descriptor) : descriptor.defaultMessage;
  return status;
}

function multiAgentRowVerb(action: string, status: string, formatMessage?: MultiAgentFormatMessage): string {
  const fm = (id: string, defaultMessage: string): string => (formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage);
  if (action === "sendInput" && status === "completed") return fm("localConversation.multiAgentAction.rowAction.sendInput.completed", "Messaged");
  if (action === "sendInput" && status === "failed") return fm("localConversation.multiAgentAction.rowAction.sendInput.failed", "Failed messaging");
  if (action === "sendInput") return fm("localConversation.multiAgentAction.rowAction.sendInput.inProgress", "Messaging");
  if (action === "spawnAgent" && status === "completed") return fm("localConversation.multiAgentAction.rowAction.spawn.completed", "Spawned");
  if (action === "spawnAgent" && status === "failed") return fm("localConversation.multiAgentAction.rowAction.spawn.failed", "Failed spawning");
  if (action === "spawnAgent") return fm("localConversation.multiAgentAction.rowAction.spawn.inProgress", "Spawning");
  if (action === "resumeAgent" && status === "completed") return fm("localConversation.multiAgentAction.rowAction.resume.completed", "Resumed");
  if (action === "resumeAgent" && status === "failed") return fm("localConversation.multiAgentAction.rowAction.resume.failed", "Failed resuming");
  if (action === "resumeAgent") return fm("localConversation.multiAgentAction.rowAction.resume.inProgress", "Resuming");
  if (action === "closeAgent" && status === "completed") return fm("localConversation.multiAgentAction.rowAction.close.completed", "Closed");
  if (action === "closeAgent" && status === "failed") return fm("localConversation.multiAgentAction.rowAction.close.failed", "Failed closing");
  if (action === "closeAgent") return fm("localConversation.multiAgentAction.rowAction.close.inProgress", "Closing");
  return status === "inProgress" ? "Working with agents" : "Updated agents";
}

function multiAgentSendInputPromptVerb(status: string, formatMessage?: MultiAgentFormatMessage): string {
  const fm = (id: string, defaultMessage: string): string => (formatMessage ? formatMessage({ id, defaultMessage }) : defaultMessage);
  if (status === "failed") return fm("localConversation.multiAgentAction.rowAction.sendInput.messaged.failed", "Failed to message");
  if (status === "completed") return fm("localConversation.multiAgentAction.rowAction.sendInput.messaged.completed", "Messaged");
  return fm("localConversation.multiAgentAction.rowAction.sendInput.messaged.inProgress", "Messaging");
}

function objectField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function agentFallbackName(id: string): string {
  return id ? `agent-${id.slice(0, 8)}` : "agent";
}
