"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { healthConsentSchema, ownHealthSchema } from "@/lib/validation/students";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { deleteOwnHealth, setHealthConsent, updateOwnHealth } from "@/server/students/students";

export async function consentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("health_consent", async () => {
    const actor = await requireActionActor("training.read_own");
    const { decision } = parseForm(healthConsentSchema, form);
    await setHealthConsent(actor, decision === "grant", await requestMeta());
    revalidatePath("/aluno/saude");
    return { ok: true, message: decision === "grant" ? "Autorização registrada." : "Autorização retirada. Seu treinador não vê mais esses dados." };
  });
}

export async function saveOwnHealthAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("save_own_health", async () => {
    const actor = await requireActionActor("training.read_own");
    const input = parseForm(ownHealthSchema, form);
    await updateOwnHealth(actor, input, await requestMeta());
    revalidatePath("/aluno/saude");
    return { ok: true, message: "Informações salvas." };
  });
}

export async function deleteOwnHealthAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("delete_own_health", async () => {
    const actor = await requireActionActor("training.read_own");
    parseForm(z.strictObject({ confirm: z.literal("apagar", { error: "Digite apagar para confirmar." }) }), form);
    await deleteOwnHealth(actor, await requestMeta());
    revalidatePath("/aluno/saude");
    return { ok: true, message: "Seus dados de saúde foram apagados." };
  });
}
