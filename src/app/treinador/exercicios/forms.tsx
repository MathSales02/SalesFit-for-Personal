"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import { useState } from "react";
import { DIFFICULTIES, MUSCLE_GROUPS } from "@/lib/validation/exercises";
import { archiveExerciseAction, copyExerciseAction, createExerciseAction, removeVideoAction, updateExerciseAction } from "./actions";
import { useT } from "@/i18n/client";

type ExerciseValues = {
  name: string;
  muscleGroup: string;
  equipment: string | null;
  description: string | null;
  instructions: string | null;
  secondaryMuscles?: string[];
  difficulty?: string | null;
  videoUrl?: string | null;
  tips?: string | null;
  commonMistakes?: string | null;
};

const difficultyOptions = [{ value: "", label: "Não informado" }, ...DIFFICULTIES.map(([value, label]) => ({ value, label }))];
const groupOptions = [{ value: "", label: "Escolha…" }, ...MUSCLE_GROUPS.map(([value, label]) => ({ value, label }))];

/** Other muscles the exercise trains. Sent as one comma-separated field. */
function SecondaryMuscles({ initial, errors }: { initial: string[]; errors?: string[] }) {
  const t = useT();
  const [chosen, setChosen] = useState<string[]>(initial);
  const toggle = (g: string) => setChosen((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{t("Grupos musculares secundários")}</legend>
      <input type="hidden" name="secondaryMuscles" value={chosen.join(",")} />
      <div className="flex flex-wrap gap-2">
        {MUSCLE_GROUPS.map(([g, label]) => {
          const on = chosen.includes(g);
          return (
            <label
              key={g}
              className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-turf ${
                on ? "border-ink bg-ink font-semibold text-paper" : "border-line-strong text-ink-soft hover:border-ink-soft"
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(g)} className="sr-only" />
              {t(label)}
            </label>
          );
        })}
      </div>
      {errors?.length ? <p className="mt-2 text-sm font-medium text-danger">{errors.join(" ")}</p> : <p className="mt-2 text-sm text-muted">{t("Opcional. Outros músculos que o exercício também trabalha.")}</p>}
    </fieldset>
  );
}

export function ExerciseForm({ exerciseId, values }: { exerciseId?: string; values?: ExerciseValues }) {
  const t = useT();
  return (
    <ActionForm action={exerciseId ? updateExerciseAction : createExerciseAction}>
      {(s) => (
        <>
          {exerciseId && <input type="hidden" name="exerciseId" value={exerciseId} />}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("Nome")} name="name" maxLength={80} defaultValue={values?.name} errors={fieldErrors(s, "name")} />
            <SelectField label={t("Grupo muscular")} name="muscleGroup" required options={groupOptions} defaultValue={values?.muscleGroup ?? ""} errors={fieldErrors(s, "muscleGroup")} />
          </div>
          <SecondaryMuscles initial={values?.secondaryMuscles ?? []} errors={fieldErrors(s, "secondaryMuscles")} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("Equipamento")} name="equipment" required={false} maxLength={80} defaultValue={values?.equipment ?? ""} errors={fieldErrors(s, "equipment")} />
            <SelectField label={t("Nível de dificuldade")} name="difficulty" options={difficultyOptions} defaultValue={values?.difficulty ?? ""} errors={fieldErrors(s, "difficulty")} />
          </div>
          <TextAreaField label={t("Descrição")} name="description" maxLength={1000} rows={2} defaultValue={values?.description ?? ""} errors={fieldErrors(s, "description")} />
          <TextAreaField
            label={t("Como executar")}
            name="instructions"
            maxLength={3000}
            rows={5}
            hint={t("Um passo por linha: posição inicial, movimento e posição final. É o que o aluno lê durante o treino.")}
            defaultValue={values?.instructions ?? ""}
            errors={fieldErrors(s, "instructions")}
          />
          <TextAreaField label={t("Dicas de execução")} name="tips" maxLength={2000} rows={3} hint={t("Uma dica por linha.")} defaultValue={values?.tips ?? ""} errors={fieldErrors(s, "tips")} />
          <TextAreaField label={t("Erros comuns")} name="commonMistakes" maxLength={2000} rows={3} hint={t("Um erro por linha.")} defaultValue={values?.commonMistakes ?? ""} errors={fieldErrors(s, "commonMistakes")} />
          <Field
            label={t("Link de vídeo (YouTube)")}
            name="videoUrl"
            required={false}
            maxLength={200}
            hint={t("Opcional. Usado quando você não enviou um vídeo próprio.")}
            defaultValue={values?.videoUrl ?? ""}
            errors={fieldErrors(s, "videoUrl")}
          />
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{exerciseId ? t("Salvar exercício") : t("Criar exercício")}</SubmitButton>
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

export const CopyExerciseButton = ({ exerciseId }: { exerciseId: string }) => {
  const t = useT();
  return (
  <IdButton action={copyExerciseAction} exerciseId={exerciseId} label={t("Copiar para minha biblioteca")} pendingLabel={t("Copiando…")} variant="primary" />
);
};
export const ArchiveExerciseButton = ({ exerciseId }: { exerciseId: string }) => {
  const t = useT();
  return (
  <IdButton action={archiveExerciseAction} exerciseId={exerciseId} label={t("Arquivar exercício")} pendingLabel={t("Arquivando…")} variant="danger" />
);
};
export const RemoveVideoButton = ({ exerciseId }: { exerciseId: string }) => {
  const t = useT();
  return (
  <IdButton action={removeVideoAction} exerciseId={exerciseId} label={t("Remover vídeo")} pendingLabel={t("Removendo…")} variant="secondary" />
);
};
