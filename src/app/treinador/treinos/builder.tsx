"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { Notice } from "@/components/ui/notice";
import { MAX_DAYS, MAX_EXERCISES_PER_DAY } from "@/lib/validation/programs";
import { saveDraftAction } from "./actions";
import { useT } from "@/i18n/client";

export type CatalogExercise = { id: string; name: string; group: string; own: boolean; demoUrl?: string | null };

type Row = {
  key: string;
  exerciseId: string;
  variationExerciseId: string | null;
  sets: string;
  reps: string;
  load: string;
  restSeconds: string;
  tempo: string;
  notes: string;
};
type Day = { key: string; name: string; notes: string; rows: Row[] };

export type BuilderDay = {
  name: string;
  notes: string | null;
  exercises: {
    exerciseId: string;
    variationExerciseId: string | null;
    sets: number;
    reps: string;
    load: string | null;
    restSeconds: number | null;
    tempo: string | null;
    notes: string | null;
  }[];
};

let seq = 0;
const newKey = () => `k${++seq}`;
const DAY_LETTERS = "ABCDEFGHIJKLMN";

function toState(days: BuilderDay[]): Day[] {
  return days.map((d) => ({
    key: newKey(),
    name: d.name,
    notes: d.notes ?? "",
    rows: d.exercises.map((e) => ({
      key: newKey(),
      exerciseId: e.exerciseId,
      variationExerciseId: e.variationExerciseId,
      sets: String(e.sets),
      reps: e.reps,
      load: e.load ?? "",
      restSeconds: e.restSeconds == null ? "" : String(e.restSeconds),
      tempo: e.tempo ?? "",
      notes: e.notes ?? "",
    })),
  }));
}

