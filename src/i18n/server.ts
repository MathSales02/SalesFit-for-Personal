import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { en } from "./catalog/en";
import { es } from "./catalog/es";
import { libraryEn } from "./catalog/library-en";
import { libraryEs } from "./catalog/library-es";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchLocale, translator, type Catalog, type Locale, type Translate } from "./config";

const CATALOGS: Record<Locale, Catalog | null> = { "pt-BR": null, en, es };

export const catalogFor = (locale: Locale) => CATALOGS[locale];

/**
 * The language of this request: the one the person chose (cookie), or else the browser's.
 * Read once per request.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const locale = await readLocale();
  known().value = locale;
  return locale;
});

async function readLocale(): Promise<Locale> {
  try {
    const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(chosen)) return chosen;
    return matchLocale((await headers()).get("accept-language"));
  } catch {
    // Outside a request (scripts, tests calling a service directly).
    return DEFAULT_LOCALE;
  }
}

/** One box per request, filled the first time the request's language is read. */
const known = cache(() => ({ value: DEFAULT_LOCALE as Locale }));

/**
 * The request's language without awaiting, for formatting dates and numbers in helpers that
 * are not async. Valid after `getT()` or `getLocale()` ran in the request, which every
 * translated page does first; before that it is Portuguese.
 */
export const currentLocale = (): Locale => known().value;

const LIBRARY: Record<Locale, Catalog | null> = { "pt-BR": null, en: libraryEn, es: libraryEs };

/**
 * Translates the exercise library's long texts (description, steps, tips, mistakes) line by line.
 * Lines that are not in the library (written or changed by a trainer) stay as they are, so a
 * trainer's copy is translated exactly where it still matches the original.
 */
export const getLibraryText = cache(async () => {
  const catalog = LIBRARY[await getLocale()];
  return (text: string | null | undefined): string | null => {
    if (text == null) return null;
    if (!catalog) return text;
    return text
      .split("\n")
      .map((line) => catalog[line.trim()] ?? line)
      .join("\n");
  };
});

/** `t` for Server Components, actions and services: `const t = await getT()`. */
export const getT = cache(async (): Promise<Translate> => {
  const locale = await getLocale();
  return translator(locale, CATALOGS[locale]);
});
