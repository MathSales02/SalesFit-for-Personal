import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { setAsaasTransport } from "@/server/billing/asaas";
import {
  cancelSubscription,
  listBillingEvents,
  listInvoices,
  normalizeCpfCnpj,
  periodEndAfter,
  yearEndAfter,
  receiveAsaasWebhook,
  safeInvoiceUrl,
  startCheckout,
} from "@/server/billing/provider";
import { getBillingOverview } from "@/server/billing/service";
import { closeDb } from "@/server/db/client";
import { withSystem } from "@/server/db/context";
import { billingEvents, plans, subscriptions } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

const TOKEN = "test-webhook-token-test-webhook-token-0000";
const CPF = "529.982.247-25";
const SYS = "00000000-0000-0000-0000-000000000000";

// --- Fake Asaas -------------------------------------------------------------
type Pay = { id: string; subscription?: string; installment?: string; installmentNumber?: number; status: string; value: number; dueDate: string; invoiceUrl: string };
const fake = {
  n: 0,
  calls: [] as string[],
  subs: new Map<string, { id: string; value: number; nextDueDate: string; cycle: string; deleted: boolean }>(),
  installments: new Map<string, { id: string; count: number; total: number; billingType: string; deleted: boolean }>(),
  payments: [] as Pay[],
  badDueDate: false,
};
setAsaasTransport(async (url, init) => {
  const path = new URL(url).pathname.replace(/^\/v3/, "");
  const method = init.method ?? "GET";
  fake.calls.push(`${method} ${path}`);
  const body = init.body ? JSON.parse(String(init.body)) : {};
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (method === "POST" && path === "/customers") {
    if (body.cpfCnpj.length !== 11 && body.cpfCnpj.length !== 14) return json({ errors: [{ code: "invalid_cpfCnpj", description: "CPF inválido" }] }, 400);
    return json({ id: `cus_${++fake.n}` });
  }
  if (method === "POST" && path === "/subscriptions") {
    const id = `sub_${++fake.n}`;
    fake.subs.set(id, { id, value: body.value, nextDueDate: body.nextDueDate, cycle: body.cycle, deleted: false });
    fake.payments.push({ id: `pay_${++fake.n}`, subscription: id, status: "PENDING", value: body.value, dueDate: fake.badDueDate ? "not-a-date" : body.nextDueDate, invoiceUrl: `https://sandbox.asaas.com/i/${fake.n}` });
    return json({ id, status: "ACTIVE", nextDueDate: body.nextDueDate });
  }
  if (method === "POST" && path === "/payments") {
    const id = `ins_${++fake.n}`;
    fake.installments.set(id, { id, count: body.installmentCount, total: body.totalValue, billingType: body.billingType, deleted: false });
    const [y, m, d] = String(body.dueDate).split("-").map(Number) as [number, number, number];
    for (let i = 0; i < body.installmentCount; i++) {
      const due = new Date(Date.UTC(y, m - 1 + i, d)).toISOString().slice(0, 10);
      fake.payments.push({ id: `pay_${++fake.n}`, installment: id, installmentNumber: i + 1, status: "PENDING", value: Math.round((body.totalValue / body.installmentCount) * 100) / 100, dueDate: due, invoiceUrl: `https://sandbox.asaas.com/i/${fake.n}` });
    }
    return json(fake.payments.find((p) => p.installment === id && p.installmentNumber === 1));
  }
  const delIns = path.match(/^\/installments\/([^/]+)$/);
  if (method === "DELETE" && delIns) {
    fake.installments.get(delIns[1]!)!.deleted = true;
    return json({ deleted: true, id: delIns[1] });
  }
  const listIns = path.match(/^\/installments\/([^/]+)\/payments$/);
  if (method === "GET" && listIns) return json({ object: "list", data: fake.payments.filter((p) => p.installment === listIns[1]) });
  const del = path.match(/^\/subscriptions\/([^/]+)$/);
  if (method === "DELETE" && del) {
    fake.subs.get(del[1]!)!.deleted = true;
    return json({ deleted: true, id: del[1] });
  }
  const list = path.match(/^\/subscriptions\/([^/]+)\/payments$/);
  if (method === "GET" && list) return json({ object: "list", data: fake.payments.filter((p) => p.subscription === list[1]) });
  return json({ errors: [{ code: "not_found" }] }, 404);
});
afterAll(async () => {
  setAsaasTransport(null);
  await closeDb();
});
beforeEach(() => {
  fake.calls = [];
  fake.badDueDate = false;
});