function toPayload(programId: string, days: Day[]) {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    programId,
    days: days.map((d) => ({
      name: d.name,
      notes: d.notes || null,
      exercises: d.rows.map((r) => ({
        exerciseId: r.exerciseId,
        variationExerciseId: r.variationExerciseId,
        sets: Number(r.sets),
        reps: r.reps,
        load: r.load || null,
        restSeconds: num(r.restSeconds),
        tempo: r.tempo || null,
        notes: r.notes || null,
      })),
    })),
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

const inputClass =
  "h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-2.5 text-[0.95rem] outline-none focus:border-turf focus:ring-2 focus:ring-turf/20";

export function ProgramBuilder({ programId, initialDays, catalog }: { programId: string; initialDays: BuilderDay[]; catalog: CatalogExercise[] }) {
  const t = useT();
  const router = useRouter();
  const [days, setDays] = useState<Day[]>(() => toState(initialDays));
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dragFrom = useRef<number | null>(null);
  const names = useMemo(() => new Map(catalog.map((c) => [c.id, c.name])), [catalog]);
  const day = days[active] ?? days[0]!;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(fn: (d: Day[]) => Day[]) {
    setDays(fn);
    setDirty(true);
    setStatus(null);
  }
  const updateDay = (patch: Partial<Day>) => update((ds) => ds.map((d, i) => (i === active ? { ...d, ...patch } : d)));
  const updateRows = (fn: (rows: Row[]) => Row[]) => update((ds) => ds.map((d, i) => (i === active ? { ...d, rows: fn(d.rows) } : d)));
  const updateRow = (key: string, patch: Partial<Row>) => updateRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addDay() {
    if (days.length >= MAX_DAYS) return;
    update((ds) => [...ds, { key: newKey(), name: `Treino ${DAY_LETTERS[ds.length] ?? ds.length + 1}`, notes: "", rows: [] }]);
    setActive(days.length);
  }
  function duplicateDay() {
    if (days.length >= MAX_DAYS) return;
    update((ds) => [...ds, { ...day, key: newKey(), name: t("{0} (cópia)", { 0: day.name }).slice(0, 60), rows: day.rows.map((r) => ({ ...r, key: newKey() })) }]);
    setActive(days.length);
  }
  function removeDay() {
    if (days.length === 1) return;
    if (day.rows.length && !window.confirm(t("Remover \"{0}\" e seus {1} exercícios?", { 0: day.name, 1: day.rows.length }))) return;
    update((ds) => ds.filter((_, i) => i !== active));
    setActive((a) => Math.max(0, a - 1));
  }
  function moveDay(to: number) {
    if (to < 0 || to >= days.length) return;
    update((ds) => move(ds, active, to));
    setActive(to);
  }
  function addExercise(id: string) {
    if (day.rows.length >= MAX_EXERCISES_PER_DAY) return;
    updateRows((rows) => [...rows, { key: newKey(), exerciseId: id, variationExerciseId: null, sets: "3", reps: "10", load: "", restSeconds: "60", tempo: "", notes: "" }]);
  }

  function save(publish: boolean) {
    startTransition(async () => {
      const res = await saveDraftAction(toPayload(programId, days), publish);
      if (!res.ok) {
        setStatus({ tone: "error", text: res.message });
        return;
      }
      setDirty(false);
      setStatus({ tone: "success", text: res.message ?? "Salvo." });
      if (publish) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Day tabs */}
      <div role="tablist" aria-label={t("Dias do programa")} className="flex flex-wrap items-center gap-2">
        {days.map((d, i) => (
          <button
            key={d.key}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`h-10 rounded-[var(--radius-control)] border px-3.5 text-sm font-semibold ${
              i === active ? "border-turf-solid bg-turf-solid text-white" : "border-line-strong bg-paper text-ink-soft hover:border-ink-soft"
            }`}
          >
            {d.name || t("Sem nome")} <span className={i === active ? "text-white/70" : "text-muted"}>· {d.rows.length}</span>
          </button>
        ))}
        {days.length < MAX_DAYS && (
          <button type="button" onClick={addDay} className={buttonClass("ghost")}>
            {t("+ Dia")}
          </button>
        )}
      </div>

      <section role="tabpanel" aria-label={day.name} className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t("Nome do dia")}
            <input className={inputClass} value={day.name} maxLength={60} onChange={(e) => updateDay({ name: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-end gap-1">
            <button type="button" className={buttonClass("ghost")} onClick={() => moveDay(active - 1)} disabled={active === 0} aria-label={t("Mover dia para a esquerda")}>
              ←
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={() => moveDay(active + 1)} disabled={active === days.length - 1} aria-label={t("Mover dia para a direita")}>
              →
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={duplicateDay} disabled={days.length >= MAX_DAYS}>
              {t("Duplicar")}
            </button>
            <button type="button" className={`${buttonClass("ghost")} text-danger`} onClick={removeDay} disabled={days.length === 1}>
              {t("Remover")}
            </button>
          </div>
        </div>
        <label className="mt-3 flex flex-col gap-1.5 text-sm font-semibold">
          {t("Orientações do dia")}
          <input className={inputClass} value={day.notes} maxLength={500} placeholder={t("Ex.: aquecer 10 minutos na esteira")} onChange={(e) => updateDay({ notes: e.target.value })} />
        </label>

        <ol className="mt-5 flex flex-col gap-3">
          {day.rows.map((r, i) => (
            <li
              key={r.key}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) updateRows((rows) => move(rows, dragFrom.current!, i));
                dragFrom.current = null;
              }}
              className="rounded-[var(--radius-control)] border border-line bg-chalk p-3"
            >
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden="true" className="cursor-grab px-1 text-muted select-none" title={t("Arraste para reordenar")}>
                  ⋮⋮
                </span>
                <span className="font-display text-lg font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{names.get(r.exerciseId) ?? t("Exercício indisponível")}</span>
                <button type="button" className="px-2 text-ink-soft disabled:opacity-30" onClick={() => updateRows((rows) => move(rows, i, i - 1))} disabled={i === 0} aria-label={t("Subir {0}", { 0: names.get(r.exerciseId) })}>
                  ↑
                </button>
                <button type="button" className="px-2 text-ink-soft disabled:opacity-30" onClick={() => updateRows((rows) => move(rows, i, i + 1))} disabled={i === day.rows.length - 1} aria-label={t("Descer {0}", { 0: names.get(r.exerciseId) })}>
                  ↓
                </button>
                <button type="button" className="px-2 text-sm font-semibold text-danger" onClick={() => updateRows((rows) => rows.filter((x) => x.key !== r.key))}>
                  {t("Remover")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Small label={t("Séries")} value={r.sets} inputMode="numeric" maxLength={2} onChange={(v) => updateRow(r.key, { sets: v.replace(/\D/g, "") })} />
                <Small label={t("Repetições")} value={r.reps} maxLength={20} placeholder="8-12" onChange={(v) => updateRow(r.key, { reps: v })} />
                <Small label={t("Carga")} value={r.load} maxLength={30} placeholder={t("20 kg")} onChange={(v) => updateRow(r.key, { load: v })} />
                <Small label={t("Descanso (s)")} value={r.restSeconds} inputMode="numeric" maxLength={3} onChange={(v) => updateRow(r.key, { restSeconds: v.replace(/\D/g, "") })} />
                <Small label={t("Cadência")} value={r.tempo} maxLength={15} placeholder="3-0-1-0" onChange={(v) => updateRow(r.key, { tempo: v })} />
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Small label={t("Observação")} value={r.notes} maxLength={500} placeholder={t("Ex.: pausa de 1s embaixo")} onChange={(v) => updateRow(r.key, { notes: v })} />
                <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                  {t("Variação")}
                  <select
                    className={inputClass}
                    value={r.variationExerciseId ?? ""}
                    onChange={(e) => updateRow(r.key, { variationExerciseId: e.target.value || null })}
                  >
                    <option value="">{t("Nenhuma")}</option>
                    {catalog
                      .filter((c) => c.id !== r.exerciseId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ol>
        {day.rows.length === 0 && <p className="mt-5 text-sm text-muted">{t("Nenhum exercício neste dia. Busque abaixo para adicionar.")}</p>}

        <ExercisePicker catalog={catalog} onPick={addExercise} disabled={day.rows.length >= MAX_EXERCISES_PER_DAY} />
      </section>

      <div className="sticky bottom-[var(--tabbar-h,0px)] z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-chalk/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-[var(--radius-panel)] sm:border">
        <div className="text-sm" aria-live="polite">
          {status ? (
            <span className={status.tone === "error" ? "font-semibold text-danger" : "font-semibold text-turf"}>{status.text}</span>
          ) : (
            <span className="text-muted">{dirty ? t("Alterações não salvas.") : t("Rascunho salvo. Os alunos só veem depois de publicar.")}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass("secondary")} disabled={pending} onClick={() => save(false)}>
            {pending ? t("Salvando…") : t("Salvar rascunho")}
          </button>
          <button type="button" className={buttonClass("primary")} disabled={pending} onClick={() => save(true)}>
            {t("Publicar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Small({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
      {label}
      <input className={inputClass} value={value} maxLength={maxLength} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ExercisePicker({ catalog, onPick, disabled }: { catalog: CatalogExercise[]; onPick: (id: string) => void; disabled: boolean }) {
  const t = useT();
  const [q, setQ] = useState("");
  const id = useId();
  const term = q.trim().toLocaleLowerCase("pt-BR");
  const results = term ? catalog.filter((c) => c.name.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 8) : [];
  return (
    <div className="mt-6 border-t border-line pt-5">
      <label htmlFor={id} className="text-sm font-semibold">
        {t("Adicionar exercício")}
      </label>
      <input
        id={id}
        type="search"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        placeholder={disabled ? t("Limite de {0} exercícios por dia", { 0: MAX_EXERCISES_PER_DAY }) : t("Busque pelo nome: supino, agachamento…")}
        className={`${inputClass} mt-1.5 h-11`}
        autoComplete="off"
      />
      {term && (
        <ul className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line">
          {results.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">{t("Nada encontrado. Crie o exercício na sua biblioteca.")}</li>}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-turf-tint"
                onClick={() => {
                  onPick(c.id);
                  setQ("");
                }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {c.demoUrl && (
                    // The demonstration the student will see comes with the exercise.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.demoUrl} alt="" loading="lazy" decoding="async" className="size-11 shrink-0 rounded-lg border border-line bg-white object-contain" />
                  )}
                  <span className="truncate font-medium">{c.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{c.group}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StaleDraftNotice() {
  const t = useT();
  return <Notice tone="info">{t("Os alunos continuam vendo a versão publicada até você publicar este rascunho.")}</Notice>;
}
