"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { invitationIdSchema, inviteStudentSchema, memberStatusSchema, studentProfileSchema, trainerHealthSchema } from "@/lib/validation/students";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import { inviteStudent, revokeInvitation } from "@/server/students/invitations";
import { setStudentStatus, updateStudentHealthAsTrainer, updateStudentProfile } from "@/server/students/students";

export async function inviteStudentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("invite_student", async () => {
    const actor = await requireActionActor("students.manage");
    const { email } = parseForm(inviteStudentSchema, form);
    await inviteStudent(actor, email, await requestMeta());
    revalidatePath("/treinador/alunos");
    return { ok: true, message: `Convite enviado para ${email}.` };
  });
}

export async function revokeInvitationAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("revoke_invitation", async () => {
    const actor = await requireActionActor("students.manage");
    const { invitationId } = parseForm(invitationIdSchema, form);
    await revokeInvitation(actor, invitationId, await requestMeta());
    revalidatePath("/treinador/alunos");
    return { ok: true };
  });
}

export async function updateProfileAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("update_student_profile", async () => {
    const actor = await requireActionActor("students.manage");
    const input = parseForm(studentProfileSchema, form);
    await updateStudentProfile(actor, input, await requestMeta());
    revalidatePath(`/treinador/alunos/${input.memberId}`);
    return { ok: true, message: "Ficha salva." };
  });
}

export async function updateHealthAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("update_student_health", async () => {
    const actor = await requireActionActor("students.manage");
    const { memberId, ...health } = parseForm(trainerHealthSchema, form);
    await updateStudentHealthAsTrainer(actor, memberId, health, await requestMeta());
    revalidatePath(`/treinador/alunos/${memberId}`);
    return { ok: true, message: "Dados de saúde salvos." };
  });
}

const STATUS_MESSAGE = { active: "Aluno reativado.", suspended: "Aluno suspenso.", archived: "Aluno arquivado." } as const;

export async function setStatusAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("set_student_status", async () => {
    const actor = await requireActionActor("students.manage");
    const { memberId, status } = parseForm(memberStatusSchema, form);
    await setStudentStatus(actor, memberId, status, await requestMeta());
    revalidatePath(`/treinador/alunos/${memberId}`);
    revalidatePath("/treinador/alunos");
    return { ok: true, message: STATUS_MESSAGE[status] };
  });
}
