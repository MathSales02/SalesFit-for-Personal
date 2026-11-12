import { FeatureNote } from "@/components/shell/feature-locked";
import { actorHasFeature } from "@/server/authz/policy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExerciseVideo } from "@/components/exercises/video";
import { buttonClass } from "@/components/ui/button-styles";
import { DIFFICULTY_LABEL, MUSCLE_GROUP_LABEL } from "@/lib/validation/exercises";
import { getExercise } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { playbackUrls } from "@/server/media/service";
import { ArchiveExerciseButton, CopyExerciseButton, ExerciseForm, RemoveVideoButton } from "../forms";
import { VideoUploader } from "../video-uploader";
import { getT } from "@/i18n/server";
import { equipmentText } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Exercício") };
}

const lines = (text: string | null) => (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

export default async function ExercisePage({ params }: { params: Promise<{ exerciseId: string }> }) {
  const t = await getT();
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
  // The platform library is translated; what the trainer wrote stays as written.
  const shownName = e.own ? e.name : t(e.name);
  const steps = lines(e.instructions);
  const tips = lines(e.tips);
  const mistakes = lines(e.commonMistakes);

  return (
    <>
      <Link href="/treinador/exercicios" className="mb-4 inline-block text-sm font-semibold text-turf underline-offset-4 hover:underline">
        {t("Voltar para exercícios")}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-[2.1rem] leading-none font-bold tracking-tight text-ink sm:text-[2.5rem]">{shownName}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-turf-tint px-3 py-1 font-semibold text-turf">{t(MUSCLE_GROUP_LABEL[e.muscleGroup])}</span>
          {e.difficulty && <span className="rounded-full border border-line-strong bg-paper px-3 py-1 font-semibold text-ink-soft">{t(DIFFICULTY_LABEL[e.difficulty])}</span>}
          <span className="text-ink-soft">{e.own ? t("Sua biblioteca") : t("Biblioteca SalesFit")}</span>
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <ExerciseVideo src={videoUrl} externalUrl={e.videoUrl} demoUrl={e.demoUrl} title={shownName} placeholder />

          {e.description && (
            <section aria-labelledby="about-h">
              <h2 id="about-h" className="mb-2 text-lg font-semibold">
                {t("Sobre o movimento")}
              </h2>
              <p className="leading-relaxed whitespace-pre-line text-ink-soft">{e.description}</p>
            </section>
          )}

          {steps.length > 0 && (
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="mb-3 text-lg font-semibold">
                {t("Passo a passo")}
              </h2>
              <ol className="flex flex-col gap-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-signal text-sm font-bold text-on-accent">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed text-ink">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="facts-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
            <h2 id="facts-h" className="sr-only">
              {t("Ficha do exercício")}
            </h2>
            <dl className="flex flex-col gap-4 text-sm">
              <div>
                <dt className="font-semibold text-ink-soft">{t("Músculo principal")}</dt>
                <dd className="mt-1 text-base font-semibold text-ink">{t(MUSCLE_GROUP_LABEL[e.muscleGroup])}</dd>
              </div>
              {e.secondaryMuscles.length > 0 && (
                <div>
                  <dt className="font-semibold text-ink-soft">{t("Também trabalha")}</dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.secondaryMuscles.map((g) => (
                      <span key={g} className="rounded-full border border-line-strong px-2.5 py-0.5 font-medium text-ink">
                        {t(MUSCLE_GROUP_LABEL[g])}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="font-semibold text-ink-soft">{t("Equipamento")}</dt>
                <dd className="mt-1 text-base text-ink">{e.equipment ? (e.own ? e.equipment : equipmentText(t, e.equipment)) : t("Não informado")}</dd>
              </div>
            </dl>
          </section>

          {tips.length > 0 && <Notes title={t("Dicas de execução")} items={tips} tone="tip" />}
          {mistakes.length > 0 && <Notes title={t("Erros comuns")} items={mistakes} tone="mistake" />}

          {!e.own && (
            <section aria-labelledby="copy-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <h2 id="copy-h" className="font-semibold">
                {e.copyId ? t("Já está na sua biblioteca") : t("Usar na sua biblioteca")}
              </h2>
              {e.copyId ? (
                <>
                  <p className="mt-1 mb-4 text-sm text-ink-soft">{t("Você já copiou este exercício. Suas alterações ficam na sua cópia.")}</p>
                  <Link href={`/treinador/exercicios/${e.copyId}`} className={buttonClass("secondary")}>
                    {t("Abrir minha cópia")}
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-1 mb-4 text-sm text-ink-soft">{t("Exercícios da biblioteca SalesFit não podem ser editados. Faça uma cópia para ajustar o texto e incluir seu vídeo.")}</p>
                  <CopyExerciseButton exerciseId={e.id} />
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {e.own && (
        <div className="mt-12 grid gap-12 border-t border-line pt-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="edit-h">
            <h2 id="edit-h" className="mb-5 text-lg font-semibold">
              {t("Editar exercício")}
            </h2>
            <ExerciseForm exerciseId={e.id} values={e} />
          </section>
          <div className="flex flex-col gap-10">
            <section aria-labelledby="video-h">
              <h2 id="video-h" className="mb-1 text-lg font-semibold">
                {t("Seu vídeo de execução")}
              </h2>
              <p className="mb-4 text-sm text-ink-soft">{t("Um vídeo enviado por você tem prioridade sobre o link do YouTube.")}</p>
              {actorHasFeature(actor, "own_videos") ? <VideoUploader exerciseId={e.id} hasVideo={!!e.videoAssetId} /> : <FeatureNote feature="own_videos" role="trainer" />}
              {e.videoAssetId && (
                <div className="mt-4">
                  <RemoveVideoButton exerciseId={e.id} />
                </div>
              )}
            </section>
            <section aria-labelledby="archive-h" className="border-t border-line pt-8">
              <h2 id="archive-h" className="text-lg font-semibold">
                {t("Arquivar")}
              </h2>
              <p className="mt-1 mb-4 text-sm text-muted">{t("Some da biblioteca, mas continua nos treinos e históricos que já o usam.")}</p>
              <ArchiveExerciseButton exerciseId={e.id} />
            </section>
          </div>
        </div>
      )}
    </>
  );
}

function Notes({ title, items, tone }: { title: string; items: string[]; tone: "tip" | "mistake" }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${tone === "tip" ? "text-success" : "text-danger"}`}>
              {tone === "tip" ? <path d="m4 10.5 4 4 8-9" /> : <path d="M5 5l10 10M15 5 5 15" />}
            </svg>
            <span className="leading-relaxed text-ink">{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
