import type { ThreadSearchParams } from "@forge/codex-protocol/generated/v2/ThreadSearchParams";
import type { ThreadSortKey } from "@forge/codex-protocol/generated/v2/ThreadSortKey";
import type { CommandPanelEntry } from "./command-panel-types";
import { compactParams } from "./thread-workflow-shared";

export const COMMAND_PANEL_CHAT_SEARCH_LIMIT = 9;
export const COMMAND_PANEL_CHAT_SEARCH_DEBOUNCE_MS = 200;

export function buildCommandPanelThreadSearchParams(
  query: string,
  sortKey: ThreadSortKey,
  limit = COMMAND_PANEL_CHAT_SEARCH_LIMIT,
): ThreadSearchParams | null {
  const searchTerm = query.trim();
  if (!searchTerm) return null;
  return compactParams({
    archived: false,
    limit,
    sortKey,
    sortDirection: "desc",
    sourceKinds: [],
    searchTerm,
  }) as ThreadSearchParams;
}

export function mergeCommandPanelThreadSearchEntries(input: {
  loadedEntries: CommandPanelEntry[];
  searchEntries: CommandPanelEntry[];
  limit?: number;
}): CommandPanelEntry[] {
  const limit = input.limit ?? COMMAND_PANEL_CHAT_SEARCH_LIMIT;
  const merged: CommandPanelEntry[] = [];
  const indexByThreadId = new Map<string, number>();
  for (const entry of [...input.loadedEntries, ...input.searchEntries]) {
    const threadId = commandPanelEntryThreadId(entry);
    if (!threadId) {
      merged.push(entry);
      continue;
    }
    const existingIndex = indexByThreadId.get(threadId);
    if (existingIndex === undefined) {
      indexByThreadId.set(threadId, merged.length);
      merged.push(entry);
      continue;
    }
    const existing = merged[existingIndex];
    if (!existing) continue;
    merged[existingIndex] = mergeThreadEntryPreview(existing, entry);
  }
  return merged.slice(0, limit);
}

function mergeThreadEntryPreview(existing: CommandPanelEntry, incoming: CommandPanelEntry): CommandPanelEntry {
  if ((existing.details?.length ?? 0) > 0 || !incoming.details || incoming.details.length === 0) {
    return existing;
  }
  return {
    ...existing,
    details: incoming.details,
  };
}

function commandPanelEntryThreadId(entry: CommandPanelEntry): string | null {
  return entry.action?.type === "selectThread" ? entry.action.threadId : null;
}
