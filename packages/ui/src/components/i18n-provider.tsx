import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createI18nBundle,
  formatI18nMessage,
  type HiCodexLocale,
  type I18nMessageDescriptor,
  type I18nValues,
} from "../state/i18n";

export interface HiCodexIntlContextValue {
  locale: HiCodexLocale;
  formatMessage: (descriptor: I18nMessageDescriptor, values?: I18nValues) => string;
}

const HiCodexIntlContext = createContext<HiCodexIntlContextValue>({
  locale: "en-US",
  formatMessage: (descriptor) => descriptor.defaultMessage,
});

export function HiCodexIntlProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: HiCodexLocale;
}) {
  const value = useMemo<HiCodexIntlContextValue>(() => {
    const bundle = createI18nBundle(locale);
    return {
      locale: bundle.locale,
      formatMessage: (descriptor, values) => formatI18nMessage(bundle, descriptor, values),
    };
  }, [locale]);

  return (
    <HiCodexIntlContext.Provider value={value}>
      {children}
    </HiCodexIntlContext.Provider>
  );
}

export function useHiCodexIntl(): HiCodexIntlContextValue {
  return useContext(HiCodexIntlContext);
}
