import Link from "next/link";
import { ANNUAL_DISCOUNT_PERCENT, FEATURES, MAX_INSTALLMENTS, type Feature } from "@/lib/plan-features";
import type { PublicPlan } from "@/server/billing/public-plans";
import { PLAN_BASE, PLAN_EXTRAS, PLAN_FEATURE_LABEL, PLAN_TAGLINE, RECOMMENDED_PLAN } from "./landing-content";
import { PricingMotion } from "./pricing-motion";
import { getT } from "@/i18n/server";

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;
const short = (name: string) => name.replace(/^SalesFit\s+/, "");

/**
 * Prices, limits and what each plan unlocks come from the database (the same plans the checkout
 * charges and the app enforces), so this section cannot promise something the product denies.
 */
export async function Pricing({ plans, trial, trialDays }: { plans: PublicPlan[]; trial: PublicPlan | null; trialDays: number }) {
  const t = await getT();
  if (plans.length === 0) return null;
  const recommended = plans.some((p) => p.code === RECOMMENDED_PLAN) ? RECOMMENDED_PLAN : null;
  // What a plan adds over the one before it.
  const added = (i: number): Feature[] => FEATURES.filter((f) => plans[i]!.features[f] && !(i > 0 && plans[i - 1]!.features[f]));

  return (
    <section id="precos" aria-labelledby="price-h" className="lp-light relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 id="price-h" className="lp-display max-w-3xl text-[2.6rem] sm:text-[4rem]">
          {t("Um plano para cada fase da sua consultoria.")}
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-[var(--lp-dark-2)]">
          {t("Comece com o essencial e suba quando a turma crescer. Mensal, ou anual com {pct}% de desconto, em até {n}x no cartão. Pix, boleto ou cartão.", { pct: ANNUAL_DISCOUNT_PERCENT, n: MAX_INSTALLMENTS })}
        </p>

        <PricingMotion>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p, i) => {
              const featured = p.code === recommended;
              const strong = featured ? "text-white" : "text-[var(--lp-dark)]";
              const soft = featured ? "text-[var(--lp-text-2)]" : "text-[var(--lp-dark-2)]";
              return (
                <li key={p.code} data-card="" className={`relative flex flex-col rounded-[var(--lp-radius)] p-6 ${featured ? "bg-[var(--lp-ink)] text-white" : "bg-white text-[var(--lp-dark)]"}`}>
                  {featured && <span className="absolute -top-3 left-6 rounded-full bg-[var(--lp-orange)] px-3 py-1 text-xs font-bold text-[var(--lp-ink)]">{t("Recomendado")}</span>}
                  <h3 className="text-lg font-semibold">{t(p.name)}</h3>
                  {PLAN_TAGLINE[p.code] && <p className={`mt-1 text-sm ${soft}`}>{t(PLAN_TAGLINE[p.code])}</p>}
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-1">
                    <span className="lp-display text-[2.4rem] lg:text-[2.1rem] xl:text-[2.3rem]">{brl(p.priceCents)}</span>
                    <span className={soft}>{t("/mês")}</span>
                  </p>
                  {p.annualPriceCents && (
                    <p className={`mt-1 text-sm ${soft}`}>
                      {t("ou")} <strong className={strong}>{brl(p.annualPriceCents)}</strong> {t("por ano")}
                    </p>
                  )}
                  <ul className={`mt-6 flex flex-1 flex-col gap-2.5 text-[0.95rem] ${soft}`}>
                    <li>
                      <strong className={strong}>{t("Até")} {p.maxStudents} {t("alunos")}</strong>
                    </li>
                    <li>
                      <strong className={strong}>{gb(p.storageQuotaMb)}</strong> {t("para vídeos e fotos")}
                    </li>
                    {i === 0 ? PLAN_BASE.map((f) => <li key={f}>{t(f)}</li>) : <li>{t("Tudo do")} {short(plans[i - 1]!.name)}</li>}
                    {added(i).map((f) => (
                      <li key={f}>{t(PLAN_FEATURE_LABEL[f])}</li>
                    ))}
                    {(PLAN_EXTRAS[p.code] ?? []).map((f) => (
                      <li key={f}>{t(f)}</li>
                    ))}
                  </ul>
                  <Link
                    href="/cadastro"
                    className={`mt-7 inline-flex h-12 items-center justify-center rounded-full font-semibold transition-colors ${
                      featured ? "bg-[var(--lp-orange)] text-[var(--lp-ink)] hover:bg-white" : "bg-[var(--lp-dark)] text-white hover:bg-[var(--lp-orange)] hover:text-[var(--lp-ink)]"
                    }`}
                  >
                    {t("Começar com")} {short(p.name)}
                    <span className="sr-only"> ({trialDays} {t("dias grátis)")}</span>
                  </Link>
                </li>
              );
            })}
            {/* Not for sale yet: one consultancy has one trainer today. */}
            <li data-card="" className="relative flex flex-col rounded-[var(--lp-radius)] border border-dashed border-[var(--lp-line-light)] p-6 text-[var(--lp-dark)]">
              <h3 className="text-lg font-semibold">{t("SalesFit Academy")}</h3>
              <p className="mt-1 text-sm text-[var(--lp-dark-2)]">{t("Para academias e equipes.")}</p>
              <p className="lp-display mt-4 text-[2.1rem]">{t("Em breve")}</p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[0.95rem] text-[var(--lp-dark-2)]">
                <li>{t("Vários treinadores na mesma conta")}</li>
                <li>{t("Alunos distribuídos por treinador")}</li>
                <li>{t("Visão geral da unidade")}</li>
              </ul>
              <p className="mt-7 inline-flex h-12 items-center justify-center rounded-full border border-[var(--lp-line-light)] font-semibold text-[var(--lp-dark-2)]">{t("Ainda não disponível")}</p>
            </li>
          </ul>
        </PricingMotion>

        <p className="mt-6 max-w-3xl text-sm text-[var(--lp-dark-2)]">
          {t("Todos começam com")} {trialDays} {t("dias de teste grátis com todos os recursos")}{trial ? t(", para até {0} alunos", { 0: trial.maxStudents }) : ""}{t(", sem cartão. Escolhendo um plano durante o teste, a primeira cobrança vence só 3 dias depois. Seus alunos não pagam nada.")}
        </p>

        {/* Comparison: a real table from md up; on phones, one block per plan (no sideways scroll). */}
        <h3 className="mt-16 text-xl font-semibold">{t("Compare os planos")}</h3>
        <div className="mt-5 hidden overflow-hidden rounded-[var(--lp-radius)] bg-white md:block">
          <table className="w-full text-left text-[0.95rem]">
            <caption className="sr-only">{t("Comparação dos planos do SalesFit")}</caption>
            <thead>
              <tr className="border-b border-[var(--lp-line-light)]">
                <th scope="col" className="px-5 py-4 font-semibold">
                  <span className="sr-only">{t("Item")}</span>
                </th>
                {plans.map((p) => (
                  <th key={p.code} scope="col" className="px-5 py-4 font-semibold">
                    {short(p.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lp-line-light)]">
              <Row label={t("Preço mensal")} values={plans.map((p) => brl(p.priceCents))} />
              <Row label={t("Preço anual ({0}% de desconto)", { 0: ANNUAL_DISCOUNT_PERCENT })} values={plans.map((p) => (p.annualPriceCents ? brl(p.annualPriceCents) : "—"))} />
              <Row label={t("Alunos (ativos e convites)")} values={plans.map((p) => t("Até {0}", { 0: p.maxStudents }))} />
              <Row label={t("Espaço para vídeos e fotos")} values={plans.map((p) => gb(p.storageQuotaMb))} />
              {PLAN_BASE.map((f) => (
                <Row key={f} label={t(f)} values={plans.map(() => true)} />
              ))}
              {FEATURES.map((f) => (
                <Row key={f} label={t(PLAN_FEATURE_LABEL[f])} values={plans.map((p) => !!p.features[f])} />
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-5 flex flex-col gap-3 md:hidden">
          {plans.map((p) => (
            <div key={p.code} className="rounded-2xl bg-white p-4">
              <dt className="font-semibold">
                {t(p.name)} <span className="font-normal text-[var(--lp-dark-2)]">· {brl(p.priceCents)}{t("/mês")}</span>
              </dt>
              <dd className="mt-2">
                <ul className="flex flex-col gap-1.5 text-sm text-[var(--lp-dark-2)]">
                  <li>
                    {t("Até")} {p.maxStudents} {t("alunos ·")} {gb(p.storageQuotaMb)}
                  </li>
                  {FEATURES.map((f) => (
                    <li key={f} className={p.features[f] ? "" : "line-through decoration-[var(--lp-line-light)]"}>
                      <span aria-hidden="true">{p.features[f] ? "✓" : "—"}</span> {t(PLAN_FEATURE_LABEL[f])}
                      <span className="sr-only">{p.features[f] ? t(" (incluído)") : t(" (não incluído)")}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
          <div className="rounded-2xl bg-white p-4">
            <dt className="text-sm font-semibold">{t("Incluído em todos os planos")}</dt>
            <dd className="mt-2">
              <ul className="flex flex-col gap-1.5 text-sm text-[var(--lp-dark-2)]">
                {PLAN_BASE.map((f) => (
                  <li key={f}>✓ {t(f)}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** Text cells as they are; yes/no cells as a mark with its meaning for screen readers. */
async function Row({ label, values }: { label: string; values: (string | boolean)[] }) {
  const t = await getT();
  return (
    <tr>
      <th scope="row" className="px-5 py-3.5 font-medium text-[var(--lp-dark-2)]">
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className="px-5 py-3.5 font-semibold tabular-nums">
          {typeof v === "string" ? (
            v
          ) : (
            <>
              <span aria-hidden="true" className={v ? "text-[var(--lp-orange-ink)]" : "text-[var(--lp-dark-2)]"}>
                {v ? "✓" : "—"}
              </span>
              <span className="sr-only">{v ? t("Incluído") : t("Não incluído")}</span>
            </>
          )}
        </td>
      ))}
    </tr>
  );
}
