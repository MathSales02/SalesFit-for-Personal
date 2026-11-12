/**
 * Languages of the app.
 *
 * The app is written in Portuguese: every text in the code is the Portuguese one, and the other
 * languages are catalogues that map each Portuguese text to its translation (see ./catalog).
 * A text without a translation shows in Portuguese, so a missing entry never breaks a screen;
 * tests/i18n.test.ts fails when one is missing.
 */
export const LOCALES = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "cadencia_locale";

/** Each language named in itself, as a language menu should. */
export const LOCALE_LABEL: Record<Locale, string> = { "pt-BR": "Português", en: "English", es: "Español" };

export const isLocale = (v: string | undefined | null): v is Locale => (LOCALES as readonly string[]).includes(v ?? "");

/**
 * The best of our languages for a browser's Accept-Language header ("es-AR,es;q=0.9,en;q=0.8").
 * Any Portuguese goes to pt-BR, any English to en, any Spanish to es; anything else gets English,
 * the most widely read of the three. No header at all (tools, crawlers) keeps the default.
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: (tag ?? "").toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.tag && x.tag !== "*" && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (base === "pt") return "pt-BR";
    if (base === "en") return "en";
    if (base === "es") return "es";
  }
  return wanted.length > 0 ? "en" : DEFAULT_LOCALE;
}

export type Vars = Record<string, string | number | null | undefined>;

/** "{n} alunos" + { n: 3 } -> "3 alunos". Unknown names are left as written. */
export const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text);

export type Catalog = Record<string, string>;
export type Translate = (text: string | null | undefined, vars?: Vars) => string;

/** The translate function for one language. `text` is always the Portuguese text. */
export function translator(locale: Locale, catalog: Catalog | null): Translate {
  if (locale === DEFAULT_LOCALE || !catalog) return (text, vars) => fill(text ?? "", vars);
  return (text, vars) => (text ? fill(catalog[text] ?? text, vars) : "");
}

/**
 * The name of a piece of equipment from the exercise library. A few of them are also the name
 * of an exercise ("Barra fixa"), so equipment may have its own entry under "equip:".
 */
export function equipmentText(t: Translate, equipment: string | null | undefined): string {
  if (!equipment) return "";
  const own = t(`equip:${equipment}`);
  return own === `equip:${equipment}` ? t(equipment) : own;
}
