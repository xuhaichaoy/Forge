import { setDesktopAppSettingValue } from "../lib/app-settings";
import type { BrowserStorageLike } from "./image-generation-tool";
import { HICODEX_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./hicodex-desktop-namespace";
import { HICODEX_MESSAGES } from "./i18n-messages";

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
    setDesktopAppSettingValue(storage, HICODEX_LOCALE_STORAGE_KEY, locale);
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
  const withPlurals = formatIcuPluralFragments(template, values);
  const withNumbers = formatIcuNumberArguments(withPlurals, values, bundle.locale);
  return withNumbers.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    const value = values[key];
    return value == null ? match : String(value);
  });
}

/**
 * Module-level i18n singleton for non-React callers — state modules and
 * module-level helper functions that cannot call the useHiCodexIntl() hook.
 * HiCodexIntlProvider syncs `activeI18nBundle` with the active locale on every
 * render (see i18n-provider.tsx), so any `formatMessage(...)` imported from here
 * resolves against the current locale. Components should still prefer the hook.
 */
let activeI18nBundle: I18nBundle = createI18nBundle(HICODEX_DEFAULT_LOCALE);

export function setActiveI18nLocale(locale: HiCodexLocale): I18nBundle {
  activeI18nBundle = createI18nBundle(locale);
  return activeI18nBundle;
}

export function formatMessage(descriptor: I18nMessageDescriptor, values?: I18nValues): string {
  return formatI18nMessage(activeI18nBundle, descriptor, values);
}

function formatIcuPluralFragments(template: string, values: I18nValues): string {
  return template.replace(
    /\{([A-Za-z0-9_]+),\s*plural,\s*(?:one\s*\{([^{}]*)\}\s*)?other\s*\{([^{}]*)\}\s*\}/g,
    (match, key: string, one: string | undefined, other: string) => {
      const rawValue = values[key];
      const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) return match;
      const selected = numericValue === 1 && one !== undefined ? one : other;
      return selected.replace(/#/g, String(rawValue));
    },
  );
}

/**
 * ICU `{key, number}` argument support — mirrors react-intl's locale-aware
 * number formatting. Codex Desktop uses `{count, number}` in several strings
 * (e.g. `codex.localConversation.summaryPanelExpandableList.showMore`); the
 * simple `{key}` interpolation in formatI18nMessage cannot match the comma
 * form, so without this the raw `{count, number}` placeholder renders verbatim.
 */
function formatIcuNumberArguments(template: string, values: I18nValues, locale: HiCodexLocale): string {
  return template.replace(/\{([A-Za-z0-9_]+),\s*number\s*\}/g, (match, key: string) => {
    const rawValue = values[key];
    const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) return match;
    try {
      return new Intl.NumberFormat(locale).format(numericValue);
    } catch {
      return String(rawValue);
    }
  });
}
