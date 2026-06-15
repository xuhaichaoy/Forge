import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createI18nBundle,
  formatI18nMessage,
  setActiveI18nLocale,
  type ForgeLocale,
  type I18nMessageDescriptor,
  type I18nValues,
} from "../state/i18n";

export interface ForgeIntlContextValue {
  locale: ForgeLocale;
  formatMessage: (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;
}

const DEFAULT_I18N_BUNDLE = createI18nBundle("en-US");

const ForgeIntlContext = createContext<ForgeIntlContextValue>({
  locale: "en-US",
  formatMessage: (descriptor, values) => formatI18nMessage(DEFAULT_I18N_BUNDLE, descriptor, values),
});

export function ForgeIntlProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: ForgeLocale;
}) {
  const value = useMemo<ForgeIntlContextValue>(() => {
    // Keep the module-level singleton (used by state/helpers via formatMessage
    // import) in sync, and reuse the same bundle for the React context value.
    const bundle = setActiveI18nLocale(locale);
    return {
      locale: bundle.locale,
      formatMessage: (descriptor, values) => formatI18nMessage(bundle, descriptor, values),
    };
  }, [locale]);

  return (
    <ForgeIntlContext.Provider value={value}>
      {children}
    </ForgeIntlContext.Provider>
  );
}

export function useForgeIntl(): ForgeIntlContextValue {
  return useContext(ForgeIntlContext);
}
