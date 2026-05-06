import type { ThreadItem, UserInput } from "@hicodex/codex-protocol";
import { formatUnknown, stringField } from "../lib/format";

export type ConversationRenderUnit =
  | {
      kind: "message";
      key: string;
      role: "user" | "assistant";
      item: ThreadItem;
      text: string;
    }
  | {
      kind: "toolActivity";
      key: string;
      items: ThreadItem[];
      summary: ToolActivitySummary;
    }
  | {
      kind: "event";
      key: string;
      item: ThreadItem;
      label: string;
      text: string;
    };

export interface ToolActivitySummary {
  label: string;
  details: string[];
  inProgress: boolean;
  counts: {
    commands: number;
    fileChanges: number;
    mcpCalls: number;
    dynamicCalls: number;
    webSearches: number;
    reasoning: number;
    plans: number;
    other: number;
  };
}

export interface RailEntry {
  id: string;
  title: string;
  meta?: string;
  status?: string;
}

export interface ConversationProjection {
  units: ConversationRenderUnit[];
  progress: RailEntry[];
  artifacts: RailEntry[];
  sources: RailEntry[];
}

type ItemRecord = ThreadItem & Record<string, unknown>;

export function projectConversation(items: ThreadItem[]): ConversationProjection {
  const units: ConversationRenderUnit[] = [];
  const progress: RailEntry[] = [];
  const artifacts = new Map<string, RailEntry>();
  const sources = new Map<string, RailEntry>();
  let activity: ThreadItem[] = [];

  const flushActivity = () => {
    if (activity.length === 0) return;
    const summary = summarizeToolActivity(activity);
    const first = activity[0];
    const last = activity[activity.length - 1];
    units.push({
      kind: "toolActivity",
      key: `tool:${first?.id ?? "unknown"}:${last?.id ?? activity.length}`,
      items: activity,
      summary,
    });
    activity = [];
  };

  for (const item of items) {
    collectRailEntries(item, artifacts, sources, progress);
    if (isUserMessage(item)) {
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "user",
        item,
        text: userMessageText(item),
      });
      continue;
    }
    if (isAssistantMessage(item)) {
      flushActivity();
      units.push({
        kind: "message",
        key: item.id,
        role: "assistant",
        item,
        text: itemText(item),
      });
      continue;
    }
    if (isToolActivityItem(item)) {
      activity.push(item);
      continue;
    }
    flushActivity();
    units.push({
      kind: "event",
      key: item.id,
      item,
      label: eventLabel(item),
      text: eventText(item),
    });
  }

  flushActivity();

  return {
    units,
    progress: coalesceProgress(progress),
    artifacts: Array.from(artifacts.values()),
    sources: Array.from(sources.values()),
  };
}

export function userMessageText(item: ThreadItem): string {
  const content = Array.isArray((item as { content?: unknown }).content)
    ? ((item as { content: UserInput[] }).content)
    : [];
  return content.map(userInputPartText).filter(Boolean).join("\n");
}

export function itemText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.summary) || Array.isArray(record.content)) {
    return [...stringArray(record.summary), ...stringArray(record.content)].join("\n");
  }
  if (typeof record.aggregatedOutput === "string") return record.aggregatedOutput;
  if (typeof record.result === "string") return record.result;
  if (typeof record.error === "string") return record.error;
  return "";
}

export function itemType(item: ThreadItem): string {
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
  if (item.type === "commandExecution") return record.exitCode == null && status !== "completed" && status !== "failed";
  if (item.type === "fileChange") return status === "pending" || status === "streaming";
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return status !== "completed" && status !== "failed" && status !== "errored" && status !== "cancelled";
  }
  return false;
}

export function formatItemDetail(item: ThreadItem): string {
  const type = itemType(item);
  const record = item as ItemRecord;
  if (type === "exec") {
    const command = stringField(record, "command") || "command";
    const output = stringField(record, "aggregatedOutput");
    return output ? `$ ${command}\n${output}` : `$ ${command}`;
  }
  if (type === "patch") {
    const paths = filePathsFromItem(item);
    return paths.length > 0 ? paths.join("\n") : statusText(item);
  }
  if (type === "mcp-tool-call") {
    return `${stringField(record, "server") || "mcp"}:${stringField(record, "tool") || "tool"}\n${formatUnknown(record.result ?? record.error ?? record.arguments ?? record.status)}`;
  }
  if (type === "dynamic-tool-call") {
    const name = [stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".");
    return `${name}\n${formatUnknown(record.contentItems ?? record.arguments ?? record.status)}`;
  }
  return itemText(item) || formatUnknown(item);
}

