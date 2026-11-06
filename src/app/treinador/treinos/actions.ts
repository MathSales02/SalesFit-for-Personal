"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { assignProgramSchema, endAssignmentSchema, programIdSchema, programInfoSchema, saveDraftSchema, updateProgramInfoSchema } from "@/lib/validation/programs";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";
import {
  archiveProgram,
  assignProgram,
  createProgram,
  discardDraft,
  duplicateProgram,
  endAssignment,
  publishDraft,
  saveDraft,
  startDraft,
  updateProgramInfo,
} from "@/server/programs/service";

const pathFor = (id: string) => `/treinador/treinos/${id}`;

export async function createProgramAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("create_program", async () => {
    const actor = await requireActionActor("training.manage");
    const input = parseForm(programInfoSchema, form);
    const id = await createProgram(actor, input, await requestMeta());
    redirect(pathFor(id));
  });
}

export async function updateProgramInfoAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("update_program", async () => {
    const actor = await requireActionActor("training.manage");
    const { programId, ...input } = parseForm(updateProgramInfoSchema, form);
    await updateProgramInfo(actor, programId, input, await requestMeta());
    revalidatePath(pathFor(programId));
    return { ok: true, message: "Informações salvas." };
  });
}

export async function startDraftAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("start_draft", async () => {
    const actor = await requireActionActor("training.manage");
    const { programId } = parseForm(programIdSchema, form);
    await startDraft(actor, programId, await requestMeta());
    revalidatePath(pathFor(programId));
    return { ok: true };
  });
}

export async function discardDraftAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("discard_draft", async () => {
    const actor = await requireActionActor("training.manage");
    const { programId } = parseForm(programIdSchema, form);
    await discardDraft(actor, programId, await requestMeta());
    revalidatePath(pathFor(programId));
    return { ok: true, message: "Rascunho descartado." };
  });
}

export async function duplicateProgramAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("duplicate_program", async () => {
    const actor = await requireActionActor("training.manage");
    const { programId } = parseForm(programIdSchema, form);
    const id = await duplicateProgram(actor, programId, await requestMeta());
    redirect(pathFor(id));
  });
}

export async function archiveProgramAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("archive_program", async () => {
    const actor = await requireActionActor("training.manage");
    const { programId } = parseForm(programIdSchema, form);
    await archiveProgram(actor, programId, await requestMeta());
    redirect("/treinador/treinos");
  });
}

/** Called by the builder with the full draft structure. */
export async function saveDraftAction(input: unknown, publish: boolean): Promise<ActionResult<{ version?: number }>> {
  return runAction("save_draft", async () => {
    const actor = await requireActionActor("training.manage");
    const parsed = saveDraftSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, code: "VALIDATION", message: issue?.message ?? "Dados inválidos.", fieldErrors: { _path: [issue?.path.join(".") ?? ""] } };
    }
    const meta = await requestMeta();
    await saveDraft(actor, parsed.data.programId, parsed.data.days, meta);
    if (!publish) return { ok: true, message: "Rascunho salvo." };
    const version = await publishDraft(actor, parsed.data.programId, meta);
    revalidatePath(pathFor(parsed.data.programId));
    return { ok: true, message: `Versão ${version} publicada.`, data: { version } };
  });
}

export async function assignProgramAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("assign_program", async () => {
    const actor = await requireActionActor("training.manage");
    // memberIds arrive as repeated checkbox fields, so this form is parsed by hand.
    const raw = {
      programId: form.get("programId"),
      memberIds: form.getAll("memberIds"),
      startsOn: form.get("startsOn"),
      endsOn: form.get("endsOn") || null,
    };
    const parsed = assignProgramSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "_form")] ??= [i.message];
      return { ok: false, code: "VALIDATION", message: "Confira os campos destacados.", fieldErrors };
    }
    const n = await assignProgram(actor, parsed.data, await requestMeta());
    revalidatePath(pathFor(parsed.data.programId));
    return { ok: true, message: n === 1 ? "Programa atribuído a 1 aluno." : `Programa atribuído a ${n} alunos.` };
  });
}

export async function endAssignmentAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("end_assignment", async () => {
    const actor = await requireActionActor("training.manage");
    const { assignmentId } = parseForm(endAssignmentSchema.extend({ programId: programIdSchema.shape.programId }), form);
    await endAssignment(actor, assignmentId, await requestMeta());
    revalidatePath(pathFor(String(form.get("programId"))));
    return { ok: true, message: "Atribuição encerrada." };
  });
}
