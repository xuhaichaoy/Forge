import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserStorage } from "../state/app-shell-helpers";
import {
  clampCodeFontSize,
  clampUiFontSize,
  loadUiAppearance,
  saveUiCodeFontSize,
  saveUiFontSize,
  saveUiReducedMotion,
  uiFontScale,
  type ReducedMotionMode,
  type UiAppearancePreferences,
} from "../state/appearance";
import {
  createI18nBundle,
  formatI18nMessage,
  loadHiCodexLocale,
  saveHiCodexLocale,
  type HiCodexLocale,
} from "../state/i18n";
import {
  loadKeymapOverrides,
  saveKeymapOverrides,
  setActiveKeymapOverrides,
  withKeymapOverride,
  withoutKeymapOverride,
  type KeymapOverrides,
} from "../state/keymap-overrides";
import {
  loadNotificationPreferences,
  mergeNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "../state/notification-preferences";
import {
  loadUiThemeMode,
  readSystemThemeVariant,
  resolveUiThemeMode,
  saveUiThemeMode,
  subscribeSystemThemeVariant,
  type ResolvedUiTheme,
  type UiThemeMode,
  type UiThemeSnapshot,
} from "../state/theme";

export type UiMessageFormatter = (
  descriptor: Parameters<typeof formatI18nMessage>[1],
  values?: Parameters<typeof formatI18nMessage>[2],
) => string;

export interface UiPreferencesState {
  uiLocale: HiCodexLocale;
  uiThemeSnapshot: UiThemeSnapshot;
  resolvedUiTheme: ResolvedUiTheme;
  uiAppearance: UiAppearancePreferences;
  keymapOverrides: KeymapOverrides;
  notificationPreferences: NotificationPreferences;
  formatUiMessage: UiMessageFormatter;
  setUiLocale: (locale: HiCodexLocale) => void;
  setUiThemeMode: (mode: UiThemeMode) => void;
  setUiCodeFontSize: (size: number) => void;
  setUiFontSize: (size: number) => void;
  setUiReducedMotion: (mode: ReducedMotionMode) => void;
  setUiKeyboardShortcut: (commandId: string, accelerator: string | null) => void;
  resetUiKeyboardShortcut: (commandId: string) => void;
  setNotificationPreferences: (patch: Partial<NotificationPreferences>) => NotificationPreferences;
}

export function useUiPreferences(): UiPreferencesState {
  const [uiLocale, setUiLocaleState] = useState<HiCodexLocale>(() => (
    loadHiCodexLocale(browserStorage(), typeof navigator === "undefined" ? null : navigator.language)
  ));
  const [uiThemeMode, setUiThemeModeState] = useState<UiThemeMode>(() => (
    loadUiThemeMode(browserStorage())
  ));
  // CODEX-REF: loadUiAppearance reads desktop.hicodex.appearance.codeFontSize
  // and desktop.hicodex.appearance.reducedMotion (see hicodex-desktop-namespace).
  const [uiAppearance, setUiAppearanceState] = useState<UiAppearancePreferences>(() => (
    loadUiAppearance(browserStorage())
  ));
  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js. Boot-loaded snapshot
   * is also pushed into the module-level singleton so accelerator resolvers in
   * command-registry.ts and commands.ts see overrides immediately, including
   * for commands registered during this render pass via useHotkey.
   */
  const [keymapOverrides, setKeymapOverridesState] = useState<KeymapOverrides>(() => {
    const initial = loadKeymapOverrides(browserStorage());
    setActiveKeymapOverrides(initial);
    return initial;
  });
  const [notificationPreferences, setNotificationPreferencesState] = useState<NotificationPreferences>(() => (
    loadNotificationPreferences(browserStorage())
  ));
  const notificationPreferencesRef = useRef(notificationPreferences);
  const [systemTheme, setSystemTheme] = useState<ResolvedUiTheme>(() => readSystemThemeVariant());
  const resolvedUiTheme = resolveUiThemeMode(uiThemeMode, systemTheme);
  const uiThemeSnapshot = useMemo(() => ({
    mode: uiThemeMode,
    resolved: resolvedUiTheme,
  }), [resolvedUiTheme, uiThemeMode]);

  const setUiThemeMode = useCallback((mode: UiThemeMode) => {
    setUiThemeModeState(mode);
    saveUiThemeMode(browserStorage(), mode);
  }, []);

  /*
   * CODEX-REF: settings.general.appearance.codeFontSize.row commit. Codex
   * Desktop persists onBlur; HiCodex commits each +/- click. clamp matches
   * the documented 8-24 px range from appearance-settings-*.js §4.
   */
  const setUiCodeFontSize = useCallback((size: number) => {
    const clamped = clampCodeFontSize(size);
    setUiAppearanceState((prev) => prev.codeFontSize === clamped ? prev : { ...prev, codeFontSize: clamped });
    saveUiCodeFontSize(browserStorage(), clamped);
  }, []);

  /*
   * CODEX-REF: settings.general.appearance.sansFontSize.row ("UI font size").
   * Codex sets `--vscode-font-size` and relies on its rem cascade; HiCodex's CSS
   * is hardcoded px, so the commit publishes `--hc-ui-font-scale` (see the apply
   * effect below) which every `font-size` calc multiplies by. clamp = 10-20.
   */
  const setUiFontSize = useCallback((size: number) => {
    const clamped = clampUiFontSize(size);
    setUiAppearanceState((prev) => prev.uiFontSize === clamped ? prev : { ...prev, uiFontSize: clamped });
    saveUiFontSize(browserStorage(), clamped);
  }, []);

  /*
   * CODEX-REF: settings.general.appearance.reducedMotion.label commit. Mode
   * string matches Codex option IDs system/on/off.
   */
  const setUiReducedMotion = useCallback((mode: ReducedMotionMode) => {
    setUiAppearanceState((prev) => prev.reducedMotion === mode ? prev : { ...prev, reducedMotion: mode });
    saveUiReducedMotion(browserStorage(), mode);
  }, []);

  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js set/replace mutation.
   * Persists override, updates React state for the panel to re-render, and
   * synchronously pushes the new snapshot into the module singleton so
   * useHotkey closures rebind without waiting for the next effect tick.
   */
  const setUiKeyboardShortcut = useCallback((commandId: string, accelerator: string | null) => {
    setKeymapOverridesState((prev) => {
      const next = withKeymapOverride(prev, commandId, accelerator);
      setActiveKeymapOverrides(next);
      saveKeymapOverrides(browserStorage(), next);
      return next;
    });
  }, []);

  /*
   * CODEX-REF: keyboard-shortcuts-settings-*.js reset mutation. Drops
   * the override so the descriptor default takes effect again.
   */
  const resetUiKeyboardShortcut = useCallback((commandId: string) => {
    setKeymapOverridesState((prev) => {
      const next = withoutKeymapOverride(prev, commandId);
      if (next === prev) return prev;
      setActiveKeymapOverrides(next);
      saveKeymapOverrides(browserStorage(), next);
      return next;
    });
  }, []);

  const setUiLocale = useCallback((locale: HiCodexLocale) => {
    setUiLocaleState(locale);
    saveHiCodexLocale(browserStorage(), locale);
  }, []);

  const setNotificationPreferences = useCallback((patch: Partial<NotificationPreferences>) => {
    const next = mergeNotificationPreferences(notificationPreferencesRef.current, patch);
    notificationPreferencesRef.current = next;
    setNotificationPreferencesState(next);
    saveNotificationPreferences(browserStorage(), next);
    return next;
  }, []);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  useEffect(() => subscribeSystemThemeVariant(setSystemTheme), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.lang = uiLocale;
    root.dataset.hcLocale = uiLocale;
    root.dataset.hcTheme = resolvedUiTheme;
    root.dataset.hcThemeMode = uiThemeMode;
    root.classList.toggle("dark", resolvedUiTheme === "dark");
    root.classList.toggle("electron-dark", resolvedUiTheme === "dark");
  }, [resolvedUiTheme, uiLocale, uiThemeMode]);

  /*
   * Locale-aware formatter for label projections computed above the
   * HiCodexIntlProvider. Callers can localize projection labels without using
   * hook-based intl context from the same render tree level.
   */
  const formatUiMessage = useMemo(() => {
    const bundle = createI18nBundle(uiLocale);
    return (
      descriptor: Parameters<typeof formatI18nMessage>[1],
      values?: Parameters<typeof formatI18nMessage>[2],
    ) => formatI18nMessage(bundle, descriptor, values);
  }, [uiLocale]);

  /*
   * CODEX-REF: Apply Code font size + Reduce motion to the DOM root.
   *
   *   - --codex-chat-code-font-size is the existing token defined in base.css
   *     :65; overriding it on `documentElement.style` lets every consumer of
   *     that variable update live without restart.
   *   - data-hc-reduce-motion="on" / "off" lets base.css forcibly enable or
   *     suppress transitions and animations regardless of the OS
   *     prefers-reduced-motion media query. "system" leaves the value unset so
   *     the media query alone decides.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--codex-chat-code-font-size", `${uiAppearance.codeFontSize}px`);
    root.style.setProperty("--hc-ui-font-scale", `${uiFontScale(uiAppearance.uiFontSize)}`);
    if (uiAppearance.reducedMotion === "system") {
      delete root.dataset.hcReduceMotion;
    } else {
      root.dataset.hcReduceMotion = uiAppearance.reducedMotion;
    }
  }, [uiAppearance.codeFontSize, uiAppearance.uiFontSize, uiAppearance.reducedMotion]);

  return {
    uiLocale,
    uiThemeSnapshot,
    resolvedUiTheme,
    uiAppearance,
    keymapOverrides,
    notificationPreferences,
    formatUiMessage,
    setUiLocale,
    setUiThemeMode,
    setUiCodeFontSize,
    setUiFontSize,
    setUiReducedMotion,
    setUiKeyboardShortcut,
    resetUiKeyboardShortcut,
    setNotificationPreferences,
  };
}
