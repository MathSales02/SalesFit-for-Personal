import type { Metadata } from "next";
import Link from "next/link";
import { historyCursorSchema } from "@/lib/validation/workouts";
import { requirePageActor } from "@/server/http/next";
import { HISTORY_PAGE, listHistory } from "@/server/workouts/service";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Histórico") };
}

const fmtDay = { format: (d: Date | number) => new Intl.DateTimeFormat(currentLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(d) };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const actor = await requirePageActor("training.log_own");
  const { before } = historyCursorSchema.parse(await searchParams);
  const rows = await listHistory(actor, before ? new Date(before) : undefined);
  const last = rows[rows.length - 1];

  return (
    <>
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Histórico")}</h1>
      {rows.length === 0 ? (
        <p className="mt-8 text-muted">{before ? t("Não há treinos mais antigos.") : t("Seus treinos concluídos aparecem aqui.")}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/aluno/treino/${r.id}/resumo`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-chalk">
                <div className="min-w-0">
                  <p className="font-semibold">{r.dayName}</p>
                  <p className="text-sm text-muted">
                    {fmtDay.format(r.startedAt)} · {r.sets} {t("séries")}{r.durationSeconds ? t(" · {0} min", { 0: Math.max(1, Math.round(r.durationSeconds / 60)) }) : ""}
                  </p>
                </div>
                {r.records > 0 && (
                  <span className="shrink-0 rounded bg-signal-tint px-2 py-0.5 text-xs font-semibold text-ink">
                    {r.records === 1 ? t("Recorde") : t("{0} recordes", { 0: r.records })}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === HISTORY_PAGE && last && (
        <Link href={`/aluno/historico?before=${encodeURIComponent(last.startedAt.toISOString())}`} className="mt-6 inline-block font-semibold text-turf">
          {t("Treinos anteriores")}
        </Link>
      )}
    </>
  );
}
