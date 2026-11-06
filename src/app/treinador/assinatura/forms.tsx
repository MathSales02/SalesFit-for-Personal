"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { cancelSubscriptionAction, checkoutAction } from "./actions";

type Plan = { id: string; name: string; price: string; maxStudents: number; storageGb: number; current: boolean; pending: boolean };

export function CheckoutForm({ plans, needsTaxId, defaultPlanId }: { plans: Plan[]; needsTaxId: boolean; defaultPlanId?: string }) {
  return (
    <ActionForm action={checkoutAction}>
      {(s) => (
        <>
          <fieldset>
            <legend className="sr-only">Plano</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {plans.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer flex-col rounded-[var(--radius-panel)] border border-line bg-paper p-5 has-[:checked]:border-turf has-[:checked]:ring-2 has-[:checked]:ring-turf/25"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-xl font-bold">{p.name}</span>
                    <input type="radio" name="planId" value={p.id} defaultChecked={p.id === defaultPlanId} className="mt-1.5 size-4 accent-turf" />
                  </span>
                  <span className="mt-2">
                    <span className="font-display text-4xl font-bold">{p.price}</span>
                    <span className="text-muted">/mês</span>
                  </span>
                  <span className="mt-4 flex-1 space-y-1 text-sm text-ink-soft">
                    <span className="block">Até {p.maxStudents} alunos ativos</span>
                    <span className="block">{p.storageGb} GB para vídeos e fotos</span>
                    <span className="block">Treinos, comunidade, ranking e mensagens</span>
                  </span>
                  {(p.current || p.pending) && (
                    <span className="mt-4 text-sm font-semibold text-turf">{p.current ? "Seu plano atual" : "Aguardando pagamento"}</span>
                  )}
                </label>
              ))}
            </div>
            {fieldErrors(s, "planId") && <p className="mt-2 text-sm font-medium text-danger">{fieldErrors(s, "planId")!.join(" ")}</p>}
          </fieldset>
          {needsTaxId && (
            <div className="max-w-sm">
              <Field
                label="CPF ou CNPJ de quem paga"
                name="cpfCnpj"
                inputMode="numeric"
                maxLength={20}
                hint="Exigido para emitir a cobrança. Não fica guardado no Cadência."
                errors={fieldErrors(s, "cpfCnpj")}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingLabel="Gerando cobrança…">Continuar para o pagamento</SubmitButton>
            <span className="text-sm text-muted">Pix, boleto ou cartão. Renovação mensal, cancele quando quiser.</span>
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
