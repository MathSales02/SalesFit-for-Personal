"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { changePasswordSchema, revokeSessionSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";
import { changePassword, revokeAllOtherSessions, revokeOwnSession } from "@/server/auth/service";
import { parseForm, runAction } from "@/server/http/action";
import { clearSessionCookie, requestMeta, requireActionActor } from "@/server/http/next";
import { deleteMyAccount } from "@/server/privacy/service";

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

export async function deleteAccountAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("delete_account", async () => {
    const actor = await requireActionActor(undefined, { allowInactive: true });
    const input = parseForm(
      z.strictObject({
        password: z.string().min(1, "Digite sua senha.").max(200),
        confirm: z.string().trim().refine((v) => v === "EXCLUIR", "Digite EXCLUIR para confirmar."),
      }),
      form,
    );
    await deleteMyAccount(actor, { password: input.password }, await requestMeta());
    await clearSessionCookie();
    redirect("/entrar?aviso=conta-excluida");
  });
}
