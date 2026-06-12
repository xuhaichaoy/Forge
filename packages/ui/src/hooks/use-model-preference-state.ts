import { useCallback, useState } from "react";
import { removeDesktopAppSettingValue, setDesktopAppSettingValue } from "../lib/app-settings";
import {
  LEGACY_SELECTED_MODEL_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
  migrateSubscriptionModelSelection,
} from "../model/model-settings";
import {
  HICODEX_DESKTOP_CONFIG_KEYS,
  readMigratedStorageValue,
} from "../state/hicodex-desktop-namespace";

const LEGACY_REASONING_EFFORT_OVERRIDE_STORAGE_KEY = "hicodex.reasoningEffortOverride";

export function useModelPreferenceState() {
  const [selectedModelKey, setSelectedModelKeyState] = useState<string | null>(() => {
    const storage = modelPreferenceStorage();
    const stored = readMigratedStorageValue(storage, SELECTED_MODEL_STORAGE_KEY, [LEGACY_SELECTED_MODEL_STORAGE_KEY]);
    const migrated = migrateSubscriptionModelSelection(stored);
    if (migrated !== stored) {
      try {
        if (migrated) setDesktopAppSettingValue(storage, SELECTED_MODEL_STORAGE_KEY, migrated);
        else removeDesktopAppSettingValue(storage, SELECTED_MODEL_STORAGE_KEY);
      } catch {
        // Selection still works in memory when storage is unavailable.
      }
    }
    return migrated;
  });
  const setSelectedModelKey = useCallback((key: string | null) => {
    const nextKey = migrateSubscriptionModelSelection(key);
    setSelectedModelKeyState(nextKey);
    try {
      const storage = modelPreferenceStorage();
      if (nextKey) {
        setDesktopAppSettingValue(storage, SELECTED_MODEL_STORAGE_KEY, nextKey);
      } else {
        removeDesktopAppSettingValue(storage, SELECTED_MODEL_STORAGE_KEY);
        storage?.removeItem(LEGACY_SELECTED_MODEL_STORAGE_KEY);
      }
    } catch {
      // Selection still works in memory when storage is unavailable.
    }
  }, []);

  const [threadModelSelections, setThreadModelSelections] = useState<Record<string, string>>({});
  const setThreadModelSelection = useCallback((threadId: string, key: string | null) => {
    setThreadModelSelections((current) => {
      if (key) return { ...current, [threadId]: key };
      if (!(threadId in current)) return current;
      const { [threadId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const [reasoningEffortOverride, setReasoningEffortOverrideState] = useState<string | null>(() =>
    readMigratedStorageValue(
      modelPreferenceStorage(),
      HICODEX_DESKTOP_CONFIG_KEYS.reasoningEffortOverride,
      [LEGACY_REASONING_EFFORT_OVERRIDE_STORAGE_KEY],
    )
  );
  const setReasoningEffortOverride = useCallback((effort: string | null) => {
    setReasoningEffortOverrideState(effort);
    try {
      const storage = modelPreferenceStorage();
      if (effort) {
        setDesktopAppSettingValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.reasoningEffortOverride, effort);
      } else {
        removeDesktopAppSettingValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.reasoningEffortOverride);
      }
      storage?.removeItem(LEGACY_REASONING_EFFORT_OVERRIDE_STORAGE_KEY);
    } catch {
      // Selection still works in memory when storage is unavailable.
    }
  }, []);

  return {
    selectedModelKey,
    setSelectedModelKey,
    threadModelSelections,
    setThreadModelSelection,
    reasoningEffortOverride,
    setReasoningEffortOverride,
  };
}

function modelPreferenceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
