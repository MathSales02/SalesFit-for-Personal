import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { MUSCLE_GROUP_LABEL } from "@/lib/validation/exercises";
import { getExercise } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { playbackUrls } from "@/server/media/service";
import { ArchiveExerciseButton, CopyExerciseButton, ExerciseForm, RemoveVideoButton } from "../forms";
import { VideoUploader } from "../video-uploader";

export const metadata: Metadata = { title: "Exercício" };

export default async function ExercisePage({ params }: { params: Promise<{ exerciseId: string }> }) {
  const actor = await requirePageActor("training.manage");
  const { exerciseId } = await params;
  if (!z.uuid().safeParse(exerciseId).success) notFound();

  let e;
  try {
    e = await getExercise(actor, exerciseId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const videoUrl = e.videoAssetId ? (await playbackUrls(actor, [e.videoAssetId])).get(e.videoAssetId) : undefined;

  return (
    <>
      <Link href="/treinador/exercicios" className="mb-4 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
        Voltar para exercícios
      </Link>
      <PageHeading
        title={e.name}
        description={[MUSCLE_GROUP_LABEL[e.muscleGroup], e.equipment, e.own ? "Sua biblioteca" : "Biblioteca Cadência"].filter(Boolean).join(" · ")}
      />

      {!e.own ? (
        <div className="max-w-2xl">
          {e.instructions && <p className="leading-relaxed whitespace-pre-line text-ink-soft">{e.instructions}</p>}
          <p className="mt-6 mb-4 text-sm text-muted">Exercícios da biblioteca Cadência não podem ser editados. Faça uma cópia para ajustar o texto e incluir seu vídeo.</p>
          <CopyExerciseButton exerciseId={e.id} />
        </div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="edit-h">
            <h2 id="edit-h" className="sr-only">
              Editar exercício
            </h2>
            <ExerciseForm exerciseId={e.id} values={e} />
          </section>
          <div className="flex flex-col gap-10">
            <section aria-labelledby="video-h">
              <h2 id="video-h" className="mb-3 text-lg font-semibold">
                Vídeo de execução
              </h2>
              {videoUrl && (
                // Captions are not available for trainer uploads yet; the written instructions cover the same content.
                <video src={videoUrl} controls preload="metadata" playsInline className="mb-4 aspect-video w-full rounded-[var(--radius-panel)] bg-black" />
              )}
              <VideoUploader exerciseId={e.id} hasVideo={!!e.videoAssetId} />
              {e.videoAssetId && (
                <div className="mt-4">
                  <RemoveVideoButton exerciseId={e.id} />
                </div>
              )}
            </section>
            <section aria-labelledby="archive-h" className="border-t border-line pt-8">
              <h2 id="archive-h" className="text-lg font-semibold">
                Arquivar
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">Some da biblioteca, mas continua nos treinos e históricos que já o usam.</p>
              <ArchiveExerciseButton exerciseId={e.id} />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
