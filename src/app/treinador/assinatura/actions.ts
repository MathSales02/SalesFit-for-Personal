"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { cancelSubscription, startCheckout } from "@/server/billing/provider";
import { parseForm, runAction } from "@/server/http/action";
import { requestMeta, requireActionActor } from "@/server/http/next";

// Billing must keep working while access is paused: that is how the trainer gets it back.
const gate = { allowInactive: true };

export async function checkoutAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("billing_checkout", async () => {
    const actor = await requireActionActor("subscription.manage", gate);
    const input = parseForm(
      z.strictObject({
        planId: z.uuid({ error: "Escolha um plano." }),
        cpfCnpj: z.string().trim().max(20).optional(),
      }),
      form,
    );
    await startCheckout(actor, input, await requestMeta());
    redirect("/treinador/assinatura?cobranca=gerada");
  });
}

export async function cancelSubscriptionAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("billing_cancel", async () => {
    const actor = await requireActionActor("subscription.manage", gate);
    parseForm(z.strictObject({ confirm: z.literal("on", { error: "Marque a confirmação para cancelar." }) }), form);
    await cancelSubscription(actor, await requestMeta());
    redirect("/treinador/assinatura?cancelada=1");
  });
}
