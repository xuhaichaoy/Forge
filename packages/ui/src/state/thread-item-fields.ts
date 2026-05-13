import { formatUnknown, stringField } from "../lib/format";

import type { AssistantMessagePhase, ItemRecord, RailEntry, ThreadItem } from "./render-group-types";

export function itemText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.summary) || Array.isArray(record.content)) {
    return [...stringArray(record.summary), ...stringArray(record.content)].join("\n");
  }
  if (typeof record.aggregatedOutput === "string") return record.aggregatedOutput;
  if (typeof record.result === "string") return record.result;
  if (typeof record.error === "string") return record.error;
  return "";
}

export function commandText(item: ThreadItem): string {
  const record = item as ItemRecord;
  const parsedCmd = recordObject(record.parsedCmd);
  return shellCommandText(record.command)
    || shellCommandText(record.cmd)
    || shellCommandText(parsedCmd.cmd)
    || shellCommandText(recordObject(record.summary).cmd);
}

export function commandOutputText(item: ThreadItem): string {
  const record = item as ItemRecord;
  const output = recordObject(record.output);
  return stringField(record, "aggregatedOutput")
    || stringField(output, "aggregatedOutput")
    || stringField(output, "stdout")
    || stringField(output, "stderr")
    || stringField(output, "text")
    || stringField(record, "output")
    || stringField(record, "result")
    || stringField(record, "error");
}

export function assistantMessageText(item: ThreadItem): string {
  const text = stripRawThinkingMarkup(itemText(item));
  if (text.trim()) return text;
  const structured = heartbeatStructuredOutput(item);
  if (!structured) return text;
  const notificationMessage = stringField(structured, "notificationMessage").trim();
  if (notificationMessage) return notificationMessage;
  return stringField(structured, "decision") === "DONT_NOTIFY" ? "Heartbeat completed quietly." : "";
}

function heartbeatStructuredOutput(item: ThreadItem): Record<string, unknown> | null {
  const record = item as ItemRecord;
  const structured = recordObject(record.structuredOutput);
  if (stringField(structured, "type") === "heartbeat") return structured;
  const snakeStructured = recordObject(record.structured_output);
  return stringField(snakeStructured, "type") === "heartbeat" ? snakeStructured : null;
}

function shouldRenderAssistantPlaceholder(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.renderPlaceholderWhileStreaming === true && record.completed !== true;
}

