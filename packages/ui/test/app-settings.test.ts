import {
  removeDesktopAppSettingValue,
  setDesktopAppSettingValue,
} from "../src/lib/app-settings";
import { FORGE_DESKTOP_CONFIG_KEYS } from "../src/state/forge-desktop-namespace";

export default function runAppSettingsTests(): void {
  writesDesktopSettingValues();
  removesDesktopSettingValues();
  removesWithFallbackWhenStorageCannotRemove();
}

function writesDesktopSettingValues(): void {
  const storage = new MemoryStorage();
  setDesktopAppSettingValue(storage, FORGE_DESKTOP_CONFIG_KEYS.activeAppTab, "knowledge");
  assertEqual(
    storage.getItem(FORGE_DESKTOP_CONFIG_KEYS.activeAppTab),
    "knowledge",
    "desktop setting helper should write the namespaced value",
  );
}

function removesDesktopSettingValues(): void {
  const storage = new MemoryStorage();
  storage.setItem(FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth, "1");
  removeDesktopAppSettingValue(storage, FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth);
  assertEqual(
    storage.getItem(FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth),
    null,
    "desktop setting helper should remove namespaced values when supported",
  );
}

function removesWithFallbackWhenStorageCannotRemove(): void {
  const values = new Map<string, string>();
  const storage = {
    setItem: (key: string, value: string) => values.set(key, value),
  };
  removeDesktopAppSettingValue(storage, FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth, "0");
  assertEqual(
    values.get(FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelFullWidth),
    "0",
    "desktop setting helper should preserve fallback write behavior when removeItem is unavailable",
  );
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
