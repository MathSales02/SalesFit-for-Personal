"use client";

import { useLocale, useT } from "@/i18n/client";
import type { Translate } from "@/i18n/config";

const fmt = (locale: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "America/Sao_Paulo" });

export function timeAgo(iso: string, t: Translate, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const min = Math.floor((now - then) / 60_000);
  if (min < 1) return t("agora");
  if (min < 60) return t("há {0} min", { 0: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("há {0} h", { 0: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t("ontem");
  if (d < 7) return t("há {0} dias", { 0: d });
  return fmt(locale, d < 300 ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" }).format(then);
}

/** "há 5 min", with the exact date on hover. Server and browser clocks may differ by a minute. */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <time
      dateTime={iso}
      title={fmt(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}
      className={className}
      suppressHydrationWarning
    >
      {timeAgo(iso, t, locale)}
    </time>
  );
}
