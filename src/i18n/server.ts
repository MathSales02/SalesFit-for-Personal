import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { en } from "./catalog/en";
import { es } from "./catalog/es";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, translator, type Catalog, type Locale, type Translate } from "./config";

const CATALOGS: Record<Locale, Catalog | null> = { "pt-BR": null, en, es };

export const catalogFor = (locale: Locale) => CATALOGS[locale];

/**
 * The language of this request: the one the person chose (cookie), or else the browser's.
 * Read once per request.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(chosen)) return chosen;
    return matchLocale((await headers()).get("accept-language"));
  } catch {
    // Outside a request (scripts, tests calling a service directly).
    return DEFAULT_LOCALE;
  }
});

/** `t` for Server Components, actions and services: `const t = await getT()`. */
export const getT = cache(async (): Promise<Translate> => {
  const locale = await getLocale();
  return translator(locale, CATALOGS[locale]);
});
