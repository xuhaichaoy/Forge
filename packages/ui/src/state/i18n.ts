import { setDesktopAppSettingValue } from "../lib/app-settings";
import type { BrowserStorageLike } from "./image-generation-tool";
import { FORGE_DESKTOP_CONFIG_KEYS, readMigratedStorageValue } from "./forge-desktop-namespace";
import type { ForgeLocale } from "./i18n-types";
import { FORGE_MESSAGES } from "../i18n/messages";

// Deliberate legacy value: the old-brand "hicodex:" localStorage key stays so
// stored locale settings survive the Forge rebrand (identifier-only rename).
export const LEGACY_FORGE_LOCALE_STORAGE_KEY = "hicodex:locale";
export const FORGE_LOCALE_STORAGE_KEY = FORGE_DESKTOP_CONFIG_KEYS.locale;
export const FORGE_DEFAULT_LOCALE = "en-US";

export type { ForgeLocale } from "./i18n-types";

export interface I18nMessageDescriptor {
  id: string;
  defaultMessage: string;
  description?: string;
}

export type I18nValues = Record<string, string | number | boolean | null | undefined>;

export interface I18nBundle {
  locale: ForgeLocale;
  messages: Record<string, string>;
}

export const FORGE_SUPPORTED_LOCALES: ForgeLocale[] = ["en-US", "zh-CN"];

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

export function resolveForgeLocale(preferred: unknown, fallback: ForgeLocale = FORGE_DEFAULT_LOCALE): ForgeLocale {
  const normalized = normalizeLocale(preferred);
  if (!normalized) return fallback;
  if (normalized.toLowerCase() === "zh-cn" || normalized.toLowerCase().startsWith("zh-hans")) return "zh-CN";
  if (normalized.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en-US";
}

export function loadForgeLocale(storage: BrowserStorageLike | null, browserLocale?: string | null): ForgeLocale {
  if (storage) {
    try {
      const stored = readMigratedStorageValue(storage, FORGE_LOCALE_STORAGE_KEY, [LEGACY_FORGE_LOCALE_STORAGE_KEY]);
      if (stored) return resolveForgeLocale(stored);
    } catch {
      // Fall through to browser locale.
    }
  }
  return resolveForgeLocale(browserLocale);
}

export function saveForgeLocale(storage: BrowserStorageLike | null, locale: ForgeLocale): void {
  if (!storage) return;
  try {
    setDesktopAppSettingValue(storage, FORGE_LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale still applies for this session when storage is unavailable.
  }
}

export function localeLabel(locale: ForgeLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Chinese (Simplified)";
    default:
      return "English";
  }
}

export function localeDescription(locale: ForgeLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Use Simplified Chinese for Forge shell labels.";
    default:
      return "Use English for Forge shell labels.";
  }
}

export function createI18nBundle(locale: ForgeLocale): I18nBundle {
  return {
    locale,
    messages: FORGE_MESSAGES[locale] ?? FORGE_MESSAGES[FORGE_DEFAULT_LOCALE],
  };
}

export function formatI18nMessage(
  bundle: I18nBundle,
  descriptor: I18nMessageDescriptor,
  values: I18nValues = {},
): string {
  const template = bundle.messages[descriptor.id]
    ?? FORGE_MESSAGES[FORGE_DEFAULT_LOCALE][descriptor.id]
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
 * module-level helper functions that cannot call the useForgeIntl() hook.
 * ForgeIntlProvider syncs `activeI18nBundle` with the active locale on every
 * render (see i18n-provider.tsx), so any `formatMessage(...)` imported from here
 * resolves against the current locale. Components should still prefer the hook.
 */
let activeI18nBundle: I18nBundle = createI18nBundle(FORGE_DEFAULT_LOCALE);

export function setActiveI18nLocale(locale: ForgeLocale): I18nBundle {
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
function formatIcuNumberArguments(template: string, values: I18nValues, locale: ForgeLocale): string {
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
