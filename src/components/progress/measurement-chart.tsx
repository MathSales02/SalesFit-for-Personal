"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MEASUREMENT_FIELDS, type MeasurementKey } from "@/lib/validation/progress";

export type MeasurementRow = { id: string; measuredOn: string } & Record<MeasurementKey, number | null>;

// Drawn at the real container width so text keeps its size on phones (no viewBox scaling).
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** "Nice" tick values covering [min, max]. */
function ticks(min: number, max: number, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * One measure over time: a single series, so no legend box; the selector above
 * names it. Hover or arrow keys move a crosshair with a tooltip. The table
 * rendered by the page is the non-visual equivalent.
 */
export function MeasurementChart({ rows }: { rows: MeasurementRow[] }) {
  const available = MEASUREMENT_FIELDS.filter(([k]) => rows.filter((r) => r[k] != null).length >= 2);
  const [metric, setMetric] = useState<MeasurementKey>(available[0]?.[0] ?? "weightKg");
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setW(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const field = MEASUREMENT_FIELDS.find(([k]) => k === metric)!;
  const points = useMemo(
    () =>
      rows
        .filter((r) => r[metric] != null)
        .map((r) => ({ date: r.measuredOn, value: r[metric] as number, t: Date.parse(`${r.measuredOn}T12:00:00Z`) }))
        .sort((a, b) => a.t - b.t),
    [rows, metric],
  );

  if (available.length === 0) {
    return <p className="text-sm text-muted">Registre pelo menos duas medições para ver a evolução no gráfico.</p>;
  }

  const values = points.map((p) => p.value);
  const yt = ticks(Math.min(...values), Math.max(...values));
  const yMin = yt[0]!;
  const yMax = yt[yt.length - 1]!;
  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const x = (t: number) => PAD.left + (tMax === tMin ? 0.5 : (t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const cur = active != null ? points[active] : undefined;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last.value - first.value;

  function nearest(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.t) - px) < Math.abs(x(points[best]!.t) - px)) best = i;
    });
    setActive(best);
  }

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Medida" className="flex flex-wrap gap-1.5">
          {available.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={k === metric}
              onClick={() => {
                setMetric(k);
                setActive(null);
              }}
              className={`h-9 rounded-[var(--radius-control)] border px-3 text-sm font-semibold ${k === metric ? "border-turf-solid bg-turf-solid text-white" : "border-line-strong bg-paper text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-soft">
          {fmtNum(first.value)} → <span className="font-semibold text-ink">{fmtNum(last.value)} {field[2]}</span>{" "}
          <span className="text-muted">
            ({delta > 0 ? "+" : ""}
            {fmtNum(delta)} {field[2]})
          </span>
        </p>
      </div>

      <figcaption id={titleId} className="sr-only">
        {field[1]} ao longo do tempo, de {fmtDate(first.date)} a {fmtDate(last.date)}: de {fmtNum(first.value)} para {fmtNum(last.value)} {field[2]}.
      </figcaption>
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-turf/40"
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
            else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length) - 1));
            else return;
            e.preventDefault();
          }}
        >
          {yt.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px] tabular-nums">
                {fmtNum(v)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 8} className="fill-muted text-[11px]">
            {fmtDate(first.date)}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">
            {fmtDate(last.date)}
          </text>
          {cur && <line x1={x(cur.t)} x2={x(cur.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-line-strong)" strokeWidth={1} />}
          <path d={path} fill="none" stroke="var(--color-turf)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle
              key={p.date + i}
              cx={x(p.t)}
              cy={y(p.value)}
              r={i === active ? 6 : 4}
              fill="var(--color-turf)"
              stroke="var(--color-paper)"
              strokeWidth={2}
            />
          ))}
        </svg>
        {cur && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[var(--radius-control)] border border-line bg-paper px-2.5 py-1.5 text-sm shadow-[var(--shadow-raised)]"
            style={{ left: `${(x(cur.t) / W) * 100}%` }}
          >
            <span className="block text-xs text-muted">{fmtDate(cur.date)}</span>
            <span className="font-semibold text-ink tabular-nums">
              {fmtNum(cur.value)} {field[2]}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}
