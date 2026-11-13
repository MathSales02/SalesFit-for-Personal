/**
 * "Novidades": every feature that reaches people gets an entry here, newest first. The app shows
 * the entries a person has not seen yet in a pop-up, once (see components/shell/whats-new.tsx).
 *
 * - `releasedAt`: the moment it went live (ISO, with time). Accounts created after it are not told:
 *   for them it is simply how the app works.
 * - `audience`: who sees it. Students and trainers only; the admin area has no pop-up.
 * - Texts are in Portuguese and are keys of the i18n catalogs (en.ts, es.ts): add the translations.
 */
export type Audience = "student" | "trainer";

export type NewsItem = {
  id: string;
  releasedAt: string;
  audience: Audience[];
  title: string;
  body: string;
  /** Where to try it, optional. */
  cta?: { href: string; label: string };
};

export const NEWS: NewsItem[] = [
  {
    id: "2026-11-week-streak",
    releasedAt: "2026-11-13T17:00:00Z",
    audience: ["student"],
    title: "Sua semana no topo do início",
    body: "Agora o foguinho mostra quantas semanas seguidas você bateu a meta, e os dias da semana ficam logo abaixo do cabeçalho. Toque no círculo de hoje para fazer o check-in.",
    cta: { href: "/aluno", label: "Ver minha semana" },
  },
];

/** The entries this person should be told about: their audience, released after they joined. */
export function newsFor(audience: Audience, joinedAt: string | undefined, all: NewsItem[] = NEWS): NewsItem[] {
  const joined = joinedAt ? Date.parse(joinedAt) : 0;
  return all.filter((n) => n.audience.includes(audience) && Date.parse(n.releasedAt) > joined);
}
