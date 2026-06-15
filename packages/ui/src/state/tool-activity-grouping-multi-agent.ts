/*
 * Multi-agent action label layer of the tool-activity grouping projection,
 * extracted verbatim from tool-activity-grouping.ts (mechanical split): the
 * Codex `K`-rollup header label, per-row verbs and receiver-thread resolution.
 */
import { stringField } from "../lib/format";

import { formatMessage } from "./i18n";
import type { ItemRecord, ThreadItem } from "./render-group-types";
import { multiAgentAction, multiAgentStatus, stripLeadingAt, threadSpawnSourceField } from "./tool-activity-fields";

function agentFallbackName(id: string): string {
  return id ? `agent-${id.slice(0, 8)}` : formatMessage({ id: "hc.toolActivity.agentFallback", defaultMessage: "agent" });
}

export function multiAgentGroupLabelForItems(items: ThreadItem[]): string {
  const first = items[0];
  // Defensive guard for an empty group (never produced by the `K` rollup, which
  // only batches terminal actions). Codex has no "Updated agents" string, so fall
  // back to the neutral passthrough verb rather than inventing copy.
  if (!first) return multiAgentHeaderVerb("agent", "completed");
  // Terminal replay rows can occasionally lack receiverThreadIds, so keep a
  // conservative item-count fallback for the header count.
  const receiverCount = uniqueMultiAgentReceiverThreadIds(items).length;
  const inferredCount = receiverCount > 0 ? receiverCount : items.length;
  const countLabel = inferredCount > 0
    ? formatMessage(
        { id: "localConversation.multiAgentAction.header.count", defaultMessage: " {count, plural, one {# agent} other {# agents}}" },
        { count: inferredCount },
      )
    : "";
  return formatMessage(
    { id: "localConversation.multiAgentAction.header", defaultMessage: "{action}{countLabel}" },
    { action: multiAgentHeaderVerb(multiAgentAction(first), multiAgentStatus(first)), countLabel },
  );
}

export function multiAgentActionRowLabel(item: ThreadItem): string {
  const action = multiAgentAction(item);
  const status = multiAgentStatus(item);
  const receivers = multiAgentReceiverThreadIds(item);
  const target = receivers.length > 0
    ? receivers.map((id) => stripLeadingAt(multiAgentReceiverTitle(item, id) || agentFallbackName(id))).join(", ")
    : agentFallbackName("");
  const prompt = stringField(item as ItemRecord, "prompt").trim();
  const verb = multiAgentRowVerb(action, status);
  if (prompt && action === "spawnAgent" && status === "completed") {
    return formatMessage(
      { id: "localConversation.multiAgentAction.row.spawn.createdWithInstructions", defaultMessage: "Created {agent} with the instructions: {instructions}" },
      { agent: target, instructions: prompt },
    );
  }
  if (prompt && action === "sendInput") {
    return formatMessage(
      { id: "localConversation.multiAgentAction.row.sendInput.messagedWithPrompt", defaultMessage: "{action} {agent}: {prompt}" },
      { action: multiAgentSendInputPromptVerb(status), agent: target, prompt },
    );
  }
  return formatMessage(
    { id: "localConversation.multiAgentAction.row.agent", defaultMessage: "{action} {agent}{stateSuffix}" },
    { action: verb, agent: target, stateSuffix: "" },
  );
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
  return Array.from(ids).sort();
}

function multiAgentReceiverTitle(item: ThreadItem, threadId: string): string {
  const record = item as ItemRecord;
  if (!Array.isArray(record.receiverThreads)) return "";
  for (const receiver of record.receiverThreads) {
    if (!receiver || typeof receiver !== "object") continue;
    const receiverRecord = receiver as Record<string, unknown>;
    const id = stringField(receiverRecord, "threadId") || stringField(receiverRecord, "id");
    if (id !== threadId) continue;
    const thread = receiverRecord.thread;
    const threadRecord = thread && typeof thread === "object" ? thread as Record<string, unknown> : null;
    return (
      stringField(receiverRecord, "agentNickname")
      || threadSpawnSourceField(receiverRecord, "agent_nickname", "agentNickname")
      || (threadRecord
        ? stringField(threadRecord, "agentNickname")
          || threadSpawnSourceField(threadRecord, "agent_nickname", "agentNickname")
        : "")
    ).trim();
  }
  return "";
}

