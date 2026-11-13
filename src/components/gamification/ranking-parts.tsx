import Link from "next/link";
import type { RankingPeriod } from "@/server/gamification/service";
import { competitionStatusLabel, fmtDay } from "./ranking-table";
import { getT } from "@/i18n/server";

export const PERIODS: { key: string; period: RankingPeriod; label: string }[] = [
  { key: "semana", period: "week", label: "Semana" },
  { key: "mes", period: "month", label: "Mês" },
  { key: "geral", period: "all", label: "Geral" },
];

export function periodFrom(param: string | string[] | undefined) {
  return PERIODS.find((p) => p.key === param) ?? PERIODS[0]!;
}

export async function PeriodTabs({ basePath, current }: { basePath: string; current: string }) {
  const t = await getT();
  return (
    <nav aria-label={t("Período")} className="mb-4 inline-flex rounded-full border border-line bg-paper p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.key}
          href={p.key === "semana" ? basePath : `${basePath}?periodo=${p.key}`}
          aria-current={p.key === current ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${p.key === current ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
        >
          {t(p.label)}
        </Link>
      ))}
    </nav>
  );
}

type Competition = { id: string; title: string; prize: string | null; startsOn: string; endsOn: string; status: string; participants: number; joined: boolean };

export async function CompetitionList({ items, basePath, showJoined }: { items: Competition[]; basePath: string; showJoined: boolean }) {
  const t = await getT();
  if (items.length === 0) return <p className="text-sm text-muted">{t("Nenhuma competição por enquanto.")}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`${basePath}/competicao/${c.id}`} className="block rounded-[var(--radius-panel)] border border-line bg-paper p-4 transition-colors hover:border-line-strong">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
              <span className={c.status === "active" ? "text-turf" : "text-muted"}>{t(competitionStatusLabel(c.status))}</span>
              {showJoined && c.joined && <span className="rounded-full bg-turf-tint px-2 py-0.5 text-turf">{t("participando")}</span>}
            </span>
            <span className="mt-1 block font-display text-lg font-bold break-words">{c.title}</span>
            <span className="mt-1 block text-sm text-muted">
              {fmtDay(c.startsOn)} a {fmtDay(c.endsOn)} · {c.participants} {c.participants === 1 ? t("participante") : t("participantes")}
              {c.prize ? t(" · com prêmio") : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
