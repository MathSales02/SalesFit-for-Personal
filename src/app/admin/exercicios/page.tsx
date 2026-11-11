import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { MUSCLE_GROUP_LABEL, MUSCLE_GROUPS } from "@/lib/validation/exercises";
import { listPlatformExercises } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { ExerciseVideoForm } from "../forms";

export const metadata: Metadata = { title: "Exercícios" };

export default async function AdminExercisesPage() {
  const actor = await requirePageActor("admin.exercises.manage");
  const rows = await listPlatformExercises(actor);
  const withVideo = rows.filter((r) => r.videoUrl).length;
  return (
    <>
      <PageHeading
        title="Exercícios"
        description={`Vídeo de demonstração de cada exercício da biblioteca SalesFit. ${withVideo} de ${rows.length} com vídeo. Cole o link de um vídeo do YouTube que mostre exatamente este exercício e que você tenha o direito de usar; deixe em branco para remover.`}
      />
      <div className="flex flex-col gap-8">
        {MUSCLE_GROUPS.map(([g]) => {
          const list = rows.filter((r) => r.muscleGroup === g);
          if (list.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`g-${g}`}>
              <h2 id={`g-${g}`} className="mb-3 font-display text-xl font-bold">
                {MUSCLE_GROUP_LABEL[g]}
              </h2>
              <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
                {list.map((r) => (
                  <li key={r.id} className="px-5 py-4">
                    <ExerciseVideoForm exercise={r} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
