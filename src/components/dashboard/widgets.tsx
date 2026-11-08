/**
 * Dashboard building blocks: big rounded white cards, large numbers, light
 * charts drawn with CSS/SVG. Every chart has a text alternative.
 */

export function Card({
  title,
  icon,
  action,
  className = "",
  children,
  labelledBy,
}: {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className={`flex flex-col rounded-[var(--radius-panel)] bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={labelledBy} className="flex items-center gap-2.5 text-lg font-semibold">
            {icon && <span className="grid size-9 place-items-center rounded-full bg-chalk text-ink [&>svg]:size-[18px]">{icon}</span>}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function BigNumber({ value, unit, label }: { value: React.ReactNode; unit?: string; label?: string }) {
  return (
    <p className="leading-none">
      <span className="font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">{value}</span>
      {unit && <span className="ml-1 text-lg font-semibold text-ink-soft">{unit}</span>}
      {label && <span className="mt-1.5 block text-sm text-muted">{label}</span>}
    </p>
  );
}

export function Pill({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "soft" | "dark" }) {
  const cls = tone === "accent" ? "bg-signal text-on-accent" : tone === "dark" ? "bg-ink text-paper" : "bg-chalk text-ink";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

/** Thin vertical bars (one per day). `values` are 0..1 heights; `label` describes the chart for screen readers. */
export function BarStrip({ values, label, emphasize }: { values: number[]; label: string; emphasize?: number }) {
  return (
    <div role="img" aria-label={label} className="flex h-20 items-end justify-between gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-[7px] shrink-0 rounded-full ${v > 0 ? (i === emphasize ? "bg-ink" : "bg-signal") : "bg-line"}`}
          style={{ height: `${Math.max(v, 0.1) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Week columns (Mon–Sun), like the reference's hydration glasses. */
export function WeekColumns({ days }: { days: { label: string; state: "workout" | "manual" | "missed" | "future"; today: boolean }[] }) {
  const text = days.map((d) => `${d.label}: ${d.state === "workout" ? "treino" : d.state === "manual" ? "check-in" : d.state === "future" ? "ainda não chegou" : "sem check-in"}`).join("; ");
  return (
    <div role="img" aria-label={text} className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <span
            className={`h-16 w-full rounded-2xl sm:h-20 ${
              d.state === "workout" ? "bg-signal" : d.state === "manual" ? "bg-signal/45" : d.state === "future" ? "border-2 border-dashed border-line" : "bg-chalk"
            } ${d.today ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}
          />
          <span className={`text-xs font-semibold ${d.today ? "text-ink" : "text-muted"}`}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Smooth line chart for a short series. */
export function Sparkline({ points, label }: { points: number[]; label: string }) {
  const w = 300;
  const h = 90;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 8 - ((p - min) / span) * (h - 20)] as const);
  const line = xy.reduce((d, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = xy[i - 1]!;
    const cx = (px + x) / 2;
    return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-24 w-full overflow-visible" preserveAspectRatio="none">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--color-signal)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--color-signal)" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1]![0]} cy={xy[xy.length - 1]![1]} r="5" fill="var(--color-ink)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-signal-tint font-bold text-turf ring-2 ring-paper ${size === "sm" ? "size-8 text-xs" : "size-10 text-sm"}`}
    >
      {initials}
    </span>
  );
}

/** Decorative rings for the hero card (no stock photos). */
export function HeroDecoration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -bottom-16 size-72 text-on-accent/10 sm:size-80">
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="14" />
      <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" strokeWidth="14" />
      <circle cx="100" cy="100" r="28" fill="currentColor" />
    </svg>
  );
}
