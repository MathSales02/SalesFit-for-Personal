import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { PageHeading } from "@/components/ui/page-heading";
import { exerciseListQuerySchema, MUSCLE_GROUP_LABEL, MUSCLE_GROUPS } from "@/lib/validation/exercises";
import { listExercises } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { ExerciseForm } from "./forms";

export const metadata: Metadata = { title: "Exercícios" };

type Row = Awaited<ReturnType<typeof listExercises>>[number];

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("training.manage");
  const query = exerciseListQuerySchema.parse(await searchParams);
  const rows = await listExercises(actor, query);
  const own = rows.filter((r) => r.own);
  const platform = rows.filter((r) => !r.own);
  const filtered = !!(query.q || query.group);

  return (
    <>
      <PageHeading title="Exercícios" description="Sua biblioteca e a biblioteca Cadência. Copie qualquer exercício para ajustar o texto e incluir seu próprio vídeo." />

      <details className="group mb-8 rounded-[var(--radius-panel)] border border-line bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
          Novo exercício
          <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <ExerciseForm />
        </div>
      </details>

      <form role="search" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" action="/treinador/exercicios">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-semibold">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={60}
            placeholder="Nome do exercício"
            className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 outline-none focus:border-turf focus:ring-2 focus:ring-turf/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="group" className="text-sm font-semibold">
            Grupo
          </label>
          <select
            id="group"
            name="group"
            defaultValue={query.group ?? ""}
            className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 outline-none focus:border-turf"
          >
            <option value="">Todos</option>
            {MUSCLE_GROUPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
        {filtered && (
          <Link href="/treinador/exercicios" className={buttonClass("ghost")}>
            Limpar
          </Link>
        )}
      </form>

      <ExerciseSection title="Sua biblioteca" rows={own} empty={filtered ? "Nada encontrado na sua biblioteca." : "Você ainda não criou exercícios. Crie um ou copie da biblioteca Cadência."} />
      <ExerciseSection title="Biblioteca Cadência" rows={platform} empty="Nada encontrado." />
    </>
  );
}

function ExerciseSection({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section className="mb-10">
      <h2 className="mb-2 text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/treinador/exercicios/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-chalk">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="truncate text-sm text-muted">{[MUSCLE_GROUP_LABEL[r.muscleGroup], r.equipment].filter(Boolean).join(" · ")}</p>
                </div>
                {r.hasVideo && <span className="shrink-0 rounded bg-turf-tint px-2 py-0.5 text-xs font-semibold text-turf">Vídeo</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
