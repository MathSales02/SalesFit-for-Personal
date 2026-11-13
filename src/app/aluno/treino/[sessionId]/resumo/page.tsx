import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { buttonClass } from "@/components/ui/button-styles";
import { EFFORT_LABEL } from "@/lib/validation/workouts";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { getSessionSummary } from "@/server/workouts/service";
import { ShareWorkoutForm } from "./share-form";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Resumo do treino") };
}

const kg = (n: number) => n.toLocaleString(currentLocale(), { maximumFractionDigits: 1 });
const minutes = (s: number | null) => (s == null ? "—" : s < 60 ? "<1" : String(Math.round(s / 60)));

export default async function SummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const t = await getT();
  const actor = await requirePageActor("training.log_own");
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  let s;
  try {
    s = await getSessionSummary(actor, sessionId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (!s.completedAt) redirect(`/aluno/treino/${sessionId}`);

  const stats: [string, string][] = [
    [t("Minutos"), minutes(s.durationSeconds)],
    [t("Séries"), String(s.totalSets)],
    [t("Exercícios"), `${s.exercisesDone}/${s.exercisesPlanned}`],
    [t("Volume (kg)"), kg(s.volumeKg)],
  ];

  return (
    <>
      <p className="text-sm font-semibold text-muted">{s.programName}</p>
      <h1 className="mt-1 font-display text-[2.6rem] leading-none font-bold tracking-tight">{s.dayName} {t("concluído.")}</h1>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-paper p-4">
            <dt className="text-sm font-semibold text-muted">{label}</dt>
            <dd className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {s.records.length > 0 && (
        <section aria-labelledby="pr-h" className="mt-8 rounded-[var(--radius-panel)] border border-signal/50 bg-signal-tint p-5">
          <h2 id="pr-h" className="font-display text-2xl font-bold">
            {s.records.length === 1 ? t("Novo recorde pessoal") : t("{0} recordes pessoais", { 0: s.records.length })}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {s.records.map((r) => (
              <li key={r.exerciseName}>
                <p className="font-semibold">{t(r.exerciseName)}</p>
                <p className="text-sm text-ink-soft">
                  {r.reps} × {kg(r.loadKg)} {t("kg · 1RM estimado")} {kg(r.e1rmKg)} {t("kg")}
                  {r.previousE1rmKg ? t(" (antes {0} kg)", { 0: kg(r.previousE1rmKg) }) : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(s.effort || s.notes) && (
        <section className="mt-8 text-sm">
          {s.effort && (
            <p>
              <span className="font-semibold">{t("Esforço:")}</span> {s.effort}/10 · {t(EFFORT_LABEL[s.effort])}
            </p>
          )}
          {s.notes && (
            <p className="mt-1">
              <span className="font-semibold">{t("Observações:")}</span> {s.notes}
            </p>
          )}
        </section>
      )}

      <section aria-label={t("Compartilhar")} className="mt-10 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <ShareWorkoutForm sessionId={s.sessionId} />
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/aluno" className={buttonClass("primary")}>
          {t("Voltar ao início")}
        </Link>
        <Link href="/aluno/historico" className={buttonClass("secondary")}>
          {t("Ver histórico")}
        </Link>
      </div>
    </>
  );
}