function summarizeToolActivity(items: ThreadItem[]): ToolActivitySummary {
  const counts = {
    commands: 0,
    fileChanges: 0,
    mcpCalls: 0,
    dynamicCalls: 0,
    webSearches: 0,
    reasoning: 0,
    plans: 0,
    other: 0,
  };
  const details: string[] = [];
  let inProgress = false;

  for (const item of items) {
    inProgress = inProgress || isItemInProgress(item);
    const type = itemType(item);
    const record = item as ItemRecord;
    if (type === "exec") {
      counts.commands += 1;
      details.push(commandLabel(item));
    } else if (type === "patch") {
      counts.fileChanges += 1;
      const paths = filePathsFromItem(item);
      details.push(paths.length > 0 ? `Edited ${formatCount(paths.length, "file")}` : "Edited files");
    } else if (type === "mcp-tool-call") {
      counts.mcpCalls += 1;
      details.push(`Called ${stringField(record, "server") || "mcp"}:${stringField(record, "tool") || "tool"}`);
    } else if (type === "dynamic-tool-call") {
      counts.dynamicCalls += 1;
      details.push(`Called ${[stringField(record, "namespace"), stringField(record, "tool") || "tool"].filter(Boolean).join(".")}`);
    } else if (type === "webSearch") {
      counts.webSearches += 1;
      details.push(`Searched web${stringField(record, "query") ? ` for ${stringField(record, "query")}` : ""}`);
    } else if (type === "reasoning") {
      counts.reasoning += 1;
      details.push(inProgress ? "Thinking" : "Reasoned");
    } else if (type === "plan") {
      counts.plans += 1;
      details.push("Updated plan");
    } else {
      counts.other += 1;
      details.push(eventLabel(item));
    }
  }

  return {
    label: activityLabel(counts, inProgress),
    details: dedupe(details).slice(0, 8),
    inProgress,
    counts,
  };
}

function activityLabel(counts: ToolActivitySummary["counts"], inProgress: boolean): string {
  if (inProgress) return "Working";
  if (counts.fileChanges > 0) return `Edited ${formatCount(counts.fileChanges, "file")}`;
  if (counts.commands > 0) return `Ran ${formatCount(counts.commands, "command")}`;
  if (counts.mcpCalls + counts.dynamicCalls > 0) return `Called ${formatCount(counts.mcpCalls + counts.dynamicCalls, "tool")}`;
  if (counts.webSearches > 0) return "Searched web";
  if (counts.plans > 0) return "Updated plan";
  if (counts.reasoning > 0) return "Reasoned";
  return "Worked";
}

function collectRailEntries(
  item: ThreadItem,
  artifacts: Map<string, RailEntry>,
  sources: Map<string, RailEntry>,
  progress: RailEntry[],
) {
  const record = item as ItemRecord;
  const plan = itemType(item) === "todo-list" && Array.isArray(record.plan) ? record.plan : null;
  if (plan) {
    for (const [index, raw] of plan.entries()) {
      const entry = raw as Record<string, unknown>;
      const title = stringField(entry, "step") || stringField(entry, "title") || stringField(entry, "text") || `Task ${index + 1}`;
      progress.push({
        id: `todo:${item.id}:${index}`,
        title,
        status: stringField(entry, "status") || "planned",
      });
    }
  }

  for (const path of filePathsFromItem(item)) {
    artifacts.set(path, {
      id: path,
      title: path.split("/").filter(Boolean).pop() ?? path,
      meta: path,
      status: statusText(item),
    });
  }

  if (item.type === "agentMessage") {
    for (const artifact of artifactsFromText(itemText(item))) {
      artifacts.set(artifact.id, artifact);
    }
  }

  if (item.type === "mcpToolCall") {
    const server = stringField(record, "server");
    if (server === "node_repl") return;
    const title = `${stringField(record, "server") || "mcp"}:${stringField(record, "tool") || "tool"}`;
    sources.set(`mcp:${title}`, { id: `mcp:${title}`, title, meta: "MCP tool", status: statusText(item) });
  }

  if (itemType(item) === "web-search") {
    const query = stringField(record, "query") || "web search";
    sources.set(`web:${query}`, { id: `web:${query}`, title: query, meta: "Web search", status: statusText(item) });
  }
}

