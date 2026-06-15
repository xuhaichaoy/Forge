import { useCallback, useRef, useState, type MouseEvent } from "react";
import type { Thread } from "@forge/codex-protocol";
import { useDismissibleLayer } from "../hooks/use-dismissible-layer";
import {
  CHATS_GROUP_KEY,
  DEFAULT_SIDEBAR_ORGANIZE_MODE,
  projectSidebarThreadGroups,
  splitSidebarThreadsByPinned,
  type SidebarOrganizeMode,
  type SidebarSortKey,
} from "../state/sidebar-projection";
import {
  projectSectionCollapseAction,
} from "./sidebar-project-section";
import {
  sidebarBrowserViewportSize,
  sidebarContextMenuPosition,
} from "./sidebar-thread-row";

interface UseSidebarInteractionsInput {
  collapsedGroupKeys?: ReadonlySet<string>;
  currentWorkspaceRoot?: string | null;
  onCollapsedGroupKeysChange?: (collapsedGroupKeys: string[]) => void;
  onOrganizeModeChange?: (organizeMode: SidebarOrganizeMode) => void;
  onSortKeyChange?: (sortKey: SidebarSortKey) => void;
  organizeMode?: SidebarOrganizeMode;
  pinnedThreadIds?: ReadonlySet<string>;
  selectedWorkspaceRoots?: string[];
  threads: Thread[];
  usageAlertKey: string | null;
}

type SidebarProjectSectionMenu = "filter" | "add-project";

