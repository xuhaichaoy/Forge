/*
 * Pure type leaf for the i18n locale union. Extracted from ./i18n so the
 * message dictionary (../i18n/messages) can reference the locale type without
 * importing the runtime module back (state/i18n -> i18n/messages value edge).
 * state/i18n re-exports this name in place, so existing import paths keep
 * working unchanged.
 */
export type ForgeLocale = "en-US" | "zh-CN";
