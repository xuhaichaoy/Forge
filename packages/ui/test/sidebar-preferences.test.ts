import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY,
  SIDEBAR_ORGANIZE_MODE_STORAGE_KEY,
  SIDEBAR_SECTION_ORDER_STORAGE_KEY,
  SIDEBAR_SORT_KEY_STORAGE_KEY,
  loadSidebarPreferences,
  saveSidebarPreferences,
  sidebarCollapsedGroupKeys,
  sidebarCollapsedGroupsFromKeys,
  type SidebarPreferenceStorageLike,
} from "../src/state/sidebar-preferences";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEqual = (actual: unknown, expected: unknown, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
};

export default function runSidebarPreferencesTests(): void {
  loadsDefaultsWithoutBrowserStorage();
  loadsExactDesktopPreferenceKeys();
  savesExactDesktopPreferenceKeys();
  migratesLegacyPreferencesWhileDesktopKeysWin();
  toleratesUnavailableStorage();
}

class MemoryStorage implements SidebarPreferenceStorageLike {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

class ThrowingStorage implements SidebarPreferenceStorageLike {
  getItem(): string | null {
    throw new Error("storage unavailable");
  }

  setItem(): void {
    throw new Error("storage unavailable");
  }
}

function loadsDefaultsWithoutBrowserStorage(): void {
  const preferences = loadSidebarPreferences(null);
  assertEqual(preferences.organizeMode, DEFAULT_SIDEBAR_PREFERENCES.organizeMode, "default organize mode");
  assertEqual(preferences.sortKey, DEFAULT_SIDEBAR_PREFERENCES.sortKey, "default sort key");
  assertEqual(sidebarCollapsedGroupKeys(preferences.collapsedGroups).length, 0, "default collapsed groups");
  assertEqual(preferences.sectionOrder.join(","), "projects", "default section order");
}

function loadsExactDesktopPreferenceKeys(): void {
  const storage = new MemoryStorage();
  storage.setItem(SIDEBAR_ORGANIZE_MODE_STORAGE_KEY, "current_workspace");
  storage.setItem(SIDEBAR_SORT_KEY_STORAGE_KEY, "created_at");
  storage.setItem(SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify({
    "current:/work/app": true,
    "/work/old": false,
    "/work/closed": true,
  }));
  storage.setItem(SIDEBAR_SECTION_ORDER_STORAGE_KEY, JSON.stringify(["threads", "projects", "threads"]));

  const preferences = loadSidebarPreferences(storage);
  assertEqual(preferences.organizeMode, "current_workspace", "organize mode should load from Desktop key");
  assertEqual(preferences.sortKey, "created_at", "sort key should load from Desktop key");
  assertEqual(
    sidebarCollapsedGroupKeys(preferences.collapsedGroups).sort().join(","),
    "/work/closed,current:/work/app",
    "collapsed groups should keep only true values",
  );
  assertEqual(preferences.sectionOrder.join(","), "threads,projects", "section order should dedupe stored ids");
}

function savesExactDesktopPreferenceKeys(): void {
  const storage = new MemoryStorage();
  saveSidebarPreferences(storage, {
    organizeMode: "recent",
    sortKey: "created_at",
    collapsedGroups: sidebarCollapsedGroupsFromKeys(["recent", "local"]),
    sectionOrder: ["threads", "projects", "threads"],
  });

  assertEqual(storage.getItem(SIDEBAR_ORGANIZE_MODE_STORAGE_KEY), "recent", "organize mode storage key");
  assertEqual(storage.getItem(SIDEBAR_SORT_KEY_STORAGE_KEY), "created_at", "sort storage key");
  assertEqual(
    storage.getItem(SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY),
    JSON.stringify({ recent: true, local: true }),
    "collapsed group storage key",
  );
  assertEqual(
    storage.getItem(SIDEBAR_SECTION_ORDER_STORAGE_KEY),
    JSON.stringify(["threads", "projects"]),
    "section order storage key",
  );
}

function migratesLegacyPreferencesWhileDesktopKeysWin(): void {
  const storage = new MemoryStorage();
  storage.setItem("hicodex:sidebar-preferences", JSON.stringify({
    organizeMode: "recent",
    sortKey: "created_at",
    collapsedGroupKeys: ["legacy-a", "legacy-b"],
    sectionOrder: ["projects"],
  }));
  storage.setItem(SIDEBAR_SORT_KEY_STORAGE_KEY, "updated_at");

  const preferences = loadSidebarPreferences(storage);
  assertEqual(preferences.organizeMode, "recent", "legacy organize mode should migrate");
  assertEqual(preferences.sortKey, "updated_at", "Desktop sort key should override legacy value");
  assertEqual(
    sidebarCollapsedGroupKeys(preferences.collapsedGroups).sort().join(","),
    "legacy-a,legacy-b",
    "legacy collapsed group keys should migrate",
  );
}

function toleratesUnavailableStorage(): void {
  const preferences = loadSidebarPreferences(new ThrowingStorage());
  assertEqual(preferences.sortKey, "updated_at", "throwing storage load should fall back");
  saveSidebarPreferences(new ThrowingStorage(), {
    organizeMode: "project",
    sortKey: "updated_at",
    collapsedGroups: {},
    sectionOrder: ["projects"],
  });
  assert(true, "throwing storage save should be swallowed");
}
