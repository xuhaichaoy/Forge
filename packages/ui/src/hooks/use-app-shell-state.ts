import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { AppNavigationTab } from "../components/app-navigation-rail";
import { browserStorage } from "../state/app-shell-helpers";
import { loadActiveAppTab, saveActiveAppTab } from "../state/app-navigation-preferences";
import {
  loadRightRailPinned,
  rightRailPreferenceStorage,
  saveRightRailPinned,
} from "../state/right-rail";

export interface AppShellState {
  activeAppTab: AppNavigationTab;
  activeRemoteTaskId: string | null;
  sidebarOpen: boolean;
  rightRailPinned: boolean;
  rightRailPopoverOpen: boolean;
  composerStatusPanelOpen: boolean;
  setActiveRemoteTaskId: Dispatch<SetStateAction<string | null>>;
  setRightRailPopoverOpen: Dispatch<SetStateAction<boolean>>;
  setComposerStatusPanelOpen: Dispatch<SetStateAction<boolean>>;
  changeActiveAppTab: (tab: AppNavigationTab) => void;
  openWorkbenchTab: () => void;
  toggleSidebar: () => void;
  setRightRailPinned: (isPinned: boolean) => void;
}

export function useAppShellState(): AppShellState {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeAppTab, setActiveAppTabState] = useState<AppNavigationTab>(() => loadActiveAppTab(browserStorage()));
  const [activeRemoteTaskId, setActiveRemoteTaskId] = useState<string | null>(null);
  const [rightRailPinned, setRightRailPinnedState] = useState(() => (
    loadRightRailPinned(rightRailPreferenceStorage())
  ));
  const [rightRailPopoverOpen, setRightRailPopoverOpen] = useState(false);
  const [composerStatusPanelOpen, setComposerStatusPanelOpen] = useState(false);

  const changeActiveAppTab = useCallback((tab: AppNavigationTab) => {
    setActiveAppTabState(tab);
    saveActiveAppTab(browserStorage(), tab);
  }, []);

  const openWorkbenchTab = useCallback(() => {
    changeActiveAppTab("workbench");
  }, [changeActiveAppTab]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => !current);
  }, []);

  const setRightRailPinned = useCallback((isPinned: boolean) => {
    setRightRailPinnedState(isPinned);
    saveRightRailPinned(rightRailPreferenceStorage(), isPinned);
  }, []);

  return {
    activeAppTab,
    activeRemoteTaskId,
    sidebarOpen,
    rightRailPinned,
    rightRailPopoverOpen,
    composerStatusPanelOpen,
    setActiveRemoteTaskId,
    setRightRailPopoverOpen,
    setComposerStatusPanelOpen,
    changeActiveAppTab,
    openWorkbenchTab,
    toggleSidebar,
    setRightRailPinned,
  };
}
