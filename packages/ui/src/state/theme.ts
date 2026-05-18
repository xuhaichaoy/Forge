import type { BrowserStorageLike } from "./image-generation-tool";

export const HICODEX_THEME_STORAGE_KEY = "hicodex:appearance-theme";

export const UI_THEME_MODES = ["system", "light", "dark"] as const;
export type UiThemeMode = (typeof UI_THEME_MODES)[number];
export type ResolvedUiTheme = Exclude<UiThemeMode, "system">;

export interface UiThemeSnapshot {
  mode: UiThemeMode;
  resolved: ResolvedUiTheme;
}

export function isUiThemeMode(value: unknown): value is UiThemeMode {
  return typeof value === "string" && UI_THEME_MODES.includes(value as UiThemeMode);
}

export function normalizeUiThemeMode(value: unknown, fallback: UiThemeMode = "system"): UiThemeMode {
  return isUiThemeMode(value) ? value : fallback;
}

export function loadUiThemeMode(storage: BrowserStorageLike | null): UiThemeMode {
  if (!storage) return "system";
  try {
    return normalizeUiThemeMode(storage.getItem(HICODEX_THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function saveUiThemeMode(storage: BrowserStorageLike | null, mode: UiThemeMode): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_THEME_STORAGE_KEY, mode);
  } catch {
    // Preference still applies for this session when storage is unavailable.
  }
}

export function resolveUiThemeMode(
  mode: UiThemeMode,
  systemTheme: ResolvedUiTheme | null | undefined,
): ResolvedUiTheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemTheme === "dark" ? "dark" : "light";
}

export function nextToggleThemeMode(resolved: ResolvedUiTheme): UiThemeMode {
  return resolved === "dark" ? "light" : "dark";
}

export function themeModeLabel(mode: UiThemeMode): string {
  switch (mode) {
    case "dark":
      return "Dark";
    case "light":
      return "Light";
    default:
      return "System";
  }
}

export function themeModeDescription(mode: UiThemeMode, resolved: ResolvedUiTheme): string {
  switch (mode) {
    case "dark":
      return "Use the dark Codex surface.";
    case "light":
      return "Use the light Codex surface.";
    default:
      return `Follow the operating system appearance. Currently ${resolved}.`;
  }
}
