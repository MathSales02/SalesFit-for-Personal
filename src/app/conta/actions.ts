"use server";

import { revalidatePath } from "next/cache";
import { changePasswordSchema, revokeSessionSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";
import { changePassword, revokeAllOtherSessions, revokeOwnSession } from "@/server/auth/service";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";

export async function changePasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("change_password", async () => {
    const actor = await requireActionActor(undefined, { allowInactive: true });
    const input = parseForm(changePasswordSchema, form);
    await changePassword(actor, input, await requestMeta());
    revalidatePath("/conta");
    return { ok: true, message: "Senha alterada. As outras sessões foram encerradas." };
  });
}

export async function revokeSessionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("revoke_session", async () => {
    const actor = await requireActionActor(undefined, { allowInactive: true });
    const { sessionId } = parseForm(revokeSessionSchema, form);
    await revokeOwnSession(actor, sessionId, await requestMeta());
    revalidatePath("/conta");
    return { ok: true, message: "Sessão encerrada." };
  });
}

export async function revokeOtherSessionsAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("revoke_other_sessions", async () => {
    const actor = await requireActionActor(undefined, { allowInactive: true });
    parseForm(revokeSessionSchema.pick({}), form);
    await revokeAllOtherSessions(actor, await requestMeta());
    revalidatePath("/conta");
    return { ok: true, message: "Todas as outras sessões foram encerradas." };
  });
}
