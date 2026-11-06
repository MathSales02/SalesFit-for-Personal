"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { overrideSubscription, setUserStatus, setWorkspaceStatus, updatePlan } from "@/server/admin/service";
import { reprocessBillingEvent } from "@/server/billing/provider";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";

const reason = z.string().trim().min(5, "Descreva o motivo (mínimo 5 caracteres).").max(300, "Use no máximo 300 caracteres.");

export async function workspaceStatusAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("admin_workspace_status", async () => {
    const actor = await requireActionActor("admin.workspaces.suspend");
    const input = parseForm(z.strictObject({ workspaceId: z.uuid(), status: z.enum(["active", "suspended"]), reason }), form);
    await setWorkspaceStatus(actor, input.workspaceId, input.status, input.reason, await requestMeta());
    revalidatePath(`/admin/consultorias/${input.workspaceId}`);
    return { ok: true, message: input.status === "suspended" ? "Consultoria suspensa. Ninguém dela consegue entrar até ser reativada." : "Consultoria reativada." };
  });
}

const overrideSchema = z.discriminatedUnion("op", [
  z.strictObject({ workspaceId: z.uuid(), reason, op: z.literal("extend_trial"), days: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo 1 dia.").max(60, "Máximo 60 dias.") }),
  z.strictObject({ workspaceId: z.uuid(), reason, op: z.literal("grant"), planId: z.uuid({ error: "Escolha o plano." }), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.") }),
  z.strictObject({ workspaceId: z.uuid(), reason, op: z.literal("change_plan"), planId: z.uuid({ error: "Escolha o plano." }) }),
  z.strictObject({ workspaceId: z.uuid(), reason, op: z.literal("expire") }),
]);

const OVERRIDE_MESSAGE = {
  extend_trial: "Teste grátis estendido.",
  grant: "Assinatura liberada até a data escolhida.",
  change_plan: "Plano alterado.",
  expire: "Assinatura encerrada. O acesso fica pausado.",
} as const;

export async function subscriptionOverrideAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("admin_subscription_override", async () => {
    const actor = await requireActionActor("admin.billing.manage");
    const { workspaceId, reason: why, ...op } = parseForm(overrideSchema, form);
    await overrideSubscription(actor, workspaceId, op, why, await requestMeta());
    revalidatePath(`/admin/consultorias/${workspaceId}`);
    return { ok: true, message: OVERRIDE_MESSAGE[op.op] };
  });
}

export async function userStatusAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("admin_user_status", async () => {
    const actor = await requireActionActor("admin.users.suspend");
    const input = parseForm(z.strictObject({ userId: z.uuid(), status: z.enum(["active", "suspended"]), reason }), form);
    await setUserStatus(actor, input.userId, input.status, input.reason, await requestMeta());
    revalidatePath("/admin/usuarios");
    return { ok: true, message: input.status === "suspended" ? "Conta suspensa e sessões encerradas." : "Conta reativada." };
  });
}

/** "79", "79,9" or "1.079,90" (reais) to cents. */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/, "Use um valor como 79,90.")
  .transform((v) => {
    const [int, dec = ""] = v.replace(/\./g, "").split(",");
    return Number(int) * 100 + Number(dec.padEnd(2, "0"));
  })
  .refine((c) => c <= 10_000_00, "Valor alto demais.");

export async function planUpdateAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("admin_plan_update", async () => {
    const actor = await requireActionActor("admin.plans.manage");
    const input = parseForm(
      z.strictObject({
        planId: z.uuid(),
        name: z.string().trim().min(2, "Nome curto demais.").max(40, "Use no máximo 40 caracteres."),
        price: money,
        maxStudents: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo 1.").max(10_000, "Máximo 10.000."),
        storageGb: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo 1 GB.").max(1000, "Máximo 1000 GB."),
        isActive: z.literal("on").optional().transform((v) => v === "on"),
      }),
      form,
    );
    await updatePlan(
      actor,
      input.planId,
      { name: input.name, priceCents: input.price, maxStudents: input.maxStudents, storageQuotaMb: input.storageGb * 1024, isActive: input.isActive },
      await requestMeta(),
    );
    revalidatePath("/admin/planos");
    return { ok: true, message: "Plano salvo. Novos valores valem para novas assinaturas e renovações." };
  });
}

export async function reprocessBillingEventAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("admin_billing_reprocess", async () => {
    const actor = await requireActionActor("admin.billing.manage");
    const { eventId } = parseForm(z.strictObject({ eventId: z.uuid() }), form);
    await reprocessBillingEvent(actor, eventId, await requestMeta());
    revalidatePath("/admin/cobranca");
    return { ok: true, message: "Evento reprocessado. Confira a situação na lista." };
  });
}
