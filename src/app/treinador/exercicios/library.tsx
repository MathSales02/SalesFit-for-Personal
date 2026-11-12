"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExerciseThumb } from "@/components/exercises/video";
import { indexExercises, searchExercises } from "@/lib/exercise-search";
import { DIFFICULTY_LABEL, MUSCLE_GROUP_LABEL, MUSCLE_GROUPS, type Difficulty, type MuscleGroup } from "@/lib/validation/exercises";

export type LibraryExercise = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string | null;
  difficulty: Difficulty | null;
  videoUrl: string | null;
  demoUrl: string | null;
  sourceExerciseId: string | null;
  own: boolean;
  hasVideo: boolean;
};

/** Search as you type plus muscle group chips, over the whole library already in memory. */
export function ExerciseLibrary({ exercises, initialQuery, initialGroup }: { exercises: LibraryExercise[]; initialQuery: string; initialGroup: MuscleGroup | null }) {
  const [query, setQuery] = useState(initialQuery);
  const [group, setGroup] = useState<MuscleGroup | null>(initialGroup);

  const index = useMemo(() => indexExercises(exercises), [exercises]);
  const copied = useMemo(() => new Set(exercises.map((e) => (e.own ? e.sourceExerciseId : null)).filter(Boolean)), [exercises]);
  // Groups with nothing registered stay out of the chips (only the extra ones: cardio, mobility).
  const groups = useMemo(() => {
    const used = new Set(exercises.map((e) => e.muscleGroup));
    return MUSCLE_GROUPS.filter(([g]) => (g !== "cardio" && g !== "mobility") || used.has(g));
  }, [exercises]);

  const matched = useMemo(() => searchExercises(index, query), [index, query]);
  const counts = useMemo(() => {
    const c = new Map<MuscleGroup, number>();
    for (const e of matched) c.set(e.muscleGroup, (c.get(e.muscleGroup) ?? 0) + 1);
    return c;
  }, [matched]);
  const shown = group ? matched.filter((e) => e.muscleGroup === group) : matched;
  const own = shown.filter((e) => e.own);
  const platform = shown.filter((e) => !e.own);
  const filtered = query.trim() !== "" || group !== null;

  // The address keeps the current view, so a reload or a shared link opens the same results.
  // Not on the first render: the address is already right, and rewriting it then could cut a
  // navigation the person started while the page was still loading.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (group) params.set("group", group);
    const qs = params.toString();
    // Keeping the router's own history entry means it does not treat this as a navigation, which
    // would cancel one in flight (opening an exercise right after touching a filter).
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, group]);

  const clear = () => {
    setQuery("");
    setGroup(null);
  };

  return (
    <>
      <div role="search" className="relative mb-4">
        <label htmlFor="exercise-search" className="sr-only">
          Buscar exercícios
        </label>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="exercise-search"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque por nome, músculo ou equipamento"
          className="h-13 w-full rounded-full border border-line-strong bg-paper pr-12 pl-12 text-base outline-none placeholder:text-muted focus:border-turf focus:ring-2 focus:ring-turf/20"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-ink-soft hover:bg-chalk">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-5">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div role="group" aria-label="Filtrar por grupo muscular" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        <Chip label="Tudo" count={matched.length} active={group === null} onClick={() => setGroup(null)} />
        {groups.map(([g, label]) => (
          <Chip key={g} label={label} count={counts.get(g) ?? 0} active={group === g} onClick={() => setGroup(group === g ? null : g)} />
        ))}
      </div>

      <p role="status" className="sr-only">
        {shown.length === 1 ? "1 exercício encontrado" : `${shown.length} exercícios encontrados`}
      </p>

      {shown.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
          <p className="font-display text-xl font-bold">Nenhum exercício encontrado</p>
          <p className="mx-auto mt-2 max-w-sm text-ink-soft">
            {query.trim() ? `Não achamos nada para “${query.trim()}”${group ? ` em ${MUSCLE_GROUP_LABEL[group]}` : ""}.` : "Ainda não há exercícios neste grupo."} Tente outro termo ou crie o exercício na sua biblioteca.
          </p>
          {filtered && (
            <button type="button" onClick={clear} className="mt-5 inline-flex h-11 items-center rounded-full border border-line-strong bg-paper px-5 text-sm font-semibold hover:border-turf/60">
              Limpar busca e filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {(own.length > 0 || !filtered) && (
            <Section title="Sua biblioteca" rows={own} copied={copied} empty="Você ainda não criou exercícios. Crie um ou copie da biblioteca SalesFit." />
          )}
          {platform.length > 0 && <Section title="Biblioteca SalesFit" rows={platform} copied={copied} empty="" />}
        </>
      )}
    </>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
        active ? "border-ink bg-ink text-paper" : count === 0 ? "border-line bg-paper text-muted" : "border-line-strong bg-paper text-ink-soft hover:border-ink-soft hover:text-ink"
      }`}
    >
      {label}
      <span className={`text-xs font-bold tabular-nums ${active ? "text-paper" : "text-muted"}`}>{count}</span>
    </button>
  );
}

function Section({ title, rows, copied, empty }: { title: string; rows: LibraryExercise[]; copied: Set<string | null>; empty: string }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="text-sm font-medium text-muted tabular-nums">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-line bg-paper px-4 py-5 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <li key={e.id} className="min-w-0">
              <Link href={`/treinador/exercicios/${e.id}`} className="flex h-full items-center gap-3.5 rounded-[var(--radius-panel)] border border-line bg-paper p-3 transition-colors hover:border-turf/50">
                <ExerciseThumb externalUrl={e.videoUrl} demoUrl={e.demoUrl} hasVideo={e.hasVideo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{e.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-turf-tint px-2 py-0.5 text-xs font-semibold text-turf">{MUSCLE_GROUP_LABEL[e.muscleGroup]}</span>
                    {!e.own && copied.has(e.id) && <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold text-ink-soft">Na sua biblioteca</span>}
                  </span>
                  <span className="mt-1 block truncate text-sm text-ink-soft">{[e.equipment, e.difficulty && DIFFICULTY_LABEL[e.difficulty]].filter(Boolean).join(" · ") || "Sem equipamento informado"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
