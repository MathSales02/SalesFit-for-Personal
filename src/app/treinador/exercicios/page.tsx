import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { exerciseListQuerySchema } from "@/lib/validation/exercises";
import { listExercises } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { ExerciseForm } from "./forms";
import { ExerciseLibrary } from "./library";
import { getT } from "@/i18n/server";
import { equipmentText } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Exercícios") };
}

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const actor = await requirePageActor("training.manage");
  const query = exerciseListQuerySchema.parse(await searchParams);
  // The whole library goes to the browser once; search and filters then answer on every keystroke.
  const rows = await listExercises(actor, { q: "" });
  const platformCount = rows.filter((r) => !r.own).length;

  return (
    <>
      <PageHeading
        title={t("Exercícios")}
        description={t("{0} exercícios da biblioteca SalesFit, organizados por grupo muscular, mais os seus. Copie qualquer um para ajustar o texto e incluir seu próprio vídeo.", { 0: platformCount })}
      />

      <details className="group mb-6 rounded-[var(--radius-panel)] border border-line bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
          {t("Novo exercício")}
          <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <ExerciseForm />
        </div>
      </details>

      <ExerciseLibrary exercises={rows.map((r) => (r.own ? r : { ...r, name: t(r.name), equipment: r.equipment ? equipmentText(t, r.equipment) : null }))} initialQuery={query.q} initialGroup={query.group ?? null} />
    </>
  );
}
