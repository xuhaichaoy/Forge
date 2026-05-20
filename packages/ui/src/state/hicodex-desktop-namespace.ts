export const HICODEX_DESKTOP_CONFIG_ROOT = "desktop.hicodex";

export const HICODEX_DESKTOP_CONFIG_KEYS = {
  appearanceTheme: desktopHiCodexKey("appearanceTheme"),
  composerWorkMode: desktopHiCodexKey("composer", "workMode"),
  imageGeneration: desktopHiCodexKey("imageGeneration"),
  locale: desktopHiCodexKey("locale"),
  notificationPreferences: desktopHiCodexKey("notificationPreferences"),
  rightRailPinned: desktopHiCodexKey("rightRail", "isPinned"),
  selectedModelKey: desktopHiCodexKey("selectedModelKey"),
} as const;

export function desktopHiCodexKey(...segments: string[]): string {
  const normalized = segments
    .map((segment) => segment.trim().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  return [HICODEX_DESKTOP_CONFIG_ROOT, ...normalized].join(".");
}

export function readMigratedStorageValue(
  storage: { getItem(key: string): string | null } | null | undefined,
  key: string,
  legacyKeys: readonly string[] = [],
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    if (value !== null) return value;
  } catch {
    return null;
  }
  for (const legacyKey of legacyKeys) {
    try {
      const value = storage.getItem(legacyKey);
      if (value !== null) return value;
    } catch {
      return null;
    }
  }
  return null;
}
