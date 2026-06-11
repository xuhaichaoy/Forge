import { useCallback, useMemo, useState } from "react";
import {
  loadSidebarPreferences,
  normalizeSidebarPreferences,
  normalizeSidebarWidthPx,
  saveSidebarPreferences,
  sidebarCollapsedGroupKeys as sidebarCollapsedGroupKeysFromPreferences,
  sidebarCollapsedGroupsFromKeys,
  sidebarPreferenceStorage,
  type SidebarPreferences,
} from "../state/sidebar-preferences";
import type { SidebarOrganizeMode, SidebarSortKey } from "../state/sidebar-projection";

export interface SidebarPreferencesState {
  sidebarPreferences: SidebarPreferences;
  sidebarCollapsedGroupKeys: ReadonlySet<string>;
  setSidebarWidthPx: (widthPx: number) => void;
  setSidebarSortKey: (sortKey: SidebarSortKey) => void;
  setSidebarOrganizeMode: (organizeMode: SidebarOrganizeMode) => void;
  setSidebarCollapsedGroupKeys: (collapsedGroupKeys: string[]) => void;
}

export function useSidebarPreferences(): SidebarPreferencesState {
  const [sidebarPreferences, setSidebarPreferencesState] = useState<SidebarPreferences>(() => (
    loadSidebarPreferences(sidebarPreferenceStorage())
  ));
  const sidebarCollapsedGroupKeys = useMemo(() => (
    new Set(sidebarCollapsedGroupKeysFromPreferences(sidebarPreferences.collapsedGroups))
  ), [sidebarPreferences.collapsedGroups]);

  const setSidebarPreferences = useCallback((patch: Partial<SidebarPreferences>) => {
    setSidebarPreferencesState((current) => {
      const next = normalizeSidebarPreferences({ ...current, ...patch });
      saveSidebarPreferences(sidebarPreferenceStorage(), next);
      return next;
    });
  }, []);

  const setSidebarWidthPx = useCallback((widthPx: number) => {
    setSidebarPreferences({ widthPx: normalizeSidebarWidthPx(widthPx) });
  }, [setSidebarPreferences]);

  const setSidebarSortKey = useCallback((sortKey: SidebarSortKey) => {
    setSidebarPreferences({ sortKey });
  }, [setSidebarPreferences]);

  const setSidebarOrganizeMode = useCallback((organizeMode: SidebarOrganizeMode) => {
    setSidebarPreferences({ organizeMode });
  }, [setSidebarPreferences]);

  const setSidebarCollapsedGroupKeys = useCallback((collapsedGroupKeys: string[]) => {
    setSidebarPreferences({ collapsedGroups: sidebarCollapsedGroupsFromKeys(collapsedGroupKeys) });
  }, [setSidebarPreferences]);

  return {
    sidebarPreferences,
    sidebarCollapsedGroupKeys,
    setSidebarWidthPx,
    setSidebarSortKey,
    setSidebarOrganizeMode,
    setSidebarCollapsedGroupKeys,
  };
}