// --- Helpers ----------------------------------------------------------------
async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor) {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: "Aluno", password: PASSWORD }, meta())).token))!;
}
async function planId(code: string) {
  const [p] = await withSystem({ userId: SYS }, (tx) => tx.select({ id: plans.id }).from(plans).where(eq(plans.code, code)));
  return p!.id;
}
async function subOf(workspaceId: string) {
  const [s] = await withSystem({ userId: SYS, workspaceId }, (tx) => tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)));
  return s!;
}
let evt = 0;
function event(type: string, extra: Record<string, unknown>) {
  return JSON.stringify({ id: `evt_test_${Date.now()}_${++evt}`, event: type, dateCreated: "2026-11-06 10:00:00", ...extra });
}
const send = (body: string, token: string | null = TOKEN) => receiveAsaasWebhook(token, body, meta());
const paymentEvent = (type: string, p: Pay) => event(type, { payment: { object: "payment", ...p, status: type === "PAYMENT_OVERDUE" ? "OVERDUE" : type === "PAYMENT_RECEIVED" ? "RECEIVED" : p.status, unknownNewField: { nested: true } } });

describe("billing helpers", () => {
  it("validates CPF and CNPJ check digits", () => {
    expect(normalizeCpfCnpj(CPF)).toBe("52998224725");
    expect(normalizeCpfCnpj("529.982.247-24")).toBeNull();
    expect(normalizeCpfCnpj("111.111.111-11")).toBeNull();
    expect(normalizeCpfCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCpfCnpj("11.222.333/0001-80")).toBeNull();
  });
  it("computes the paid period, clamping to the end of the month", () => {
    expect(periodEndAfter("2026-01-31").toISOString()).toBe("2026-03-01T02:59:59.000Z"); // Feb 28, 23:59:59 in Brazil
    expect(periodEndAfter("2026-12-10").toISOString()).toBe("2027-01-11T02:59:59.000Z");
  });
  it("only links Asaas payment pages", () => {
    expect(safeInvoiceUrl("https://www.asaas.com/i/123")).toBe("https://www.asaas.com/i/123");
    expect(safeInvoiceUrl("https://sandbox.asaas.com/i/1")).not.toBeNull();
    expect(safeInvoiceUrl("https://asaas.com.evil.io/i/1")).toBeNull();
    expect(safeInvoiceUrl("javascript:alert(1)")).toBeNull();
    expect(safeInvoiceUrl("http://www.asaas.com/i/1")).toBeNull();
  });
});

