"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, translator, type Catalog, type Locale, type Translate } from "./config";

const Ctx = createContext<{ locale: Locale; t: Translate }>({ locale: DEFAULT_LOCALE, t: translator(DEFAULT_LOCALE, null) });

/**
 * Makes the request's language available to Client Components. The server passes the catalogue
 * of that one language (nothing at all for Portuguese), so a browser never downloads the others.
 */
export function LocaleProvider({ locale, catalog, children }: { locale: Locale; catalog: Catalog | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: translator(locale, catalog) }), [locale, catalog]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `t` for Client Components: `const t = useT()`. */
export const useT = () => useContext(Ctx).t;
export const useLocale = () => useContext(Ctx).locale;
