import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProgramView } from "@/components/program-view";
import { PageHeading } from "@/components/ui/page-heading";
import { MUSCLE_GROUP_LABEL } from "@/lib/validation/exercises";
import { listExercises } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { assignableStudents, getProgram } from "@/server/programs/service";
import { ProgramBuilder, StaleDraftNotice } from "../builder";
import {
  ArchiveProgramButton,
  AssignForm,
  DiscardDraftButton,
  DuplicateProgramButton,
  EndAssignmentButton,
  ProgramInfoForm,
  StartDraftButton,
} from "../forms";
import { currentLocale, getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Programa") };
}

const fmtDate = (iso: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export default async function ProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const t = await getT();
  const actor = await requirePageActor("training.manage");
  const { programId } = await params;
  if (!z.uuid().safeParse(programId).success) notFound();

  let data;
  try {
    data = await getProgram(actor, programId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { program, published, draft, assignments } = data;
  const [catalogRows, students] = await Promise.all([draft ? listExercises(actor, { q: "" }) : Promise.resolve([]), published ? assignableStudents(actor) : Promise.resolve([])]);
  const catalog = catalogRows.map((c) => ({ id: c.id, name: c.own ? c.name : t(c.name), group: t(MUSCLE_GROUP_LABEL[c.muscleGroup]), own: c.own, demoUrl: c.demoUrl }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <Link href="/treinador/treinos" className="mb-4 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
        {t("Voltar para treinos")}
      </Link>
      <PageHeading
        title={program.name}
        description={[program.isTemplate ? t("Modelo") : null, published ? t("Versão {0} publicada", { 0: published.number }) : t("Ainda não publicado"), draft ? t("rascunho aberto") : null]
          .filter(Boolean)
          .join(" · ")}
      />

      {draft ? (
        <section aria-labelledby="draft-h" className="mb-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="draft-h" className="text-lg font-semibold">
              {t("Rascunho da versão")} {draft.number}
            </h2>
            {published && <DiscardDraftButton programId={program.id} />}
          </div>
          {published && (
            <div className="mb-4">
              <StaleDraftNotice />
            </div>
          )}
          <ProgramBuilder
            programId={program.id}
            catalog={catalog}
            initialDays={draft.content.days.map((d) => ({
              name: d.name,
              notes: d.notes,
              exercises: d.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                variationExerciseId: e.variationExerciseId,
                sets: e.sets,
                reps: e.reps,
                load: e.load,
                restSeconds: e.restSeconds,
                tempo: e.tempo,
                notes: e.notes,
              })),
            }))}
          />
        </section>
      ) : (
        published && (
          <section aria-labelledby="pub-h" className="mb-12">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="pub-h" className="text-lg font-semibold">
                {t("Versão")} {published.number}
              </h2>
              <StartDraftButton programId={program.id} />
            </div>
            <ProgramView content={published.content} />
          </section>
        )
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        {published && (
          <section aria-labelledby="assign-h">
            <h2 id="assign-h" className="mb-1 text-lg font-semibold">
              {t("Atribuir a alunos")}
            </h2>
            <p className="mb-4 text-sm text-muted">{t("Cada aluno segue um programa por vez. Atribuir este substitui o atual.")}</p>
            <AssignForm programId={program.id} programName={program.name} students={students} today={today} />

            {assignments.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted">{t("Seguindo este programa")}</h3>
                <ul className="mt-2 divide-y divide-line">
                  {assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <Link href={`/treinador/alunos/${a.memberId}`} className="truncate font-medium hover:underline">
                          {a.displayName}
                        </Link>
                        <p className="text-sm text-muted">
                          {t("Desde")} {fmtDate(a.startsOn)}
                          {a.endsOn ? t(" até {0}", { 0: fmtDate(a.endsOn) }) : ""}
                        </p>
                      </div>
                      <EndAssignmentButton programId={program.id} assignmentId={a.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="info-h" className="flex flex-col gap-8">
          <div>
            <h2 id="info-h" className="mb-4 text-lg font-semibold">
              {t("Informações")}
            </h2>
            <ProgramInfoForm programId={program.id} values={program} />
          </div>
          <div className="flex flex-wrap gap-3 border-t border-line pt-6">
            <DuplicateProgramButton programId={program.id} />
            <ArchiveProgramButton programId={program.id} />
          </div>
        </section>
      </div>
    </>
  );
}
