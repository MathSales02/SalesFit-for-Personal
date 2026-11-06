import { EFFORT_LABEL } from "@/lib/validation/workouts";
import type { TrainingOverview } from "@/server/workouts/service";

const fmtDay = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const fmtWeek = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const kg = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Trainer's view of a student's consistency, recent workouts and records. */
export function TrainingSection({ data, weeklyTarget }: { data: TrainingOverview; weeklyTarget: number | null }) {
  const max = Math.max(weeklyTarget ?? 0, ...data.weeks.map((w) => w.sessions), 1);
  const last = data.daysSinceLastWorkout;
  return (
    <section aria-labelledby="training-h" className="mb-12">
      <h2 id="training-h" className="text-lg font-semibold">
        Treinos
      </h2>
      <p className="mt-1 text-sm text-muted">
        {data.currentProgram ? `Programa atual: ${data.currentProgram.name}` : "Sem programa atribuído."}
        {last == null ? " · Ainda não registrou treinos." : last === 0 ? " · Treinou hoje." : ` · Último treino há ${last} ${last === 1 ? "dia" : "dias"}.`}
      </p>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <figure>
          <figcaption className="mb-3 text-sm font-semibold">
            Treinos por semana{weeklyTarget ? <span className="font-normal text-muted"> · meta {weeklyTarget}x</span> : null}
          </figcaption>
          <div className="relative flex h-32 items-end gap-2 border-b border-line" role="img" aria-label={`Treinos nas últimas 8 semanas: ${data.weeks.map((w) => w.sessions).join(", ")}`}>
            {weeklyTarget ? <div className="absolute inset-x-0 border-t border-dashed border-signal" style={{ bottom: `${(weeklyTarget / max) * 100}%` }} aria-hidden="true" /> : null}
            {data.weeks.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                <span className="text-xs font-semibold tabular-nums text-ink-soft">{w.sessions || ""}</span>
                <div className={`w-full rounded-t-[3px] ${w.sessions ? "bg-turf" : "bg-line"}`} style={{ height: w.sessions ? `${(w.sessions / max) * 100}%` : "3px" }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {data.weeks.map((w) => (
              <span key={w.weekStart} className="flex-1 text-center text-[0.7rem] text-muted tabular-nums">
                {fmtWeek(w.weekStart)}
              </span>
            ))}
          </div>
        </figure>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Recordes recentes</h3>
          {data.recentRecords.length === 0 ? (
            <p className="text-sm text-muted">Nenhum recorde ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.recentRecords.slice(0, 5).map((r, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate font-medium">{r.exerciseName}</span>
                  <span className="shrink-0 text-ink-soft tabular-nums">
                    {r.reps}×{kg(r.loadKg)} kg · {fmtDay.format(r.achievedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {data.recentSessions.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Data</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Treino</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Séries</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Esforço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.recentSessions.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDay.format(s.startedAt)}</td>
                  <td className="px-4 py-2.5 font-medium">
                    {s.dayName}
                    {s.records > 0 && <span className="ml-2 rounded bg-signal-tint px-1.5 py-0.5 text-xs font-semibold">{s.records === 1 ? "recorde" : `${s.records} recordes`}</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{s.sets}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{s.effort ? `${s.effort}/10 · ${EFFORT_LABEL[s.effort]}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
