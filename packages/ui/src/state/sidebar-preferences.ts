import {
  DEFAULT_SIDEBAR_ORGANIZE_MODE,
  DEFAULT_SIDEBAR_SORT_KEY,
  type SidebarOrganizeMode,
  type SidebarSortKey,
} from "./sidebar-projection";

/*
 * Storage keys mirror Codex Desktop's `sidebar-*` localStorage namespace.
 * Verified literally against
 *   sidebar-signals-*.js
 *   sidebar-project-group-signals-*.js
 *   sidebar-project-groups-*.js
 */
export const SIDEBAR_ORGANIZE_MODE_STORAGE_KEY = "sidebar-organize-mode-v1";
export const SIDEBAR_SORT_KEY_STORAGE_KEY = "thread-sort-key";
export const SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY = "sidebar-collapsed-sections-v1";
export const SIDEBAR_SECTION_ORDER_STORAGE_KEY = "sidebar-section-order-v1";
export const SIDEBAR_WIDTH_STORAGE_KEY = "hicodex:sidebar-width-v1";
export const SIDEBAR_WIDTH_MIN_PX = 260;
export const SIDEBAR_WIDTH_MAX_PX = 420;
export const SIDEBAR_WIDTH_DEFAULT_PX = SIDEBAR_WIDTH_MIN_PX;

const LEGACY_SIDEBAR_PREFERENCES_STORAGE_KEY = "hicodex:sidebar-preferences";
/*
 * Earlier HiCodex builds wrote collapsed-section state under
 * `sidebar-collapsed-groups`, which never matched any Codex Desktop key.
 * Keep the legacy name only long enough to migrate existing local state
 * into the Desktop-aligned `sidebar-collapsed-sections-v1` slot on the
 * next load/save cycle.
 */
const LEGACY_HICODEX_COLLAPSED_GROUPS_STORAGE_KEY = "sidebar-collapsed-groups";
const DEFAULT_SIDEBAR_SECTION_ORDER = ["projects"];

export interface SidebarPreferenceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type SidebarCollapsedGroups = Record<string, true>;

export interface SidebarPreferences {
  organizeMode: SidebarOrganizeMode;
  sortKey: SidebarSortKey;
  collapsedGroups: SidebarCollapsedGroups;
  sectionOrder: string[];
  widthPx: number;
}

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  organizeMode: DEFAULT_SIDEBAR_ORGANIZE_MODE,
  sortKey: DEFAULT_SIDEBAR_SORT_KEY,
  collapsedGroups: {},
  sectionOrder: DEFAULT_SIDEBAR_SECTION_ORDER,
  widthPx: SIDEBAR_WIDTH_DEFAULT_PX,
};

export function sidebarPreferenceStorage(): SidebarPreferenceStorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSidebarPreferences(
  storage: SidebarPreferenceStorageLike | null | undefined,
): SidebarPreferences {
  if (!storage) return { ...DEFAULT_SIDEBAR_PREFERENCES, collapsedGroups: {}, sectionOrder: [...DEFAULT_SIDEBAR_SECTION_ORDER] };
  const legacy = legacySidebarPreferences(storage);
  const next: Partial<SidebarPreferences> = { ...legacy };

  const organizeMode = parseSidebarOrganizeMode(readStoredText(storage, SIDEBAR_ORGANIZE_MODE_STORAGE_KEY));
  if (organizeMode) next.organizeMode = organizeMode;

  const sortKey = parseSidebarSortKey(readStoredText(storage, SIDEBAR_SORT_KEY_STORAGE_KEY));
  if (sortKey) next.sortKey = sortKey;

  const collapsedGroups = readStoredJson(storage, SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY);
  if (collapsedGroups !== undefined) {
    next.collapsedGroups = normalizeSidebarCollapsedGroups(collapsedGroups);
  } else {
    const legacyCollapsedGroups = readStoredJson(storage, LEGACY_HICODEX_COLLAPSED_GROUPS_STORAGE_KEY);
    if (legacyCollapsedGroups !== undefined) {
      next.collapsedGroups = normalizeSidebarCollapsedGroups(legacyCollapsedGroups);
    }
  }

  const sectionOrder = readStoredJson(storage, SIDEBAR_SECTION_ORDER_STORAGE_KEY);
  if (sectionOrder !== undefined) next.sectionOrder = normalizeSidebarSectionOrder(sectionOrder);

  const widthPx = parseSidebarWidthPx(readStoredText(storage, SIDEBAR_WIDTH_STORAGE_KEY));
  if (widthPx != null) next.widthPx = widthPx;

  return normalizeSidebarPreferences(next);
}

export function saveSidebarPreferences(
  storage: SidebarPreferenceStorageLike | null | undefined,
  preferences: SidebarPreferences,
): void {
  if (!storage) return;
  const normalized = normalizeSidebarPreferences(preferences);
  safeSetItem(storage, SIDEBAR_ORGANIZE_MODE_STORAGE_KEY, normalized.organizeMode);
  safeSetItem(storage, SIDEBAR_SORT_KEY_STORAGE_KEY, normalized.sortKey);
  safeSetItem(storage, SIDEBAR_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(normalized.collapsedGroups));
  safeSetItem(storage, SIDEBAR_SECTION_ORDER_STORAGE_KEY, JSON.stringify(normalized.sectionOrder));
  safeSetItem(storage, SIDEBAR_WIDTH_STORAGE_KEY, String(normalized.widthPx));
  safeRemoveItem(storage, LEGACY_HICODEX_COLLAPSED_GROUPS_STORAGE_KEY);
}

