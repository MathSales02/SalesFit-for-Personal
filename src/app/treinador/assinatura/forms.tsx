"use client";

import { useState } from "react";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ANNUAL_DISCOUNT_PERCENT, FEATURE_INFO, FEATURES, FIRST_CHARGE_DELAY_DAYS, MAX_INSTALLMENTS, type BillingCycle } from "@/lib/plan-features";
import { cancelSubscriptionAction, checkoutAction } from "./actions";

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
            <legend className="mb-2 text-sm font-semibold">Como você quer pagar</legend>
            <div className="inline-flex rounded-full border border-line-strong bg-paper p-1">
              {(
                [
                  ["monthly", "Mensal"],
                  ["yearly", `Anual, ${ANNUAL_DISCOUNT_PERCENT}% de desconto`],
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
            <legend className="sr-only">Plano</legend>
            <div className="grid gap-4 lg:grid-cols-3">
              {plans.map((p, i) => {
                const price = yearly ? p.annualPriceCents : p.priceCents;
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
                      <span className="font-display text-4xl font-bold">{price === null ? "—" : brl(price)}</span>
                      <span className="text-muted">{yearly ? "/ano" : "/mês"}</span>
                    </span>
                    {yearly && price !== null && <span className="mt-1 text-sm text-ink-soft">Equivale a {brl(Math.round(price / 12))} por mês</span>}
                    <span className="mt-4 flex-1 space-y-1.5 text-sm text-ink-soft">
                      <span className="block font-semibold text-ink">Até {p.maxStudents} alunos</span>
                      <span className="block">{p.storageGb} GB para vídeos e fotos</span>
                      <span className="block">{previous ? `Tudo do ${previous.name.replace(/^SalesFit\s+/, "")}` : "Alunos, treinos, biblioteca com animações, histórico, check-in e mensagens com os alunos"}</span>
                      {added.map((f) => (
                        <span key={f} className="block">
                          {FEATURE_INFO[f].label}
                        </span>
                      ))}
                    </span>
                    {(isCurrent || p.pending) && <span className="mt-4 text-sm font-semibold text-turf">{isCurrent ? "Seu plano atual" : "Aguardando pagamento"}</span>}
                  </label>
                );
              })}
            </div>
            {fieldErrors(s, "planId") && <p className="mt-2 text-sm font-medium text-danger">{fieldErrors(s, "planId")!.join(" ")}</p>}
            {fieldErrors(s, "cycle") && <p className="mt-2 text-sm font-medium text-danger">{fieldErrors(s, "cycle")!.join(" ")}</p>}
          </fieldset>

          {yearly ? (
            <div className="max-w-sm">
              <label htmlFor="installments" className="text-sm font-semibold text-ink">
                Parcelas
              </label>
              <select
                id="installments"
                name="installments"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 text-base outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
              >
                {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "À vista (Pix, boleto ou cartão)" : `${n}x no cartão de crédito${total ? ` de ${brl(Math.round(total / n))}` : ""}`}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-sm text-muted">
                {split ? "Parcelado, o plano vale por 12 meses e não renova sozinho: perto do fim você escolhe de novo." : "À vista, o plano renova a cada 12 meses. Cancele quando quiser."}
              </p>
              {fieldErrors(s, "installments") && <p className="mt-1 text-sm font-medium text-danger">{fieldErrors(s, "installments")!.join(" ")}</p>}
            </div>
          ) : (
            <input type="hidden" name="installments" value="1" />
          )}

          {needsTaxId && (
            <div className="max-w-sm">
              <Field
                label="CPF ou CNPJ de quem paga"
                name="cpfCnpj"
                inputMode="numeric"
                maxLength={20}
                hint="Exigido para emitir a cobrança. Não fica guardado no SalesFit."
                errors={fieldErrors(s, "cpfCnpj")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Gerando cobrança…">Continuar para o pagamento</SubmitButton>
            <span className="text-sm text-muted">
              {inTrial ? `Você continua no teste: a primeira cobrança vence em ${FIRST_CHARGE_DELAY_DAYS} dias. ` : ""}
              {yearly ? "" : "Pix, boleto ou cartão. Renovação mensal, cancele quando quiser."}
            </span>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CancelForm({ paid }: { paid: boolean }) {
  return (
    <ActionForm action={cancelSubscriptionAction}>
      {(s) => (
        <>
          <p className="text-sm text-muted">
            {paid ? "As renovações param. Você e seus alunos continuam usando até o fim do período já pago." : "A cobrança pendente é cancelada."}
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="confirm" className="size-4 accent-turf" />
            Quero cancelar a assinatura
          </label>
          {fieldErrors(s, "confirm") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "confirm")!.join(" ")}</p>}
          <div>
            <SubmitButton variant="danger" pendingLabel="Cancelando…">
              Cancelar assinatura
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
