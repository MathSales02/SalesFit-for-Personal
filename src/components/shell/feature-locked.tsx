import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { FEATURE_INFO, type Feature } from "@/lib/plan-features";
import { getT } from "@/i18n/server";

const Lock = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

/**
 * Shown in place of a feature the consultancy's plan does not include. The trainer sees what it
 * is and where to get it; the student is only told it is not available, with nothing to buy.
 */
export async function FeatureLocked({ feature, role }: { feature: Feature; role: "trainer" | "student" }) {
  const t = await getT();
  const info = FEATURE_INFO[feature];
  return (
    <section aria-labelledby="locked-h" className="mx-auto max-w-xl rounded-[var(--radius-panel)] border border-line bg-paper px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-signal-tint text-turf">
        <Lock />
      </span>
      {role === "trainer" ? (
        <>
          <p className="mt-5 text-sm font-semibold text-turf">{t("Plano SalesFit")} {info.plan}</p>
          <h1 id="locked-h" className="mt-1 font-display text-3xl font-bold">
            {t(info.label)}
          </h1>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink-soft">{t(info.pitch)}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{t("Seu plano atual não inclui este recurso. Nada do que você já tem é apagado ao mudar de plano.")}</p>
          <Link href="/treinador/assinatura" className={`${buttonClass("primary")} mt-6`}>
            {t("Ver planos")}
          </Link>
        </>
      ) : (
        <>
          <h1 id="locked-h" className="mt-5 font-display text-3xl font-bold">
            {t(info.label)}
          </h1>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink-soft">{t("Este recurso não faz parte do plano da sua consultoria. Seus treinos e seu histórico continuam funcionando normalmente.")}</p>
          <Link href="/aluno" className={`${buttonClass("secondary")} mt-6`}>
            {t("Voltar ao início")}
          </Link>
        </>
      )}
    </section>
  );
}

/** The same message for one section of a page (the rest of the page keeps working). */
export async function FeatureNote({ feature, role }: { feature: Feature; role: "trainer" | "student" }) {
  const t = await getT();
  const info = FEATURE_INFO[feature];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-paper px-5 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-signal-tint text-turf">
        <Lock className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">{t(info.label)}</span>
        {role === "trainer" ? t(" faz parte do plano SalesFit {0}. {1}", { 0: info.plan, 1: info.pitch }) : t(" não faz parte do plano da sua consultoria.")}
      </p>
      {role === "trainer" && (
        <Link href="/treinador/assinatura" className={buttonClass("secondary")}>
          {t("Ver planos")}
        </Link>
      )}
    </div>
  );
}
