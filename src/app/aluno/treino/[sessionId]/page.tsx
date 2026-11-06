import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { playbackUrls } from "@/server/media/service";
import { getSessionView } from "@/server/workouts/service";
import { WorkoutPlayer, type PlayerExercise } from "./player";

export const metadata: Metadata = { title: "Treino" };

export default async function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const actor = await requirePageActor("training.log_own");
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();

  let view;
  try {
    view = await getSessionView(actor, sessionId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (view.session.status === "completed") redirect(`/aluno/treino/${sessionId}/resumo`);
  if (view.session.status === "abandoned") redirect("/aluno");

  const videos = await playbackUrls(actor, view.day.exercises.map((e) => e.videoAssetId).filter((x): x is string => !!x));
  const exercises: PlayerExercise[] = view.day.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    variationExerciseId: e.variationExerciseId,
    variationName: e.variationName,
    sets: e.sets,
    reps: e.reps,
    load: e.load,
    restSeconds: e.restSeconds,
    tempo: e.tempo,
    notes: e.notes,
    instructions: e.instructions,
    videoUrl: e.videoAssetId ? (videos.get(e.videoAssetId) ?? null) : null,
    previous: view.previous.get(e.exerciseId) ?? [],
    previousVariation: e.variationExerciseId ? (view.previous.get(e.variationExerciseId) ?? []) : [],
  }));

  return (
    <WorkoutPlayer
        sessionId={sessionId}
        dayName={view.day.name}
        programName={view.programName}
        startedAt={view.session.startedAt.toISOString()}
        exercises={exercises}
        initialSets={view.sets.map((s) => ({ programExerciseId: s.programExerciseId, exerciseId: s.exerciseId, setNumber: s.setNumber, reps: s.reps, loadKg: s.loadKg }))}
      />
  );
}

