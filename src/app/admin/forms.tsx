"use client";

import { useState } from "react";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { closeSupportAction, openSupportAction, exerciseVideoAction, planUpdateAction, syncDemosAction, reprocessBillingEventAction, subscriptionOverrideAction, userStatusAction, workspaceStatusAction } from "./actions";

const reasonHint = "Fica registrado na auditoria.";

export function WorkspaceStatusForm({ workspaceId, suspended }: { workspaceId: string; suspended: boolean }) {
  return (
    <ActionForm action={workspaceStatusAction} resetOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
          <Field label="Motivo" name="reason" maxLength={300} hint={reasonHint} errors={fieldErrors(s, "reason")} />
          <div>
            <SubmitButton variant={suspended ? "primary" : "danger"} pendingLabel="Salvando…">
              {suspended ? "Reativar consultoria" : "Suspender consultoria"}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

type PlanOpt = { id: string; name: string };
const OPS = [
  { value: "extend_trial", label: "Estender teste grátis" },
  { value: "grant", label: "Liberar plano pago até uma data (pagamento por fora)" },
  { value: "change_plan", label: "Trocar o plano" },
  { value: "expire", label: "Encerrar assinatura agora" },
] as const;

export function SubscriptionOverrideForm({ workspaceId, plans, trialing }: { workspaceId: string; plans: PlanOpt[]; trialing: boolean }) {
  // No default: each change is an explicit choice, and the choice clears after it is applied.
  const [op, setOp] = useState<(typeof OPS)[number]["value"] | "">("");
  const planOptions = [{ value: "", label: "Escolha…" }, ...plans.map((p) => ({ value: p.id, label: p.name }))];
  return (
    <ActionForm action={subscriptionOverrideAction} resetOnSuccess onSuccess={() => setOp("")}>
      {(s) => (
        <>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Ação</legend>
            {OPS.filter((o) => trialing || o.value !== "extend_trial").map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="op" value={o.value} checked={op === o.value} onChange={() => setOp(o.value)} className="accent-turf" />
                {o.label}
              </label>
            ))}
            {fieldErrors(s, "op") && <span className="text-sm font-medium text-danger">Escolha uma ação.</span>}
          </fieldset>
          {op === "extend_trial" && <Field label="Dias a mais" name="days" type="number" inputMode="numeric" defaultValue="7" errors={fieldErrors(s, "days")} />}
          {(op === "grant" || op === "change_plan") && <SelectField label="Plano" name="planId" required options={planOptions} errors={fieldErrors(s, "planId")} />}
          {op === "grant" && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Válido até
              <input type="date" name="until" required className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 font-normal" />
              {fieldErrors(s, "until") && <span className="font-medium text-danger">{fieldErrors(s, "until")!.join(" ")}</span>}
            </label>
          )}
          <Field label="Motivo" name="reason" maxLength={300} hint={reasonHint} errors={fieldErrors(s, "reason")} />
          <div>
            <SubmitButton variant={op === "expire" ? "danger" : "primary"} pendingLabel="Aplicando…">
              Aplicar
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function UserStatusForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  return (
    <ActionForm action={userStatusAction} className="flex flex-col gap-2" resetOnSuccess>
      {(s) => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">Motivo</span>
            <input name="reason" maxLength={300} placeholder="Motivo (fica na auditoria)" className="h-10 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3" />
            {fieldErrors(s, "reason") && <span className="font-medium text-danger">{fieldErrors(s, "reason")!.join(" ")}</span>}
          </label>
          <SubmitButton variant={suspended ? "secondary" : "danger"} pendingLabel="…">
            {suspended ? "Reativar" : "Suspender"}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function PlanForm({ plan }: { plan: { id: string; code: string; name: string; priceCents: number; maxStudents: number; storageQuotaMb: number; isActive: boolean } }) {
  const price = (plan.priceCents / 100).toFixed(2).replace(".", ",");
  const trial = plan.code === "trial";
  return (
    <ActionForm action={planUpdateAction}>
      {(s) => (
        <>
          <input type="hidden" name="planId" value={plan.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="name" maxLength={40} defaultValue={plan.name} errors={fieldErrors(s, "name")} />
            <Field label="Preço mensal (R$)" name="price" inputMode="decimal" defaultValue={price} hint={trial ? "O teste grátis precisa custar 0,00." : undefined} errors={fieldErrors(s, "price")} />
            <Field label="Máximo de alunos" name="maxStudents" type="number" inputMode="numeric" defaultValue={String(plan.maxStudents)} errors={fieldErrors(s, "maxStudents")} />
            <Field label="Armazenamento (GB)" name="storageGb" type="number" inputMode="numeric" defaultValue={String(Math.round(plan.storageQuotaMb / 1024))} errors={fieldErrors(s, "storageGb")} />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="isActive" defaultChecked={plan.isActive} disabled={trial} className="size-4 accent-turf" />
            Disponível para contratação
            {trial && <input type="hidden" name="isActive" value="on" />}
          </label>
          <div>
            <SubmitButton pendingLabel="Salvando…">Salvar plano</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function ReprocessButton({ eventId }: { eventId: string }) {
  return (
    <ActionForm action={reprocessBillingEventAction} className="flex flex-col gap-1">
      {() => (
        <>
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton variant="secondary" pendingLabel="…">
            Reprocessar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function OpenSupportForm({ workspaceId }: { workspaceId: string }) {
  return (
    <ActionForm action={openSupportAction}>
      {(s) => (
        <>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <TextAreaField label="Motivo e número do chamado" name="reason" maxLength={500} rows={3} errors={fieldErrors(s, "reason")} />
          <SelectField
            label="Duração"
            name="minutes"
            defaultValue="15"
            options={[
              { value: "15", label: "15 minutos" },
              { value: "30", label: "30 minutos" },
              { value: "60", label: "1 hora" },
            ]}
            errors={fieldErrors(s, "minutes")}
          />
          <div>
            <SubmitButton variant="danger" pendingLabel="Abrindo…">
              Abrir acesso de suporte
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function CloseSupportForm({ workspaceId }: { workspaceId: string }) {
  return (
    <ActionForm action={closeSupportAction} className="flex flex-col gap-2">
      {() => (
        <>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <SubmitButton variant="secondary" pendingLabel="Encerrando…">
            Encerrar acesso agora
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ExerciseMediaForm({ exercise }: { exercise: { id: string; name: string; videoUrl: string | null; demoExternalId: string | null; aliases: string[] } }) {
  return (
    <ActionForm action={exerciseVideoAction}>
      {(s) => (
        <>
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID na ExerciseDB" name="demoExternalId" required={false} maxLength={40} defaultValue={exercise.demoExternalId ?? ""} hint="Em branco: sem animação." errors={fieldErrors(s, "demoExternalId")} />
            <Field label="Link do YouTube" name="videoUrl" required={false} maxLength={200} defaultValue={exercise.videoUrl ?? ""} hint="Opcional. Tem prioridade sobre a animação." errors={fieldErrors(s, "videoUrl")} />
          </div>
          <Field label="Outros nomes" name="aliases" required={false} maxLength={600} defaultValue={exercise.aliases.join(", ")} hint="Separados por vírgula. Exercícios de treinadores com esses nomes recebem esta animação." errors={fieldErrors(s, "aliases")} />
          <div>
            <SubmitButton variant="secondary" pendingLabel="Salvando…">
              Salvar
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function SyncDemosButton() {
  return (
    <ActionForm action={syncDemosAction}>
      {() => (
        <div>
          <SubmitButton pendingLabel="Sincronizando… pode levar um minuto">Sincronizar agora</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
