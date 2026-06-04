import { createContext, useContext, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";

import type { CommandPanelState } from "../state/command-panel";
import type { SettingsPanelId } from "../state/composer-workflow";
import type { HooksSettingsFocus } from "../state/hooks-review";
import { type AppNavigationTab } from "./app-navigation-rail";

/*
 * App-level navigation/routing switches that decide which view renders and that
 * the settings + command palettes toggle. Owned by HiCodexApp (the body still
 * holds the useState slots) and forwarded here so any subtree can read them via
 * useNavigation() instead of receiving them as drilled props.
 *
 * The value shape stays inline (rather than in state/) because it references a
 * component-defined type (AppNavigationTab); keeping it here avoids pulling
 * components/** into the tsconfig.test.json graph, mirroring how
 * components/i18n-provider.tsx co-locates HiCodexIntlContextValue.
 *
 * NOTE: setActiveSettingsPanel / setCommandPanel are mutually exclusive by
 * convention (opening one clears the other; see loadSettingsPanel + the
 * thread-find contract). That ordering lives in the callbacks the body forwards,
 * so consumers get the exact same semantics they had as props.
 */
export interface NavigationContextValue {
  activeAppTab: AppNavigationTab;
  setActiveAppTab: Dispatch<SetStateAction<AppNavigationTab>>;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  toggleSidebar: () => void;
  activeRemoteTaskId: string | null;
  setActiveRemoteTaskId: Dispatch<SetStateAction<string | null>>;
  activeSettingsPanel: SettingsPanelId | null;
  setActiveSettingsPanel: Dispatch<SetStateAction<SettingsPanelId | null>>;
  commandPanel: CommandPanelState | null;
  setCommandPanel: Dispatch<SetStateAction<CommandPanelState | null>>;
  loadSettingsPanel: (
    panel: SettingsPanelId,
    options?: { forceReload?: boolean; hooksFocus?: HooksSettingsFocus | null },
  ) => Promise<void>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
  activeAppTab,
  setActiveAppTab,
  sidebarOpen,
  setSidebarOpen,
  toggleSidebar,
  activeRemoteTaskId,
  setActiveRemoteTaskId,
  activeSettingsPanel,
  setActiveSettingsPanel,
  commandPanel,
  setCommandPanel,
  loadSettingsPanel,
}: { children: ReactNode } & NavigationContextValue) {
  const value = useMemo<NavigationContextValue>(
    () => ({
      activeAppTab,
      setActiveAppTab,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      activeRemoteTaskId,
      setActiveRemoteTaskId,
      activeSettingsPanel,
      setActiveSettingsPanel,
      commandPanel,
      setCommandPanel,
      loadSettingsPanel,
    }),
    [
      activeAppTab,
      setActiveAppTab,
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      activeRemoteTaskId,
      setActiveRemoteTaskId,
      activeSettingsPanel,
      setActiveSettingsPanel,
      commandPanel,
      setCommandPanel,
      loadSettingsPanel,
    ],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (value === null) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return value;
}