describe("checkout", () => {
  it("requires a valid CPF/CNPJ on the first purchase and only trainers can buy", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const solo = await planId("sf_start");
    await expect(startCheckout(t, { planId: solo }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(startCheckout(t, { planId: solo, cpfCnpj: "123" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(startCheckout(s, { planId: solo, cpfCnpj: CPF }, meta())).rejects.toThrow(AppError);
    await expect(startCheckout(t, { planId: await planId("trial"), cpfCnpj: CPF }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(fake.calls).toEqual([]);
  });

  it("creates the customer and subscription; access changes only after the payment webhook", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const pro = await planId("sf_pro");
    const { invoiceUrl } = await startCheckout(t, { planId: pro, cpfCnpj: CPF }, meta());
    expect(invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    expect(fake.calls).toEqual(["POST /customers", "POST /subscriptions", expect.stringMatching(/^GET \/subscriptions\/sub_\d+\/payments$/)]);

    let sub = await subOf(ws);
    expect(sub.status).toBe("trialing");
    expect(sub.pendingPlanId).toBe(pro);
    expect(sub.providerCustomerId).toMatch(/^cus_/);
    expect(await listInvoices(t)).toHaveLength(1);

    // Forged or missing token: rejected, nothing stored.
    const pay = fake.payments.find((p) => p.subscription === sub.providerSubscriptionId)!;
    expect((await send(paymentEvent("PAYMENT_RECEIVED", pay), "wrong")).status).toBe(401);
    expect((await send(paymentEvent("PAYMENT_RECEIVED", pay), null)).status).toBe(401);
    expect((await subOf(ws)).status).toBe("trialing");
    expect((await send("not json")).status).toBe(400);

    const body = paymentEvent("PAYMENT_RECEIVED", pay);
    expect((await send(body)).status).toBe(200);
    sub = await subOf(ws);
    expect(sub.status).toBe("active");
    expect(sub.planId).toBe(pro);
    expect(sub.pendingPlanId).toBeNull();
    expect(sub.currentPeriodEnd!.toISOString()).toBe(periodEndAfter(pay.dueDate).toISOString());
    const invoices = await listInvoices(t);
    expect(invoices[0]!.status).toBe("RECEIVED");
    expect(invoices[0]!.paidAt).not.toBeNull();

    // Redelivery of the same event is a no-op.
    expect((await send(body)).status).toBe(200);
    const stored = await withSystem({ userId: SYS }, (tx) => tx.select().from(billingEvents).where(eq(billingEvents.workspaceId, ws)));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.status).toBe("processed");

    // The second purchase reuses the customer (no CPF needed) and "same plan" is refused.
    const t2 = (await resolveActor((await loginAs(t.email)).token))!;
    expect(t2.membership!.access!.state).toBe("active");
    await expect(startCheckout(t2, { planId: pro }, meta())).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("changes plan at the next renewal, ignoring the deletion of the replaced subscription", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const solo = await planId("sf_start");
    const pro = await planId("sf_pro");
    await startCheckout(t, { planId: solo, cpfCnpj: CPF }, meta());
    const first = await subOf(ws);
    const firstPay = fake.payments.find((p) => p.subscription === first.providerSubscriptionId)!;
    await send(paymentEvent("PAYMENT_CONFIRMED", firstPay));
    const paid = await subOf(ws);

    await startCheckout(t, { planId: pro }, meta());
    expect(fake.subs.get(first.providerSubscriptionId!)!.deleted).toBe(true);
    const changed = await subOf(ws);
    expect(changed.providerSubscriptionId).not.toBe(first.providerSubscriptionId);
    expect(changed.planId).toBe(solo); // still the paid plan
    expect(changed.pendingPlanId).toBe(pro);
    // The new subscription's first charge falls on the end of the paid period.
    expect(fake.subs.get(changed.providerSubscriptionId!)!.nextDueDate).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(paid.currentPeriodEnd!));

    // Asaas reports the old subscription deleted: must not cancel the new one.
    await send(event("SUBSCRIPTION_DELETED", { subscription: { id: first.providerSubscriptionId, deleted: true } }));
    const after = await subOf(ws);
    expect(after.status).toBe("active");
    expect(after.providerSubscriptionId).toBe(changed.providerSubscriptionId);
  });

  it("marks overdue payments, then cancels keeping the paid period", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    await startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta());
    const sub = await subOf(ws);
    const pay = fake.payments.find((p) => p.subscription === sub.providerSubscriptionId)!;
    await send(paymentEvent("PAYMENT_RECEIVED", pay));
    await send(paymentEvent("PAYMENT_OVERDUE", { ...pay, id: "pay_next_" + pay.id }));
    expect((await subOf(ws)).status).toBe("past_due");
    expect((await getBillingOverview(t)).access.state).toBe("grace");

    await cancelSubscription(t, meta());
    expect(fake.calls).toContain(`DELETE /subscriptions/${sub.providerSubscriptionId}`);
    const canceled = await subOf(ws);
    expect(canceled.status).toBe("canceled");
    expect(canceled.providerSubscriptionId).toBeNull();
    expect((await getBillingOverview(t)).access.state).toBe("active"); // until the end of the paid period
  });

  it("undoes the Asaas subscription when saving the checkout fails", async () => {
    const t = await trainer();
    fake.badDueDate = true; // the first charge cannot be stored: the transaction fails
    await expect(startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta())).rejects.toThrow();
    const created = fake.calls.find((c) => c.startsWith("GET /subscriptions/"))!.split("/")[2]!;
    expect(fake.calls).toContain(`DELETE /subscriptions/${created}`);
    const sub = await subOf(t.membership!.workspaceId);
    expect(sub.providerSubscriptionId).toBeNull();
  });

  it("ignores events for unknown subscriptions and records failures for reprocessing", async () => {
    const admin = { ...(await trainer()), isPlatformAdmin: true, membership: null };
    expect((await send(paymentEvent("PAYMENT_RECEIVED", { id: "pay_x", subscription: "sub_unknown", status: "RECEIVED", value: 79, dueDate: "2026-11-06", invoiceUrl: "" }))).status).toBe(200);
    expect((await send(event("SOMETHING_NEW", {}))).status).toBe(200);

    const t = await trainer();
    await startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta());
    const sub = await subOf(t.membership!.workspaceId);
    // A paid event without a usable due date fails, is kept, and answers 200 so the Asaas queue keeps flowing.
    expect((await send(event("PAYMENT_RECEIVED", { payment: { id: "pay_bad", subscription: sub.providerSubscriptionId, status: "RECEIVED", value: 79 } }))).status).toBe(200);
    const failed = await listBillingEvents(admin, { status: "failed", page: 1 });
    expect(failed.some((e) => e.eventType === "PAYMENT_RECEIVED")).toBe(true);
    expect((await subOf(t.membership!.workspaceId)).status).toBe("trialing");
    await expect(listBillingEvents(t, { page: 1 })).rejects.toThrow(AppError);
  });
});

describe("yearly plans, installments and buying during the trial", () => {
  const today = (plus = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + plus * 86_400_000));
  const DAY = 86_400_000;

  it("a year ends one year later, at the end of the day in Brazil", () => {
    expect(yearEndAfter("2026-11-12").toISOString()).toBe("2027-11-13T02:59:59.000Z");
    expect(yearEndAfter("2028-02-29").toISOString()).toBe("2029-03-01T02:59:59.000Z"); // Feb 28, 23:59:59 in Brazil
  });

  it("bought during the trial: the first charge falls three days ahead and the trial stays open until then", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const before = await subOf(ws);
    // The trial is seven days.
    expect(Math.round((before.trialEndsAt!.getTime() - before.createdAt.getTime()) / DAY)).toBe(7);

    // On the last day of the trial: without the extension, access would end before the charge is due.
    await withSystem({ userId: SYS, workspaceId: ws }, (tx) => tx.update(subscriptions).set({ trialEndsAt: new Date(Date.now() + 3_600_000) }).where(eq(subscriptions.workspaceId, ws)));
    await startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta());
    const sub = await subOf(ws);
    const charge = fake.payments.find((p) => p.subscription === sub.providerSubscriptionId)!;
    expect(charge.dueDate).toBe(today(3));
    expect(sub.status).toBe("trialing");
    expect(sub.trialEndsAt!.toISOString()).toBe(new Date(`${today(3)}T23:59:59-03:00`).toISOString());
    expect((await resolveActor((await loginAs(t.email)).token))!.membership!.access!.state).toBe("trial");

    // Starting checkout again does not push the trial any further.
    await startCheckout(t, { planId: await planId("sf_pro") }, meta());
    expect((await subOf(ws)).trialEndsAt!.toISOString()).toBe(sub.trialEndsAt!.toISOString());
  });

  it("the trial can never be stretched past its length plus the delay", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    // An account created nine days ago whose trial an admin extended until tomorrow.
    await withSystem({ userId: SYS, workspaceId: ws }, (tx) =>
      tx.update(subscriptions).set({ createdAt: new Date(Date.now() - 9 * DAY), trialEndsAt: new Date(Date.now() + DAY) }).where(eq(subscriptions.workspaceId, ws)),
    );
    const before = await subOf(ws);
    await startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta());
    const after = await subOf(ws);
    // Cap: created + 10 days = tomorrow (same instant as before, give or take the test's own time).
    expect(Math.abs(after.trialEndsAt!.getTime() - before.trialEndsAt!.getTime())).toBeLessThan(60_000);
  });

  it("after the trial ended, the charge is due the same day", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    await withSystem({ userId: SYS, workspaceId: ws }, (tx) => tx.update(subscriptions).set({ trialEndsAt: new Date(Date.now() - DAY) }).where(eq(subscriptions.workspaceId, ws)));
    await startCheckout(t, { planId: await planId("sf_start"), cpfCnpj: CPF }, meta());
    const sub = await subOf(ws);
    expect(fake.payments.find((p) => p.subscription === sub.providerSubscriptionId)!.dueDate).toBe(today());
    expect(sub.trialEndsAt!.getTime()).toBeLessThan(Date.now());
  });

  it("yearly at once: one charge with 15% off, a year of access, renewing yearly", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const pro = await planId("sf_pro");
    await startCheckout(t, { planId: pro, cycle: "yearly", cpfCnpj: CPF }, meta());
    let sub = await subOf(ws);
    const made = fake.subs.get(sub.providerSubscriptionId!)!;
    expect(made).toMatchObject({ cycle: "YEARLY", value: 508.98 });
    expect(508.98).toBeCloseTo(49.9 * 12 * 0.85, 2);
    expect(sub).toMatchObject({ pendingCycle: "yearly", billingCycle: "monthly", providerInstallmentId: null });

    const pay = fake.payments.find((p) => p.subscription === sub.providerSubscriptionId)!;
    await send(paymentEvent("PAYMENT_RECEIVED", pay));
    sub = await subOf(ws);
    expect(sub).toMatchObject({ status: "active", planId: pro, billingCycle: "yearly", pendingCycle: null });
    expect(sub.currentPeriodEnd!.toISOString()).toBe(yearEndAfter(pay.dueDate).toISOString());

    // Same plan, same cycle: nothing to buy. The monthly version of it is a real change.
    const t2 = (await resolveActor((await loginAs(t.email)).token))!;
    await expect(startCheckout(t2, { planId: pro, cycle: "yearly" }, meta())).rejects.toMatchObject({ code: "CONFLICT" });
    await startCheckout(t2, { planId: pro, cycle: "monthly" }, meta());
    sub = await subOf(ws);
    expect(sub.pendingCycle).toBe("monthly");
    // The paid year runs to its end: the monthly plan's first charge falls on that date.
    expect(fake.subs.get(sub.providerSubscriptionId!)!).toMatchObject({ cycle: "MONTHLY", value: 49.9 });
  });

  it("yearly in installments: split on the card, the first paid charge opens the whole year, the others change nothing", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const elite = await planId("sf_elite");
    const { invoiceUrl } = await startCheckout(t, { planId: elite, cycle: "yearly", installments: 6, cpfCnpj: CPF }, meta());
    expect(invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    let sub = await subOf(ws);
    expect(sub.providerSubscriptionId).toBeNull();
    expect(fake.installments.get(sub.providerInstallmentId!)!).toMatchObject({ count: 6, total: 814.98, billingType: "CREDIT_CARD" });
    const charges = fake.payments.filter((p) => p.installment === sub.providerInstallmentId);
    expect(charges).toHaveLength(6);
    expect(await listInvoices(t)).toHaveLength(6);

    await send(paymentEvent("PAYMENT_CONFIRMED", charges[0]!));
    sub = await subOf(ws);
    const end = yearEndAfter(charges[0]!.dueDate).toISOString();
    expect(sub).toMatchObject({ status: "active", planId: elite, billingCycle: "yearly", pendingPlanId: null });
    expect(sub.currentPeriodEnd!.toISOString()).toBe(end);

    // The card confirms the other installments (now or month by month): the year does not grow.
    for (const c of charges.slice(1)) await send(paymentEvent("PAYMENT_CONFIRMED", c));
    expect((await subOf(ws)).currentPeriodEnd!.toISOString()).toBe(end);
    expect((await listInvoices(t)).filter((i) => i.paidAt)).toHaveLength(6);
    // Paid: there is nothing left to cancel.
    await expect(cancelSubscription(t, meta())).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("an unpaid installment purchase is dropped when the trainer cancels or chooses something else", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    await startCheckout(t, { planId: await planId("sf_pro"), cycle: "yearly", installments: 12, cpfCnpj: CPF }, meta());
    const first = (await subOf(ws)).providerInstallmentId!;
    await startCheckout(t, { planId: await planId("sf_pro"), cycle: "yearly", installments: 3 }, meta());
    expect(fake.installments.get(first)!.deleted).toBe(true);
    const second = (await subOf(ws)).providerInstallmentId!;
    expect(second).not.toBe(first);
    await cancelSubscription(t, meta());
    expect(fake.installments.get(second)!.deleted).toBe(true);
    expect(await subOf(ws)).toMatchObject({ providerInstallmentId: null, pendingPlanId: null, pendingCycle: null, status: "trialing" });
  });

  it("installments are for the yearly plan only, up to twelve", async () => {
    const t = await trainer();
    const start = await planId("sf_start");
    await expect(startCheckout(t, { planId: start, cycle: "monthly", installments: 3, cpfCnpj: CPF }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(startCheckout(t, { planId: start, cycle: "yearly", installments: 13, cpfCnpj: CPF }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(startCheckout(t, { planId: start, cycle: "yearly", installments: 0, cpfCnpj: CPF }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
