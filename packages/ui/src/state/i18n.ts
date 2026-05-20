import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";

export const LEGACY_HICODEX_LOCALE_STORAGE_KEY = "hicodex:locale";
export const HICODEX_LOCALE_STORAGE_KEY = HICODEX_DESKTOP_CONFIG_KEYS.locale;
export const HICODEX_DEFAULT_LOCALE = "en-US";

export type HiCodexLocale = "en-US" | "zh-CN";

export interface I18nMessageDescriptor {
  id: string;
  defaultMessage: string;
  description?: string;
}

export type I18nValues = Record<string, string | number | boolean | null | undefined>;

export interface I18nBundle {
  locale: HiCodexLocale;
  messages: Record<string, string>;
}

export const HICODEX_SUPPORTED_LOCALES: HiCodexLocale[] = ["en-US", "zh-CN"];

const HICODEX_MESSAGES: Record<HiCodexLocale, Record<string, string>> = {
  "en-US": {
    "hc.app.name": "HiCodex",
    "hc.command.theme.title": "Theme",
    "hc.command.theme.message": "Choose the UI appearance. The selection is saved locally.",
    "hc.command.theme.toggleDark": "Switch to dark theme",
    "hc.command.theme.toggleLight": "Switch to light theme",
  },
  "zh-CN": {
    "hc.app.name": "HiCodex",
    "hc.command.theme.title": "主题",
    "hc.command.theme.message": "选择界面外观。该选择会保存在本机。",
    "hc.command.theme.toggleDark": "切换到深色主题",
    "hc.command.theme.toggleLight": "切换到浅色主题",
  },
};

export function normalizeLocale(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return Intl.getCanonicalLocales(trimmed.replace(/_/g, "-"))[0] ?? null;
  } catch {
    return trimmed.replace(/_/g, "-");
  }
}

export function resolveHiCodexLocale(preferred: unknown, fallback: HiCodexLocale = HICODEX_DEFAULT_LOCALE): HiCodexLocale {
  const normalized = normalizeLocale(preferred);
  if (!normalized) return fallback;
  if (normalized.toLowerCase() === "zh-cn" || normalized.toLowerCase().startsWith("zh-hans")) return "zh-CN";
  if (normalized.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en-US";
}

export function loadHiCodexLocale(storage: BrowserStorageLike | null, browserLocale?: string | null): HiCodexLocale {
  if (storage) {
    try {
      const stored = readMigratedStorageValue(storage, HICODEX_LOCALE_STORAGE_KEY, [LEGACY_HICODEX_LOCALE_STORAGE_KEY]);
      if (stored) return resolveHiCodexLocale(stored);
    } catch {
      // Fall through to browser locale.
    }
  }
  return resolveHiCodexLocale(browserLocale);
}

export function saveHiCodexLocale(storage: BrowserStorageLike | null, locale: HiCodexLocale): void {
  if (!storage) return;
  try {
    storage.setItem(HICODEX_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale still applies for this session when storage is unavailable.
  }
}

export function localeLabel(locale: HiCodexLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Chinese (Simplified)";
    default:
      return "English";
  }
}

export function localeDescription(locale: HiCodexLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Use Simplified Chinese for HiCodex shell labels.";
    default:
      return "Use English for HiCodex shell labels.";
  }
}

export function createI18nBundle(locale: HiCodexLocale): I18nBundle {
  return {
    locale,
    messages: HICODEX_MESSAGES[locale] ?? HICODEX_MESSAGES[HICODEX_DEFAULT_LOCALE],
  };
}

export function formatI18nMessage(
  bundle: I18nBundle,
  descriptor: I18nMessageDescriptor,
  values: I18nValues = {},
): string {
  const template = bundle.messages[descriptor.id]
    ?? HICODEX_MESSAGES[HICODEX_DEFAULT_LOCALE][descriptor.id]
    ?? descriptor.defaultMessage;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];
    return value == null ? match : String(value);
  });
}
