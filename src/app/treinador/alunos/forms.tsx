"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { inviteStudentAction, revokeInvitationAction, setStatusAction, updateHealthAction, updateProfileAction } from "./actions";

export function InviteForm() {
  return (
    <ActionForm action={inviteStudentAction} className="flex flex-col gap-3" resetOnSuccess>
      {(s) => (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="E-mail do aluno" name="email" type="email" autoComplete="off" errors={fieldErrors(s, "email")} />
          </div>
          <SubmitButton pendingLabel="Enviando…">Enviar convite</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  return (
    <ActionForm action={revokeInvitationAction} className="flex" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="invitationId" value={invitationId} />
          <SubmitButton variant="ghost" pendingLabel="Cancelando…">
            Cancelar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

type Profile = { goal: string | null; fitnessLevel: string | null; weeklyFrequency: number | null; trainerNotes: string | null };

export function ProfileForm({ memberId, profile }: { memberId: string; profile: Profile }) {
  return (
    <ActionForm action={updateProfileAction}>
      {(s) => (
        <>
          <input type="hidden" name="memberId" value={memberId} />
          <TextAreaField label="Objetivo" name="goal" maxLength={500} rows={2} defaultValue={profile.goal ?? ""} errors={fieldErrors(s, "goal")} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Nível"
              name="fitnessLevel"
              defaultValue={profile.fitnessLevel ?? ""}
              errors={fieldErrors(s, "fitnessLevel")}
              options={[
                { value: "", label: "Não definido" },
                { value: "beginner", label: "Iniciante" },
                { value: "intermediate", label: "Intermediário" },
                { value: "advanced", label: "Avançado" },
              ]}
            />
            <SelectField
              label="Treinos por semana"
              name="weeklyFrequency"
              defaultValue={profile.weeklyFrequency ? String(profile.weeklyFrequency) : ""}
              errors={fieldErrors(s, "weeklyFrequency")}
              options={[{ value: "", label: "Não definido" }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `${n}x` }))]}
            />
          </div>
          <TextAreaField
            label="Anotações do treinador"
            name="trainerNotes"
            maxLength={2000}
            hint="Só você vê estas anotações."
            defaultValue={profile.trainerNotes ?? ""}
            errors={fieldErrors(s, "trainerNotes")}
          />
          <div>
            <SubmitButton pendingLabel="Salvando…">Salvar ficha</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

type Health = { restrictions: string | null; injuries: string | null; medicalNotes: string | null };

export function HealthForm({ memberId, health }: { memberId: string; health: Health | null }) {
  return (
    <ActionForm action={updateHealthAction}>
      {(s) => (
        <>
          <input type="hidden" name="memberId" value={memberId} />
          <TextAreaField label="Restrições de exercício" name="restrictions" maxLength={2000} defaultValue={health?.restrictions ?? ""} errors={fieldErrors(s, "restrictions")} />
          <TextAreaField label="Lesões" name="injuries" maxLength={2000} defaultValue={health?.injuries ?? ""} errors={fieldErrors(s, "injuries")} />
          <TextAreaField label="Observações médicas" name="medicalNotes" maxLength={2000} defaultValue={health?.medicalNotes ?? ""} errors={fieldErrors(s, "medicalNotes")} />
          <div>
            <SubmitButton pendingLabel="Salvando…">Salvar dados de saúde</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

const STATUS_ACTIONS: Record<string, { status: string; label: string; variant: "secondary" | "danger" }[]> = {
  active: [
    { status: "suspended", label: "Suspender acesso", variant: "secondary" },
    { status: "archived", label: "Arquivar aluno", variant: "danger" },
  ],
  suspended: [
    { status: "active", label: "Reativar acesso", variant: "secondary" },
    { status: "archived", label: "Arquivar aluno", variant: "danger" },
  ],
  archived: [{ status: "active", label: "Reativar aluno", variant: "secondary" }],
};

export function StatusActions({ memberId, status }: { memberId: string; status: string }) {
  return (
    <ActionForm action={setStatusAction} className="flex flex-col gap-3">
      {() => (
        <div className="flex flex-wrap gap-2">
          <input type="hidden" name="memberId" value={memberId} />
          {(STATUS_ACTIONS[status] ?? []).map((a) => (
            <SubmitButton key={a.status} name="status" value={a.status} variant={a.variant}>
              {a.label}
            </SubmitButton>
          ))}
        </div>
      )}
    </ActionForm>
  );
}
