// The stored value keeps the legacy "desktop.hicodex" namespace on purpose so
// existing user settings keep resolving after the Forge rebrand (deliberate
// legacy, see README storage-compatibility note). Only identifiers were renamed.
export const FORGE_DESKTOP_CONFIG_ROOT = "desktop.hicodex";

export const FORGE_DESKTOP_CONFIG_KEYS = {
  appearanceTheme: desktopForgeKey("appearanceTheme"),
  // CODEX-REF: keyboard-shortcuts-settings-*.js — Codex Desktop persists
  // user keymap overrides via the host bridge `set-codex-command-keybinding`.
  // Forge ships a webview-only implementation: { [commandId]: accelerator | null }
  // saved under desktop.hicodex.keymap as JSON. `null` means "explicitly unbound";
  // a missing key falls back to the command descriptor's default keybinding.
  keymapOverrides: desktopForgeKey("keymap"),
  // CODEX-REF: settings.general.appearance.codeFontSize.row — Codex Desktop
  // persists code font size as a number 8-24 (appearance-settings-*.js
  // section 4). Forge namespaces it under desktop.hicodex.* for parity with
  // appearanceTheme.
  appearanceCodeFontSize: desktopForgeKey("appearance", "codeFontSize"),
  // CODEX-REF: settings.general.appearance.sansFontSize.row ("UI font size") —
  // Codex Desktop persists the whole-UI base font size; Forge stores it under
  // the same desktop.hicodex.* namespace and derives `--hc-ui-font-scale` from it.
  appearanceUiFontSize: desktopForgeKey("appearance", "sansFontSize"),
  // CODEX-REF: settings.general.appearance.reducedMotion.label — Codex Desktop
  // exposes a 3-way toggle (system / on / off). Forge stores the same triple.
  appearanceReducedMotion: desktopForgeKey("appearance", "reducedMotion"),
  activeAppTab: desktopForgeKey("app", "activeTab"),
  composerWorkMode: desktopForgeKey("composer", "workMode"),
  filePreviewPanelFullWidth: desktopForgeKey("filePreviewPanel", "fullWidth"),
  filePreviewPanelWidth: desktopForgeKey("filePreviewPanel", "widthPx"),
  imageGeneration: desktopForgeKey("imageGeneration"),
  locale: desktopForgeKey("locale"),
  notificationPreferences: desktopForgeKey("notificationPreferences"),
  // CODEX-REF: composer-*.js setModelAndReasoningEffort — the picked effort
  // persists alongside selectedModelKey (Forge stores it as its own key).
  reasoningEffortOverride: desktopForgeKey("reasoningEffortOverride"),
  rightRailPinned: desktopForgeKey("rightRail", "isPinned"),
  selectedModelKey: desktopForgeKey("selectedModelKey"),
  // codex `k(!0)` full-access confirmation memory (composer permissions dropdown).
  skipFullAccessConfirm: desktopForgeKey("permissions", "skipFullAccessConfirm"),
  teamServiceAuth: desktopForgeKey("teamService", "auth"),
  yuxiConnection: desktopForgeKey("yuxi", "connection"),
} as const;

export function desktopForgeKey(...segments: string[]): string {
  const normalized = segments
    .map((segment) => segment.trim().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
  return [FORGE_DESKTOP_CONFIG_ROOT, ...normalized].join(".");
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
