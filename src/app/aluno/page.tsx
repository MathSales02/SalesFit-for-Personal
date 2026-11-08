import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, BarStrip, BigNumber, Card, HeroDecoration, Pill, Sparkline, WeekColumns } from "@/components/dashboard/widgets";
import { CheckinForm } from "@/components/gamification/forms";
import { ProgramView } from "@/components/program-view";
import { IconActivity, IconTrend, IconTrophy } from "@/components/shell/icons";
import { buttonClass } from "@/components/ui/button-styles";
import { getMyGamification, getRanking } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";
import { playbackUrls } from "@/server/media/service";
import { getMyProgram } from "@/server/programs/service";
import { getOwnWeightTrend } from "@/server/progress/service";
import { getOpenSession } from "@/server/workouts/service";
import { StartWorkoutButton } from "./start-button";
import { AbandonButton } from "./treino/[sessionId]/abandon-button";

export const metadata: Metadata = { title: "Início" };

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("pt-BR", { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtKg = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
const WEEKDAYS = ["S", "T", "Q", "Q", "S", "S", "D"];

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function StudentHomePage() {
  const actor = await requirePageActor("training.read_own");
  const firstName = actor.displayName.split(" ")[0];
  const [program, open, g, weight] = await Promise.all([getMyProgram(actor), getOpenSession(actor), getMyGamification(actor), getOwnWeightTrend(actor)]);
  const ranking = g.settings.rankingEnabled ? await getRanking(actor, "week") : null;
  const videos = program
    ? await playbackUrls(
        actor,
        program.content.days.flatMap((d) => d.exercises.map((e) => e.videoAssetId).filter((x): x is string => !!x)),
      )
    : undefined;

  // Check-ins by day for the week columns and the 28-day bars.
  const byDay = new Map(g.recentCheckins.map((c) => [c.day, c.source]));
  const week = WEEKDAYS.map((label, i) => {
    const day = addDays(g.weekStart, i);
    const src = byDay.get(day);
    return { label, today: day === g.today, state: src ? (src === "workout" ? "workout" : "manual") : day > g.today ? "future" : "missed" } as const;
  });
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(g.today, i - 27));
  const bars = last28.map((d) => (byDay.get(d) === "workout" ? 1 : byDay.has(d) ? 0.55 : 0));
  const active28 = bars.filter((b) => b > 0).length;
  const goalReached = g.weekCheckins >= g.weeklyTarget;
  const latest = weight[weight.length - 1];
  const first = weight[0];
  const delta = latest && first && weight.length > 1 ? latest.kg - first.kg : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">Bora, {firstName}.</h1>
          <p className="mt-1.5 text-sm text-muted">{actor.membership?.workspaceName} · seu resumo de hoje</p>
        </div>
        {ranking && (
          <span className="hidden sm:block">
            <Link href="/aluno/ranking" className={buttonClass("primary")}>
              <span className="size-4">
                <IconTrophy />
              </span>
              Ranking
            </Link>
          </span>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Hero: today's training */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-signal p-6 text-on-accent shadow-[var(--shadow-card)] sm:p-8 lg:col-span-2">
          <HeroDecoration />
          <div className="relative max-w-md">
            <Pill tone="dark">{open ? "Em andamento" : "Seu treino"}</Pill>
            {open ? (
              <>
                <h2 id="hero-h" className="mt-4 font-display text-4xl leading-[0.95] font-bold sm:text-5xl">
                  {open.dayName} em andamento
                </h2>
                <p className="mt-3 text-[0.95rem] font-medium text-on-accent/80">Continue de onde parou. Suas séries já estão salvas.</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={`/aluno/treino/${open.id}`} className={buttonClass("primary")}>
                    Continuar treino →
                  </Link>
                  <AbandonButton sessionId={open.id} />
                </div>
              </>
            ) : program ? (
              <>
                <h2 id="hero-h" className="mt-4 font-display text-4xl leading-[0.95] font-bold sm:text-5xl">
                  {program.name}
                </h2>
                <p className="mt-3 text-[0.95rem] font-medium text-on-accent/80">
                  {program.content.days.length} {program.content.days.length === 1 ? "dia de treino" : "dias de treino"} · desde {fmtDate(program.startsOn)}
                  {program.endsOn ? ` até ${fmtDate(program.endsOn)}` : ""}
                </p>
                <div className="mt-6">
                  <a href="#programa" className={buttonClass("primary")}>
                    Escolher o treino de hoje →
                  </a>
                </div>
              </>
            ) : (
              <>
                <h2 id="hero-h" className="mt-4 font-display text-4xl leading-[0.95] font-bold sm:text-5xl">
                  Seu programa chega em breve
                </h2>
                <p className="mt-3 text-[0.95rem] font-medium text-on-accent/80">Quando seu treinador atribuir um programa, ele aparece aqui com vídeos, séries e orientações.</p>
              </>
            )}
          </div>
        </section>

        {/* Week constancy (the reference's hydration card) */}
        <Card title="Constância" labelledBy="week-h" action={goalReached ? <Pill>Meta batida</Pill> : undefined}>
          <p className="-mt-2 mb-4 text-sm text-muted">Dias com check-in nesta semana</p>
          <WeekColumns days={[...week]} />
          <div className="mt-5 flex items-end justify-between gap-3">
            <BigNumber value={`${g.weekCheckins}/${g.weeklyTarget}`} unit="dias" />
            <p className="text-right text-xs leading-tight text-muted">
              {g.streakWeeks > 0 ? (
                <>
                  <span className="block font-display text-2xl font-bold text-ink">{g.streakWeeks}</span>
                  {g.streakWeeks === 1 ? "semana seguida" : "semanas seguidas"}
                </>
              ) : (
                "Bata a meta para começar uma sequência"
              )}
            </p>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {g.checkedInToday ? (
              <p className="text-sm">
                <span className="font-semibold text-turf">Check-in de hoje feito.</span>{" "}
                <span className="text-muted">{g.checkedInToday === "workout" ? "Treino concluído." : "Concluir um treino hoje completa os pontos."}</span>
              </p>
            ) : g.settings.manualCheckinsEnabled ? (
              <CheckinForm />
            ) : (
              <p className="text-sm text-muted">Conclua um treino para fazer o check-in de hoje.</p>
            )}
          </div>
        </Card>

        {/* Ranking (the reference's sleep card) */}
        <Card title="Ranking" icon={<IconTrophy />} labelledBy="rank-h">
          {ranking ? (
            <>
              <div className="flex -space-x-2">
                {ranking.rows.slice(0, 3).map((r) => (
                  <Avatar key={r.memberId} name={r.name} />
                ))}
              </div>
              <p className="mt-4 text-xl leading-snug font-semibold">
                {g.weekPosition ? (
                  <>
                    Você está em <span className="text-turf">#{g.weekPosition}</span> de {g.weekParticipants} nesta semana
                  </>
                ) : (
                  "Faça um check-in para entrar no ranking da semana"
                )}
              </p>
              <ol className="mt-4 flex flex-col gap-2 text-sm">
                {ranking.rows.slice(0, 3).map((r) => (
                  <li key={r.memberId} className={`flex items-center justify-between rounded-full px-3 py-2 ${r.isMe ? "bg-signal-tint" : "bg-chalk"}`}>
                    <span className="truncate">
                      <span className="mr-2 font-bold tabular-nums">{r.position}º</span>
                      {r.name}
                    </span>
                    <span className="font-semibold tabular-nums">{r.points} pts</span>
                  </li>
                ))}
              </ol>
              <Link href="/aluno/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
                Ver ranking e competições →
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Seu treinador deixou o ranking desligado.</p>
              <Link href="/aluno/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
                Ver competições →
              </Link>
            </>
          )}
        </Card>

        {/* Points (the reference's calories card) */}
        <Card title="Pontos" icon={<IconActivity />} labelledBy="pts-h" action={<span className="text-sm font-semibold text-muted">esta semana</span>}>
          <BigNumber value={g.weekPoints} unit="pts" label={`${active28} ${active28 === 1 ? "dia ativo" : "dias ativos"} nos últimos 28`} />
          <div className="mt-5">
            <BarStrip values={bars} emphasize={27} label={`Últimos 28 dias: ${active28} com check-in. Barras cheias são treinos concluídos; meias, check-ins manuais.`} />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{fmtDate(last28[0]!, { day: "numeric", month: "short" })}</span>
              <span>hoje</span>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            <div>
              <dt className="text-xs text-muted">Mês</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.monthPoints}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Total</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.totalPoints}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Sequência</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.streakWeeks}</dd>
            </div>
          </dl>
        </Card>

        {/* Weight (the reference's weight card) */}
        <Card title="Peso" icon={<IconTrend />} labelledBy="kg-h">
          {latest ? (
            <>
              <p className="-mt-2 text-sm text-muted">Última medida em {fmtDate(latest.day, { day: "numeric", month: "short" })}</p>
              <div className="my-4">
                {weight.length > 1 ? (
                  <Sparkline points={weight.map((w) => w.kg)} label={`Peso nas últimas ${weight.length} medidas: de ${fmtKg(first!.kg)} para ${fmtKg(latest.kg)} kg`} />
                ) : (
                  <p className="py-6 text-sm text-muted">Registre mais medidas para ver a curva.</p>
                )}
              </div>
              <div className="mt-auto flex items-end justify-between gap-3">
                <BigNumber value={fmtKg(latest.kg)} unit="kg" />
                {delta !== null && (
                  <p className="text-right text-xs text-muted">
                    <span className="block text-base font-semibold text-ink">
                      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                      {fmtKg(Math.abs(delta))} kg
                    </span>
                    desde {fmtDate(first!.day, { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Registre peso e medidas para acompanhar sua evolução. Fica privado, a menos que você compartilhe com o treinador.</p>
              <Link href="/aluno/progresso" className={`${buttonClass("secondary")} mt-auto self-start`}>
                Registrar medida
              </Link>
            </>
          )}
        </Card>
      </div>

      {program && (
        <section id="programa" aria-labelledby="program-h" className="mt-4 scroll-mt-20">
          <h2 id="program-h" className="mb-4 font-display text-2xl font-bold">
            Seu programa
          </h2>
          {program.description && <p className="mb-4 max-w-2xl text-sm leading-relaxed text-ink-soft">{program.description}</p>}
          <ProgramView content={program.content} videos={videos} showInstructions dayAction={open ? undefined : (dayId) => <StartWorkoutButton dayId={dayId} />} />
        </section>
      )}
    </div>
  );
}