export function normalizeSidebarPreferences(
  preferences: Partial<SidebarPreferences>,
): SidebarPreferences {
  return {
    organizeMode: preferences.organizeMode && isSidebarOrganizeMode(preferences.organizeMode)
      ? preferences.organizeMode
      : DEFAULT_SIDEBAR_ORGANIZE_MODE,
    sortKey: preferences.sortKey && isSidebarSortKey(preferences.sortKey)
      ? preferences.sortKey
      : DEFAULT_SIDEBAR_SORT_KEY,
    collapsedGroups: normalizeSidebarCollapsedGroups(preferences.collapsedGroups),
    sectionOrder: normalizeSidebarSectionOrder(preferences.sectionOrder),
    widthPx: normalizeSidebarWidthPx(preferences.widthPx),
  };
}

export function normalizeSidebarWidthPx(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return SIDEBAR_WIDTH_DEFAULT_PX;
  return Math.min(SIDEBAR_WIDTH_MAX_PX, Math.max(SIDEBAR_WIDTH_MIN_PX, Math.round(numeric)));
}

export function sidebarCollapsedGroupKeys(collapsedGroups: SidebarCollapsedGroups): string[] {
  return Object.keys(collapsedGroups).filter((key) => collapsedGroups[key] === true);
}

export function sidebarCollapsedGroupsFromKeys(keys: Iterable<string>): SidebarCollapsedGroups {
  const collapsedGroups: SidebarCollapsedGroups = {};
  for (const key of keys) {
    if (key) collapsedGroups[key] = true;
  }
  return collapsedGroups;
}

function legacySidebarPreferences(
  storage: SidebarPreferenceStorageLike,
): Partial<SidebarPreferences> {
  const value = readStoredJson(storage, LEGACY_SIDEBAR_PREFERENCES_STORAGE_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    organizeMode: parseSidebarOrganizeMode(record.organizeMode) ?? undefined,
    sortKey: parseSidebarSortKey(record.sortKey) ?? undefined,
    collapsedGroups: legacyCollapsedGroups(record),
    sectionOrder: normalizeSidebarSectionOrder(record.sectionOrder),
  };
}

function legacyCollapsedGroups(record: Record<string, unknown>): SidebarCollapsedGroups {
  if (record.collapsedGroups != null) return normalizeSidebarCollapsedGroups(record.collapsedGroups);
  if (Array.isArray(record.collapsedGroupKeys)) {
    return sidebarCollapsedGroupsFromKeys(record.collapsedGroupKeys.filter((key): key is string => typeof key === "string"));
  }
  return {};
}

function normalizeSidebarCollapsedGroups(value: unknown): SidebarCollapsedGroups {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const collapsedGroups: SidebarCollapsedGroups = {};
  for (const [key, collapsed] of Object.entries(value)) {
    if (collapsed === true) collapsedGroups[key] = true;
  }
  return collapsedGroups;
}

function normalizeSidebarSectionOrder(value: unknown): string[] {
  const source = Array.isArray(value) ? value : DEFAULT_SIDEBAR_SECTION_ORDER;
  const seen = new Set<string>();
  const sectionOrder: string[] = [];
  for (const item of source) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    sectionOrder.push(id);
  }
  return sectionOrder.length > 0 ? sectionOrder : [...DEFAULT_SIDEBAR_SECTION_ORDER];
}

function readStoredText(
  storage: SidebarPreferenceStorageLike,
  key: string,
): string | null {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return null;
    const parsed = parseMaybeJson(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return null;
  }
}

function readStoredJson(
  storage: SidebarPreferenceStorageLike,
  key: string,
): unknown {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    return parseMaybeJson(raw);
  } catch {
    return undefined;
  }
}

function parseMaybeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function safeSetItem(storage: SidebarPreferenceStorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Sidebar preferences remain in memory when browser storage is unavailable.
  }
}

function safeRemoveItem(storage: SidebarPreferenceStorageLike, key: string): void {
  if (typeof storage.removeItem !== "function") return;
  try {
    storage.removeItem(key);
  } catch {
    // Same tolerance as safeSetItem: storage failures do not break preference flow.
  }
}

function parseSidebarSortKey(value: unknown): SidebarSortKey | null {
  return isSidebarSortKey(value) ? value : null;
}

function parseSidebarOrganizeMode(value: unknown): SidebarOrganizeMode | null {
  return isSidebarOrganizeMode(value) ? value : null;
}

function parseSidebarWidthPx(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? normalizeSidebarWidthPx(numeric) : null;
}

function isSidebarSortKey(value: unknown): value is SidebarSortKey {
  return value === "updated_at" || value === "created_at";
}

function isSidebarOrganizeMode(value: unknown): value is SidebarOrganizeMode {
  return value === "project" || value === "recent" || value === "current_workspace";
}
