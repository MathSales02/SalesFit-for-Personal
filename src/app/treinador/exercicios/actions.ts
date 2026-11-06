"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { attachVideoSchema, createExerciseSchema, exerciseIdSchema, requestUploadSchema, updateExerciseSchema } from "@/lib/validation/exercises";
import { archiveExercise, attachVideo, copyExercise, createExercise, removeVideo, updateExercise } from "@/server/exercises/service";
import { parseForm, parseInput, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { completeUpload, requestUpload, type UploadTicket } from "@/server/media/service";

export async function createExerciseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("create_exercise", async () => {
    const actor = await requireActionActor("training.manage");
    const input = parseForm(createExerciseSchema, form);
    const id = await createExercise(actor, input, await requestMeta());
    redirect(`/treinador/exercicios/${id}`);
  });
}

export async function updateExerciseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("update_exercise", async () => {
    const actor = await requireActionActor("training.manage");
    const { exerciseId, ...input } = parseForm(updateExerciseSchema, form);
    await updateExercise(actor, exerciseId, input, await requestMeta());
    revalidatePath(`/treinador/exercicios/${exerciseId}`);
    return { ok: true, message: "Exercício salvo." };
  });
}

export async function copyExerciseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("copy_exercise", async () => {
    const actor = await requireActionActor("training.manage");
    const { exerciseId } = parseForm(exerciseIdSchema, form);
    const id = await copyExercise(actor, exerciseId, await requestMeta());
    redirect(`/treinador/exercicios/${id}`);
  });
}

export async function archiveExerciseAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("archive_exercise", async () => {
    const actor = await requireActionActor("training.manage");
    const { exerciseId } = parseForm(exerciseIdSchema, form);
    await archiveExercise(actor, exerciseId, await requestMeta());
    redirect("/treinador/exercicios");
  });
}

export async function removeVideoAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("remove_video", async () => {
    const actor = await requireActionActor("training.manage");
    const { exerciseId } = parseForm(exerciseIdSchema, form);
    await removeVideo(actor, exerciseId, await requestMeta());
    revalidatePath(`/treinador/exercicios/${exerciseId}`);
    return { ok: true, message: "Vídeo removido." };
  });
}

/** Step 1 of a video upload: returns a signed form the browser posts directly to storage. */
export async function requestVideoUploadAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  return runAction("request_upload", async () => {
    const actor = await requireActionActor("training.manage");
    const { contentType, sizeBytes } = parseInput(requestUploadSchema, input);
    if (!contentType.startsWith("video/")) return { ok: false, code: "VALIDATION", message: "Envie um arquivo de vídeo." };
    const ticket = await requestUpload(actor, { contentType, sizeBytes }, await requestMeta());
    return { ok: true, data: ticket };
  });
}

/** Step 2: verify what was uploaded and attach it to the exercise. */
export async function completeVideoUploadAction(input: unknown): Promise<ActionResult> {
  return runAction("complete_upload", async () => {
    const actor = await requireActionActor("training.manage");
    const { exerciseId, assetId } = parseInput(attachVideoSchema, input);
    const meta = await requestMeta();
    await completeUpload(actor, assetId, meta);
    await attachVideo(actor, exerciseId, assetId, meta);
    revalidatePath(`/treinador/exercicios/${exerciseId}`);
    return { ok: true, message: "Vídeo enviado." };
  });
}
