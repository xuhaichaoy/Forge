import {
  FORGE_DESKTOP_CONFIG_KEYS,
  desktopForgeKey,
  readMigratedStorageValue,
} from "../src/state/forge-desktop-namespace";

export default function runForgeDesktopNamespaceTests(): void {
  assertEqual(
    desktopForgeKey("rightRail", "isPinned"),
    "desktop.hicodex.rightRail.isPinned",
    "Forge desktop config keys should live under the legacy desktop.hicodex namespace",
  );
  assertEqual(
    FORGE_DESKTOP_CONFIG_KEYS.imageGeneration,
    "desktop.hicodex.imageGeneration",
    "image settings should use the legacy desktop.hicodex namespace",
  );
  assertEqual(
    FORGE_DESKTOP_CONFIG_KEYS.composerWorkMode,
    "desktop.hicodex.composer.workMode",
    "composer work mode should use the legacy desktop.hicodex namespace",
  );
  assertEqual(
    FORGE_DESKTOP_CONFIG_KEYS.filePreviewPanelWidth,
    "desktop.hicodex.filePreviewPanel.widthPx",
    "file preview panel width should use the mirrored desktop namespace",
  );

  const storage = new MemoryStorage();
  storage.setItem("hicodex:legacy", "legacy-value");
  assertEqual(
    readMigratedStorageValue(storage, "desktop.hicodex.current", ["hicodex:legacy"]),
    "legacy-value",
    "storage reads should fall back to legacy keys during migration",
  );
  storage.setItem("desktop.hicodex.current", "current-value");
  assertEqual(
    readMigratedStorageValue(storage, "desktop.hicodex.current", ["hicodex:legacy"]),
    "current-value",
    "current desktop.hicodex value should win over legacy values",
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
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
