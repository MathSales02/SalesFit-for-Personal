"use client";

import { useState } from "react";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { AnimatedPrice } from "@/components/ui/animated-price";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ANNUAL_DISCOUNT_PERCENT, FEATURE_INFO, FEATURES, FIRST_CHARGE_DELAY_DAYS, MAX_INSTALLMENTS, type BillingCycle } from "@/lib/plan-features";
import { cancelSubscriptionAction, checkoutAction } from "./actions";
import { useT } from "@/i18n/client";

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  annualPriceCents: number | null;
  maxStudents: number;
  storageGb: number;
  features: Record<string, boolean>;
  /** The cycle of the plan the consultancy is on, when this is it. */
  current: BillingCycle | null;
  pending: boolean;
};

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export function CheckoutForm({
  plans,
  needsTaxId,
  defaultPlanId,
  defaultCycle = "monthly",
  inTrial,
}: {
  plans: Plan[];
  needsTaxId: boolean;
  defaultPlanId?: string;
  defaultCycle?: BillingCycle;
  inTrial: boolean;
}) {
  const t = useT();
  const [cycle, setCycle] = useState<BillingCycle>(defaultCycle);
  const [planId, setPlanId] = useState(defaultPlanId ?? "");
  const [installments, setInstallments] = useState(1);
  const yearly = cycle === "yearly";
  const chosen = plans.find((p) => p.id === planId);
  const total = chosen ? (yearly ? chosen.annualPriceCents : chosen.priceCents) : null;
  const split = yearly && installments > 1;

  return (
    <ActionForm action={checkoutAction}>
      {(s) => (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t("Como você quer pagar")}</legend>
            <div className="inline-flex rounded-full border border-line-strong bg-paper p-1">
              {(
                [
                  ["monthly", t("Mensal")],
                  ["yearly", t("Anual, {0}% de desconto", { 0: ANNUAL_DISCOUNT_PERCENT })],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold text-ink-soft has-[:checked]:bg-ink has-[:checked]:text-paper has-focus-visible:outline-2 has-focus-visible:outline-turf">
                  <input
                    type="radio"
                    name="cycle"
                    value={value}
                    checked={cycle === value}
                    onChange={() => {
                      setCycle(value);
                      if (value === "monthly") setInstallments(1);
                    }}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="sr-only">{t("Plano")}</legend>
            <div className="grid gap-4 lg:grid-cols-3">
              {plans.map((p, i) => {
                // Two numbers, each in its fixed place: what is charged, and what it comes to per month.
                // Switching between monthly and yearly only runs the digits; nothing else moves.
                const byYear = yearly && p.annualPriceCents !== null;
                const charged = byYear ? p.annualPriceCents! : p.priceCents;
                const perMonth = byYear ? Math.round(p.annualPriceCents! / 12) : p.priceCents;
                const previous = i > 0 ? plans[i - 1]! : null;
                const added = FEATURES.filter((f) => p.features[f] && !previous?.features[f]);
                const isCurrent = p.current === cycle && !p.pending;
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-5 has-[:checked]:border-turf has-[:checked]:ring-2 has-[:checked]:ring-turf/25"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-display text-xl font-bold">{p.name}</span>
                      <input type="radio" name="planId" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} className="mt-1.5 size-4 accent-turf" />
                    </span>
                    <span className="mt-2">
                      <AnimatedPrice cents={charged} className="font-display text-4xl font-bold" />
                      <span className="text-muted">{byYear ? t("/ano") : t("/mês")}</span>
                    </span>
                    <span className="mt-1 text-sm text-ink-soft">
                      <AnimatedPrice cents={perMonth} className="font-semibold text-ink" /> {t("por mês")}
                    </span>
                    <span className="mt-4 flex-1 space-y-1.5 text-sm text-ink-soft">
                      <span className="block font-semibold text-ink">{t("Até")} {p.maxStudents} {t("alunos")}</span>
                      <span className="block">{p.storageGb} {t("GB para vídeos e fotos")}</span>
                      <span className="block">{previous ? t("Tudo do {0}", { 0: previous.name.replace(/^SalesFit\s+/, "") }) : t("Alunos, treinos, biblioteca com animações, histórico, check-in e mensagens com os alunos")}</span>
                      {added.map((f) => (
                        <span key={f} className="block">
                          {t(FEATURE_INFO[f].label)}
                        </span>
                      ))}
                    </span>
                    {(isCurrent || p.pending) && <span className="mt-4 text-sm font-semibold text-turf">{isCurrent ? t("Seu plano atual") : t("Aguardando pagamento")}</span>}
                  </label>
                );
              })}
            </div>
            {fieldErrors(s, "planId") && <p className="mt-2 text-sm font-medium text-danger">{fieldErrors(s, "planId")!.join(" ")}</p>}
            {fieldErrors(s, "cycle") && <p className="mt-2 text-sm font-medium text-danger">{fieldErrors(s, "cycle")!.join(" ")}</p>}
          </fieldset>

          {/* Always in its place, so choosing yearly does not push the rest of the form down. */}
          <div className="max-w-sm">
            <label htmlFor="installments" className="text-sm font-semibold text-ink">
              {t("Parcelas")}
            </label>
            {yearly ? (
              <select
                id="installments"
                name="installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 text-base outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
              >
                {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? t("À vista (Pix, boleto ou cartão)") : t("{0}x no cartão de crédito{1}", { 0: n, 1: total ? ` de ${brl(Math.round(total / n))}` : "" })}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="installments" value="1" />
                <select id="installments" disabled className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface-subtle px-3 text-base text-ink-soft">
                  <option>{t("Cobrança mensal, sem parcelas")}</option>
                </select>
              </>
            )}
            <p className="mt-1.5 min-h-10 text-sm text-muted">
              {!yearly
                ? t("No anual você pode parcelar em até 12x no cartão.")
                : split
                  ? t("Parcelado, o plano vale por 12 meses e não renova sozinho: perto do fim você escolhe de novo.")
                  : t("À vista, o plano renova a cada 12 meses. Cancele quando quiser.")}
            </p>
            {fieldErrors(s, "installments") && <p className="mt-1 text-sm font-medium text-danger">{fieldErrors(s, "installments")!.join(" ")}</p>}
          </div>

          {needsTaxId && (
            <div className="max-w-sm">
              <Field
                label={t("CPF ou CNPJ de quem paga")}
                name="cpfCnpj"
                inputMode="numeric"
                maxLength={20}
                hint={t("Exigido para emitir a cobrança. Não fica guardado no SalesFit.")}
                errors={fieldErrors(s, "cpfCnpj")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel={t("Gerando cobrança…")}>{t("Continuar para o pagamento")}</SubmitButton>
            <span className="text-sm text-muted">
              {inTrial ? t("Você continua no teste: a primeira cobrança vence em {0} dias. ", { 0: FIRST_CHARGE_DELAY_DAYS }) : ""}
              {yearly ? "" : t("Pix, boleto ou cartão. Renovação mensal, cancele quando quiser.")}
            </span>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CancelForm({ paid }: { paid: boolean }) {
  const t = useT();
  return (
    <ActionForm action={cancelSubscriptionAction}>
      {(s) => (
        <>
          <p className="text-sm text-muted">
            {paid ? t("As renovações param. Você e seus alunos continuam usando até o fim do período já pago.") : t("A cobrança pendente é cancelada.")}
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="confirm" className="size-4 accent-turf" />
            {t("Quero cancelar a assinatura")}
          </label>
          {fieldErrors(s, "confirm") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "confirm")!.join(" ")}</p>}
          <div>
            <SubmitButton variant="danger" pendingLabel={t("Cancelando…")}>
              {t("Cancelar assinatura")}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
