"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { MUSCLE_GROUPS } from "@/lib/validation/exercises";
import { archiveExerciseAction, copyExerciseAction, createExerciseAction, removeVideoAction, updateExerciseAction } from "./actions";

type ExerciseValues = { name: string; muscleGroup: string; equipment: string | null; description: string | null; instructions: string | null };

const groupOptions = [{ value: "", label: "Escolha…" }, ...MUSCLE_GROUPS.map(([value, label]) => ({ value, label }))];

export function ExerciseForm({ exerciseId, values }: { exerciseId?: string; values?: ExerciseValues }) {
  return (
    <ActionForm action={exerciseId ? updateExerciseAction : createExerciseAction}>
      {(s) => (
        <>
          {exerciseId && <input type="hidden" name="exerciseId" value={exerciseId} />}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome" name="name" maxLength={80} defaultValue={values?.name} errors={fieldErrors(s, "name")} />
            <SelectField label="Grupo muscular" name="muscleGroup" required options={groupOptions} defaultValue={values?.muscleGroup ?? ""} errors={fieldErrors(s, "muscleGroup")} />
          </div>
          <Field label="Equipamento" name="equipment" required={false} maxLength={80} defaultValue={values?.equipment ?? ""} errors={fieldErrors(s, "equipment")} />
          <TextAreaField label="Descrição" name="description" maxLength={1000} rows={2} defaultValue={values?.description ?? ""} errors={fieldErrors(s, "description")} />
          <TextAreaField
            label="Como executar"
            name="instructions"
            maxLength={3000}
            rows={5}
            hint="Posição inicial, movimento e cuidados. É o que o aluno lê durante o treino."
            defaultValue={values?.instructions ?? ""}
            errors={fieldErrors(s, "instructions")}
          />
          <div>
            <SubmitButton pendingLabel="Salvando…">{exerciseId ? "Salvar exercício" : "Criar exercício"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

function IdButton({
  action,
  exerciseId,
  label,
  pendingLabel,
  variant,
}: {
  action: typeof copyExerciseAction;
  exerciseId: string;
  label: string;
  pendingLabel: string;
  variant: "primary" | "secondary" | "danger";
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-3">
      {() => (
        <div>
          <input type="hidden" name="exerciseId" value={exerciseId} />
          <SubmitButton variant={variant} pendingLabel={pendingLabel}>
            {label}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export const CopyExerciseButton = ({ exerciseId }: { exerciseId: string }) => (
  <IdButton action={copyExerciseAction} exerciseId={exerciseId} label="Copiar para minha biblioteca" pendingLabel="Copiando…" variant="primary" />
);
export const ArchiveExerciseButton = ({ exerciseId }: { exerciseId: string }) => (
  <IdButton action={archiveExerciseAction} exerciseId={exerciseId} label="Arquivar exercício" pendingLabel="Arquivando…" variant="danger" />
);
export const RemoveVideoButton = ({ exerciseId }: { exerciseId: string }) => (
  <IdButton action={removeVideoAction} exerciseId={exerciseId} label="Remover vídeo" pendingLabel="Removendo…" variant="secondary" />
);
