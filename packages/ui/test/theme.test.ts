import {
  FORGE_THEME_STORAGE_KEY,
  loadUiThemeMode,
  nextToggleThemeMode,
  normalizeUiThemeMode,
  resolveUiThemeMode,
  saveUiThemeMode,
} from "../src/state/theme";

export default function runThemeTests(): void {
  normalizesAndResolvesThemeModes();
  persistsThemePreference();
}

function normalizesAndResolvesThemeModes(): void {
  assertEqual(normalizeUiThemeMode("dark"), "dark", "dark mode should normalize");
  assertEqual(normalizeUiThemeMode("sepia", "light"), "light", "invalid modes should fall back");
  assertEqual(resolveUiThemeMode("system", "dark"), "dark", "system mode should follow dark OS");
  assertEqual(resolveUiThemeMode("system", "light"), "light", "system mode should follow light OS");
  assertEqual(resolveUiThemeMode("dark", "light"), "dark", "explicit dark should ignore OS");
  assertEqual(nextToggleThemeMode("dark"), "light", "toggle from dark should target light");
}

function persistsThemePreference(): void {
  const storage = memoryStorage();
  assertEqual(loadUiThemeMode(storage), "system", "missing preference should default to system");
  saveUiThemeMode(storage, "dark");
  assertEqual(storage.values.get(FORGE_THEME_STORAGE_KEY), "dark", "theme mode should be persisted");
  assertEqual(loadUiThemeMode(storage), "dark", "theme mode should load from storage");
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