export function stripRawThinkingMarkup(value: string): string {
  let text = value.replace(/\r\n?/g, "\n");
  text = text.replaceAll(/[ \t]*\n?[ \t]*<think\b[^>]*>[\s\S]*?<\/think>[ \t]*\n?[ \t]*/gi, "\n");

  const lastDanglingClose = text.toLowerCase().lastIndexOf("</think>");
  if (lastDanglingClose >= 0) {
    text = text.slice(lastDanglingClose + "</think>".length);
  }

  text = text.replaceAll(/<think\b[^>]*>[\s\S]*$/gi, "");
  return text
    .replaceAll(/[ \t]+\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export function assistantMessagePhase(item: ThreadItem): AssistantMessagePhase {
  const phase = stringField(item as Record<string, unknown>, "phase");
  if (phase === "commentary") return "commentary";
  if (phase === "final_answer" || phase === "final") return "final_answer";
  return "unknown";
}

export function itemType(item: ThreadItem): string {
  const rawType = String((item as Record<string, unknown>).type ?? "");
  if (rawType === "workedFor") return "worked-for";
  switch (item.type) {
    case "userMessage":
      return "user-message";
    case "agentMessage":
      return "assistant-message";
    case "commandExecution":
      return "exec";
    case "fileChange":
      return "patch";
    case "mcpToolCall":
      return "mcp-tool-call";
    case "dynamicToolCall":
      return "dynamic-tool-call";
    case "collabAgentToolCall":
      return "multi-agent-action";
    case "contextCompaction":
      return "context-compaction";
    case "webSearch":
      return "web-search";
    default:
      return item.type;
  }
}

export function isThreadStatusInProgress(status: unknown): boolean {
  if (typeof status === "string") return status === "running" || status === "inProgress" || status === "active";
  if (!status || typeof status !== "object") return false;
  const record = status as Record<string, unknown>;
  const type = record.type;
  if (type === "active" || type === "running" || type === "inProgress") return true;
  const statusValue = record.status;
  return statusValue === "active" || statusValue === "running" || statusValue === "inProgress";
}

export function isItemInProgress(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  const status = record.status;
  if (status === "inProgress" || status === "running" || status === "pending" || status === "streaming") return true;
  if (itemType(item) === "worked-for") return status === "working";
  // Codex Desktop's split-items activity predicate treats reasoning as active
  // while the protocol item has not completed.
  if (itemType(item) === "reasoning") return record.completed === false;
  if (itemType(item) === "exec") {
    if (record.executionStatus === "interrupted") return false;
    const parsedCmd = recordObject(record.parsedCmd);
    if (typeof parsedCmd.isFinished === "boolean") return !parsedCmd.isFinished;
    return execExitCode(item) === null && status !== "completed" && status !== "failed" && status !== "declined";
  }
  if (itemType(item) === "patch") {
    if (record.success === null) return true;
    if (typeof record.success === "boolean") return false;
    return status === "pending" || status === "streaming" || status === "inProgress";
  }
  if (itemType(item) === "hook") {
    const run = recordObject(record.run);
    return stringField(run, "status") === "running" || status === "running";
  }
  if (itemType(item) === "web-search") return record.completed === false;
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return status !== "completed" && status !== "failed" && status !== "errored" && status !== "cancelled";
  }
  return false;
}
export function mcpServerName(item: ThreadItem): string {
  return mcpInvocationField(item, "server");
}

export function mcpToolName(item: ThreadItem): string {
  return mcpInvocationField(item, "tool");
}

export function mcpAppResourceUri(item: ThreadItem): string {
  if (itemType(item) !== "mcp-tool-call") return "";
  const record = item as ItemRecord;
  const direct = stringField(record, "mcpAppResourceUri");
  if (direct) return direct;
  const result = recordObject(record.result);
  return mcpAppResourceUriFromMeta(result._meta);
}

export function mcpAppResourceUriFromMeta(meta: unknown): string {
  const record = recordObject(meta);
  const ui = recordObject(record.ui);
  return stringField(ui, "resourceUri")
    || stringField(record, "ui/resourceUri")
    || stringField(record, "openai/outputTemplate");
}

export function mcpAppResourceUriFromServerStatuses(
  mcpServerStatuses: unknown,
  server: string,
  tool: string,
): string {
  const statusRecord = recordObject(mcpServerStatuses);
  const statuses = Array.isArray(statusRecord.data)
    ? recordArray(statusRecord.data)
    : recordArray(mcpServerStatuses);
  const serverStatus = statuses.find((status) => stringField(status, "name") === server);
  if (!serverStatus) return "";
  const tools = recordObject(serverStatus.tools);
  const directTool = recordObject(tools[tool]);
  const matchedTool = Object.values(tools)
    .map(recordObject)
    .find((candidate) => stringField(candidate, "name") === tool);
  return mcpAppResourceUriFromMeta((Object.keys(directTool).length > 0 ? directTool : matchedTool)?._meta);
}

export function mcpSourceTitle(server: string): string {
  const value = server.trim();
  if (!value) return "MCP";
  if (value.toLowerCase() === "github") return "GitHub";
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function mcpInvocationField(item: ThreadItem, field: "server" | "tool"): string {
  const record = item as ItemRecord;
  const direct = stringField(record, field);
  if (direct) return direct;
  const invocation = record.invocation && typeof record.invocation === "object"
    ? record.invocation as Record<string, unknown>
    : null;
  return invocation ? stringField(invocation, field) : "";
}
export function isCompletedRecord(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  return record.completed === true || record.status === "completed";
}
export function mcpElicitationServer(item: ThreadItem): string {
  const record = item as ItemRecord;
  const direct = stringField(record, "server") || stringField(record, "serverName");
  if (direct) return direct;
  const elicitation = record.elicitation && typeof record.elicitation === "object"
    ? record.elicitation as Record<string, unknown>
    : null;
  if (!elicitation) return "";
  const genericServer = stringField(elicitation, "serverName") || stringField(elicitation, "server");
  if (genericServer) return genericServer;
  const approval = elicitation.approval && typeof elicitation.approval === "object"
    ? elicitation.approval as Record<string, unknown>
    : null;
  return approval ? stringField(approval, "connector_id") || stringField(approval, "connectorId") : "";
}
export function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function filePathsFromItem(item: ThreadItem): string[] {
  const record = item as ItemRecord;
  const paths: string[] = [];
  const addPath = (value: string) => {
    const path = normalizeRenderableFilePath(value);
    if (path) paths.push(path);
  };
  if (typeof record.path === "string") addPath(record.path);
  if (typeof record.savedPath === "string") addPath(record.savedPath);
  for (const change of patchChanges(item)) {
    for (const key of ["path", "file", "filePath", "oldPath", "newPath"]) {
      const value = (change as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) addPath(value);
    }
  }
  return dedupe(paths);
}

function normalizeRenderableFilePath(value: string): string {
  const normalized = value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;:，。、；：]+$/g, "")
    .trim();
  if (!normalized) return "";
  const withoutScheme = normalized.replace(/^file:\/\//i, "");
  const withoutLine = withoutScheme.replace(/:(\d+)(?:-(\d+))?$/, "");
  const basename = withoutLine.split(/[\\/]/).filter(Boolean).pop() ?? withoutLine;
  if (!basename || basename === "." || basename === "..") return "";
  return /[\p{L}\p{N}]/u.test(basename) ? normalized : "";
}

export function shouldProjectArtifactsFromItem(item: ThreadItem): boolean {
  if (isItemInProgress(item)) return false;
  return !hasFailedOutcome(item);
}

function patchChanges(item: ThreadItem): Record<string, unknown>[] {
  const changes = (item as ItemRecord).changes;
  if (Array.isArray(changes)) {
    return changes.filter((change): change is Record<string, unknown> => Boolean(change) && typeof change === "object");
  }
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes as Record<string, unknown>).flatMap(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const change = value as Record<string, unknown>;
    return [{ ...change, path: stringField(change, "path") || path }];
  });
}
export function commandLabel(item: ThreadItem): string {
  const command = commandText(item);
  if (!command) return isItemInProgress(item) ? "Running command" : "Ran command";
  return `${isItemInProgress(item) ? "Running" : "Ran"} ${command}`;
}

