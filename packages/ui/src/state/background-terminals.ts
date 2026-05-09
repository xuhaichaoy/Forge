import type { CommandPanelEntry } from "./command-panel";
import type { ThreadItem } from "./render-groups";
import {
  commandOutputText,
  commandText,
  itemType,
} from "./thread-item-fields";
import { stringField } from "../lib/format";

const MAX_RECENT_OUTPUT_LINES = 3;

export function projectBackgroundTerminalEntries(items: ThreadItem[]): CommandPanelEntry[] {
  const entries = new Map<string, CommandPanelEntry>();
  for (const item of items) {
    if (!isBackgroundTerminalItem(item)) continue;
    const record = item as Record<string, unknown>;
    const processId = stringField(record, "processId");
    const key = processId || item.id;
    if (entries.has(key)) continue;
    const command = commandText(item) || "Background terminal";
    entries.set(key, {
      id: `background-terminal:${key}`,
      title: command,
      kind: "status",
      status: "running",
      meta: stringField(record, "cwd") || undefined,
      details: backgroundTerminalDetails(item, processId),
    });
  }
  return Array.from(entries.values());
}

function isBackgroundTerminalItem(item: ThreadItem): boolean {
  if (itemType(item) !== "exec") return false;
  const record = item as Record<string, unknown>;
  if (!isInProgressStatus(stringField(record, "status"))) return false;
  return isUnifiedExecSource(stringField(record, "source"));
}

function isInProgressStatus(value: string): boolean {
  return value === "inProgress" || value === "in_progress" || value === "running";
}

function isUnifiedExecSource(value: string): boolean {
  return value === "unifiedExecStartup" || value === "unifiedExecInteraction";
}

function backgroundTerminalDetails(item: ThreadItem, processId: string): string[] {
  const outputLines = recentOutputLines(commandOutputText(item));
  return [
    ...(processId ? [`Process: ${processId}`] : []),
    ...outputLines.map((line) => `Output: ${line}`),
  ];
}

function recentOutputLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-MAX_RECENT_OUTPUT_LINES);
}
