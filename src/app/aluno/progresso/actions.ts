"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { addPhotoSchema, measurementIdSchema, measurementSchema, photoIdSchema, photoSharingSchema, requestPhotoUploadSchema } from "@/lib/validation/progress";
import { parseForm, parseInput, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { completeUpload, requestUpload, type UploadTicket } from "@/server/media/service";
import { addOwnMeasurement, addOwnPhoto, deleteOwnMeasurement, deleteOwnPhoto, setPhotoSharing } from "@/server/progress/service";

const PATH = "/aluno/progresso";

export async function addMeasurementAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("add_measurement", async () => {
    const actor = await requireActionActor("progress.manage_own");
    await addOwnMeasurement(actor, parseForm(measurementSchema, form), await requestMeta());
    revalidatePath(PATH);
    return { ok: true, message: "Medidas salvas." };
  });
}

export async function deleteMeasurementAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("delete_measurement", async () => {
    const actor = await requireActionActor("progress.manage_own");
    const { measurementId } = parseForm(measurementIdSchema, form);
    await deleteOwnMeasurement(actor, measurementId, await requestMeta());
    revalidatePath(PATH);
    return { ok: true };
  });
}

export async function requestPhotoUploadAction(input: unknown): Promise<ActionResult<UploadTicket>> {
  return runAction("request_photo_upload", async () => {
    const actor = await requireActionActor("progress.manage_own");
    const ticket = await requestUpload(actor, parseInput(requestPhotoUploadSchema, input), await requestMeta(), "private");
    return { ok: true, data: ticket };
  });
}

export async function completePhotoUploadAction(input: unknown): Promise<ActionResult> {
  return runAction("complete_photo_upload", async () => {
    const actor = await requireActionActor("progress.manage_own");
    const data = parseInput(addPhotoSchema, input);
    const meta = await requestMeta();
    await completeUpload(actor, data.assetId, meta);
    await addOwnPhoto(actor, data, meta);
    revalidatePath(PATH);
    return { ok: true, message: "Foto salva. Ela é privada até você compartilhar." };
  });
}

export async function setPhotoSharingAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("set_photo_sharing", async () => {
    const actor = await requireActionActor("progress.manage_own");
    const { photoId, shared } = parseForm(photoSharingSchema, form);
    await setPhotoSharing(actor, photoId, shared === "1", await requestMeta());
    revalidatePath(PATH);
    return { ok: true };
  });
}

export async function deletePhotoAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("delete_photo", async () => {
    const actor = await requireActionActor("progress.manage_own");
    const { photoId } = parseForm(photoIdSchema, form);
    await deleteOwnPhoto(actor, photoId, await requestMeta());
    revalidatePath(PATH);
    return { ok: true };
  });
}
