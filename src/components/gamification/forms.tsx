"use client";

import {
  adjustPointsAction,
  checkinAction,
  competitionLifecycleAction,
  createCompetitionAction,
  gamificationSettingsAction,
  participationAction,
  rankingVisibilityAction,
} from "@/app/_gamification/actions";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextAreaField } from "@/components/ui/field";
import type { GamificationSettings } from "@/server/gamification/service";

export function CheckinForm() {
  return (
    <ActionForm action={checkinAction} className="flex flex-col gap-2" resetOnSuccess>
      {(s) => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-white/80">
            O que você fez? (opcional)
            <input
              name="activity"
              maxLength={60}
              placeholder="Ex.: corrida, aula de funcional"
              className="h-11 rounded-[var(--radius-control)] border border-white/25 bg-white/10 px-3 font-normal text-white placeholder:text-white/50 outline-none focus:border-white"
            />
            {fieldErrors(s, "activity") && <span className="text-signal">{fieldErrors(s, "activity")!.join(" ")}</span>}
          </label>
          <button type="submit" className="h-11 rounded-[var(--radius-control)] bg-signal px-4 font-semibold text-ink">
            Fazer check-in
          </button>
        </div>
      )}
    </ActionForm>
  );
}

export function VisibilityForm({ hidden }: { hidden: boolean }) {
  return (
    <ActionForm action={rankingVisibilityAction} className="flex flex-col gap-2">
      {() => (
        <div>
          <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
          <SubmitButton variant="ghost" pendingLabel="Salvando…">
            {hidden ? "Voltar a aparecer no ranking" : "Não aparecer no ranking dos outros"}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function ParticipationButton({ competitionId, joined }: { competitionId: string; joined: boolean }) {
  return (
    <ActionForm action={participationAction} className="flex flex-col items-start gap-2">
      {() => (
        <>
          <input type="hidden" name="competitionId" value={competitionId} />
          <input type="hidden" name="join" value={joined ? "0" : "1"} />
          <SubmitButton variant={joined ? "secondary" : "primary"} pendingLabel="…">
            {joined ? "Sair da competição" : "Participar"}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CreateCompetitionForm({ today }: { today: string }) {
  return (
    <ActionForm action={createCompetitionAction}>
      {(s) => (
        <>
          <Field label="Nome" name="title" maxLength={80} errors={fieldErrors(s, "title")} />
          <TextAreaField label="Regras ou descrição (opcional)" name="description" maxLength={1000} rows={2} errors={fieldErrors(s, "description")} />
          <Field label="Prêmio (opcional)" name="prize" required={false} maxLength={200} hint="Deixe em branco se não houver prêmio." errors={fieldErrors(s, "prize")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput label="Início" name="startsOn" defaultValue={today} errors={fieldErrors(s, "startsOn")} />
            <DateInput label="Fim" name="endsOn" errors={fieldErrors(s, "endsOn")} />
          </div>
          <p className="text-sm text-muted">Quem participa é ranqueado pelos pontos de constância feitos dentro do período.</p>
          <div>
            <SubmitButton pendingLabel="Criando…">Criar competição</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

function DateInput({ label, name, defaultValue, errors }: { label: string; name: string; defaultValue?: string; errors?: string[] }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      <input type="date" name={name} defaultValue={defaultValue} required className={`h-11 rounded-[var(--radius-control)] border bg-paper px-3 font-normal outline-none focus:border-turf ${errors ? "border-danger" : "border-line-strong"}`} />
      {errors && <span className="text-sm font-medium text-danger">{errors.join(" ")}</span>}
    </label>
  );
}

export function CompetitionLifecycle({ competitionId, canClose }: { competitionId: string; canClose: boolean }) {
  return (
    <ActionForm action={competitionLifecycleAction} className="flex flex-col gap-2">
      {() => (
        <div className="flex flex-wrap gap-2">
          <input type="hidden" name="competitionId" value={competitionId} />
          {canClose && (
            <SubmitButton name="op" value="close">
              Encerrar e registrar resultado
            </SubmitButton>
          )}
          <SubmitButton name="op" value="cancel" variant="danger">
            Cancelar competição
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function GamificationSettingsForm({ settings }: { settings: GamificationSettings }) {
  return (
    <ActionForm action={gamificationSettingsAction}>
      {(s) => (
        <>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="rankingEnabled" defaultChecked={settings.rankingEnabled} className="mt-1 size-4 accent-turf" />
            <span>
              <span className="block font-semibold">Ranking visível para os alunos</span>
              <span className="block text-sm text-muted">Desligado, só você vê o ranking.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="manualCheckinsEnabled" defaultChecked={settings.manualCheckinsEnabled} className="mt-1 size-4 accent-turf" />
            <span>
              <span className="block font-semibold">Permitir check-in manual</span>
              <span className="block text-sm text-muted">Para atividades fora do programa. Máximo 1 por dia.</span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Treino concluído" name="workoutPoints" type="number" inputMode="numeric" defaultValue={String(settings.workoutPoints)} errors={fieldErrors(s, "workoutPoints")} />
            <Field label="Check-in manual" name="manualCheckinPoints" type="number" inputMode="numeric" defaultValue={String(settings.manualCheckinPoints)} errors={fieldErrors(s, "manualCheckinPoints")} />
            <Field label="Meta semanal batida" name="weeklyGoalPoints" type="number" inputMode="numeric" defaultValue={String(settings.weeklyGoalPoints)} errors={fieldErrors(s, "weeklyGoalPoints")} />
          </div>
          <p className="text-sm text-muted">Só um check-in conta por dia. Treinar duas vezes no mesmo dia não dá pontos extras: o ranking premia constância.</p>
          <div>
            <SubmitButton pendingLabel="Salvando…">Salvar regras</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AdjustPointsForm({ students }: { students: { memberId: string; name: string }[] }) {
  return (
    <ActionForm action={adjustPointsAction} resetOnSuccess>
      {(s) => (
        <>
          <SelectField
            label="Aluno"
            name="memberId"
            required
            options={[{ value: "", label: "Escolha…" }, ...students.map((x) => ({ value: x.memberId, label: x.name }))]}
            errors={fieldErrors(s, "memberId")}
          />
          <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Field label="Pontos (+/-)" name="points" type="number" inputMode="numeric" errors={fieldErrors(s, "points")} />
            <Field label="Motivo" name="note" maxLength={200} errors={fieldErrors(s, "note")} />
          </div>
          <div>
            <SubmitButton variant="secondary" pendingLabel="Registrando…">
              Registrar ajuste
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
