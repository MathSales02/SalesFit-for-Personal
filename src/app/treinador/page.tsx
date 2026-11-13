import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, BarStrip, BigNumber, Card, HeroDecoration, Pill } from "@/components/dashboard/widgets";
import { IconActivity, IconBell, IconMessage, IconTrophy, IconUsers } from "@/components/shell/icons";
import { RecordFolder } from "@/components/shell/record-folder";
import { buttonClass } from "@/components/ui/button-styles";
import { listSupportAccessForTrainer } from "@/server/admin/support";
import { getRanking } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";
import { pushPublicKey } from "@/server/notifications/push";
import { PushPrompt } from "@/components/notifications/push-setup";
import { unreadConversationCount } from "@/server/messaging/service";
import { unreadNotificationCount } from "@/server/notifications/service";
import { assignableStudents, listPrograms } from "@/server/programs/service";
import { getTrainerActivity, getTrainerOverview } from "@/server/workspace/overview";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Visão geral") };
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Assinatura ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
};
const fmtDateTime = { format: (d: Date | number) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) };
const fmtDay = (iso: string) => new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default async function TrainerOverviewPage() {
  const t = await getT();
  const actor = await requirePageActor("students.read");
  const [o, activity, ranking, support, unreadMessages, unreadNotifications, students, programs] = await Promise.all([
    getTrainerOverview(actor),
    getTrainerActivity(actor),
    actorHasFeature(actor, "ranking") ? getRanking(actor, "week") : null,
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
  const top = (ranking?.rows ?? []).filter((r) => r.points > 0).slice(0, 3);

  const pushKey = pushPublicKey();
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Olá,")} {firstName}!</h1>
          <p className="mt-1.5 text-sm text-muted">{o.workspaceName} {t("· como está sua consultoria hoje")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/treinador/treinos" className={buttonClass("secondary")}>
            {t("Novo treino")}
          </Link>
          <Link href="/treinador/alunos" className={buttonClass("primary")}>
            {t("Convidar aluno")}
          </Link>
        </div>
      </header>
      {pushKey && <PushPrompt publicKey={pushKey} />}

      <div className="motion-stagger grid gap-5 lg:grid-cols-3">
        {/* Hero: the consultancy at a glance */}
        <section aria-labelledby="hero-h" className="relative overflow-hidden rounded-[var(--radius-panel)] bg-signal p-6 text-on-accent shadow-[var(--shadow-card)] sm:p-8 lg:col-span-2">
          <HeroDecoration />
          <div className="relative">
            <Pill tone="dark">{o.subscription ? t(STATUS_LABEL[o.subscription.status] ?? o.subscription.status) : t("Sem assinatura")}</Pill>
            <h2 id="hero-h" className="sr-only">
              {t("Sua consultoria")}
            </h2>
            <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
              <p className="leading-none">
                <span className="font-display text-7xl font-bold tracking-tight tabular-nums sm:text-8xl">{o.students.active}</span>
                <span className="mt-2 block text-sm font-semibold">{o.students.active === 1 ? t("aluno ativo") : t("alunos ativos")}</span>
              </p>
              <p className="leading-none">
                <span className="font-display text-4xl font-bold tabular-nums">{o.students.invited}</span>
                <span className="mt-2 block text-sm font-semibold">{o.students.invited === 1 ? t("convite pendente") : t("convites pendentes")}</span>
              </p>
            </div>
            <div className="mt-6 max-w-sm">
              <div className="flex justify-between text-sm font-semibold">
                <span>{t("Vagas do plano")} {o.plan?.name ? `(${t(o.plan.name)})` : ""}</span>
                <span className="tabular-nums">
                  {used}/{max}
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-on-accent/15" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label={t("Vagas usadas")}>
                <div className="h-full rounded-full bg-on-accent" style={{ width: `${max ? Math.min(100, (used / max) * 100) : 0}%` }} />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/treinador/alunos" className={buttonClass("primary")}>
                {t("Ver alunos →")}
              </Link>
              {o.subscription?.status === "trialing" && (
                <Link href="/treinador/assinatura" className="inline-flex h-11 items-center rounded-full bg-white/70 px-5 font-semibold text-on-accent hover:bg-white">
                  {t("Ver planos")}
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Workouts (the reference's calories card) */}
        <Card title={t("Treinos")} icon={<IconActivity />} labelledBy="wk-h" action={<span className="text-sm font-semibold text-muted">{t("14 dias")}</span>}>
          <BigNumber
            value={thisWeek}
            unit={thisWeek === 1 ? t("treino") : t("treinos")}
            label={lastWeek ? t("nos últimos 7 dias · {0} na semana anterior", { 0: lastWeek }) : t("concluídos nos últimos 7 dias")}
          />
          <div className="mt-5">
            <BarStrip
              values={activity.daily.map((d) => d.workouts / peak)}
              emphasize={activity.daily.length - 1}
              label={t("Treinos concluídos por dia nos últimos 14 dias: {0}", { 0: activity.daily.map((d) => d.workouts).join(", ") })}
            />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{activity.daily[0] ? fmtDay(activity.daily[0].day) : ""}</span>
              <span>{t("hoje")}</span>
            </div>
          </div>
        </Card>

        {/* Students who need attention */}
        <Card title={t("Precisam de atenção")} icon={<IconUsers />} labelledBy="att-h">
          {o.students.active === 0 ? (
            <p className="text-sm text-muted">{t("Quando seus alunos começarem a treinar, quem ficar mais de 7 dias sem treino aparece aqui.")}</p>
          ) : activity.inactive.length === 0 ? (
            <p className="text-sm text-muted">{t("Todos os alunos ativos treinaram nos últimos 7 dias.")}</p>
          ) : (
            <>
              <p className="-mt-2 mb-3 text-sm text-muted">
                {activity.inactiveTotal} {activity.inactiveTotal === 1 ? t("aluno sem treinar") : t("alunos sem treinar")} {t("há mais de 7 dias")}
              </p>
              <ul className="flex flex-col gap-2">
                {activity.inactive.map((s) => (
                  <li key={s.memberId}>
                    <Link href={`/treinador/alunos/${s.memberId}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-chalk">
                      <Avatar name={s.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                      <span className="text-xs text-muted">{s.lastWorkoutAt ? t("há {0} dias", { 0: daysSince(s.lastWorkoutAt) }) : t("nunca treinou")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Ranking of the week */}
        <Card title={t("Ranking da semana")} icon={<IconTrophy />} labelledBy="rk-h">
          {top.length === 0 ? (
            <p className="text-sm text-muted">{t("Ninguém pontuou nesta semana ainda.")}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {top.map((r) => (
                <li key={r.memberId} className="flex items-center gap-3 rounded-full bg-chalk py-1.5 pr-4 pl-1.5">
                  <span className={`grid size-8 place-items-center rounded-full text-sm font-bold ${r.position === 1 ? "bg-signal text-on-accent" : "bg-paper"}`}>{r.position}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                  <span className="text-sm font-semibold tabular-nums">{r.points} {t("pts")}</span>
                </li>
              ))}
            </ol>
          )}
          <Link href="/treinador/ranking" className="mt-auto pt-4 text-sm font-semibold text-turf hover:underline">
            {t("Ranking e competições →")}
          </Link>
        </Card>

        {/* Inbox */}
        <Card title={t("Caixa de entrada")} labelledBy="in-h">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/treinador/mensagens" className="rounded-2xl bg-chalk p-4 hover:bg-signal-tint">
              <span className="block size-5 text-ink-soft">
                <IconMessage />
              </span>
              <span className="mt-3 block font-display text-4xl font-bold tabular-nums">{unreadMessages}</span>
              <span className="text-sm text-muted">{unreadMessages === 1 ? t("conversa não lida") : t("conversas não lidas")}</span>
            </Link>
            <Link href="/treinador/notificacoes" className="rounded-2xl bg-chalk p-4 hover:bg-signal-tint">
              <span className="block size-5 text-ink-soft">
                <IconBell />
              </span>
              <span className="mt-3 block font-display text-4xl font-bold tabular-nums">{unreadNotifications}</span>
              <span className="text-sm text-muted">{unreadNotifications === 1 ? t("notificação") : t("notificações")}</span>
            </Link>
          </div>
        </Card>
      </div>

      <section aria-labelledby="records-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h2 id="records-h" className="font-display text-2xl font-bold">
          {t("Fichas")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">{t("As fichas dos seus alunos e os treinos que você montou. Abra uma pasta e toque em uma ficha para ir direto a ela.")}</p>
        <div className="mt-2 grid justify-items-center gap-x-10 gap-y-4 md:grid-cols-2">
          <RecordFolder
            label={t("Fichas de alunos")}
            meta={students.length === 1 ? t("1 aluno") : t("{0} alunos", { 0: students.length })}
            sheets={students.map((s) => ({ name: s.displayName, meta: s.currentProgram ?? t("Sem treino"), href: `/treinador/alunos/${s.memberId}` }))}
            seed={3}
            allHref="/treinador/alunos"
            allLabel={students.length > 4 ? t("Ver os {0} alunos", { 0: students.length }) : t("Ver alunos")}
            empty={t("Você ainda não tem alunos ativos.")}
          />
          <RecordFolder
            label={t("Fichas de treino")}
            meta={programs.length === 1 ? t("1 treino") : t("{0} treinos", { 0: programs.length })}
            sheets={programs.map((p) => ({
              name: p.name,
              meta: p.isTemplate ? t("Modelo") : p.activeAssignments === 1 ? "1 aluno" : `${p.activeAssignments} alunos`,
              href: `/treinador/treinos/${p.id}`,
            }))}
            seed={11}
            allHref="/treinador/treinos"
            allLabel={programs.length > 4 ? t("Ver os {0} treinos", { 0: programs.length }) : t("Ver treinos")}
            empty={t("Você ainda não montou treinos.")}
          />
        </div>
      </section>

      {support.length > 0 && (
        <Card title={t("Acessos de suporte nos últimos 90 dias")} labelledBy="support-h">
          <p className="-mt-2 text-sm text-muted">{t("A equipe do SalesFit só acessa com motivo registrado, por tempo limitado e sem ver saúde, fotos ou mensagens.")}</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {support.map((g) => (
              <li key={g.id}>
                <span className="font-semibold">{fmtDateTime.format(g.createdAt)}</span>
                <span className="text-muted"> · {g.revokedAt ? t("encerrado") : g.expiresAt > new Date() ? t("aberto agora") : t("expirado")}</span>
                <span className="block break-words text-ink-soft">{g.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
