import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { assertCan, assertEmailVerified, requireMembership, type Actor } from "../authz/policy";
import type { Tx } from "../db/client";
import { withSystem, withTenant } from "../db/context";
import { billingEvents, billingInvoices, plans, subscriptions, workspaceMembers, workspaces } from "../db/schema";
import { env } from "../env";
import type { RequestMeta } from "../http/request-meta";
import { safeEqual } from "../lib/crypto";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { audit, recordSecurityEvent } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { billingAccess } from "./access";
import { asaasEnabled, createCustomer, createSubscription, deleteSubscription, listSubscriptionPayments, type AsaasPayment } from "./asaas";

/**
 * Online subscription through Asaas.
 *  - Checkout creates (or replaces) a monthly Asaas subscription; access only
 *    changes when a verified webhook confirms the payment.
 *  - Webhooks are stored first (unique event id), then processed. Redeliveries
 *    are no-ops; failures are kept for an admin to reprocess.
 */

const PROVIDER = "asaas";
/** Context user for system work triggered by the provider (no human actor). */
const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** CPF (11 digits) or CNPJ (14 digits) with valid check digits. Returns digits only, or null. */
export function normalizeCpfCnpj(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(d)) return null;
  const check = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const w1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return check(d, w1) === Number(d[9]) && check(d, w2) === Number(d[10]) ? d : null;
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return check(d, w1) === Number(d[12]) && check(d, w2) === Number(d[13]) ? d : null;
  }
  return null;
}

/** Today in Brazil as YYYY-MM-DD. */
function brazilToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** End of the day (Brazil) one month after `isoDate`, clamping to the month's last day. */
export function periodEndAfter(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const day = Math.min(d, last);
  return new Date(`${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}T23:59:59-03:00`);
}

/** Only Asaas-hosted payment pages are ever linked. */
export function safeInvoiceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com")) ? u.toString() : null;
  } catch {
    return null;
  }
}

const PAID = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

