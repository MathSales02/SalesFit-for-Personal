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
import { useT } from "@/i18n/client";

export function CheckinForm({ successNotice = true, onSuccess }: { successNotice?: boolean; onSuccess?: () => void } = {}) {
  const t = useT();
  return (
    <ActionForm action={checkinAction} className="flex flex-col gap-2" resetOnSuccess successNotice={successNotice} onSuccess={onSuccess}>
      {(s) => (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink-soft">
            {t("Treinou por fora? Conte o que fez (opcional)")}
            <input
              name="activity"
              maxLength={60}
              placeholder={t("Ex.: corrida, aula de funcional")}
              className="h-11 rounded-full border border-line bg-chalk px-4 font-normal text-ink outline-none placeholder:text-muted focus:border-turf"
            />
            {fieldErrors(s, "activity") && <span className="text-danger">{fieldErrors(s, "activity")!.join(" ")}</span>}
          </label>
          <button type="submit" className="h-11 rounded-full bg-ink px-5 font-semibold text-paper hover:bg-ink/85">
            {t("Fazer check-in")}
          </button>
        </div>
      )}
    </ActionForm>
  );
}

export function VisibilityForm({ hidden }: { hidden: boolean }) {
  const t = useT();
  return (
    <ActionForm action={rankingVisibilityAction} className="flex flex-col gap-2">
      {() => (
        <div>
          <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
          <SubmitButton variant="ghost" pendingLabel={t("Salvando…")}>
            {hidden ? t("Voltar a aparecer no ranking") : t("Não aparecer no ranking dos outros")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function ParticipationButton({ competitionId, joined }: { competitionId: string; joined: boolean }) {
  const t = useT();
  return (
    <ActionForm action={participationAction} className="flex flex-col items-start gap-2">
      {() => (
        <>
          <input type="hidden" name="competitionId" value={competitionId} />
          <input type="hidden" name="join" value={joined ? "0" : "1"} />
          <SubmitButton variant={joined ? "secondary" : "primary"} pendingLabel="…">
            {joined ? t("Sair da competição") : t("Participar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CreateCompetitionForm({ today }: { today: string }) {
  const t = useT();
  return (
    <ActionForm action={createCompetitionAction}>
      {(s) => (
        <>
          <Field label={t("Nome")} name="title" maxLength={80} errors={fieldErrors(s, "title")} />
          <TextAreaField label={t("Regras ou descrição (opcional)")} name="description" maxLength={1000} rows={2} errors={fieldErrors(s, "description")} />
          <Field label={t("Prêmio (opcional)")} name="prize" required={false} maxLength={200} hint={t("Deixe em branco se não houver prêmio.")} errors={fieldErrors(s, "prize")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput label={t("Início")} name="startsOn" defaultValue={today} errors={fieldErrors(s, "startsOn")} />
            <DateInput label={t("Fim")} name="endsOn" errors={fieldErrors(s, "endsOn")} />
          </div>
          <p className="text-sm text-muted">{t("Quem participa é ranqueado pelos pontos de constância feitos dentro do período.")}</p>
          <div>
            <SubmitButton pendingLabel={t("Criando…")}>{t("Criar competição")}</SubmitButton>
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
  const t = useT();
  return (
    <ActionForm action={competitionLifecycleAction} className="flex flex-col gap-2">
      {() => (
        <div className="flex flex-wrap gap-2">
          <input type="hidden" name="competitionId" value={competitionId} />
          {canClose && (
            <SubmitButton name="op" value="close">
              {t("Encerrar e registrar resultado")}
            </SubmitButton>
          )}
          <SubmitButton name="op" value="cancel" variant="danger">
            {t("Cancelar competição")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function GamificationSettingsForm({ settings }: { settings: GamificationSettings }) {
  const t = useT();
  return (
    <ActionForm action={gamificationSettingsAction}>
      {(s) => (
        <>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="rankingEnabled" defaultChecked={settings.rankingEnabled} className="mt-1 size-4 accent-turf" />
            <span>
              <span className="block font-semibold">{t("Ranking visível para os alunos")}</span>
              <span className="block text-sm text-muted">{t("Desligado, só você vê o ranking.")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="manualCheckinsEnabled" defaultChecked={settings.manualCheckinsEnabled} className="mt-1 size-4 accent-turf" />
            <span>
              <span className="block font-semibold">{t("Permitir check-in manual")}</span>
              <span className="block text-sm text-muted">{t("Para atividades fora do programa. Máximo 1 por dia.")}</span>
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("Treino concluído")} name="workoutPoints" type="number" inputMode="numeric" defaultValue={String(settings.workoutPoints)} errors={fieldErrors(s, "workoutPoints")} />
            <Field label={t("Check-in manual")} name="manualCheckinPoints" type="number" inputMode="numeric" defaultValue={String(settings.manualCheckinPoints)} errors={fieldErrors(s, "manualCheckinPoints")} />
            <Field label={t("Meta semanal batida")} name="weeklyGoalPoints" type="number" inputMode="numeric" defaultValue={String(settings.weeklyGoalPoints)} errors={fieldErrors(s, "weeklyGoalPoints")} />
          </div>
          <p className="text-sm text-muted">{t("Só um check-in conta por dia. Treinar duas vezes no mesmo dia não dá pontos extras: o ranking premia constância.")}</p>
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{t("Salvar regras")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AdjustPointsForm({ students }: { students: { memberId: string; name: string }[] }) {
  const t = useT();
  return (
    <ActionForm action={adjustPointsAction} resetOnSuccess>
      {(s) => (
        <>
          <SelectField
            label={t("Aluno")}
            name="memberId"
            required
            options={[{ value: "", label: "Escolha…" }, ...students.map((x) => ({ value: x.memberId, label: x.name }))]}
            errors={fieldErrors(s, "memberId")}
          />
          <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Field label={t("Pontos (+/-)")} name="points" type="number" inputMode="numeric" errors={fieldErrors(s, "points")} />
            <Field label={t("Motivo")} name="note" maxLength={200} errors={fieldErrors(s, "note")} />
          </div>
          <div>
            <SubmitButton variant="secondary" pendingLabel={t("Registrando…")}>
              {t("Registrar ajuste")}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
