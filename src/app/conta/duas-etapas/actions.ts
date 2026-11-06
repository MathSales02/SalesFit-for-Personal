"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { confirmMfaEnrollment, disableMfa, regenerateRecoveryCodes, startMfaEnrollment } from "@/server/auth/mfa";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";

// Account security keeps working while a workspace's subscription is paused.
const gate = { allowInactive: true };
const code = z.string().trim().min(6, "Digite o código.").max(20);

export async function startMfaAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("mfa_start", async () => {
    const actor = await requireActionActor(undefined, gate);
    parseForm(z.strictObject({}), form);
    await startMfaEnrollment(actor);
    redirect("/conta/duas-etapas");
  });
}

export async function confirmMfaAction(_prev: ActionResult<string[]>, form: FormData): Promise<ActionResult<string[]>> {
  return runAction("mfa_confirm", async () => {
    const actor = await requireActionActor(undefined, gate);
    const input = parseForm(z.strictObject({ code }), form);
    const codes = await confirmMfaEnrollment(actor, input.code, await requestMeta());
    return { ok: true, data: codes, message: "Verificação em duas etapas ativada." };
  });
}

export async function regenerateCodesAction(_prev: ActionResult<string[]>, form: FormData): Promise<ActionResult<string[]>> {
  return runAction("mfa_regenerate", async () => {
    const actor = await requireActionActor(undefined, gate);
    const input = parseForm(z.strictObject({ code }), form);
    const codes = await regenerateRecoveryCodes(actor, input.code, await requestMeta());
    return { ok: true, data: codes, message: "Novos códigos gerados. Os anteriores deixaram de valer." };
  });
}

export async function disableMfaAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("mfa_disable", async () => {
    const actor = await requireActionActor(undefined, gate);
    const input = parseForm(z.strictObject({ password: z.string().min(1, "Digite sua senha.").max(200), code }), form);
    await disableMfa(actor, input, await requestMeta());
    revalidatePath("/conta/duas-etapas");
    return { ok: true, message: "Verificação em duas etapas desativada." };
  });
}