function isUserMessage(item: ThreadItem): boolean {
  return itemType(item) === "user-message";
}

function isAssistantMessage(item: ThreadItem): boolean {
  return itemType(item) === "assistant-message";
}

function isToolActivityItem(item: ThreadItem): boolean {
  return [
    "reasoning",
    "plan",
    "exec",
    "patch",
    "mcp-tool-call",
    "dynamic-tool-call",
    "web-search",
    "todo-list",
    "context-compaction",
  ].includes(itemType(item));
}

function userInputPartText(part: unknown): string {
  if (!part || typeof part !== "object") return formatUnknown(part);
  const record = part as Record<string, unknown>;
  if (record.type === "text") return stringField(record, "text");
  if (record.type === "image") return `[image ${stringField(record, "url")}]`;
  if (record.type === "localImage") return `[image ${stringField(record, "path")}]`;
  if (record.type === "mention") return `@${stringField(record, "name") || stringField(record, "path")}`;
  if (record.type === "skill") return `$${stringField(record, "name") || stringField(record, "path")}`;
  return `[${stringField(record, "type") || "input"}]`;
}

function eventLabel(item: ThreadItem): string {
  const type = itemType(item);
  if (type === "context-compaction") return "Context compacted";
  if (type === "imageView") return "Viewed image";
  if (type === "imageGeneration") return "Generated image";
  if (type === "enteredReviewMode") return "Entered review";
  if (type === "exitedReviewMode") return "Exited review";
  return type;
}

function eventText(item: ThreadItem): string {
  return itemText(item) || formatUnknown(item);
}

function filePathsFromItem(item: ThreadItem): string[] {
  const record = item as ItemRecord;
  const paths: string[] = [];
  if (typeof record.path === "string") paths.push(record.path);
  if (typeof record.savedPath === "string") paths.push(record.savedPath);
  const changes = Array.isArray(record.changes) ? record.changes : [];
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    for (const key of ["path", "file", "filePath", "oldPath", "newPath"]) {
      const value = (change as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0) paths.push(value);
    }
  }
  return dedupe(paths);
}

function artifactsFromText(text: string): RailEntry[] {
  const entries: RailEntry[] = [];
  const markdownLinks = Array.from(text.matchAll(/\[[^\]]+]\(([^)]+)\)/g)).map((match) => match[1] ?? "");
  const plainUrls = Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0] ?? "");
  const backtickPaths = Array.from(text.matchAll(/`([^`]+\.[A-Za-z0-9]{1,8})`/g)).map((match) => match[1] ?? "");
  for (const target of dedupe([...markdownLinks, ...plainUrls, ...backtickPaths])) {
    if (!target || target.startsWith("#")) continue;
    if (target.startsWith("http://") || target.startsWith("https://")) {
      entries.push({
        id: `website:${target}`,
        title: urlTitle(target),
        meta: target,
        status: "website",
      });
      continue;
    }
    if (looksLikeFilePath(target)) {
      entries.push({
        id: `file:${target}`,
        title: target.split("/").filter(Boolean).pop() ?? target,
        meta: target,
        status: "referenced",
      });
    }
  }
  return entries;
}

function looksLikeFilePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /^[\w.-]+\/[\w./-]+\.[\w-]+$/.test(value);
}

function urlTitle(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost"
      ? `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`
      : url.hostname;
  } catch {
    return value;
  }
}

function commandLabel(item: ThreadItem): string {
  const command = stringField(item, "command");
  if (!command) return isItemInProgress(item) ? "Running command" : "Ran command";
  return `${isItemInProgress(item) ? "Running" : "Ran"} ${command}`;
}

function statusText(item: ThreadItem): string {
  const record = item as ItemRecord;
  if (typeof record.status === "string") return record.status;
  if (typeof record.exitCode === "number") return record.exitCode === 0 ? "completed" : `exit ${record.exitCode}`;
  if (isItemInProgress(item)) return "inProgress";
  return "completed";
}

function coalesceProgress(entries: RailEntry[]): RailEntry[] {
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : formatUnknown(item));
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
