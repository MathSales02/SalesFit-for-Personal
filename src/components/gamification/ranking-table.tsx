import type { RankingRow } from "@/server/gamification/service";

/** Ranking list. Medals use the "signal" accent; identity is always written, never color alone. */
export function RankingTable({ rows, showHidden = false, frozen = false, empty }: { rows: RankingRow[]; showHidden?: boolean; frozen?: boolean; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
      {rows.map((r) => (
        <li key={r.memberId} className={`flex items-center gap-3 px-4 py-3 ${r.isMe ? "bg-turf-tint" : ""}`}>
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-lg font-bold tabular-nums ${r.position <= 3 && r.points > 0 ? "bg-signal text-on-accent" : "text-muted"}`}
            aria-label={`${r.position}º lugar`}
          >
            {r.position}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {r.name}
              {r.isMe && <span className="ml-2 text-xs font-semibold text-turf">você</span>}
            </span>
            <span className="block text-xs text-muted">
              {frozen ? "resultado final" : `${r.checkins} ${r.checkins === 1 ? "check-in" : "check-ins"}`}
              {showHidden && r.hidden ? " · escondido do ranking" : ""}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-display text-2xl font-bold tabular-nums">{r.points}</span>
            <span className="block text-xs text-muted">pontos</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const STATUS: Record<string, string> = { upcoming: "Em breve", active: "Acontecendo", ended: "Terminou (aguardando resultado)", closed: "Encerrada", cancelled: "Cancelada" };
export const competitionStatusLabel = (s: string) => STATUS[s] ?? s;

export const fmtDay = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