async function upsertInvoice(tx: Tx, workspaceId: string, p: AsaasPayment, paidAt: Date | null) {
  const values = {
    workspaceId,
    provider: PROVIDER,
    providerPaymentId: String(p.id).slice(0, 100),
    providerSubscriptionId: p.subscription ?? null,
    status: String(p.status).slice(0, 40),
    valueCents: Math.round(Number(p.value) * 100),
    dueDate: p.dueDate,
    invoiceUrl: safeInvoiceUrl(p.invoiceUrl),
    paidAt,
  };
  await tx
    .insert(billingInvoices)
    .values(values)
    .onConflictDoUpdate({
      target: [billingInvoices.provider, billingInvoices.providerPaymentId],
      set: { status: values.status, valueCents: values.valueCents, dueDate: values.dueDate, invoiceUrl: values.invoiceUrl, ...(paidAt ? { paidAt } : {}), updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Trainer side
// ---------------------------------------------------------------------------

export async function listInvoices(actor: Actor) {
  assertCan(actor, "subscription.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) =>
    tx
      .select({ id: billingInvoices.id, status: billingInvoices.status, valueCents: billingInvoices.valueCents, dueDate: billingInvoices.dueDate, invoiceUrl: billingInvoices.invoiceUrl, paidAt: billingInvoices.paidAt })
      .from(billingInvoices)
      .where(eq(billingInvoices.workspaceId, m.workspaceId))
      .orderBy(desc(billingInvoices.dueDate), desc(billingInvoices.createdAt))
      .limit(24),
  );
}

/** Whether checkout needs the CPF/CNPJ (first purchase only; it is not stored by us). */
export async function needsTaxId(actor: Actor) {
  assertCan(actor, "subscription.read");
  const m = requireMembership(actor);
  return withSystem({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [s] = await tx.select({ customer: subscriptions.providerCustomerId }).from(subscriptions).where(eq(subscriptions.workspaceId, m.workspaceId));
    return !s?.customer;
  });
}

/**
 * Starts (or changes) the monthly subscription. Returns the payment page of
 * the first charge when Asaas has already generated it.
 */
export async function startCheckout(actor: Actor, input: { planId: string; cpfCnpj?: string | null }, meta: RequestMeta): Promise<{ invoiceUrl: string | null }> {
  assertCan(actor, "subscription.manage");
  assertEmailVerified(actor);
  const m = requireMembership(actor);
  if (!asaasEnabled()) throw new AppError("UNAVAILABLE", "O pagamento online ainda não está disponível. Fale com o suporte.");
  await enforceRateLimit("checkout_user", actor.userId);

  // If anything fails after Asaas created the subscription (including the commit), undo it there too.
  let createdAtProvider: string | null = null;
  try {
    return await checkoutTx(actor, m.workspaceId, input, meta, (id) => (createdAtProvider = id));
  } catch (err) {
    if (createdAtProvider) {
      await deleteSubscription(createdAtProvider).catch((e) => log.error("orphan Asaas subscription", { subscription: createdAtProvider, ...errorFields(e) }));
    }
    throw err;
  }
}

function checkoutTx(actor: Actor, workspaceId: string, input: { planId: string; cpfCnpj?: string | null }, meta: RequestMeta, onCreated: (id: string) => void) {
  const m = { workspaceId };
  return withSystem({ userId: actor.userId, workspaceId }, async (tx) => {
    // Serializes concurrent checkouts of the same workspace (double clicks, two tabs).
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, m.workspaceId)).for("update");
    if (!sub) throw Errors.notFound();
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.isActive, true)));
    if (!plan || plan.code === "trial") throw Errors.validation({ planId: ["Escolha um plano disponível."] });

    const [used] = await tx
      .select({ n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), inArray(workspaceMembers.status, ["active", "invited"])));
    const studentsUsed = used?.n ?? 0;
    if (studentsUsed > plan.maxStudents) {
      throw new AppError("PLAN_LIMIT", `Este plano comporta até ${plan.maxStudents} alunos e você tem ${studentsUsed} (ativos e convidados). Arquive alunos ou escolha um plano maior.`);
    }

    const access = billingAccess(sub);
    const paidAndRenewing = sub.status === "active" && access.state === "active";
    if (paidAndRenewing && sub.planId === plan.id && sub.provider === PROVIDER && sub.providerSubscriptionId && !sub.pendingPlanId) {
      throw new AppError("CONFLICT", "Este já é o seu plano.");
    }

    let customer = sub.providerCustomerId;
    if (!customer) {
      const taxId = input.cpfCnpj ? normalizeCpfCnpj(input.cpfCnpj) : null;
      if (!taxId) throw Errors.validation({ cpfCnpj: ["Informe um CPF ou CNPJ válido."] });
      const [ws] = await tx.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, m.workspaceId));
      const c = await createCustomer({ name: taxId.length === 14 ? (ws?.name ?? actor.displayName) : actor.displayName, cpfCnpj: taxId, email: actor.email, externalReference: m.workspaceId });
      customer = c.id;
      await tx.update(subscriptions).set({ provider: PROVIDER, providerCustomerId: customer, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    }

    // Replace any previous Asaas subscription first, so two never charge at once.
    const previous = sub.provider === PROVIDER ? sub.providerSubscriptionId : null;
    if (previous) await deleteSubscription(previous);

    // A paid period runs to its end; the new plan's first charge falls on that date.
    const end = access.state === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() && sub.status !== "trialing" ? sub.currentPeriodEnd : null;
    const nextDueDate = end ? brazilToday(end) : brazilToday();
    const created = await createSubscription({
      customer,
      value: plan.priceCents / 100,
      nextDueDate,
      description: `Cadência: plano ${plan.name}`,
      externalReference: m.workspaceId,
    });
    onCreated(created.id);

    await tx
      .update(subscriptions)
      .set({
        provider: PROVIDER,
        providerSubscriptionId: created.id,
        pendingPlanId: plan.id,
        status: sub.status === "canceled" && end ? "active" : sub.status,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
    await audit(tx, {
      action: "billing.checkout_started",
      actorUserId: actor.userId,
      workspaceId: m.workspaceId,
      targetType: "subscription",
      targetId: sub.id,
      metadata: { plan: plan.code, nextDueDate, replaced: !!previous },
      ipHash: meta.ipHash,
    });

    // The first charge also arrives by webhook; if it is not listed yet the page shows it later.
    const payments = await listSubscriptionPayments(created.id).catch((err) => {
      log.warn("could not list first charge", errorFields(err));
      return [];
    });
    for (const p of payments) await upsertInvoice(tx, m.workspaceId, p, null);
    const open = payments.find((p) => !PAID.has(p.status));
    return { invoiceUrl: safeInvoiceUrl(open?.invoiceUrl) };
  });
}

