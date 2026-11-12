import Link from "next/link";
import { notFound } from "next/navigation";
import type { Actor } from "@/server/authz/policy";
import { getCompetition } from "@/server/gamification/service";
import { AppError } from "@/server/lib/errors";
import { CompetitionLifecycle, ParticipationButton } from "./forms";
import { competitionStatusLabel, fmtDay, RankingTable } from "./ranking-table";
import { getT } from "@/i18n/server";

/** Competition page shared by trainer and student; actions depend on the role. */
export async function CompetitionDetail({ actor, competitionId, backHref }: { actor: Actor; competitionId: string; backHref: string }) {
  const t = await getT();
  const data = await getCompetition(actor, competitionId).catch((err: unknown) => {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const { competition: c, status, joined, ranking, results } = data;
  const isTrainer = actor.membership?.role === "trainer";
  const open = status === "upcoming" || status === "active";
  const rows = results
    ? results.map((r) => ({ ...r, checkins: 0, hidden: false, isMe: r.memberId === actor.membership?.memberId }))
    : (ranking ?? []);

  return (
    <>
      <Link href={backHref} className="text-sm font-semibold text-turf hover:underline">
        {t("← Ranking")}
      </Link>
      <section className="mt-4 rounded-[var(--radius-panel)] bg-night p-6 text-white">
        <p className="text-sm font-semibold text-signal">{competitionStatusLabel(status)}</p>
        <h1 className="mt-1 font-display text-3xl leading-tight font-bold break-words">{c.title}</h1>
        <p className="mt-2 text-sm text-white/70">
          {fmtDay(c.startsOn)} a {fmtDay(c.endsOn)}
        </p>
        {c.prize && (
          <p className="mt-4 rounded-[var(--radius-control)] bg-white/10 px-3 py-2 text-sm break-words">
            <span className="font-semibold text-white">{t("Prêmio:")}</span> {c.prize}
          </p>
        )}
        {c.description && <p className="mt-4 max-w-xl text-sm leading-relaxed whitespace-pre-line text-white/85 break-words">{c.description}</p>}
      </section>

      {!isTrainer && open && (
        <div className="mt-5">
          <ParticipationButton competitionId={c.id} joined={joined} />
          {!joined && <p className="mt-2 text-sm text-muted">{t("Valem os pontos de constância feitos dentro do período, mesmo os de antes de você entrar.")}</p>}
        </div>
      )}
      {isTrainer && status !== "closed" && status !== "cancelled" && (
        <div className="mt-5">
          <CompetitionLifecycle competitionId={c.id} canClose={status === "ended"} />
          {status !== "ended" && <p className="mt-2 text-sm text-muted">{t("O resultado oficial pode ser registrado depois do último dia.")}</p>}
        </div>
      )}

      <h2 className="mt-8 mb-3 font-display text-xl font-bold">{results ? t("Resultado oficial") : status === "cancelled" ? t("Participantes") : t("Classificação parcial")}</h2>
      {status === "cancelled" ? (
        <p className="text-sm text-muted">{t("Esta competição foi cancelada.")}</p>
      ) : (
        <RankingTable rows={rows} showHidden={isTrainer} frozen={!!results} empty={status === "upcoming" ? t("A classificação começa no primeiro dia.") : t("Ninguém participando ainda.")} />
      )}
    </>
  );
}
