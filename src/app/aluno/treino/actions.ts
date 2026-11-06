"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { finishSessionSchema, logSetSchema, removeSetSchema, sessionIdSchema, startSessionSchema } from "@/lib/validation/workouts";
import { parseForm, parseInput, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { abandonSession, finishSession, logSet, removeSet, startSession } from "@/server/workouts/service";

export async function startSessionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("start_session", async () => {
    const actor = await requireActionActor("training.log_own");
    const { dayId, replace } = parseForm(startSessionSchema.extend({ replace: z.literal("1").optional() }), form);
    const res = await startSession(actor, dayId, await requestMeta(), { replaceOpen: replace === "1" });
    // With another workout open, resume it: the home screen offers to abandon it explicitly.
    redirect(`/aluno/treino/${"sessionId" in res ? res.sessionId : res.conflict.sessionId}`);
  });
}

export async function logSetAction(input: unknown): Promise<ActionResult> {
  return runAction("log_set", async () => {
    const actor = await requireActionActor("training.log_own");
    await logSet(actor, parseInput(logSetSchema, input));
    return { ok: true };
  });
}

export async function removeSetAction(input: unknown): Promise<ActionResult> {
  return runAction("remove_set", async () => {
    const actor = await requireActionActor("training.log_own");
    await removeSet(actor, parseInput(removeSetSchema, input));
    return { ok: true };
  });
}

export async function finishSessionAction(input: unknown): Promise<ActionResult> {
  return runAction("finish_session", async () => {
    const actor = await requireActionActor("training.log_own");
    const parsed = finishSessionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    await finishSession(actor, parsed.data, await requestMeta());
    revalidatePath("/aluno");
    redirect(`/aluno/treino/${parsed.data.sessionId}/resumo`);
  });
}

export async function abandonSessionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("abandon_session", async () => {
    const actor = await requireActionActor("training.log_own");
    const { sessionId } = parseForm(sessionIdSchema, form);
    await abandonSession(actor, sessionId, await requestMeta());
    revalidatePath("/aluno");
    redirect("/aluno");
  });
}
