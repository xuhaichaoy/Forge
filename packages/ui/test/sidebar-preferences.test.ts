import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY,
  SIDEBAR_ORGANIZE_MODE_STORAGE_KEY,
  SIDEBAR_SECTION_ORDER_STORAGE_KEY,
  SIDEBAR_SORT_KEY_STORAGE_KEY,
  SIDEBAR_WIDTH_DEFAULT_PX,
  SIDEBAR_WIDTH_MAX_PX,
  SIDEBAR_WIDTH_MIN_PX,
  SIDEBAR_WIDTH_STORAGE_KEY,
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
  migratesHiCodexLegacyCollapsedGroupsKey();
  desktopCollapsedSectionsKeyWinsOverHiCodexLegacy();
  clampsStoredSidebarWidth();
  savingDropsHiCodexLegacyCollapsedGroupsKey();
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

  removeItem(key: string): void {
    this.items.delete(key);
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
  assertEqual(preferences.widthPx, SIDEBAR_WIDTH_DEFAULT_PX, "default sidebar width");
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
  storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "320");

  const preferences = loadSidebarPreferences(storage);
  assertEqual(preferences.organizeMode, "current_workspace", "organize mode should load from Desktop key");
  assertEqual(preferences.sortKey, "created_at", "sort key should load from Desktop key");
  assertEqual(
    sidebarCollapsedGroupKeys(preferences.collapsedGroups).sort().join(","),
    "/work/closed,current:/work/app",
    "collapsed groups should keep only true values",
  );
  assertEqual(preferences.sectionOrder.join(","), "threads,projects", "section order should dedupe stored ids");
  assertEqual(preferences.widthPx, 320, "sidebar width should load from HiCodex width key");
}

function savesExactDesktopPreferenceKeys(): void {
  const storage = new MemoryStorage();
  saveSidebarPreferences(storage, {
    organizeMode: "recent",
    sortKey: "created_at",
    collapsedGroups: sidebarCollapsedGroupsFromKeys(["recent", "local"]),
    sectionOrder: ["threads", "projects", "threads"],
    widthPx: 360,
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
  assertEqual(storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY), "360", "sidebar width storage key");
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
  assertEqual(preferences.widthPx, SIDEBAR_WIDTH_DEFAULT_PX, "legacy aggregate should not override default sidebar width");
}

function migratesHiCodexLegacyCollapsedGroupsKey(): void {
  // Older HiCodex builds wrote collapsed-section state under the (non-Desktop)
  // key `sidebar-collapsed-groups`. When that legacy slot is the only source,
  // load should still surface the state under the Desktop-aligned key.
  const storage = new MemoryStorage();
  storage.setItem(
    "sidebar-collapsed-groups",
    JSON.stringify({ "legacy:/work/app": true, "legacy:/work/closed": true }),
  );

  const preferences = loadSidebarPreferences(storage);
  assertEqual(
    sidebarCollapsedGroupKeys(preferences.collapsedGroups).sort().join(","),
    "legacy:/work/app,legacy:/work/closed",
    "HiCodex legacy collapsed-groups key should migrate when Desktop key is absent",
  );
}

function clampsStoredSidebarWidth(): void {
  const tooSmall = new MemoryStorage();
  tooSmall.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_WIDTH_MIN_PX - 100));
  assertEqual(loadSidebarPreferences(tooSmall).widthPx, SIDEBAR_WIDTH_MIN_PX, "stored width should clamp to min");

  const tooLarge = new MemoryStorage();
  tooLarge.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_WIDTH_MAX_PX + 100));
  assertEqual(loadSidebarPreferences(tooLarge).widthPx, SIDEBAR_WIDTH_MAX_PX, "stored width should clamp to max");
}

function desktopCollapsedSectionsKeyWinsOverHiCodexLegacy(): void {
  // When both keys exist, the Desktop-aligned `sidebar-collapsed-sections-v1`
  // must win and the HiCodex legacy slot is ignored. This protects users who
  // already adopted the Desktop key from being reverted by stale legacy data.
  const storage = new MemoryStorage();
  storage.setItem(
    "sidebar-collapsed-groups",
    JSON.stringify({ "legacy:/should-not-load": true }),
  );
  storage.setItem(
    SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY,
    JSON.stringify({ "desktop:/wins": true }),
  );

  const preferences = loadSidebarPreferences(storage);
  assertEqual(
    sidebarCollapsedGroupKeys(preferences.collapsedGroups).sort().join(","),
    "desktop:/wins",
    "Desktop sidebar-collapsed-sections-v1 must take precedence over HiCodex legacy key",
  );
}

function savingDropsHiCodexLegacyCollapsedGroupsKey(): void {
  // After save, the migrated state lives under the Desktop key and the legacy
  // slot is removed so the same value is not read back twice on next load.
  const storage = new MemoryStorage();
  storage.setItem(
    "sidebar-collapsed-groups",
    JSON.stringify({ "legacy:/migrated": true }),
  );

  saveSidebarPreferences(storage, {
    organizeMode: "project",
    sortKey: "updated_at",
    collapsedGroups: sidebarCollapsedGroupsFromKeys(["legacy:/migrated"]),
    sectionOrder: ["projects"],
    widthPx: SIDEBAR_WIDTH_MIN_PX,
  });

  assertEqual(
    storage.getItem(SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY),
    JSON.stringify({ "legacy:/migrated": true }),
    "saved state should land on the Desktop key",
  );
  assertEqual(
    storage.getItem("sidebar-collapsed-groups"),
    null,
    "HiCodex legacy collapsed-groups key should be removed after save",
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
    widthPx: SIDEBAR_WIDTH_MIN_PX,
  });
  assert(true, "throwing storage save should be swallowed");
}
