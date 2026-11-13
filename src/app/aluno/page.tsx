import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, BarStrip, BigNumber, Card, HeroDecoration, Pill, Sparkline, WeekColumns } from "@/components/dashboard/widgets";
import { CheckinForm } from "@/components/gamification/forms";
import { ProgramView } from "@/components/program-view";
import { IconActivity, IconTrend, IconTrophy } from "@/components/shell/icons";
import { RecordFolder } from "@/components/shell/record-folder";
import { buttonClass } from "@/components/ui/button-styles";
import { getMyGamification, getRanking } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";
import { pushPublicKey } from "@/server/notifications/push";
import { PushPrompt } from "@/components/notifications/push-setup";
import { playbackUrls } from "@/server/media/service";
import { getMyProgram } from "@/server/programs/service";
import { getOwnWeightTrend } from "@/server/progress/service";
import { getOpenSession } from "@/server/workouts/service";
import { StartWorkoutButton } from "./start-button";
import { AbandonButton } from "./treino/[sessionId]/abandon-button";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Início") };
}

const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat(currentLocale(), { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtKg = (n: number) => new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: 1 }).format(n);
/** Monday to Sunday, one letter each, in the request's language (2024-01-01 was a Monday). */
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(currentLocale(), { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))).toUpperCase());

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function StudentHomePage() {
  const t = await getT();
  const actor = await requirePageActor("training.read_own");
  const firstName = actor.displayName.split(" ")[0];
  const [program, open, g, weight] = await Promise.all([getMyProgram(actor), getOpenSession(actor), getMyGamification(actor), getOwnWeightTrend(actor)]);
  const ranking = g.settings.rankingEnabled && actorHasFeature(actor, "ranking") ? await getRanking(actor, "week") : null;
  const videos = program
    ? await playbackUrls(
        actor,
        program.content.days.flatMap((d) => d.exercises.map((e) => e.videoAssetId).filter((x): x is string => !!x)),
      )
    : undefined;

  // Check-ins by day for the week columns and the 28-day bars.
  const byDay = new Map(g.recentCheckins.map((c) => [c.day, c.source]));
  const week = weekdays().map((label, i) => {
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

  const pushKey = pushPublicKey();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Bora,")} {firstName}.</h1>
          <p className="mt-1.5 text-sm text-muted">{actor.membership?.workspaceName} {t("· seu resumo de hoje")}</p>
        </div>
        {ranking && (
          <span className="hidden sm:block">
            <Link href="/aluno/ranking" className={buttonClass("primary")}>
              <span className="size-4">
                <IconTrophy />
              </span>
              {t("Ranking")}
            </Link>
          </span>
        )}
      </header>
      {pushKey && <PushPrompt publicKey={pushKey} />}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Hero: today's training */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-signal p-6 text-on-accent shadow-[var(--shadow-card)] sm:p-8 lg:col-span-2">
          <HeroDecoration />
          <div className="relative max-w-md">
            <Pill tone="dark">{open ? t("Em andamento") : t("Seu treino")}</Pill>
            {open ? (
              <>
                <h2 id="hero-h" className="mt-4 font-display text-4xl leading-[0.95] font-bold sm:text-5xl">
                  {open.dayName} {t("em andamento")}
                </h2>
                <p className="mt-3 text-[0.95rem] font-medium text-on-accent/80">{t("Continue de onde parou. Suas séries já estão salvas.")}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={`/aluno/treino/${open.id}`} className={buttonClass("primary")}>
                    {t("Continuar treino →")}
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
                  {program.content.days.length} {program.content.days.length === 1 ? t("dia de treino") : t("dias de treino")} {t("· desde")} {fmtDate(program.startsOn)}
                  {program.endsOn ? t(" até {0}", { 0: fmtDate(program.endsOn) }) : ""}
                </p>
                <div className="mt-6">
                  <a href="#programa" className={buttonClass("primary")}>
                    {t("Escolher o treino de hoje →")}
                  </a>
                </div>
              </>
            ) : (
              <>
                <h2 id="hero-h" className="mt-4 font-display text-4xl leading-[0.95] font-bold sm:text-5xl">
                  {t("Seu programa chega em breve")}
                </h2>
                <p className="mt-3 text-[0.95rem] font-medium text-on-accent/80">{t("Quando seu treinador atribuir um programa, ele aparece aqui com vídeos, séries e orientações.")}</p>
              </>
            )}
          </div>
        </section>

        {/* Week constancy (the reference's hydration card) */}
        <Card title={t("Constância")} labelledBy="week-h" action={goalReached ? <Pill>{t("Meta batida")}</Pill> : undefined}>
          <p className="-mt-2 mb-4 text-sm text-muted">{t("Dias com check-in nesta semana")}</p>
          <WeekColumns days={[...week]} words={{ workout: t("treino"), manual: t("check-in"), future: t("ainda não chegou"), missed: t("sem check-in") }} />
          <div className="mt-5 flex items-end justify-between gap-3">
            <BigNumber value={`${g.weekCheckins}/${g.weeklyTarget}`} unit="dias" />
            <p className="text-right text-xs leading-tight text-muted">
              {g.streakWeeks > 0 ? (
                <>
                  <span className="block font-display text-2xl font-bold text-ink">{g.streakWeeks}</span>
                  {g.streakWeeks === 1 ? t("semana seguida") : t("semanas seguidas")}
                </>
              ) : (
                t("Bata a meta para começar uma sequência")
              )}
            </p>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            {g.checkedInToday ? (
              <p className="text-sm">
                <span className="font-semibold text-turf">{t("Check-in de hoje feito.")}</span>{" "}
                <span className="text-muted">{g.checkedInToday === "workout" ? t("Treino concluído.") : t("Concluir um treino hoje completa os pontos.")}</span>
              </p>
            ) : g.settings.manualCheckinsEnabled ? (
              <CheckinForm />
            ) : (
              <p className="text-sm text-muted">{t("Conclua um treino para fazer o check-in de hoje.")}</p>
            )}
          </div>
        </Card>

        {/* Ranking (the reference's sleep card) */}
        <Card title={t("Ranking")} icon={<IconTrophy />} labelledBy="rank-h">
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
                    {t("Você está em")} <span className="text-turf">#{g.weekPosition}</span> {t("de")} {g.weekParticipants} {t("nesta semana")}
                  </>
                ) : (
                  t("Faça um check-in para entrar no ranking da semana")
                )}
              </p>
              <ol className="mt-4 flex flex-col gap-2 text-sm">
                {ranking.rows.slice(0, 3).map((r) => (
                  <li key={r.memberId} className={`flex items-center justify-between rounded-full px-3 py-2 ${r.isMe ? "bg-signal-tint" : "bg-chalk"}`}>
                    <span className="truncate">
                      <span className="mr-2 font-bold tabular-nums">{r.position}º</span>
                      {r.name}
                    </span>
                    <span className="font-semibold tabular-nums">{r.points} {t("pts")}</span>
                  </li>
                ))}
              </ol>
              <Link href="/aluno/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
                {t("Ver ranking e competições →")}
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{t("Seu treinador deixou o ranking desligado.")}</p>
              <Link href="/aluno/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
                {t("Ver competições →")}
              </Link>
            </>
          )}
        </Card>

        {/* Points (the reference's calories card) */}
        <Card title={t("Pontos")} icon={<IconActivity />} labelledBy="pts-h" action={<span className="text-sm font-semibold text-muted">{t("esta semana")}</span>}>
          <BigNumber value={g.weekPoints} unit="pts" label={t("{0} {1} nos últimos 28", { 0: active28, 1: active28 === 1 ? t("dia ativo") : t("dias ativos") })} />
          <div className="mt-5">
            <BarStrip values={bars} emphasize={27} label={t("Últimos 28 dias: {0} com check-in. Barras cheias são treinos concluídos; meias, check-ins manuais.", { 0: active28 })} />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{fmtDate(last28[0]!, { day: "numeric", month: "short" })}</span>
              <span>{t("hoje")}</span>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            <div>
              <dt className="text-xs text-muted">{t("Mês")}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.monthPoints}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("Total")}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.totalPoints}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t("Sequência")}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{g.streakWeeks}</dd>
            </div>
          </dl>
        </Card>

        {/* Weight (the reference's weight card) */}
        <Card title={t("Peso")} icon={<IconTrend />} labelledBy="kg-h">
          {latest ? (
            <>
              <p className="-mt-2 text-sm text-muted">{t("Última medida em")} {fmtDate(latest.day, { day: "numeric", month: "short" })}</p>
              <div className="my-4">
                {weight.length > 1 ? (
                  <Sparkline points={weight.map((w) => w.kg)} label={t("Peso nas últimas {0} medidas: de {1} para {2} kg", { 0: weight.length, 1: fmtKg(first!.kg), 2: fmtKg(latest.kg) })} />
                ) : (
                  <p className="py-6 text-sm text-muted">{t("Registre mais medidas para ver a curva.")}</p>
                )}
              </div>
              <div className="mt-auto flex items-end justify-between gap-3">
                <BigNumber value={fmtKg(latest.kg)} unit="kg" />
                {delta !== null && (
                  <p className="text-right text-xs text-muted">
                    <span className="block text-base font-semibold text-ink">
                      {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                      {fmtKg(Math.abs(delta))} {t("kg")}
                    </span>
                    {t("desde")} {fmtDate(first!.day, { day: "numeric", month: "short" })}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">{t("Registre peso e medidas para acompanhar sua evolução. Fica privado, a menos que você compartilhe com o treinador.")}</p>
              <Link href="/aluno/progresso" className={`${buttonClass("secondary")} mt-auto self-start`}>
                {t("Registrar medida")}
              </Link>
            </>
          )}
        </Card>
      </div>

      <section aria-labelledby="sheets-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="grid items-center gap-x-10 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 id="sheets-h" className="font-display text-2xl font-bold">
              {t("Ficha de treino")}
            </h2>
            {program ? (
              <>
                <p className="mt-2 text-lg font-semibold">{program.name}</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                  {program.content.days.length === 1 ? t("1 treino") : t("{0} treinos", { 0: program.content.days.length })} {t("na sua ficha, desde")} {fmtDate(program.startsOn)}
                  {program.endsOn ? t(" até {0}", { 0: fmtDate(program.endsOn) }) : ""}{t(". Abra a pasta e toque em um treino para ver os exercícios, as demonstrações e as orientações.")}
                </p>
              </>
            ) : (
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{t("Quando seu treinador montar a sua ficha, os treinos aparecem nesta pasta, com as demonstrações de cada exercício.")}</p>
            )}
          </div>
          <RecordFolder
            label={t("Ficha de treino")}
            meta={program ? (program.content.days.length === 1 ? t("1 treino") : t("{0} treinos", { 0: program.content.days.length })) : t("Vazia")}
            sheets={(program?.content.days ?? []).map((d) => ({
              name: d.name,
              meta: d.exercises.length === 1 ? t("1 exercício") : t("{0} exercícios", { 0: d.exercises.length }),
              href: `/aluno#dia-${d.id}`,
            }))}
            allHref={program ? "/aluno#programa" : "/aluno/historico"}
            allLabel={program ? t("Ver a ficha completa") : t("Ver meu histórico")}
            empty={t("Sua ficha ainda está vazia.")}
          />
        </div>
      </section>

      {program && (
        <section id="programa" aria-labelledby="program-h" className="mt-4 scroll-mt-20">
          <h2 id="program-h" className="mb-4 font-display text-2xl font-bold">
            {t("Seu programa")}
          </h2>
          {program.description && <p className="mb-4 max-w-2xl text-sm leading-relaxed text-ink-soft">{program.description}</p>}
          <ProgramView content={program.content} videos={videos} showInstructions dayAction={open ? undefined : (dayId) => <StartWorkoutButton dayId={dayId} />} />
        </section>
      )}
    </div>
  );
}
