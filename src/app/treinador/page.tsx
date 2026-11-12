import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, BarStrip, BigNumber, Card, HeroDecoration, Pill } from "@/components/dashboard/widgets";
import { IconActivity, IconBell, IconMessage, IconTrophy, IconUsers } from "@/components/shell/icons";
import { RecordFolder } from "@/components/shell/record-folder";
import { buttonClass } from "@/components/ui/button-styles";
import { listSupportAccessForTrainer } from "@/server/admin/support";
import { getRanking } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";
import { unreadConversationCount } from "@/server/messaging/service";
import { unreadNotificationCount } from "@/server/notifications/service";
import { assignableStudents, listPrograms } from "@/server/programs/service";
import { getTrainerActivity, getTrainerOverview } from "@/server/workspace/overview";

export const metadata: Metadata = { title: "Visão geral" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Assinatura ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
};
const fmtDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const fmtDay = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function TrainerOverviewPage() {
  const actor = await requirePageActor("students.read");
  const [o, activity, ranking, support, unreadMessages, unreadNotifications, students, programs] = await Promise.all([
    getTrainerOverview(actor),
    getTrainerActivity(actor),
    getRanking(actor, "week"),
    listSupportAccessForTrainer(actor),
    unreadConversationCount(actor),
    unreadNotificationCount(actor),
    assignableStudents(actor),
    listPrograms(actor),
  ]);
  const firstName = actor.displayName.split(" ")[0];
  const used = o.students.active + o.students.invited;
  const max = o.plan?.maxStudents ?? 0;
  const thisWeek = activity.daily.slice(-7).reduce((n, d) => n + d.workouts, 0);
  const lastWeek = activity.daily.slice(0, 7).reduce((n, d) => n + d.workouts, 0);
  const peak = Math.max(1, ...activity.daily.map((d) => d.workouts));
  const top = ranking.rows.filter((r) => r.points > 0).slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">Olá, {firstName}!</h1>
          <p className="mt-1.5 text-sm text-muted">{o.workspaceName} · como está sua consultoria hoje</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/treinador/treinos" className={buttonClass("secondary")}>
            Novo treino
          </Link>
          <Link href="/treinador/alunos" className={buttonClass("primary")}>
            Convidar aluno
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Hero: the consultancy at a glance */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-signal p-6 text-on-accent shadow-[var(--shadow-card)] sm:p-8 lg:col-span-2">
          <HeroDecoration />
          <div className="relative">
            <Pill tone="dark">{o.subscription ? (STATUS_LABEL[o.subscription.status] ?? o.subscription.status) : "Sem assinatura"}</Pill>
            <h2 id="hero-h" className="sr-only">
              Sua consultoria
            </h2>
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <p className="leading-none">
                <span className="font-display text-7xl font-bold tracking-tight tabular-nums sm:text-8xl">{o.students.active}</span>
                <span className="mt-2 block text-sm font-semibold">{o.students.active === 1 ? "aluno ativo" : "alunos ativos"}</span>
              </p>
              <p className="leading-none">
                <span className="font-display text-4xl font-bold tabular-nums">{o.students.invited}</span>
                <span className="mt-2 block text-sm font-semibold">{o.students.invited === 1 ? "convite pendente" : "convites pendentes"}</span>
              </p>
            </div>
            <div className="mt-6 max-w-sm">
              <div className="flex justify-between text-sm font-semibold">
                <span>Vagas do plano {o.plan?.name ? `(${o.plan.name})` : ""}</span>
                <span className="tabular-nums">
                  {used}/{max}
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-on-accent/15" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label="Vagas usadas">
                <div className="h-full rounded-full bg-on-accent" style={{ width: `${max ? Math.min(100, (used / max) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/treinador/alunos" className={buttonClass("primary")}>
                Ver alunos →
              </Link>
              {o.subscription?.status === "trialing" && (
                <Link href="/treinador/assinatura" className="inline-flex h-11 items-center rounded-full bg-white/70 px-5 font-semibold text-on-accent hover:bg-white">
                  Ver planos
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Workouts (the reference's calories card) */}
        <Card title="Treinos" icon={<IconActivity />} labelledBy="wk-h" action={<span className="text-sm font-semibold text-muted">14 dias</span>}>
          <BigNumber
            value={thisWeek}
            unit={thisWeek === 1 ? "treino" : "treinos"}
            label={lastWeek ? `nos últimos 7 dias · ${lastWeek} na semana anterior` : "concluídos nos últimos 7 dias"}
          />
          <div className="mt-5">
            <BarStrip
              values={activity.daily.map((d) => d.workouts / peak)}
              emphasize={activity.daily.length - 1}
              label={`Treinos concluídos por dia nos últimos 14 dias: ${activity.daily.map((d) => d.workouts).join(", ")}`}
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{activity.daily[0] ? fmtDay(activity.daily[0].day) : ""}</span>
              <span>hoje</span>
            </div>
          </div>
        </Card>

        {/* Students who need attention */}
        <Card title="Precisam de atenção" icon={<IconUsers />} labelledBy="att-h">
          {o.students.active === 0 ? (
            <p className="text-sm text-muted">Quando seus alunos começarem a treinar, quem ficar mais de 7 dias sem treino aparece aqui.</p>
          ) : activity.inactive.length === 0 ? (
            <p className="text-sm text-muted">Todos os alunos ativos treinaram nos últimos 7 dias.</p>
          ) : (
            <>
              <p className="-mt-2 mb-3 text-sm text-muted">
                {activity.inactiveTotal} {activity.inactiveTotal === 1 ? "aluno sem treinar" : "alunos sem treinar"} há mais de 7 dias
              </p>
              <ul className="flex flex-col gap-2">
                {activity.inactive.map((s) => (
                  <li key={s.memberId}>
                    <Link href={`/treinador/alunos/${s.memberId}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-chalk">
                      <Avatar name={s.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                      <span className="text-xs text-muted">{s.lastWorkoutAt ? `há ${daysSince(s.lastWorkoutAt)} dias` : "nunca treinou"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Ranking of the week */}
        <Card title="Ranking da semana" icon={<IconTrophy />} labelledBy="rk-h">
          {top.length === 0 ? (
            <p className="text-sm text-muted">Ninguém pontuou nesta semana ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {top.map((r) => (
                <li key={r.memberId} className="flex items-center gap-3 rounded-full bg-chalk py-1.5 pr-4 pl-1.5">
                  <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${r.position === 1 ? "bg-signal text-on-accent" : "bg-paper"}`}>{r.position}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{r.points} pts</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/treinador/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
            Ranking e competições →
          </Link>
        </Card>

        {/* Inbox */}
        <Card title="Caixa de entrada" labelledBy="in-h">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/treinador/mensagens" className="rounded-2xl bg-chalk p-4 hover:bg-signal-tint">
              <span className="block size-5 text-ink-soft">
                <IconMessage />
              </span>
              <span className="mt-3 block font-display text-4xl font-bold tabular-nums">{unreadMessages}</span>
              <span className="text-sm text-muted">{unreadMessages === 1 ? "conversa não lida" : "conversas não lidas"}</span>
            </Link>
            <Link href="/treinador/notificacoes" className="rounded-2xl bg-chalk p-4 hover:bg-signal-tint">
              <span className="block size-5 text-ink-soft">
                <IconBell />
              </span>
              <span className="mt-3 block font-display text-4xl font-bold tabular-nums">{unreadNotifications}</span>
              <span className="text-sm text-muted">{unreadNotifications === 1 ? "notificação" : "notificações"}</span>
            </Link>
          </div>
        </Card>
      </div>

      <section aria-labelledby="records-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h2 id="records-h" className="font-display text-2xl font-bold">
          Fichas
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">As fichas dos seus alunos e os treinos que você montou. Abra uma pasta e toque em uma ficha para ir direto a ela.</p>
        <div className="mt-2 grid justify-items-center gap-x-10 gap-y-4 md:grid-cols-2">
          <RecordFolder
            label="Fichas de alunos"
            meta={students.length === 1 ? "1 aluno" : `${students.length} alunos`}
            sheets={students.map((s) => ({ name: s.displayName, meta: s.currentProgram ?? "Sem treino", href: `/treinador/alunos/${s.memberId}` }))}
            seed={3}
            allHref="/treinador/alunos"
            allLabel={students.length > 4 ? `Ver os ${students.length} alunos` : "Ver alunos"}
            empty="Você ainda não tem alunos ativos."
          />
          <RecordFolder
            label="Fichas de treino"
            meta={programs.length === 1 ? "1 treino" : `${programs.length} treinos`}
            sheets={programs.map((p) => ({
              name: p.name,
              meta: p.isTemplate ? "Modelo" : p.activeAssignments === 1 ? "1 aluno" : `${p.activeAssignments} alunos`,
              href: `/treinador/treinos/${p.id}`,
            }))}
            seed={11}
            allHref="/treinador/treinos"
            allLabel={programs.length > 4 ? `Ver os ${programs.length} treinos` : "Ver treinos"}
            empty="Você ainda não montou treinos."
          />
        </div>
      </section>

      {support.length > 0 && (
        <Card title="Acessos de suporte nos últimos 90 dias" labelledBy="support-h">
          <p className="-mt-2 text-sm text-muted">A equipe do SalesFit só acessa com motivo registrado, por tempo limitado e sem ver saúde, fotos ou mensagens.</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {support.map((g) => (
              <li key={g.id}>
                <span className="font-semibold">{fmtDateTime.format(g.createdAt)}</span>
                <span className="text-muted"> · {g.revokedAt ? "encerrado" : g.expiresAt > new Date() ? "aberto agora" : "expirado"}</span>
                <span className="block break-words text-ink-soft">{g.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