export function useSidebarInteractions({
  collapsedGroupKeys,
  currentWorkspaceRoot,
  onCollapsedGroupKeysChange,
  onOrganizeModeChange,
  onSortKeyChange,
  organizeMode,
  pinnedThreadIds,
  selectedWorkspaceRoots,
  threads,
  usageAlertKey,
}: UseSidebarInteractionsInput) {
  const [openThreadMenu, setOpenThreadMenu] = useState<{
    threadId: string;
    x: number;
    y: number;
  } | null>(null);
  const [openSectionMenu, setOpenSectionMenu] = useState<SidebarProjectSectionMenu | null>(null);
  const sectionActionsRef = useRef<HTMLDivElement | null>(null);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const [internalOrganizeMode, setInternalOrganizeMode] = useState<SidebarOrganizeMode>(DEFAULT_SIDEBAR_ORGANIZE_MODE);
  const [internalCollapsedGroupKeys, setInternalCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [previouslyExpandedGroupKeys, setPreviouslyExpandedGroupKeys] = useState<string[]>([]);
  const [confirmingArchiveThreadId, setConfirmingArchiveThreadId] = useState<string | null>(null);
  const [dismissedUsageAlertKeys, setDismissedUsageAlertKeys] = useState<Set<string>>(() => new Set());
  const effectiveOrganizeMode = organizeMode ?? internalOrganizeMode;
  const effectiveCollapsedGroupKeys = collapsedGroupKeys ?? internalCollapsedGroupKeys;
  const { pinnedThreads, unpinnedThreads } = splitSidebarThreadsByPinned(threads, pinnedThreadIds);
  const threadGroups = projectSidebarThreadGroups(unpinnedThreads, {
    organizeMode: effectiveOrganizeMode,
    currentWorkspaceRoot,
    selectedWorkspaceRoots,
  });
  const projectGroups = threadGroups.filter((group) => group.key !== CHATS_GROUP_KEY);
  const chatsThreads = threadGroups.find((group) => group.key === CHATS_GROUP_KEY)?.threads ?? [];
  const projectGroupKeys = projectGroups.map((group) => group.key);
  const sectionCollapseAction = projectSectionCollapseAction(
    projectGroupKeys,
    effectiveCollapsedGroupKeys,
    previouslyExpandedGroupKeys,
  );

  const closeThreadMenu = useCallback(() => {
    setOpenThreadMenu(null);
  }, []);

  const closeSectionMenu = useCallback(() => {
    setOpenSectionMenu(null);
  }, []);

  useDismissibleLayer(openThreadMenu != null, threadMenuRef, closeThreadMenu);
  useDismissibleLayer(openSectionMenu != null, sectionActionsRef, closeSectionMenu);

  const openContextMenu = useCallback((event: MouseEvent, thread: Thread) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenSectionMenu(null);
    setConfirmingArchiveThreadId(null);
    const position = sidebarContextMenuPosition(
      { x: event.clientX, y: event.clientY },
      sidebarBrowserViewportSize(),
    );
    setOpenThreadMenu({ threadId: thread.id, x: position.left, y: position.top });
  }, []);

  const requestArchiveConfirmation = useCallback((thread: Thread) => {
    setOpenThreadMenu(null);
    setConfirmingArchiveThreadId(thread.id);
  }, []);

  const clearArchiveConfirmation = useCallback((thread: Thread) => {
    setConfirmingArchiveThreadId((current) => current === thread.id ? null : current);
  }, []);

  /*
   * Row actions clear whichever row holds the pending confirmation, not just
   * their own: with keyboard focus the pointer never leaves the confirming
   * row, so a per-row clear would leave its "Confirm" button stranded (and
   * its row click swallowed by the confirmation guard).
   */
  const clearAnyArchiveConfirmation = useCallback(() => {
    setConfirmingArchiveThreadId(null);
  }, []);

  const updateCollapsedGroupKeys = useCallback((updater: (current: ReadonlySet<string>) => Set<string>) => {
    const next = updater(effectiveCollapsedGroupKeys);
    if (onCollapsedGroupKeysChange) {
      onCollapsedGroupKeysChange([...next]);
      return;
    }
    setInternalCollapsedGroupKeys(next);
  }, [effectiveCollapsedGroupKeys, onCollapsedGroupKeysChange]);

  const toggleGroup = useCallback((key: string) => {
    updateCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [updateCollapsedGroupKeys]);

  const runSectionCollapseAction = useCallback(() => {
    setOpenSectionMenu(null);
    if (sectionCollapseAction === "collapse-all") {
      const expanded = projectGroupKeys.filter((key) => !effectiveCollapsedGroupKeys.has(key));
      updateCollapsedGroupKeys(() => new Set(projectGroupKeys));
      setPreviouslyExpandedGroupKeys(expanded);
      return;
    }
    if (sectionCollapseAction === "reopen-previous") {
      updateCollapsedGroupKeys((current) => {
        const next = new Set(current);
        const visible = new Set(projectGroupKeys);
        for (const key of previouslyExpandedGroupKeys) {
          if (visible.has(key)) next.delete(key);
        }
        return next;
      });
      setPreviouslyExpandedGroupKeys([]);
    }
  }, [
    effectiveCollapsedGroupKeys,
    previouslyExpandedGroupKeys,
    projectGroupKeys,
    sectionCollapseAction,
    updateCollapsedGroupKeys,
  ]);

  const chooseSortKey = useCallback((nextSortKey: SidebarSortKey) => {
    setOpenSectionMenu(null);
    onSortKeyChange?.(nextSortKey);
  }, [onSortKeyChange]);

  const chooseOrganizeMode = useCallback((nextOrganizeMode: SidebarOrganizeMode) => {
    setOpenSectionMenu(null);
    if (onOrganizeModeChange) {
      onOrganizeModeChange(nextOrganizeMode);
      return;
    }
    setInternalOrganizeMode(nextOrganizeMode);
  }, [onOrganizeModeChange]);

  const toggleSectionMenu = useCallback((menu: SidebarProjectSectionMenu | null) => {
    setOpenThreadMenu(null);
    setOpenSectionMenu(menu);
  }, []);

  const dismissUsageAlert = useCallback(() => {
    if (!usageAlertKey) return;
    setDismissedUsageAlertKeys((current) => new Set(current).add(usageAlertKey));
  }, [usageAlertKey]);

  return {
    chatsThreads,
    closeThreadMenu,
    openContextMenu,
    requestArchiveConfirmation,
    clearArchiveConfirmation,
    clearAnyArchiveConfirmation,
    chooseOrganizeMode,
    chooseSortKey,
    confirmingArchiveThreadId,
    dismissUsageAlert,
    dismissedUsageAlertKeys,
    effectiveCollapsedGroupKeys,
    effectiveOrganizeMode,
    openSectionMenu,
    openThreadMenu,
    pinnedThreads,
    projectGroups,
    runSectionCollapseAction,
    sectionActionsRef,
    sectionCollapseAction,
    threadMenuRef,
    toggleGroup,
    toggleSectionMenu,
    closeSectionMenu,
  };
}
