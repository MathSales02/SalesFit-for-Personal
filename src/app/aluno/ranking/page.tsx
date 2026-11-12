import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import { VisibilityForm } from "@/components/gamification/forms";
import { CompetitionList, PeriodTabs, periodFrom } from "@/components/gamification/ranking-parts";
import { RankingTable } from "@/components/gamification/ranking-table";
import { PageHeading } from "@/components/ui/page-heading";
import { getMyGamification, getRanking, listCompetitions } from "@/server/gamification/service";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Ranking" };

export default async function StudentRankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("community.read", { feature: "ranking" });
  const p = periodFrom((await searchParams).periodo);
  const hasCompetitions = actorHasFeature(actor, "competitions");
  const [ranking, me, competitions] = await Promise.all([getRanking(actor, p.period), getMyGamification(actor), hasCompetitions ? listCompetitions(actor) : []]);

  return (
    <>
      <PageHeading title="Ranking" description="Pontos de constância: treinos concluídos, check-ins e metas semanais batidas. Um check-in por dia." />

      {ranking.enabled ? (
        <section aria-label="Classificação">
          <PeriodTabs basePath="/aluno/ranking" current={p.key} />
          <RankingTable rows={ranking.rows} empty="Ainda não há alunos no ranking." />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {me.hidden && <span>Você está escondido: só você e seu treinador veem sua posição.</span>}
            <VisibilityForm hidden={me.hidden} />
          </div>
        </section>
      ) : (
        <p className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-sm text-muted">Seu treinador desativou o ranking.</p>
      )}

      {hasCompetitions && (
        <section aria-label="Competições" className="mt-10">
          <h2 className="mb-3 font-display text-2xl font-bold">Competições</h2>
          <CompetitionList items={competitions} basePath="/aluno/ranking" showJoined />
        </section>
      )}
    </>
  );
}
