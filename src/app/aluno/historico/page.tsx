import type { Metadata } from "next";
import Link from "next/link";
import { historyCursorSchema } from "@/lib/validation/workouts";
import { requirePageActor } from "@/server/http/next";
import { HISTORY_PAGE, listHistory } from "@/server/workouts/service";

export const metadata: Metadata = { title: "Histórico" };

const fmtDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("training.log_own");
  const { before } = historyCursorSchema.parse(await searchParams);
  const rows = await listHistory(actor, before ? new Date(before) : undefined);
  const last = rows[rows.length - 1];

  return (
    <>
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">Histórico</h1>
      {rows.length === 0 ? (
        <p className="mt-8 text-muted">{before ? "Não há treinos mais antigos." : "Seus treinos concluídos aparecem aqui."}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/aluno/treino/${r.id}/resumo`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-chalk">
                <div className="min-w-0">
                  <p className="font-semibold">{r.dayName}</p>
                  <p className="text-sm text-muted">
                    {fmtDay.format(r.startedAt)} · {r.sets} séries{r.durationSeconds ? ` · ${Math.max(1, Math.round(r.durationSeconds / 60))} min` : ""}
                  </p>
                </div>
                {r.records > 0 && (
                  <span className="shrink-0 rounded bg-signal-tint px-2 py-0.5 text-xs font-semibold text-ink">
                    {r.records === 1 ? "Recorde" : `${r.records} recordes`}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === HISTORY_PAGE && last && (
        <Link href={`/aluno/historico?before=${encodeURIComponent(last.startedAt.toISOString())}`} className="mt-6 inline-block font-semibold text-turf">
          Treinos anteriores
        </Link>
      )}
    </>
  );
}
