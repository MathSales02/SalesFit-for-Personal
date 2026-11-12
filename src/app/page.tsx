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

const TITLE = "SalesFit: treinos, evolução e constância para personal trainers";
const DESCRIPTION =
  "Monte treinos, acompanhe a evolução dos alunos e mantenha a turma motivada com ranking e comunidade. Teste grátis por 7 dias, sem cartão.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "SalesFit",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: "SalesFit" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/og.jpg"] },
};

export default async function LandingPage() {
  const { paid, trial } = await listPublicPlans();
  return (
    <LandingRoot>
      <a href="#conteudo" className="sr-only z-[60] rounded-full bg-white px-4 py-2 font-semibold text-[var(--lp-ink)] focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Pular para o conteúdo
      </a>
      <Navbar />
      <main id="conteudo">
        <Hero trialDays={TRIAL_DAYS} />
        <Demo />
        <Features />
        <Benefits />
        <Proof />
        <Pricing plans={paid} trial={trial} trialDays={TRIAL_DAYS} />
        <Faq items={faqItems({ trialDays: TRIAL_DAYS, trialStudents: trial?.maxStudents ?? null })} />
        <FinalCta trialDays={TRIAL_DAYS} />
      </main>
      <Footer />
    </LandingRoot>
  );
}
