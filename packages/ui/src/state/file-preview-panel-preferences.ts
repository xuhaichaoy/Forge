import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";
import { setDesktopAppSettingValue } from "../lib/app-settings";

/*
 * codex: app-shell-*.js — AppShell RightPanel sizing constants:
 *   - min width 320 px (`if (e3 < x(320)) close`)
 *   - default width 600 px (`defaultWidth: r2 = 600`)
 */
export const FILE_PREVIEW_PANEL_MIN_WIDTH_PX = 320;
export const FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX = 600;
export const FILE_PREVIEW_PANEL_MAX_WIDTH_RATIO = 0.85;

export const LEGACY_FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY = "hicodex.filePreviewPanel.widthPx";
export const LEGACY_FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY = "hicodex.filePreviewPanel.fullWidth";
export const FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.filePreviewPanelWidth;
export const FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth;

export interface FilePreviewPanelPreferenceStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function filePreviewPanelPreferenceStorage(): FilePreviewPanelPreferenceStorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function clampFilePreviewPanelWidth(value: number, maxPx: number): number {
  if (!Number.isFinite(value)) return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  const upper = Math.max(FILE_PREVIEW_PANEL_MIN_WIDTH_PX, maxPx);
  if (value < FILE_PREVIEW_PANEL_MIN_WIDTH_PX) return FILE_PREVIEW_PANEL_MIN_WIDTH_PX;
  if (value > upper) return upper;
  return value;
}

export function loadFilePreviewPanelWidth(
  storage: FilePreviewPanelPreferenceStorageLike | null | undefined,
): number {
  const raw = readMigratedStorageValue(
    storage,
    FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    [LEGACY_FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY],
  );
  if (!raw) return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < FILE_PREVIEW_PANEL_MIN_WIDTH_PX) {
    return FILE_PREVIEW_PANEL_DEFAULT_WIDTH_PX;
  }
  return value;
}

export function loadFilePreviewPanelFullWidth(
  storage: FilePreviewPanelPreferenceStorageLike | null | undefined,
): boolean {
  return readMigratedStorageValue(
    storage,
    FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY,
    [LEGACY_FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY],
  ) === "1";
}

export function saveFilePreviewPanelWidth(
  storage: FilePreviewPanelPreferenceStorageLike | null | undefined,
  value: number,
): void {
  if (!storage) return;
  try {
    setDesktopAppSettingValue(storage, FILE_PREVIEW_PANEL_WIDTH_STORAGE_KEY, String(Math.round(value)));
  } catch {
    // Best-effort local preference.
  }
}

export function saveFilePreviewPanelFullWidth(
  storage: FilePreviewPanelPreferenceStorageLike | null | undefined,
  value: boolean,
): void {
  if (!storage) return;
  try {
    /*
     * "Off" must be an explicit "0": the migrated read falls back to the
     * legacy key whenever the shared key is absent, so merely removing the
     * shared key lets a legacy "1" resurrect full-width on the next launch.
     * Dropping the legacy key completes the migration for both states.
     */
    setDesktopAppSettingValue(storage, FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY, value ? "1" : "0");
    storage.removeItem?.(LEGACY_FILE_PREVIEW_PANEL_FULL_WIDTH_STORAGE_KEY);
  } catch {
    // Best-effort local preference.
  }
}
