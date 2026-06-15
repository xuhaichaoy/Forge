import type {
  CommandPanelEntry,
  CommandPanelKind,
  CommandPanelState,
} from "./command-panel-types";

export function isAppBackedPanel(panel: CommandPanelKind | null | undefined): panel is "apps" | "plugins" {
  return panel === "apps" || panel === "plugins";
}

export function isCommandMenuPanel(panel: CommandPanelState | null | undefined): panel is CommandPanelState & { panel: "generic" } {
  return panel?.panel === "generic" && panel.title === "Search commands and chats";
}

export function isAppBackedPanelState(
  state: CommandPanelState | null | undefined,
): state is CommandPanelState & { panel: "apps" | "plugins" } {
  return isAppBackedPanel(state?.panel);
}

const COMMAND_PANEL_PINNED_CHATS_GROUP = { key: "pinned-chats", label: "Pinned chats" };
const COMMAND_PANEL_RECENT_CHATS_GROUP = { key: "recent-chats", label: "Recent chats" };

export function commandPanelThreadGroup(threadId: string, pinnedThreadIds: Set<string>): Pick<CommandPanelEntry, "groupKey" | "groupLabel"> {
  const group = pinnedThreadIds.has(threadId)
    ? COMMAND_PANEL_PINNED_CHATS_GROUP
    : COMMAND_PANEL_RECENT_CHATS_GROUP;
  return { groupKey: group.key, groupLabel: group.label };
}

export function orderCommandPanelThreadsByPinned<T extends { id: string }>(threads: T[], pinnedThreadIds: Set<string>): T[] {
  const pinnedThreads = threads.filter((thread) => pinnedThreadIds.has(thread.id));
  const recentThreads = threads.filter((thread) => !pinnedThreadIds.has(thread.id));
  return [...pinnedThreads, ...recentThreads];
}
