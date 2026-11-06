"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { Notice } from "@/components/ui/notice";
import { EFFORT_LABEL } from "@/lib/validation/workouts";
import { finishSessionAction, logSetAction, removeSetAction } from "../actions";
import { AbandonButton } from "./abandon-button";

export type PlayerExercise = {
  id: string; // program exercise id
  exerciseId: string;
  exerciseName: string;
  variationExerciseId: string | null;
  variationName: string | null;
  sets: number;
  reps: string;
  load: string | null;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  instructions: string | null;
  videoUrl: string | null;
  previous: { setNumber: number; reps: number; loadKg: number | null }[];
  previousVariation: { setNumber: number; reps: number; loadKg: number | null }[];
};

export type LoggedSet = { programExerciseId: string; exerciseId: string; setNumber: number; reps: number; loadKg: number | null };

type Draft = { reps: string; load: string };
const slot = (pe: string, n: number) => `${pe}:${n}`;
const firstInt = (s: string) => Number(s.match(/\d+/)?.[0] ?? "") || null;
const kg = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const parseKg = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const prevLabel = (p: PlayerExercise["previous"]) => p.map((x) => (x.loadKg ? `${x.reps}×${kg(x.loadKg)}kg` : `${x.reps}`)).join(" · ");

export function WorkoutPlayer({
  sessionId,
  dayName,
  programName,
  startedAt,
  exercises,
  initialSets,
}: {
  sessionId: string;
  dayName: string;
  programName: string;
  startedAt: string;
  exercises: PlayerExercise[];
  initialSets: LoggedSet[];
}) {
  const [index, setIndex] = useState(() => {
    const firstOpen = exercises.findIndex((e) => initialSets.filter((s) => s.programExerciseId === e.id).length < e.sets);
    return firstOpen === -1 ? 0 : firstOpen;
  });
  const [logged, setLogged] = useState<Map<string, LoggedSet>>(() => new Map(initialSets.map((s) => [slot(s.programExerciseId, s.setNumber), s])));
  const [extraSets, setExtraSets] = useState<Map<string, number>>(new Map());
  const [useVariation, setUseVariation] = useState<Map<string, boolean>>(
    () => new Map(initialSets.filter((s) => exercises.find((e) => e.id === s.programExerciseId)?.variationExerciseId === s.exerciseId).map((s) => [s.programExerciseId, true])),
  );
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [pending, startTransition] = useTransition();

  const ex = exercises[index]!;
  const variation = !!useVariation.get(ex.id) && !!ex.variationExerciseId;
  const currentExerciseId = variation ? ex.variationExerciseId! : ex.exerciseId;
  const previous = variation ? ex.previousVariation : ex.previous;
  const setCount = ex.sets + (extraSets.get(ex.id) ?? 0);

  const planned = useMemo(() => exercises.reduce((a, e) => a + e.sets, 0), [exercises]);
  const done = logged.size;

  function draftFor(n: number): Draft {
    const d = drafts.get(slot(ex.id, n));
    if (d) return d;
    const l = logged.get(slot(ex.id, n));
    if (l) return { reps: String(l.reps), load: kg(l.loadKg) };
    const p = previous.find((x) => x.setNumber === n) ?? previous[previous.length - 1];
    return { reps: String(p?.reps ?? firstInt(ex.reps) ?? ""), load: kg(p?.loadKg ?? null) };
  }
  const setDraft = (n: number, patch: Partial<Draft>) => setDrafts((m) => new Map(m).set(slot(ex.id, n), { ...draftFor(n), ...patch }));

  function logOne(n: number) {
    const d = draftFor(n);
    const reps = Number(d.reps);
    const loadKg = parseKg(d.load);
    if (!Number.isInteger(reps) || reps < 0 || reps > 200) return setError("Informe as repetições (número inteiro).");
    if (Number.isNaN(loadKg) || (loadKg != null && (loadKg < 0 || loadKg > 1000))) return setError("Carga inválida.");
    setError(null);
    const entry: LoggedSet = { programExerciseId: ex.id, exerciseId: currentExerciseId, setNumber: n, reps, loadKg };
    const key = slot(ex.id, n);
    const before = logged.get(key);
    setLogged((m) => new Map(m).set(key, entry)); // optimistic
    if (ex.restSeconds) setRest({ endsAt: Date.now() + ex.restSeconds * 1000, total: ex.restSeconds });
    startTransition(async () => {
      const res = await logSetAction({ sessionId, ...entry });
      if (!res.ok) {
        setLogged((m) => {
          const next = new Map(m);
          if (before) next.set(key, before);
          else next.delete(key);
          return next;
        });
        setRest(null);
        setError(res.message);
      }
    });
  }

  function undo(n: number) {
    const key = slot(ex.id, n);
    const before = logged.get(key);
    if (!before) return;
    setLogged((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
    startTransition(async () => {
      const res = await removeSetAction({ sessionId, programExerciseId: ex.id, setNumber: n });
      if (!res.ok) {
        setLogged((m) => new Map(m).set(key, before));
        setError(res.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-40">
      <header>
        <p className="text-sm font-semibold text-muted">{programName}</p>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl leading-tight font-bold">{dayName}</h1>
          <Elapsed startedAt={startedAt} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-turf-tint" role="progressbar" aria-valuemin={0} aria-valuemax={planned} aria-valuenow={Math.min(done, planned)} aria-label="Séries feitas">
            <div className="h-full rounded-full bg-turf transition-[width]" style={{ width: `${planned ? Math.min(100, (done / planned) * 100) : 0}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {done}/{planned}
          </span>
        </div>
      </header>

      <nav aria-label="Exercícios do treino" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {exercises.map((e, i) => {
          const n = [...logged.values()].filter((s) => s.programExerciseId === e.id).length;
          const complete = n >= e.sets;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`${i + 1}. ${e.exerciseName}${complete ? ", concluído" : ""}`}
              className={`grid size-10 shrink-0 place-items-center rounded-full border text-sm font-bold ${
                i === index ? "border-turf bg-turf text-white" : complete ? "border-turf bg-turf-tint text-turf" : "border-line-strong bg-paper text-ink-soft"
              }`}
            >
              {complete && i !== index ? "✓" : i + 1}
            </button>
          );
        })}
      </nav>

      <section aria-labelledby="ex-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
        <h2 id="ex-h" className="text-xl font-semibold">
          {variation ? ex.variationName : ex.exerciseName}
        </h2>
        <p className="mt-0.5 text-sm text-ink-soft">
          {[`${ex.sets} × ${ex.reps}`, ex.load, ex.restSeconds ? `descanso ${fmtTime(ex.restSeconds)}` : null, ex.tempo && `cadência ${ex.tempo}`].filter(Boolean).join(" · ")}
        </p>
        {ex.notes && <p className="mt-1 text-sm text-muted">{ex.notes}</p>}
        {previous.length > 0 && (
          <p className="mt-2 rounded-[var(--radius-control)] bg-chalk px-3 py-2 text-sm">
            <span className="font-semibold">Última vez:</span> {prevLabel(previous)}
          </p>
        )}
        {ex.variationExerciseId && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-turf" checked={variation} onChange={(e) => setUseVariation((m) => new Map(m).set(ex.id, e.target.checked))} />
            Fazer a variação: {ex.variationName}
          </label>
        )}
        {(ex.videoUrl || ex.instructions) && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-turf">Como executar</summary>
            {ex.videoUrl && <video src={ex.videoUrl} controls playsInline preload="none" className="mt-2 aspect-video w-full rounded-[var(--radius-control)] bg-ink" />}
            {ex.instructions && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{ex.instructions}</p>}
          </details>
        )}

        <ol className="mt-4 flex flex-col gap-2">
          {Array.from({ length: setCount }, (_, i) => i + 1).map((n) => {
            const isLogged = logged.has(slot(ex.id, n));
            const d = draftFor(n);
            return (
              <li key={n} className={`flex items-end gap-2 rounded-[var(--radius-control)] p-2 ${isLogged ? "bg-turf-tint" : "bg-chalk"}`}>
                <span className="w-7 pb-2.5 text-center font-display text-lg font-bold text-muted">{n}</span>
                <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs font-semibold text-muted">
                  Reps
                  <input
                    inputMode="numeric"
                    value={d.reps}
                    maxLength={3}
                    onChange={(e) => setDraft(n, { reps: e.target.value.replace(/\D/g, "") })}
                    className="h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-paper px-2 text-center text-lg font-semibold text-ink tabular-nums outline-none focus:border-turf"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs font-semibold text-muted">
                  Kg
                  <input
                    inputMode="decimal"
                    value={d.load}
                    maxLength={7}
                    placeholder="—"
                    onChange={(e) => setDraft(n, { load: e.target.value.replace(/[^\d.,]/g, "") })}
                    className="h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-paper px-2 text-center text-lg font-semibold text-ink tabular-nums outline-none focus:border-turf"
                  />
                </label>
                {isLogged ? (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => logOne(n)} className="h-11 rounded-[var(--radius-control)] bg-turf px-3 font-semibold text-white" aria-label={`Atualizar série ${n}`}>
                      ✓
                    </button>
                    <button type="button" onClick={() => undo(n)} className="h-11 px-2 text-sm font-semibold text-ink-soft" aria-label={`Desfazer série ${n}`}>
                      Desfazer
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => logOne(n)} className="h-11 rounded-[var(--radius-control)] border border-turf bg-paper px-4 font-semibold text-turf" aria-label={`Concluir série ${n}`}>
                    Feita
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {setCount < ex.sets + 5 && (
          <button type="button" className="mt-2 text-sm font-semibold text-turf" onClick={() => setExtraSets((m) => new Map(m).set(ex.id, (m.get(ex.id) ?? 0) + 1))}>
            + Série extra
          </button>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </section>

      <div className="flex gap-2">
        <button type="button" className={`${buttonClass("secondary")} flex-1`} onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          Anterior
        </button>
        {index < exercises.length - 1 ? (
          <button type="button" className={`${buttonClass("primary")} flex-1`} onClick={() => setIndex((i) => i + 1)}>
            Próximo exercício
          </button>
        ) : (
          <button type="button" className={`${buttonClass("primary")} flex-1`} onClick={() => setFinishing(true)}>
            Concluir treino
          </button>
        )}
      </div>
      {index < exercises.length - 1 && (
        <button type="button" className="self-center text-sm font-semibold text-turf" onClick={() => setFinishing(true)}>
          Concluir treino agora
        </button>
      )}

      <AbandonButton sessionId={sessionId} />

      {finishing && <FinishPanel sessionId={sessionId} done={done} planned={planned} onCancel={() => setFinishing(false)} busy={pending} />}
      {rest && !finishing && <RestTimer endsAt={rest.endsAt} total={rest.total} onAdd={(s) => setRest((r) => (r ? { ...r, endsAt: r.endsAt + s * 1000, total: r.total + s } : r))} onClose={() => setRest(null)} />}
    </div>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const start = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The clock starts after hydration so server and client markup match.
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const secs = now == null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  return (
    <span className="font-display text-xl font-bold text-muted tabular-nums" aria-label="Tempo de treino">
      {now == null ? "–:––" : fmtTime(secs)}
    </span>
  );
}

/** Rest countdown. Vibrates (where supported) and announces when rest is over. */
function RestTimer({ endsAt, total, onAdd, onClose }: { endsAt: number; total: number; onAdd: (s: number) => void; onClose: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  const notified = useRef(false);
  useEffect(() => {
    notified.current = false;
    const tick = () => {
      const l = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(l);
      if (l === 0 && !notified.current) {
        notified.current = true;
        if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <div role="region" aria-label="Descanso" className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-ink px-4 py-3 text-white sm:bottom-0">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-white/60" aria-live="polite">
            {left === 0 ? "Descanso acabou. Próxima série!" : "Descanso"}
          </p>
          <p className="font-display text-3xl font-bold tabular-nums">{fmtTime(left)}</p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full bg-signal transition-[width] duration-200" style={{ width: `${total ? (left / total) * 100 : 0}%` }} />
          </div>
        </div>
        <button type="button" onClick={() => onAdd(15)} className="h-11 rounded-[var(--radius-control)] border border-white/25 px-3 font-semibold">
          +15s
        </button>
        <button type="button" onClick={onClose} className="h-11 rounded-[var(--radius-control)] bg-white px-4 font-semibold text-ink">
          {left === 0 ? "Fechar" : "Pular"}
        </button>
      </div>
    </div>
  );
}

function FinishPanel({ sessionId, done, planned, onCancel, busy }: { sessionId: string; done: number; planned: number; onCancel: () => void; busy: boolean }) {
  const [effort, setEffort] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="finish-h" className="fixed inset-0 z-30 flex items-end bg-ink/50 sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-t-[var(--radius-panel)] bg-paper p-5 sm:rounded-[var(--radius-panel)]">
        <h2 id="finish-h" className="font-display text-2xl font-bold">
          Concluir treino
        </h2>
        <p className="mt-1 text-sm text-muted">
          {done} de {planned} séries registradas.
        </p>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Como foi o esforço?</legend>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={effort === n}
                onClick={() => setEffort(n)}
                className={`h-10 rounded-[var(--radius-control)] border font-semibold tabular-nums ${effort === n ? "border-turf bg-turf text-white" : "border-line-strong"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 h-5 text-sm text-muted">{effort ? EFFORT_LABEL[effort] : "1 = muito leve, 10 = no limite"}</p>
        </fieldset>
        <label className="mt-3 flex flex-col gap-1.5 text-sm font-semibold">
          Observações para o treinador (opcional)
          <textarea
            value={notes}
            maxLength={500}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: a última série do supino ficou pesada"
            className="rounded-[var(--radius-control)] border border-line-strong px-3 py-2 font-normal outline-none focus:border-turf"
          />
        </label>
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" className={`${buttonClass("secondary")} flex-1`} onClick={onCancel}>
            Voltar
          </button>
          <button
            type="button"
            className={`${buttonClass("primary")} flex-1`}
            disabled={pending || busy}
            onClick={() =>
              startTransition(async () => {
                const res = await finishSessionAction({ sessionId, effort, notes: notes || null });
                if (res && !res.ok) setError(res.message);
              })
            }
          >
            {pending ? "Salvando…" : "Concluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
