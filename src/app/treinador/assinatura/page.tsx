import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { daysLeft } from "@/server/billing/access";
import { asaasEnabled } from "@/server/billing/asaas";
import { listInvoices, needsTaxId } from "@/server/billing/provider";
import { formatBRL, getBillingOverview } from "@/server/billing/service";
import { requirePageActor } from "@/server/http/next";
import { CancelForm, CheckoutForm } from "./forms";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Assinatura") };
}

const fmtDate = { format: (d: Date | number) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(d) };
const fmtDay = (iso: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

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
  const t = await getT();
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
      ? t("Teste grátis: {0} {1}", { 0: left, 1: left === 1 ? t("dia restante") : t("dias restantes") })
      : b.access.state === "active"
        ? s?.status === "canceled"
          ? t("Assinatura cancelada")
          : t("Assinatura ativa")
        : b.access.state === "grace"
          ? t("Pagamento pendente")
          : t("Acesso pausado");

  return (
    <>
      <PageHeading title={t("Assinatura")} description={t("Plano da sua consultoria no SalesFit.")} />

      {sp.cobranca === "gerada" && (
        <div className="mb-6">
          <Notice tone="success">
            {t("Cobrança gerada.")} {openInvoice ? t("Pague pelo link abaixo; o acesso é liberado assim que o pagamento for confirmado.") : t("Ela aparece aqui em instantes; atualize a página.")}
          </Notice>
        </div>
      )}
      {sp.cancelada === "1" && (
        <div className="mb-6">
          <Notice tone="info">{t("Assinatura cancelada. Nenhuma nova cobrança será feita.")}</Notice>
        </div>
      )}

      <section aria-label={t("Situação")} className="rounded-[var(--radius-panel)] bg-night p-6 text-white">
        <p className="text-sm font-semibold text-signal">{s?.planName ? t(s.planName) : t("Sem plano")}</p>
        <p className="mt-1 font-display text-3xl font-bold">{headline}</p>
        <p className="mt-2 text-sm text-white/70">
          {b.studentsUsed} {t("de")} {s?.maxStudents ?? 0} {t("vagas de alunos em uso")}
          {b.access.state === "active" && yearly ? t(" · plano anual") : ""}
          {b.access.state === "active" && b.access.until ? ` · ${s?.status === "canceled" || fixedYear ? t("acesso até") : t("próxima renovação em")} ${fmtDate.format(b.access.until)}` : ""}
          {b.access.state === "trial" && b.access.until ? t(" · termina em {0}", { 0: fmtDate.format(b.access.until) }) : ""}
          {b.access.state === "grace" && b.access.until ? t(" · o acesso continua até {0}", { 0: fmtDate.format(b.access.until) }) : ""}
        </p>
        {b.access.state === "blocked" && (
          <p className="mt-3 text-sm text-white/85">{t("Você e seus alunos não conseguem usar o app até escolher um plano. Nenhum dado foi apagado.")}</p>
        )}
        {fixedYear && paidActive && <p className="mt-3 text-sm text-white/85">{t("Comprado parcelado: não renova sozinho. Perto do fim, escolha o plano de novo aqui.")}</p>}
        {pendingPlan && (
          <p className="mt-3 text-sm text-white/85">
            {paidActive ? t("Muda para o plano {0}{1} no fim do período atual.", { 0: pendingPlan.name, 1: s?.pendingCycle === "yearly" ? t(" anual") : "" }) : t("Plano {0}{1} aguardando o pagamento.", { 0: pendingPlan.name, 1: s?.pendingCycle === "yearly" ? t(" anual") : "" })}
          </p>
        )}
        {openInvoice && (
          <a
            href={openInvoice.invoiceUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-control)] bg-signal px-4 font-semibold text-on-accent"
          >
            {t("Pagar")} {formatBRL(openInvoice.valueCents)} {t("(vence")} {fmtDay(openInvoice.dueDate)})
          </a>
        )}
      </section>

      <section aria-labelledby="plans-h" className="mt-10">
        <h2 id="plans-h" className="mb-4 font-display text-2xl font-bold">
          {paidActive ? t("Trocar de plano") : t("Escolha seu plano")}
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
          <p className="text-sm text-muted">{t("O pagamento online ainda não está disponível. Fale com o suporte para contratar.")}</p>
        )}
      </section>

      {invoices.length > 0 && (
        <section aria-labelledby="inv-h" className="mt-10">
          <h2 id="inv-h" className="mb-3 font-display text-xl font-bold">
            {t("Cobranças")}
          </h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {invoices.map((i) => {
              const st = INVOICE_STATUS[i.status] ?? { label: i.status, tone: "text-muted" };
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold tabular-nums">{formatBRL(i.valueCents)}</span>
                    <span className="text-muted"> {t("· vencimento")} {fmtDay(i.dueDate)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`font-semibold ${st.tone}`}>{t(st.label)}</span>
                    {i.invoiceUrl && (
                      <a href={i.invoiceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-turf hover:underline">
                        {PAID.has(i.status) ? t("Comprovante") : t("Pagar")}
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
          <summary className="cursor-pointer font-semibold">{t("Cancelar assinatura")}</summary>
          <div className="mt-4">
            <CancelForm paid={paidActive || s.status === "past_due"} />
          </div>
        </details>
      )}
    </>
  );
}
