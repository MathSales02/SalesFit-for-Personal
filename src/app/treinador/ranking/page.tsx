import { FeatureNote } from "@/components/shell/feature-locked";
import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import { AdjustPointsForm, CreateCompetitionForm, GamificationSettingsForm } from "@/components/gamification/forms";
import { CompetitionList, PeriodTabs, periodFrom } from "@/components/gamification/ranking-parts";
import { RankingTable } from "@/components/gamification/ranking-table";
import { PageHeading } from "@/components/ui/page-heading";
import { todayInBrazil } from "@/lib/validation/progress";
import { getGamificationSettings, getRanking, listCompetitions } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Ranking") };
}

const panel = "rounded-[var(--radius-panel)] border border-line bg-paper p-5";

export default async function TrainerRankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const actor = await requirePageActor("gamification.configure", { feature: "ranking" });
  const p = periodFrom((await searchParams).periodo);
  const hasCompetitions = actorHasFeature(actor, "competitions");
  const [ranking, everyone, settings, competitions] = await Promise.all([
    getRanking(actor, p.period),
    p.period === "all" ? null : getRanking(actor, "all"),
    getGamificationSettings(actor),
    hasCompetitions ? listCompetitions(actor) : [],
  ]);
  const students = (everyone ?? ranking).rows.map((r) => ({ memberId: r.memberId, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, currentLocale()));

  return (
    <>
      <PageHeading
        title={t("Ranking e competições")}
        description={t("Os pontos são calculados no servidor a partir de treinos concluídos e check-ins, no máximo um por dia por aluno. Você vê também quem escolheu sair do ranking.")}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label={t("Classificação")} className="min-w-0">
          {!ranking.enabled && <p className="mb-3 text-sm font-semibold text-danger">{t("Ranking desativado para os alunos. Só você está vendo.")}</p>}
          <PeriodTabs basePath="/treinador/ranking" current={p.key} />
          <RankingTable rows={ranking.rows} showHidden empty={t("Nenhum aluno ativo ainda.")} />

          <h2 className="mt-10 mb-3 font-display text-2xl font-bold">{t("Competições")}</h2>
          {hasCompetitions ? (
            <>
              <CompetitionList items={competitions} basePath="/treinador/ranking" showJoined={false} />
              <details className={`${panel} mt-4`}>
                <summary className="cursor-pointer font-semibold">{t("Nova competição")}</summary>
                <div className="mt-4">
                  <CreateCompetitionForm today={todayInBrazil()} />
                </div>
              </details>
            </>
          ) : (
            <FeatureNote feature="competitions" role="trainer" />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-label={t("Regras de pontuação")} className={panel}>
            <h2 className="mb-4 font-display text-lg font-bold">{t("Regras de pontuação")}</h2>
            <GamificationSettingsForm settings={settings} />
          </section>
          <section aria-label={t("Ajuste de pontos")} className={panel}>
            <h2 className="font-display text-lg font-bold">{t("Ajuste manual")}</h2>
            <p className="mt-1 mb-4 text-sm text-muted">{t("Para corrigir erros ou premiar algo fora do app. Fica registrado com o motivo.")}</p>
            <AdjustPointsForm students={students} />
          </section>
        </aside>
      </div>
    </>
  );
}
