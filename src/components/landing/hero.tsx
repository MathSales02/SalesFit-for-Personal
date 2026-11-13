import Image from "next/image";
import Link from "next/link";
import heroPhoto from "./assets/hero-treino.jpg";
import { Beats } from "./brand";
import { HeroMotion, SectionLink } from "./hero-motion";
import { MockCheckinToast, MockConstancia, MockTreinos } from "./mockups";
import { getT } from "@/i18n/server";

/**
 * Hero. The headline is plain server-rendered text (the LCP element) and never
 * waits for JavaScript. The photo is licensed by the owner.
 */
export async function Hero({ trialDays }: { trialDays: number }) {
  const t = await getT();
  return (
    <HeroMotion>
      <section aria-labelledby="hero-h" className="lp-dark relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        {/* Background photo: on wide screens it sits to the right, so the text stays on the dark side. */}
        <div className="absolute inset-x-0 top-0 -z-10 h-[62%] sm:h-[70%] lg:inset-y-0 lg:left-[30%] lg:h-auto" data-depth="0.15">
          <Image
            src={heroPhoto}
            alt={t("Aluna sorrindo durante o treino em uma academia")}
            fill
            priority
            sizes="(min-width: 1024px) 70vw, 100vw"
            className="object-cover object-[46%_22%] brightness-[0.9] lg:object-[40%_25%] lg:brightness-[0.82]"
          />
        </div>
        {/* Scrims: guarantee contrast for the text (not decoration). */}
        {/* Phones: the photo fills the top; it fades into the dark where the text sits. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[62%] bg-[linear-gradient(180deg,rgba(14,15,17,0.45)_0%,rgba(14,15,17,0)_28%,rgba(14,15,17,0.35)_60%,var(--lp-ink)_100%)] sm:h-[70%] lg:hidden" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,var(--lp-ink)_30%,rgba(14,15,17,0.86)_44%,rgba(14,15,17,0.2)_70%,rgba(14,15,17,0.35)_100%)] lg:block" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[var(--lp-ink)] to-transparent" />

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pt-32 pb-14 sm:px-8 lg:justify-center lg:pb-24">
          <div className="max-w-[40rem]">
            <p data-hero-anim="" className="mb-6 inline-flex items-center gap-3 text-sm font-medium text-[var(--lp-text-2)]">
              <Beats className="h-4 w-14 text-[var(--lp-orange)]" />
              {t("Para personal trainers e seus alunos")}
            </p>
            <h1 id="hero-h" className="lp-display text-[2.9rem] text-white sm:text-[4.2rem] lg:text-[5rem]">
              {t("Seus alunos no ritmo. Sua consultoria em ordem.")}
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-[var(--lp-text-2)]">
              {t("Treino no celular do aluno, evolução acompanhada de perto e um ranking que premia constância. Tudo no SalesFit.")}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/cadastro"
                data-magnetic=""
                className="inline-flex h-13 items-center rounded-full bg-[var(--lp-orange)] px-7 text-base font-semibold text-[var(--lp-ink)] transition-colors hover:bg-white"
              >
                {t("Começar")} {trialDays} {t("dias grátis")}
              </Link>
              <SectionLink id="demonstracao" className="inline-flex h-13 items-center gap-2 rounded-full border border-white/25 px-6 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10">
                {t("Ver o sistema funcionando")}
              </SectionLink>
            </div>
            <p className="mt-4 text-sm text-[var(--lp-text-2)]">{t("Sem cartão de crédito para testar.")}</p>
          </div>
        </div>

        {/* Real interface, example data, in depth layers. */}
        <div aria-hidden="true" className="pointer-events-none absolute right-[3%] bottom-[12%] hidden w-[620px] xl:block">
          <div data-hero-anim="" data-depth="0.5" data-float="" className="absolute right-[250px] bottom-[150px] w-[300px]">
            <MockTreinos />
          </div>
          <div data-hero-anim="" data-depth="0.9" data-float="" className="absolute right-0 bottom-[40px] w-[310px]">
            <MockConstancia />
          </div>
          <div data-hero-anim="" data-depth="1.3" data-float="" className="absolute right-[220px] bottom-0 w-[280px]">
            <MockCheckinToast />
          </div>
        </div>
        <p className="absolute right-5 bottom-4 hidden text-xs text-white/70 xl:block">{t("Telas reais do SalesFit com dados de exemplo.")}</p>
      </section>
    </HeroMotion>
  );
}
