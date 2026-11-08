import Link from "next/link";
import type { PublicPlan } from "@/server/billing/public-plans";
import { PLAN_FEATURES, RECOMMENDED_PLAN } from "./landing-content";
import { PricingMotion } from "./pricing-motion";

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;

/**
 * Prices and limits come from the database (the same plans the checkout charges).
 * Every plan includes every feature; plans differ in students and storage.
 */
export function Pricing({ plans, trial, trialDays }: { plans: PublicPlan[]; trial: PublicPlan | null; trialDays: number }) {
  if (plans.length === 0) return null;
  const recommended = plans.some((p) => p.code === RECOMMENDED_PLAN) ? RECOMMENDED_PLAN : null;

  return (
    <section id="precos" aria-labelledby="price-h" className="lp-light relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 id="price-h" className="lp-display max-w-3xl text-[2.6rem] sm:text-[4rem]">
          Um plano para cada tamanho de agenda.
        </h2>
        <p className="mt-5 max-w-2xl text-lg text-[var(--lp-dark-2)]">
          Todos os recursos em todos os planos. A diferença é quantos alunos você atende e o espaço para vídeos e fotos. Cobrança mensal por Pix, boleto ou cartão.
        </p>

        <PricingMotion>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => {
              const featured = p.code === recommended;
              return (
                <li key={p.code} data-card="" className={`relative flex flex-col rounded-[var(--lp-radius)] p-6 ${featured ? "bg-[var(--lp-ink)] text-white" : "bg-white text-[var(--lp-dark)]"}`}>
                  {featured && <span className="absolute -top-3 left-6 rounded-full bg-[var(--lp-orange)] px-3 py-1 text-xs font-bold text-[var(--lp-ink)]">Recomendado</span>}
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-1">
                    <span className="lp-display text-[2.4rem] lg:text-[2.1rem] xl:text-[2.3rem]">{brl(p.priceCents)}</span>
                    <span className={featured ? "text-[var(--lp-text-2)]" : "text-[var(--lp-dark-2)]"}>/mês</span>
                  </p>
                  <ul className={`mt-6 flex flex-1 flex-col gap-2.5 text-[0.95rem] ${featured ? "text-[var(--lp-text-2)]" : "text-[var(--lp-dark-2)]"}`}>
                    <li>
                      <strong className={featured ? "text-white" : "text-[var(--lp-dark)]"}>Até {p.maxStudents} alunos</strong>
                    </li>
                    <li>
                      <strong className={featured ? "text-white" : "text-[var(--lp-dark)]"}>{gb(p.storageQuotaMb)}</strong> para vídeos e fotos
                    </li>
                    <li>Todos os recursos do SalesFit</li>
                  </ul>
                  <Link
                    href="/cadastro"
                    className={`mt-7 inline-flex h-12 items-center justify-center rounded-full font-semibold transition-colors ${
                      featured ? "bg-[var(--lp-orange)] text-[var(--lp-ink)] hover:bg-white" : "bg-[var(--lp-dark)] text-white hover:bg-[var(--lp-orange)] hover:text-[var(--lp-ink)]"
                    }`}
                  >
                    Começar com {p.name}
                    <span className="sr-only"> ({trialDays} dias grátis)</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </PricingMotion>

        <p className="mt-6 max-w-3xl text-sm text-[var(--lp-dark-2)]">
          Todos começam com {trialDays} dias de teste grátis{trial ? `, com até ${trial.maxStudents} alunos` : ""}, sem cartão. Você escolhe o plano dentro do app, em Assinatura, quando quiser.
        </p>

        {/* Comparison: a real table from md up; on phones, one block per row (no sideways scroll). */}
        <h3 className="mt-16 text-xl font-semibold">Compare os planos</h3>
        <div className="mt-5 hidden overflow-hidden rounded-[var(--lp-radius)] bg-white md:block">
          <table className="w-full text-left text-[0.95rem]">
            <caption className="sr-only">Comparação dos planos do SalesFit</caption>
            <thead>
              <tr className="border-b border-[var(--lp-line-light)]">
                <th scope="col" className="px-5 py-4 font-semibold">
                  <span className="sr-only">Item</span>
                </th>
                {plans.map((p) => (
                  <th key={p.code} scope="col" className="px-5 py-4 font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lp-line-light)]">
              <Row label="Preço mensal" values={plans.map((p) => brl(p.priceCents))} />
              <Row label="Alunos (ativos e convites)" values={plans.map((p) => `Até ${p.maxStudents}`)} />
              <Row label="Espaço para vídeos e fotos" values={plans.map((p) => gb(p.storageQuotaMb))} />
              {PLAN_FEATURES.map((f) => (
                <Row key={f} label={f} values={plans.map(() => "Incluído")} check />
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-5 flex flex-col gap-3 md:hidden">
          {[
            ["Preço mensal", plans.map((p) => brl(p.priceCents))],
            ["Alunos (ativos e convites)", plans.map((p) => `Até ${p.maxStudents}`)],
            ["Espaço para vídeos e fotos", plans.map((p) => gb(p.storageQuotaMb))],
          ].map(([label, values]) => (
            <div key={label as string} className="rounded-2xl bg-white p-4">
              <dt className="text-sm font-semibold">{label as string}</dt>
              <dd className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {(values as string[]).map((v, i) => (
                  <span key={plans[i]!.code} className="flex justify-between gap-2">
                    <span className="text-[var(--lp-dark-2)]">{plans[i]!.name}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
          <div className="rounded-2xl bg-white p-4">
            <dt className="text-sm font-semibold">Incluído em todos os planos</dt>
            <dd className="mt-2">
              <ul className="flex flex-col gap-1.5 text-sm text-[var(--lp-dark-2)]">
                {PLAN_FEATURES.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function Row({ label, values, check = false }: { label: string; values: string[]; check?: boolean }) {
  return (
    <tr>
      <th scope="row" className="px-5 py-3.5 font-medium text-[var(--lp-dark-2)]">
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className="px-5 py-3.5 font-semibold tabular-nums">
          {check ? (
            <>
              <span aria-hidden="true" className="text-[var(--lp-orange-ink)]">
                ✓
              </span>
              <span className="sr-only">{v}</span>
            </>
          ) : (
            v
          )}
        </td>
      ))}
    </tr>
  );
}
