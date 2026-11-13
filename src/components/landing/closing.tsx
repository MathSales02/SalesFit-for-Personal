import Link from "next/link";
import { Beats, BrandLogo } from "./brand";
import { SectionLink } from "./hero-motion";
import { BRAND, CONTACT, NAV, SOCIAL } from "./landing-content";
import { LOCALE_LABEL, LOCALES } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { LANDING_PATHS } from "./landing-page";

/** Final call to action: the bright orange band (black text, 6.3:1) that hands over to the footer. */
export async function FinalCta({ trialDays }: { trialDays: number }) {
  const t = await getT();
  return (
    <section aria-labelledby="cta-h" className="relative overflow-hidden bg-[var(--lp-orange)] text-[var(--lp-ink)]">
      <Beats className="pointer-events-none absolute -right-10 bottom-0 h-[85%] w-[55%] text-[var(--lp-ink)]/10" on={[0, 1, 2, 3, 4, 5, 6]} heights={[40, 70, 55, 100, 80, 45, 60]} />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <h2 id="cta-h" className="lp-display max-w-4xl text-[2.9rem] sm:text-[5rem]">
          {t("A próxima semana dos seus alunos começa aqui.")}
        </h2>
        <p className="mt-6 max-w-xl text-lg font-medium text-[var(--lp-ink)]/80">
          {trialDays} {t("dias com todos os recursos, sem cartão. Monte o primeiro programa hoje e convide seus alunos.")}
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/cadastro" className="inline-flex h-13 items-center rounded-full bg-[var(--lp-ink)] px-7 text-base font-semibold text-white transition-colors hover:bg-white hover:text-[var(--lp-ink)]">
            {t("Criar minha conta grátis")}
          </Link>
          <Link href="/entrar" className="inline-flex h-13 items-center rounded-full border border-[var(--lp-ink)]/40 px-6 text-base font-semibold text-[var(--lp-ink)] transition-colors hover:bg-black/10">
            {t("Já tenho conta")}
          </Link>
        </div>
      </div>
    </section>
  );
}

export async function Footer() {
  const t = await getT();
  const year = new Date().getFullYear();
  const locale = await getLocale();
  return (
    <footer className="lp-dark border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.1fr_0.9fr_0.9fr_1.4fr]">
        <div>
          <BrandLogo />
          <p className="mt-4 text-base font-semibold text-[var(--lp-text)]">{t("Evolução é constância.")}</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--lp-text-2)]">{t("Treinos, evolução e constância para personal trainers e seus alunos.")}</p>
        </div>
        <nav aria-label={t("Seções do site")}>
          <h2 className="text-sm font-semibold text-white">{t("Página")}</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {NAV.map((n) => (
              <li key={n.id}>
                <SectionLink id={n.id} className="text-[var(--lp-text-2)] hover:text-white">
                  {t(n.label)}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("Conta e documentos")}>
          <h2 className="text-sm font-semibold text-white">{t("Conta")}</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/cadastro" className="text-[var(--lp-text-2)] hover:text-white">
                {t("Criar conta")}
              </Link>
            </li>
            <li>
              <Link href="/entrar" className="text-[var(--lp-text-2)] hover:text-white">
                {t("Entrar")}
              </Link>
            </li>
            <li>
              <Link href="/termos" className="text-[var(--lp-text-2)] hover:text-white">
                {t("Termos de uso")}
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="text-[var(--lp-text-2)] hover:text-white">
                {t("Política de privacidade")}
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-white">{t("Contato")}</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <a href={`mailto:${CONTACT.email}`} className="break-words text-[var(--lp-text-2)] hover:text-white">
                {CONTACT.email}
              </a>
            </li>
            <li>
              <a href={CONTACT.whatsapp.href} target="_blank" rel="noopener noreferrer" className="text-[var(--lp-text-2)] hover:text-white">
                {t("WhatsApp")} {CONTACT.whatsapp.display}
                <span className="sr-only"> {t("(abre em nova aba)")}</span>
              </a>
            </li>
            {SOCIAL.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[var(--lp-text-2)] hover:text-white">
                  {t(s.label)}
                  <span className="sr-only"> {t("(abre em nova aba)")}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/10 px-5 py-6 text-xs text-[var(--lp-text-2)] sm:px-8">
        <p>
          © {year} {BRAND}
          {t(". Todos os direitos reservados.")}
        </p>
        {/* Each language named in itself. Portuguese goes through ?lang= so the choice is remembered. */}
        <nav aria-label={t("Idioma")}>
          <ul className="flex gap-1">
            {LOCALES.map((l) => (
              <li key={l}>
                <a
                  href={l === "pt-BR" ? "/?lang=pt-BR" : LANDING_PATHS[l]}
                  hrefLang={l}
                  lang={l}
                  aria-current={l === locale ? "true" : undefined}
                  className={`inline-flex min-h-6 items-center rounded-full px-3 py-1 ${l === locale ? "bg-white/10 font-semibold text-white" : "hover:text-white"}`}
                >
                  {LOCALE_LABEL[l]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
