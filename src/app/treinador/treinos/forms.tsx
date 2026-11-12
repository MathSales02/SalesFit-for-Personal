"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import type { ActionResult } from "@/lib/action-result";
import {
  archiveProgramAction,
  assignProgramAction,
  createProgramAction,
  discardDraftAction,
  duplicateProgramAction,
  endAssignmentAction,
  startDraftAction,
  updateProgramInfoAction,
} from "./actions";
import { useT } from "@/i18n/client";

type Info = { name: string; description: string | null; isTemplate: boolean };

export function ProgramInfoForm({ programId, values }: { programId?: string; values?: Info }) {
  const t = useT();
  return (
    <ActionForm action={programId ? updateProgramInfoAction : createProgramAction}>
      {(s) => (
        <>
          {programId && <input type="hidden" name="programId" value={programId} />}
          <Field label={t("Nome do programa")} name="name" maxLength={80} defaultValue={values?.name} errors={fieldErrors(s, "name")} />
          <TextAreaField label={t("Descrição")} name="description" maxLength={1000} rows={2} defaultValue={values?.description ?? ""} errors={fieldErrors(s, "description")} />
          <label className="flex items-start gap-3 text-sm text-ink-soft">
            <input type="checkbox" name="isTemplate" defaultChecked={values?.isTemplate} className="mt-0.5 size-4 accent-turf" />
            <span>
              <span className="font-semibold text-ink">{t("Usar como modelo")}</span>
              <br />
              {t("Modelos servem de ponto de partida: duplique e ajuste para cada aluno.")}
            </span>
          </label>
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{programId ? t("Salvar informações") : t("Criar programa")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

type IdAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

function ProgramButton({ action, programId, label, variant = "secondary" }: { action: IdAction; programId: string; label: string; variant?: "primary" | "secondary" | "danger" }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-2">
      {() => (
        <div>
          <input type="hidden" name="programId" value={programId} />
          <SubmitButton variant={variant}>{label}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export const StartDraftButton = ({ programId }: { programId: string }) => {
  const t = useT();
  return <ProgramButton action={startDraftAction} programId={programId} label={t("Editar treino")} variant="primary" />;
};
export const DiscardDraftButton = ({ programId }: { programId: string }) => {
  const t = useT();
  return <ProgramButton action={discardDraftAction} programId={programId} label={t("Descartar rascunho")} variant="danger" />;
};
export const DuplicateProgramButton = ({ programId }: { programId: string }) => {
  const t = useT();
  return <ProgramButton action={duplicateProgramAction} programId={programId} label={t("Duplicar programa")} />;
};
export const ArchiveProgramButton = ({ programId }: { programId: string }) => {
  const t = useT();
  return <ProgramButton action={archiveProgramAction} programId={programId} label={t("Arquivar programa")} variant="danger" />;
};

type Student = { memberId: string; displayName: string; currentProgram: string | null };

export function AssignForm({ programId, programName, students, today }: { programId: string; programName: string; students: Student[]; today: string }) {
  const t = useT();
  if (students.length === 0) return <p className="text-sm text-muted">{t("Você ainda não tem alunos ativos.")}</p>;
  return (
    <ActionForm action={assignProgramAction} resetOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="programId" value={programId} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-semibold">{t("Alunos")}</legend>
            <div className="max-h-64 divide-y divide-line overflow-y-auto rounded-[var(--radius-control)] border border-line bg-paper">
              {students.map((st) => (
                <label key={st.memberId} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-chalk">
                  <input type="checkbox" name="memberIds" value={st.memberId} className="size-4 accent-turf" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{st.displayName}</span>
                    {st.currentProgram && (
                      <span className="block truncate text-xs text-muted">
                        {st.currentProgram === programName ? t("Já segue este programa") : t("Hoje: {0} (será substituído)", { 0: st.currentProgram })}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors(s, "memberIds") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "memberIds")!.join(" ")}</p>}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField label={t("Início")} name="startsOn" defaultValue={today} required errors={fieldErrors(s, "startsOn")} />
            <DateField label={t("Fim (opcional)")} name="endsOn" errors={fieldErrors(s, "endsOn")} />
          </div>
          <div>
            <SubmitButton pendingLabel={t("Atribuindo…")}>{t("Atribuir programa")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

function DateField({ label, name, defaultValue, required, errors }: { label: string; name: string; defaultValue?: string; required?: boolean; errors?: string[] }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={!!errors}
        className={`h-11 rounded-[var(--radius-control)] border bg-paper px-3 font-normal outline-none focus:border-turf ${errors ? "border-danger" : "border-line-strong"}`}
      />
      {errors && <span className="text-sm font-medium text-danger">{errors.join(" ")}</span>}
    </label>
  );
}

export function EndAssignmentButton({ programId, assignmentId }: { programId: string; assignmentId: string }) {
  const t = useT();
  return (
    <ActionForm action={endAssignmentAction} className="flex" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="programId" value={programId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <SubmitButton variant="ghost" pendingLabel={t("Encerrando…")}>
            {t("Encerrar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
