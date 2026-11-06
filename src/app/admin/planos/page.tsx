import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { listPlansAdmin } from "@/server/admin/service";
import { formatBRL } from "@/server/billing/service";
import { requirePageActor } from "@/server/http/next";
import { PlanForm } from "../forms";

export const metadata: Metadata = { title: "Planos" };

export default async function PlansPage() {
  const actor = await requirePageActor("admin.plans.manage");
  const plans = await listPlansAdmin(actor);
  return (
    <>
      <PageHeading
        title="Planos"
        description="Preço e limites de cada plano. Um novo preço vale para novas assinaturas; assinaturas já criadas no provedor de pagamento mantêm o valor até serem refeitas."
      />
      <div className="flex flex-col gap-6">
        {plans.map((p) => (
          <section key={p.id} aria-label={p.name} className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl font-bold">
                {p.name} <span className="text-sm font-normal text-muted">({p.code})</span>
              </h2>
              <p className="text-sm text-muted">
                {formatBRL(p.priceCents)}/mês · {p.subscribers} {p.subscribers === 1 ? "consultoria" : "consultorias"}
                {!p.isActive && <span className="ml-2 font-semibold text-danger">indisponível</span>}
              </p>
            </div>
            <PlanForm plan={p} />
          </section>
        ))}
      </div>
    </>
  );
}
