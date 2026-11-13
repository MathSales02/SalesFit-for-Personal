import type { Metadata } from "next";
import { Benefits, Proof } from "@/components/landing/benefits";
import { FinalCta, Footer } from "@/components/landing/closing";
import { Demo } from "@/components/landing/demo";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { faqItems } from "@/components/landing/faq-content";
import { LandingRoot } from "@/components/landing/landing-root";
import { Navbar } from "@/components/landing/navbar";
import { Pricing } from "@/components/landing/pricing";
import "@/components/landing/landing.css";
import { TRIAL_DAYS } from "@/server/auth/service";
import { listPublicPlans } from "@/server/billing/public-plans";
import { getT } from "@/i18n/server";

import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";

/** Where each language version of the landing lives. "/" is the Portuguese one for search engines. */
export const LANDING_PATHS: Record<Locale, string> = { "pt-BR": "/", en: "/en", es: "/es" };
const OG_LOCALE: Record<Locale, string> = { "pt-BR": "pt_BR", en: "en_US", es: "es_ES" };

/**
 * Title, description and the links between language versions (hreflang), so a search engine
 * shows each person the version in their language.
 */
export async function landingMetadata(page: Locale): Promise<Metadata> {
  const t = await getT();
  const title = t("SalesFit: treinos, evolução e constância para personal trainers");
  const description = t("Monte treinos, acompanhe a evolução dos alunos e mantenha a turma motivada com ranking e comunidade. Teste grátis por {days} dias, sem cartão.", { days: TRIAL_DAYS });
  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: LANDING_PATHS[page],
      languages: { "pt-BR": LANDING_PATHS["pt-BR"], en: LANDING_PATHS.en, es: LANDING_PATHS.es, "x-default": LANDING_PATHS["pt-BR"] },
    },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[await getLocale()],
      siteName: "SalesFit",
      title,
      description,
      url: LANDING_PATHS[page],
      images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "SalesFit" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/landing/og.jpg"] },
  };
}

export async function LandingPage() {
  const t = await getT();
  const { paid, trial } = await listPublicPlans();
  return (
    <LandingRoot>
      <a href="#conteudo" className="sr-only z-[60] rounded-full bg-white px-4 py-2 font-semibold text-[var(--lp-ink)] focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t("Pular para o conteúdo")}
      </a>
      <Navbar />
      <main id="conteudo">
        <Hero trialDays={TRIAL_DAYS} />
        <Demo />
        <Features />
        <Benefits />
        <Proof />
        <Pricing plans={paid} trial={trial} trialDays={TRIAL_DAYS} />
        <Faq items={faqItems({ trialDays: TRIAL_DAYS, trialStudents: trial?.maxStudents ?? null, t })} />
        <FinalCta trialDays={TRIAL_DAYS} />
      </main>
      <Footer />
    </LandingRoot>
  );
}
