import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { daysLeft } from "@/server/billing/access";
import { formatBRL, getBillingOverview } from "@/server/billing/service";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Assinatura" };

const fmtDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

export default async function SubscriptionPage() {
  const actor = await requirePageActor("subscription.read", { allowInactive: true });
  const b = await getBillingOverview(actor);
  const left = daysLeft(b.access.until);
  const s = b.subscription;

  const headline =
    b.access.state === "trial"
      ? `Teste grátis: ${left} ${left === 1 ? "dia restante" : "dias restantes"}`
      : b.access.state === "active"
        ? s?.status === "canceled"
          ? "Assinatura cancelada"
          : "Assinatura ativa"
        : b.access.state === "grace"
          ? "Pagamento pendente"
          : "Acesso pausado";

  return (
    <>
      <PageHeading title="Assinatura" description="Plano da sua consultoria no Cadência." />

      <section aria-label="Situação" className="rounded-[var(--radius-panel)] bg-ink p-6 text-white">
        <p className="text-sm font-semibold text-signal">{s?.planName ?? "Sem plano"}</p>
        <p className="mt-1 font-display text-3xl font-bold">{headline}</p>
        <p className="mt-2 text-sm text-white/70">
          {b.studentsUsed} de {s?.maxStudents ?? 0} vagas de alunos em uso
          {b.access.state === "active" && b.access.until ? ` · ${s?.status === "canceled" ? "acesso até" : "próxima renovação em"} ${fmtDate.format(b.access.until)}` : ""}
          {b.access.state === "trial" && b.access.until ? ` · termina em ${fmtDate.format(b.access.until)}` : ""}
          {b.access.state === "grace" && b.access.until ? ` · o acesso continua até ${fmtDate.format(b.access.until)}` : ""}
        </p>
        {b.access.state === "blocked" && (
          <p className="mt-3 text-sm text-white/85">Você e seus alunos não conseguem usar o app até escolher um plano. Nenhum dado foi apagado.</p>
        )}
      </section>

      <section aria-labelledby="plans-h" className="mt-10">
        <h2 id="plans-h" className="mb-4 font-display text-2xl font-bold">
          Planos
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {b.plans.map((p) => {
            const current = s?.planId === p.id && (b.access.state === "active" || b.access.state === "grace");
            return (
              <li key={p.id} className={`flex flex-col rounded-[var(--radius-panel)] border bg-paper p-5 ${current ? "border-turf" : "border-line"}`}>
                <p className="font-display text-xl font-bold">{p.name}</p>
                <p className="mt-2">
                  <span className="font-display text-4xl font-bold">{formatBRL(p.priceCents)}</span>
                  <span className="text-muted">/mês</span>
                </p>
                <ul className="mt-4 flex-1 space-y-1 text-sm text-ink-soft">
                  <li>Até {p.maxStudents} alunos ativos</li>
                  <li>{Math.round(p.storageQuotaMb / 1024)} GB para vídeos e fotos</li>
                  <li>Treinos, comunidade, ranking e mensagens</li>
                </ul>
                <div className="mt-5">
                  {current ? (
                    <p className="text-sm font-semibold text-turf">Seu plano atual</p>
                  ) : (
                    <p className="text-sm text-muted">Pagamento online por Pix, boleto ou cartão em breve.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
