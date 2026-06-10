export const HICODEX_DESKTOP_CONFIG_ROOT = "desktop.hicodex";

export const HICODEX_DESKTOP_CONFIG_KEYS = {
  appearanceTheme: desktopHiCodexKey("appearanceTheme"),
  // CODEX-REF: keyboard-shortcuts-settings-*.js — Codex Desktop persists
  // user keymap overrides via the host bridge `set-codex-command-keybinding`.
  // HiCodex ships a webview-only implementation: { [commandId]: accelerator | null }
  // saved under desktop.hicodex.keymap as JSON. `null` means "explicitly unbound";
  // a missing key falls back to the command descriptor's default keybinding.
  keymapOverrides: desktopHiCodexKey("keymap"),
  // CODEX-REF: settings.general.appearance.codeFontSize.row — Codex Desktop
  // persists code font size as a number 8-24 (appearance-settings-*.js
  // section 4). HiCodex namespaces it under desktop.hicodex.* for parity with
  // appearanceTheme.
  appearanceCodeFontSize: desktopHiCodexKey("appearance", "codeFontSize"),
  // CODEX-REF: settings.general.appearance.sansFontSize.row ("UI font size") —
  // Codex Desktop persists the whole-UI base font size; HiCodex stores it under
  // the same desktop.hicodex.* namespace and derives `--hc-ui-font-scale` from it.
  appearanceUiFontSize: desktopHiCodexKey("appearance", "sansFontSize"),
  // CODEX-REF: settings.general.appearance.reducedMotion.label — Codex Desktop
  // exposes a 3-way toggle (system / on / off). HiCodex stores the same triple.
  appearanceReducedMotion: desktopHiCodexKey("appearance", "reducedMotion"),
  activeAppTab: desktopHiCodexKey("app", "activeTab"),
  composerWorkMode: desktopHiCodexKey("composer", "workMode"),
  imageGeneration: desktopHiCodexKey("imageGeneration"),
  locale: desktopHiCodexKey("locale"),
  notificationPreferences: desktopHiCodexKey("notificationPreferences"),
  // CODEX-REF: composer-*.js setModelAndReasoningEffort — the picked effort
  // persists alongside selectedModelKey (HiCodex stores it as its own key).
  reasoningEffortOverride: desktopHiCodexKey("reasoningEffortOverride"),
  rightRailPinned: desktopHiCodexKey("rightRail", "isPinned"),
  selectedModelKey: desktopHiCodexKey("selectedModelKey"),
  // codex `k(!0)` full-access confirmation memory (composer permissions dropdown).
  skipFullAccessConfirm: desktopHiCodexKey("permissions", "skipFullAccessConfirm"),
  teamServiceAuth: desktopHiCodexKey("teamService", "auth"),
  yuxiConnection: desktopHiCodexKey("yuxi", "connection"),
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
