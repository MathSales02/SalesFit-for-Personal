"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { acceptInviteExistingSchema, acceptInviteNewAccountSchema } from "@/lib/validation/students";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor, setSessionCookie } from "@/server/http/next";
import { acceptInvitationAsActor, acceptInvitationWithNewAccount } from "@/server/students/invitations";

export async function acceptWithNewAccountAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("accept_invitation_new", async () => {
    const input = parseForm(acceptInviteNewAccountSchema, form);
    const session = await acceptInvitationWithNewAccount(input, await requestMeta());
    await setSessionCookie(session.token, session.expiresAt);
    redirect("/aluno");
  });
}

export async function acceptAsCurrentUserAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("accept_invitation_existing", async () => {
    const actor = await requireActionActor();
    const { token } = parseForm(acceptInviteExistingSchema, form);
    await acceptInvitationAsActor(actor, token, await requestMeta());
    redirect("/aluno");
  });
}