/**
 * Two-tone label parts mirroring Codex Desktop's `<action>Ran</action> <detail>{command}</detail>`
 * i18n template (`wg.commandRanWithDetail` / `commandRunningWithDetail` / `commandStoppedWithDetail`
 * in local-conversation-thread-*.js :3766; renderers `O_` / `D_` at :4207-4211 — action is muted,
 * detail is normal foreground color). Returns null when no command text is available so the caller
 * can fall back to the plain string `commandLabel`.
 */
export function commandLabelParts(item: ThreadItem): { action: string; detail: string } | null {
  const command = commandText(item);
  if (!command) return null;
  const record = item as ItemRecord;
  const executionStatus = typeof record.executionStatus === "string" ? record.executionStatus : "";
  if (executionStatus === "interrupted") return { action: "Stopped", detail: command };
  return { action: isItemInProgress(item) ? "Running" : "Ran", detail: command };
}

function shellCommandText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map(shellArgText).filter(Boolean).join(" ").trim();
}

function shellArgText(value: unknown): string {
  if (typeof value !== "string") return formatUnknown(value);
  if (value.length === 0) return "''";
  return /[\s"'\\$`]/.test(value) ? JSON.stringify(value) : value;
}

function execExitCode(item: ThreadItem): number | null {
  const record = item as ItemRecord;
  if (typeof record.exitCode === "number" && Number.isFinite(record.exitCode)) return record.exitCode;
  const output = recordObject(record.output);
  return typeof output.exitCode === "number" && Number.isFinite(output.exitCode) ? output.exitCode : null;
}

function hasFailedOutcome(item: ThreadItem): boolean {
  const record = item as ItemRecord;
  const status = typeof record.status === "string" ? record.status.toLowerCase() : "";
  if (/^(?:failed|error|errored|cancelled|canceled|declined|rejected|denied|timeout|timedout|interrupted)$/.test(status)) {
    return true;
  }
  if (record.success === false) return true;
  if (record.executionStatus === "interrupted") return true;
  if (execExitCode(item) !== null && execExitCode(item) !== 0) return true;
  if (hasErrorValue(record.error)) return true;
  const output = recordObject(record.output);
  return hasErrorValue(output.error);
}

function hasErrorValue(value: unknown): boolean {
  if (value == null || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function durationMs(item: ThreadItem): number {
  const record = item as ItemRecord;
  const value = record.durationMs;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const started = typeof record.startedAtMs === "number" && Number.isFinite(record.startedAtMs) ? record.startedAtMs : null;
  const completed = typeof record.completedAtMs === "number" && Number.isFinite(record.completedAtMs) ? record.completedAtMs : null;
  if (started !== null && completed !== null && completed > started) return completed - started;
  return 0;
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function statusText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.status === "string") return record.status;
  if (typeof record.exitCode === "number") return record.exitCode === 0 ? "completed" : `exit ${record.exitCode}`;
  if (isItemInProgress(item)) return "inProgress";
  return "completed";
}
export function coalesceProgress(entries: RailEntry[]): RailEntry[] {
  const seen = new Set<string>();
  const result: RailEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.title}:${entry.meta ?? ""}:${entry.status ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result.slice(-12);
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : formatUnknown(item));
}

export function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