/** Stops renewals. A paid period keeps working until its end; a pending first charge is dropped. */
export async function cancelSubscription(actor: Actor, meta: RequestMeta) {
  assertCan(actor, "subscription.manage");
  const m = requireMembership(actor);
  await enforceRateLimit("checkout_user", actor.userId);
  await withSystem({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, m.workspaceId)).for("update");
    if (!sub || sub.provider !== PROVIDER || !sub.providerSubscriptionId) throw new AppError("CONFLICT", "Não há assinatura online para cancelar.");
    await deleteSubscription(sub.providerSubscriptionId);
    const paid = sub.status === "active" || sub.status === "past_due";
    await tx
      .update(subscriptions)
      .set({ status: paid ? "canceled" : sub.status, providerSubscriptionId: null, pendingPlanId: null, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await audit(tx, { action: "billing.subscription_canceled", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "subscription", targetId: sub.id, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

type WebhookResult = { status: 200 | 400 | 401 | 404 | 413 };
export const WEBHOOK_MAX_BYTES = 256 * 1024;

/**
 * Entry point of POST /api/webhooks/asaas. Only HTTP 200 counts as delivered
 * for Asaas, so anything that is ours to fix (processing errors) still answers
 * 200 after the event is safely stored.
 */
export async function receiveAsaasWebhook(token: string | null, body: string, meta: RequestMeta): Promise<WebhookResult> {
  const expected = env().ASAAS_WEBHOOK_TOKEN;
  if (!expected) return { status: 404 };
  if (!token || !safeEqual(token, expected)) {
    await recordSecurityEvent({ type: "billing.webhook_rejected", severity: "warning", ipHash: meta.ipHash });
    return { status: 401 };
  }
  if (Buffer.byteLength(body) > WEBHOOK_MAX_BYTES) return { status: 413 };
  let evt: { id?: unknown; event?: unknown };
  try {
    evt = JSON.parse(body);
  } catch {
    return { status: 400 };
  }
  if (typeof evt?.id !== "string" || typeof evt.event !== "string" || evt.id.length > 100 || evt.event.length > 100) return { status: 400 };

  const stored = await withSystem({ userId: SYSTEM_USER }, (tx) =>
    tx
      .insert(billingEvents)
      .values({ provider: PROVIDER, eventId: evt.id as string, eventType: evt.event as string, payload: evt as Record<string, unknown> })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id }),
  );
  if (stored.length === 0) return { status: 200 }; // redelivery
  await processBillingEvent(stored[0]!.id);
  return { status: 200 };
}

/** Applies one stored event. Safe to run again: every effect is idempotent. */
export async function processBillingEvent(eventRowId: string) {
  try {
    await withSystem({ userId: SYSTEM_USER }, async (tx) => {
      const [row] = await tx.select().from(billingEvents).where(eq(billingEvents.id, eventRowId)).for("update");
      if (!row) return;
      const outcome = await applyEvent(tx, row.eventType, row.payload);
      await tx
        .update(billingEvents)
        .set({ status: outcome.applied ? "processed" : "ignored", workspaceId: outcome.workspaceId, error: null, processedAt: new Date() })
        .where(eq(billingEvents.id, row.id));
    });
  } catch (err) {
    log.error("billing event failed", { eventRowId, ...errorFields(err) });
    await withSystem({ userId: SYSTEM_USER }, (tx) =>
      tx
        .update(billingEvents)
        .set({ status: "failed", error: (err instanceof Error ? err.message : "erro").slice(0, 500), processedAt: new Date() })
        .where(eq(billingEvents.id, eventRowId)),
    );
  }
}

async function applyEvent(tx: Tx, type: string, payload: Record<string, unknown>): Promise<{ applied: boolean; workspaceId: string | null }> {
  if (type.startsWith("PAYMENT_")) {
    const p = payload.payment as AsaasPayment | undefined;
    if (!p || typeof p.id !== "string" || typeof p.subscription !== "string") return { applied: false, workspaceId: null };
    // The workspace is found through the subscription id we stored, never through data in the event alone.
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, PROVIDER), eq(subscriptions.providerSubscriptionId, p.subscription)))
      .for("update");
    if (!sub) {
      // Charges of a replaced subscription still update their invoice row, nothing else.
      const [inv] = await tx.select({ ws: billingInvoices.workspaceId }).from(billingInvoices).where(and(eq(billingInvoices.provider, PROVIDER), eq(billingInvoices.providerPaymentId, p.id)));
      if (inv) await upsertInvoice(tx, inv.ws, p, null);
      return { applied: false, workspaceId: inv?.ws ?? null };
    }
    const ws = sub.workspaceId;
    const now = new Date();
    const paid = type === "PAYMENT_CONFIRMED" || type === "PAYMENT_RECEIVED";
    await upsertInvoice(tx, ws, p, paid ? now : null);

    if (paid) {
      if (typeof p.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate)) throw new Error("payment without a valid dueDate");
      const end = periodEndAfter(p.dueDate);
      const newEnd = sub.currentPeriodEnd && sub.currentPeriodEnd > end ? sub.currentPeriodEnd : end;
      await tx
        .update(subscriptions)
        .set({ status: "active", planId: sub.pendingPlanId ?? sub.planId, pendingPlanId: null, currentPeriodEnd: newEnd, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      await audit(tx, { action: "billing.payment_confirmed", workspaceId: ws, targetType: "subscription", targetId: sub.id, metadata: { event: type, payment: p.id, periodEnd: newEnd.toISOString() } });
      return { applied: true, workspaceId: ws };
    }
    if (type === "PAYMENT_OVERDUE") {
      if (sub.status === "active") await tx.update(subscriptions).set({ status: "past_due", updatedAt: now }).where(eq(subscriptions.id, sub.id));
      return { applied: true, workspaceId: ws };
    }
    if (type === "PAYMENT_REFUNDED" || type === "PAYMENT_CHARGEBACK_REQUESTED" || type === "PAYMENT_CHARGEBACK_DISPUTE") {
      if (sub.status === "active") await tx.update(subscriptions).set({ status: "past_due", updatedAt: now }).where(eq(subscriptions.id, sub.id));
      await audit(tx, { action: "billing.payment_reversed", workspaceId: ws, targetType: "subscription", targetId: sub.id, metadata: { event: type, payment: p.id } });
      await recordSecurityEvent({ type: "billing.payment_reversed", severity: "warning", workspaceId: ws, metadata: { event: type } });
      return { applied: true, workspaceId: ws };
    }
    return { applied: true, workspaceId: ws }; // created/updated/deleted: invoice row only
  }

  if (type === "SUBSCRIPTION_DELETED" || type === "SUBSCRIPTION_INACTIVATED") {
    const s = payload.subscription as { id?: unknown } | undefined;
    if (!s || typeof s.id !== "string") return { applied: false, workspaceId: null };
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, PROVIDER), eq(subscriptions.providerSubscriptionId, s.id)))
      .for("update");
    // Deleting a subscription we already replaced (plan change) must not cancel the new one.
    if (!sub) return { applied: false, workspaceId: null };
    const paid = sub.status === "active" || sub.status === "past_due";
    await tx
      .update(subscriptions)
      .set({ status: paid ? "canceled" : sub.status, providerSubscriptionId: null, pendingPlanId: null, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await audit(tx, { action: "billing.subscription_ended_by_provider", workspaceId: sub.workspaceId, targetType: "subscription", targetId: sub.id, metadata: { event: type } });
    return { applied: true, workspaceId: sub.workspaceId };
  }
  return { applied: false, workspaceId: null };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listBillingEvents(actor: Actor, opts: { status?: "received" | "processed" | "ignored" | "failed"; page: number }) {
  assertCan(actor, "admin.billing.manage");
  return withTenant({ userId: actor.userId, isPlatformAdmin: true }, (tx) =>
    tx
      .select({ id: billingEvents.id, eventType: billingEvents.eventType, status: billingEvents.status, workspaceId: billingEvents.workspaceId, error: billingEvents.error, receivedAt: billingEvents.receivedAt })
      .from(billingEvents)
      .where(opts.status ? eq(billingEvents.status, opts.status) : undefined)
      .orderBy(desc(billingEvents.receivedAt))
      .limit(51)
      .offset((opts.page - 1) * 50),
  );
}

export async function reprocessBillingEvent(actor: Actor, eventRowId: string, meta: RequestMeta) {
  assertCan(actor, "admin.billing.manage");
  const [row] = await withTenant({ userId: actor.userId, isPlatformAdmin: true }, (tx) => tx.select({ id: billingEvents.id, status: billingEvents.status }).from(billingEvents).where(eq(billingEvents.id, eventRowId)));
  if (!row) throw Errors.notFound();
  if (row.status !== "failed" && row.status !== "received") throw new AppError("CONFLICT", "Só eventos com falha podem ser reprocessados.");
  await processBillingEvent(row.id);
  await withTenant({ userId: actor.userId, isPlatformAdmin: true }, (tx) =>
    audit(tx, { action: "admin.billing_event_reprocessed", actorUserId: actor.userId, targetType: "billing_event", targetId: row.id, ipHash: meta.ipHash }),
  );
}