function multiAgentHeaderVerb(action: string, status: string): string {
  if (action === "spawnAgent") {
    if (status === "inProgress") return formatMessage({ id: "localConversation.multiAgentAction.header.spawn.inProgress", defaultMessage: "Spawning" });
    if (status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.header.spawn.failed", defaultMessage: "Failed to spawn" });
    return formatMessage({ id: "localConversation.multiAgentAction.header.spawn.completed", defaultMessage: "Spawned" });
  }
  if (action === "sendInput") {
    if (status === "inProgress") return formatMessage({ id: "localConversation.multiAgentAction.header.sendInput.inProgress", defaultMessage: "Messaging" });
    if (status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.header.sendInput.failed", defaultMessage: "Failed to message" });
    return formatMessage({ id: "localConversation.multiAgentAction.header.sendInput.completed", defaultMessage: "Messaged" });
  }
  if (action === "resumeAgent") {
    if (status === "inProgress") return formatMessage({ id: "localConversation.multiAgentAction.header.resume.inProgress", defaultMessage: "Resuming" });
    if (status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.header.resume.failed", defaultMessage: "Failed to resume" });
    return formatMessage({ id: "localConversation.multiAgentAction.header.resume.completed", defaultMessage: "Resumed" });
  }
  if (action === "closeAgent") {
    if (status === "inProgress") return formatMessage({ id: "localConversation.multiAgentAction.header.close.inProgress", defaultMessage: "Closing" });
    if (status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.header.close.failed", defaultMessage: "Failed to close" });
    return formatMessage({ id: "localConversation.multiAgentAction.header.close.completed", defaultMessage: "Closed" });
  }
  // Codex's generic multi-agent header is `{action}{countLabel}` — the raw action
  // is passed straight through (no "Updated agents"/"Working with agents" string
  // exists in the bundle). Mirror that by returning the action verbatim for any
  // unrecognized action value.
  return action;
}

function multiAgentRowVerb(action: string, status: string): string {
  if (action === "sendInput" && status === "completed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.completed", defaultMessage: "Messaged" });
  if (action === "sendInput" && status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.failed", defaultMessage: "Failed messaging" });
  if (action === "sendInput") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.inProgress", defaultMessage: "Messaging" });
  if (action === "spawnAgent" && status === "completed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.spawn.completed", defaultMessage: "Spawned" });
  if (action === "spawnAgent" && status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.spawn.failed", defaultMessage: "Failed spawning" });
  if (action === "spawnAgent") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.spawn.inProgress", defaultMessage: "Spawning" });
  if (action === "resumeAgent" && status === "completed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.resume.completed", defaultMessage: "Resumed" });
  if (action === "resumeAgent" && status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.resume.failed", defaultMessage: "Failed resuming" });
  if (action === "resumeAgent") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.resume.inProgress", defaultMessage: "Resuming" });
  if (action === "closeAgent" && status === "completed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.close.completed", defaultMessage: "Closed" });
  if (action === "closeAgent" && status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.close.failed", defaultMessage: "Failed closing" });
  if (action === "closeAgent") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.close.inProgress", defaultMessage: "Closing" });
  return multiAgentHeaderVerb(action, status);
}

function multiAgentSendInputPromptVerb(status: string): string {
  if (status === "failed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.messaged.failed", defaultMessage: "Failed to message" });
  if (status === "completed") return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.messaged.completed", defaultMessage: "Messaged" });
  return formatMessage({ id: "localConversation.multiAgentAction.rowAction.sendInput.messaged.inProgress", defaultMessage: "Messaging" });
}
