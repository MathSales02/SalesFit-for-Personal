import Link from "next/link";
import type { Actor } from "@/server/authz/policy";
import { getMyGamification } from "@/server/gamification/service";
import { CheckinForm } from "./forms";

/** Student home: today's check-in plus this week's constancy numbers. */
export async function GamificationCard({ actor }: { actor: Actor }) {
  const g = await getMyGamification(actor);
  const progress = Math.min(1, g.weekCheckins / Math.max(1, g.weeklyTarget));

  return (
    <section aria-label="Constância" className="mt-6 rounded-[var(--radius-panel)] bg-ink p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white/60">Esta semana</p>
          <p className="mt-1 font-display text-4xl leading-none font-bold tabular-nums">
            {g.weekPoints} <span className="text-base font-semibold text-white/60">pontos</span>
          </p>
        </div>
        <dl className="flex gap-5 text-right">
          {g.settings.rankingEnabled && (
            <div>
              <dt className="text-xs text-white/60">Posição</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.weekPosition ? `#${g.weekPosition}` : "–"}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-white/60">Sequência</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {g.streakWeeks} <span className="text-sm font-semibold">sem.</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-sm">
          <span className="text-white/75">Meta da semana</span>
          <span className="font-semibold tabular-nums">
            {g.weekCheckins} de {g.weeklyTarget} dias
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={g.weeklyTarget} aria-valuenow={g.weekCheckins} aria-label="Meta da semana">
          <div className="h-full rounded-full bg-signal" style={{ width: `${progress * 100}%` }} />
        </div>
        {progress >= 1 && <p className="mt-1.5 text-sm text-signal">Meta batida! +{g.settings.weeklyGoalPoints} pontos de bônus.</p>}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        {g.checkedInToday ? (
          <p className="text-sm">
            <span className="font-semibold text-signal">Check-in de hoje feito</span>
            <span className="text-white/70">{g.checkedInToday === "workout" ? " com o treino do programa." : ". Concluir um treino hoje completa os pontos."}</span>
          </p>
        ) : g.settings.manualCheckinsEnabled ? (
          <>
            <p className="mb-3 text-sm text-white/75">
              Concluir um treino já faz seu check-in ({g.settings.workoutPoints} pts). Treinou por fora? Marque aqui ({g.settings.manualCheckinPoints} pts).
            </p>
            <CheckinForm />
          </>
        ) : (
          <p className="text-sm text-white/75">Conclua um treino para fazer o check-in de hoje ({g.settings.workoutPoints} pts).</p>
        )}
      </div>

      <Link href="/aluno/ranking" className="mt-4 inline-block text-sm font-semibold text-signal hover:underline">
        {g.settings.rankingEnabled ? "Ver ranking e competições →" : "Ver competições →"}
      </Link>
    </section>
  );
}
