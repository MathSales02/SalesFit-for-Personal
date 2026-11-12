import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { daysLeft } from "@/server/billing/access";
import { asaasEnabled } from "@/server/billing/asaas";
import { listInvoices, needsTaxId } from "@/server/billing/provider";
import { formatBRL, getBillingOverview } from "@/server/billing/service";
import { requirePageActor } from "@/server/http/next";
import { CancelForm, CheckoutForm } from "./forms";

export const metadata: Metadata = { title: "Assinatura" };

const fmtDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });
const fmtDay = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Aguardando pagamento", tone: "text-ink" },
  CONFIRMED: { label: "Pago", tone: "text-turf" },
  RECEIVED: { label: "Pago", tone: "text-turf" },
  RECEIVED_IN_CASH: { label: "Pago", tone: "text-turf" },
  OVERDUE: { label: "Vencida", tone: "text-danger" },
  REFUNDED: { label: "Estornada", tone: "text-muted" },
  REFUND_REQUESTED: { label: "Estorno solicitado", tone: "text-muted" },
  CHARGEBACK_REQUESTED: { label: "Contestada", tone: "text-danger" },
};
const PAID = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("subscription.read", { allowInactive: true });
  const sp = await searchParams;
  const online = asaasEnabled();
  const [b, invoices, taxId] = await Promise.all([getBillingOverview(actor), listInvoices(actor), online ? needsTaxId(actor) : false]);
  const left = daysLeft(b.access.until);
  const s = b.subscription;
  const openInvoice = invoices.find((i) => !PAID.has(i.status) && i.invoiceUrl && i.status !== "REFUNDED");
  const pendingPlan = s?.pendingPlanId ? b.plans.find((p) => p.id === s.pendingPlanId) : undefined;
  const paidActive = b.access.state === "active" && s?.status === "active";
  // A year bought in installments is one purchase: it ends on its date instead of renewing.
  const fixedYear = !!s?.providerInstallmentId && !s.providerSubscriptionId && !s.pendingPlanId;
  const yearly = s?.billingCycle === "yearly";

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
      <PageHeading title="Assinatura" description="Plano da sua consultoria no SalesFit." />

      {sp.cobranca === "gerada" && (
        <div className="mb-6">
          <Notice tone="success">
            Cobrança gerada. {openInvoice ? "Pague pelo link abaixo; o acesso é liberado assim que o pagamento for confirmado." : "Ela aparece aqui em instantes; atualize a página."}
          </Notice>
        </div>
      )}
      {sp.cancelada === "1" && (
        <div className="mb-6">
          <Notice tone="info">Assinatura cancelada. Nenhuma nova cobrança será feita.</Notice>
        </div>
      )}

      <section aria-label="Situação" className="rounded-[var(--radius-panel)] bg-night p-6 text-white">
        <p className="text-sm font-semibold text-signal">{s?.planName ?? "Sem plano"}</p>
        <p className="mt-1 font-display text-3xl font-bold">{headline}</p>
        <p className="mt-2 text-sm text-white/70">
          {b.studentsUsed} de {s?.maxStudents ?? 0} vagas de alunos em uso
          {b.access.state === "active" && yearly ? " · plano anual" : ""}
          {b.access.state === "active" && b.access.until ? ` · ${s?.status === "canceled" || fixedYear ? "acesso até" : "próxima renovação em"} ${fmtDate.format(b.access.until)}` : ""}
          {b.access.state === "trial" && b.access.until ? ` · termina em ${fmtDate.format(b.access.until)}` : ""}
          {b.access.state === "grace" && b.access.until ? ` · o acesso continua até ${fmtDate.format(b.access.until)}` : ""}
        </p>
        {b.access.state === "blocked" && (
          <p className="mt-3 text-sm text-white/85">Você e seus alunos não conseguem usar o app até escolher um plano. Nenhum dado foi apagado.</p>
        )}
        {fixedYear && paidActive && <p className="mt-3 text-sm text-white/85">Comprado parcelado: não renova sozinho. Perto do fim, escolha o plano de novo aqui.</p>}
        {pendingPlan && (
          <p className="mt-3 text-sm text-white/85">
            {paidActive ? `Muda para o plano ${pendingPlan.name}${s?.pendingCycle === "yearly" ? " anual" : ""} no fim do período atual.` : `Plano ${pendingPlan.name}${s?.pendingCycle === "yearly" ? " anual" : ""} aguardando o pagamento.`}
          </p>
        )}
        {openInvoice && (
          <a
            href={openInvoice.invoiceUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-control)] bg-signal px-4 font-semibold text-on-accent"
          >
            Pagar {formatBRL(openInvoice.valueCents)} (vence {fmtDay(openInvoice.dueDate)})
          </a>
        )}
      </section>

      <section aria-labelledby="plans-h" className="mt-10">
        <h2 id="plans-h" className="mb-4 font-display text-2xl font-bold">
          {paidActive ? "Trocar de plano" : "Escolha seu plano"}
        </h2>
        {online ? (
          <CheckoutForm
            needsTaxId={taxId}
            defaultPlanId={s?.pendingPlanId ?? undefined}
            defaultCycle={s?.pendingCycle ?? (paidActive ? s?.billingCycle : undefined) ?? "monthly"}
            inTrial={b.access.state === "trial"}
            plans={b.plans.map((p) => ({
              id: p.id,
              name: p.name,
              priceCents: p.priceCents,
              annualPriceCents: p.annualPriceCents,
              maxStudents: p.maxStudents,
              storageGb: Math.round(p.storageQuotaMb / 1024),
              features: p.features,
              current: paidActive && s?.planId === p.id && !s.pendingPlanId ? s.billingCycle : null,
              pending: s?.pendingPlanId === p.id,
            }))}
          />
        ) : (
          <p className="text-sm text-muted">O pagamento online ainda não está disponível. Fale com o suporte para contratar.</p>
        )}
      </section>

      {invoices.length > 0 && (
        <section aria-labelledby="inv-h" className="mt-10">
          <h2 id="inv-h" className="mb-3 font-display text-xl font-bold">
            Cobranças
          </h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {invoices.map((i) => {
              const st = INVOICE_STATUS[i.status] ?? { label: i.status, tone: "text-muted" };
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold tabular-nums">{formatBRL(i.valueCents)}</span>
                    <span className="text-muted"> · vencimento {fmtDay(i.dueDate)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`font-semibold ${st.tone}`}>{st.label}</span>
                    {i.invoiceUrl && (
                      <a href={i.invoiceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-turf hover:underline">
                        {PAID.has(i.status) ? "Comprovante" : "Pagar"}
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {online && s?.provider === "asaas" && (s.providerSubscriptionId || (s.providerInstallmentId && s.pendingPlanId)) && (
        <details className="mt-10 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          <summary className="cursor-pointer font-semibold">Cancelar assinatura</summary>
          <div className="mt-4">
            <CancelForm paid={paidActive || s.status === "past_due"} />
          </div>
        </details>
      )}
    </>
  );
}
