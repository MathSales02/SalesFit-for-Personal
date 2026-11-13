"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CheckinForm } from "@/components/gamification/forms";
import { useT } from "@/i18n/client";

export type StreakDay = {
  /** Short name shown above the circle: "Seg". */
  label: string;
  /** Full name read aloud: "segunda-feira". */
  name: string;
  state: "workout" | "manual" | "missed" | "future";
  today: boolean;
};

/** Small flame, orange outside and yellow inside. */
function Flame({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="var(--color-signal)"
        d="M12 2.5c.6 3.2 2.9 4.9 4.4 7.1 1.1 1.6 1.6 3.2 1.6 4.9a6 6 0 0 1-12 0c0-2.3 1-4.2 2.4-5.6.2 1.6.9 2.7 2 3.3-.3-3.4 1-6.9 1.6-9.7Z"
      />
      <path fill="#ffc94a" d="M12 12.2c1.3 1.3 2.6 2.5 2.6 4.2a2.6 2.6 0 0 1-5.2 0c0-1.6 1.2-2.8 2.6-4.2Z" />
    </svg>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="motion-check size-[55%]">
    <path pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

const CalendarDot = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[50%]">
    <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
    <path d="M8 3.5v4M16 3.5v4M4 10.5h16" />
  </svg>
);

/** Remembers, per device, the last day whose check-in was celebrated: each check-in animates once. */
const SEEN_KEY = "salesfit:checkin-celebrated";

/**
 * The home screen's week at a glance: the streak of weeks with the goal reached, and the seven days
 * with their check-ins. Today's empty circle is the manual check-in (when the trainer allows it).
 */
export function WeekStreak({
  streakWeeks,
  days,
  today,
  checkedInToday,
  canCheckIn,
}: {
  streakWeeks: number;
  days: StreakDay[];
  /** ISO day, the key of the once-per-check-in animation. */
  today: string;
  checkedInToday: "workout" | "manual" | null;
  /** The trainer allows manual check-ins: today's empty circle opens the check-in. */
  canCheckIn: boolean;
}) {
  const t = useT();
  const bar = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // A check-in that this device has not shown yet fills its circle, with a little flame.
  useEffect(() => {
    if (!checkedInToday) return;
    try {
      if (localStorage.getItem(SEEN_KEY) === today) return;
      localStorage.setItem(SEEN_KEY, today);
    } catch {
      return;
    }
    bar.current?.setAttribute("data-celebrate", "");
    const id = window.setTimeout(() => bar.current?.removeAttribute("data-celebrate"), 1600);
    return () => window.clearTimeout(id);
  }, [checkedInToday, today]);

  const words = { workout: t("treino concluído"), manual: t("check-in"), future: t("ainda não chegou"), missed: t("sem check-in") };
  const streakText = streakWeeks === 1 ? t("semana seguida") : t("semanas seguidas");

  return (
    <div ref={bar} className="week-streak flex items-center gap-3 sm:gap-4">
      <Link
        href="/aluno/historico"
        className="group flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper py-1.5 pr-2.5 pl-2 shadow-[var(--shadow-card)] hover:border-turf/60 sm:gap-2 sm:pr-3"
      >
        <Flame className={`streak-flame size-5 shrink-0 sm:size-6 ${streakWeeks > 0 ? "" : "opacity-40 grayscale"}`} />
        <span className={`font-display text-lg leading-none font-bold tabular-nums ${streakWeeks > 0 ? "text-turf" : "text-muted"}`}>{streakWeeks}</span>{" "}
        <span className="max-w-[4.6rem] text-[0.7rem] leading-[1.1] font-semibold text-ink-soft sm:max-w-none sm:text-sm">{streakText}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="hidden size-3.5 text-muted group-hover:text-turf min-[400px]:block">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>

      <span aria-hidden="true" className="hidden h-9 w-px shrink-0 bg-line min-[400px]:block" />

      <ol aria-label={t("Check-ins desta semana")} className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 sm:max-w-md sm:gap-2">
        {days.map((d, i) => {
          const done = d.state === "workout" || d.state === "manual";
          const label = `${d.name}${d.today ? `, ${t("hoje")}` : ""}: ${words[d.state]}`;
          const circle = `relative grid aspect-square w-[88%] max-w-8 place-items-center rounded-full transition-colors ${
            done
              ? "bg-signal text-on-accent"
              : d.today
                ? "border-2 border-signal text-turf shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-signal)_18%,transparent),0_0_14px_color-mix(in_srgb,var(--color-signal)_45%,transparent)]"
                : "border-2 border-line-strong"
          } ${done && d.today ? "streak-today shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-signal)_18%,transparent),0_0_14px_color-mix(in_srgb,var(--color-signal)_45%,transparent)]" : ""}`;
          const inner = done ? <Check /> : d.today ? <CalendarDot /> : null;
          return (
            <li key={i} className="flex flex-col items-center gap-1">
              <span aria-hidden="true" className={`text-[0.7rem] leading-none font-semibold sm:text-xs ${d.today ? "text-turf" : "text-muted"}`}>
                {d.label}
              </span>
              {d.today && canCheckIn && !done ? (
                <button type="button" aria-label={`${label}. ${t("Fazer check-in")}`} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} className={`${circle} cursor-pointer hover:bg-signal-tint active:scale-95`}>
                  {inner}
                </button>
              ) : (
                <span role="img" aria-label={label} className={circle}>
                  {inner}
                  {d.today && done && <Flame className="streak-spark pointer-events-none absolute -top-1 left-1/2 size-3.5 -translate-x-1/2 opacity-0" />}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p role="status" className="sr-only">
        {checkedInToday ? t("Check-in de hoje feito.") : ""}
      </p>

      {canCheckIn && (
        <dialog ref={dialog} aria-labelledby="checkin-h" className="cm-sheet">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 id="checkin-h" className="font-display text-lg font-bold">
              {t("Check-in de hoje")}
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label={t("Fechar")} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-chalk">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-5">
            <CheckinForm successNotice={false} onSuccess={() => dialog.current?.close()} />
          </div>
        </dialog>
      )}
    </div>
  );
}
