import type { AppNavigationTab } from "../components/app-navigation-rail";
import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";

const PERSISTABLE_APP_TABS = ["workbench", "knowledge", "ingest", "archive", "todo"] as const;

type PersistableAppNavigationTab = (typeof PERSISTABLE_APP_TABS)[number];

export function loadActiveAppTab(storage: BrowserStorageLike | null): AppNavigationTab {
  return normalizePersistableAppTab(readMigratedStorageValue(storage, HICODEX_DESKTOP_CONFIG_KEYS.activeAppTab))
    ?? "workbench";
}

export function saveActiveAppTab(
  storage: BrowserStorageLike | null,
  tab: AppNavigationTab,
): void {
  if (!storage) return;
  const normalized = normalizePersistableAppTab(tab);
  if (!normalized) return;
  try {
    storage.setItem(HICODEX_DESKTOP_CONFIG_KEYS.activeAppTab, normalized);
  } catch {
    // The in-memory tab change still applies when storage is unavailable.
  }
}

function normalizePersistableAppTab(value: unknown): PersistableAppNavigationTab | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PERSISTABLE_APP_TABS.includes(normalized as PersistableAppNavigationTab)
    ? (normalized as PersistableAppNavigationTab)
    : null;
}
