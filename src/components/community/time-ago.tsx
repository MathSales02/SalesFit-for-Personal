"use client";

const full = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const short = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const shortYear = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const min = Math.floor((now - then) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return (d < 300 ? short : shortYear).format(then);
}

/** "há 5 min", with the exact date on hover. Server and browser clocks may differ by a minute. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={full.format(new Date(iso))} className={className} suppressHydrationWarning>
      {timeAgo(iso)}
    </time>
  );
}
