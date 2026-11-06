import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  getWorkspaceAdmin,
  listAuditLogs,
  listPlansAdmin,
  listUsers,
  listWorkspaces,
  overrideSubscription,
  setUserStatus,
  setWorkspaceStatus,
  updatePlan,
} from "@/server/admin/service";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { billingAccess, GRACE_DAYS } from "@/server/billing/access";
import { getBillingOverview } from "@/server/billing/service";
import { closeDb } from "@/server/db/client";
import { withSystem, withTenant } from "@/server/db/context";
import { subscriptions } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-15T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * DAY);

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
/** The service layer only trusts actor.isPlatformAdmin, which resolveActor reads from the users table. */
async function admin(): Promise<Actor> {
  const t = await trainer();
  return { ...t, isPlatformAdmin: true, membership: null };
}
async function setSub(workspaceId: string, patch: Partial<typeof subscriptions.$inferInsert>) {
  await withSystem({ userId: "00000000-0000-0000-0000-000000000000", workspaceId }, (tx) => tx.update(subscriptions).set(patch).where(eq(subscriptions.workspaceId, workspaceId)));
}
const refresh = async (email: string) => resolveActor((await loginAs(email)).token);

describe("billing access rules", () => {
  it("derives access from the subscription dates", () => {
    expect(billingAccess(null, now).state).toBe("blocked");
    expect(billingAccess({ status: "trialing", trialEndsAt: at(3), currentPeriodEnd: null }, now).state).toBe("trial");
    expect(billingAccess({ status: "trialing", trialEndsAt: at(-1), currentPeriodEnd: null }, now).state).toBe("blocked");
    expect(billingAccess({ status: "active", trialEndsAt: null, currentPeriodEnd: at(10) }, now).state).toBe("active");
    expect(billingAccess({ status: "active", trialEndsAt: null, currentPeriodEnd: at(-2) }, now).state).toBe("grace");
    expect(billingAccess({ status: "active", trialEndsAt: null, currentPeriodEnd: at(-GRACE_DAYS - 1) }, now).state).toBe("blocked");
    expect(billingAccess({ status: "past_due", trialEndsAt: null, currentPeriodEnd: at(-1) }, now).state).toBe("grace");
    expect(billingAccess({ status: "past_due", trialEndsAt: null, currentPeriodEnd: null }, now).state).toBe("blocked");
    expect(billingAccess({ status: "canceled", trialEndsAt: null, currentPeriodEnd: at(5) }, now).state).toBe("active");
    expect(billingAccess({ status: "canceled", trialEndsAt: null, currentPeriodEnd: at(-1) }, now).state).toBe("blocked");
    expect(billingAccess({ status: "expired", trialEndsAt: null, currentPeriodEnd: at(30) }, now).state).toBe("blocked");
  });

  it("resolves access for trainers and students, and blocks both when the trial ends", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    expect(t.membership!.access!.state).toBe("trial");
    // Students cannot read the subscription, but still get the derived flag.
    expect(s.membership!.access!.state).toBe("trial");

    await setSub(t.membership!.workspaceId, { trialEndsAt: new Date(Date.now() - DAY) });
    const t2 = await refresh(t.email);
    const s2 = await refresh(s.email);
    expect(t2!.membership!.access!.state).toBe("blocked");
    expect(s2!.membership!.access!.state).toBe("blocked");

    const overview = await getBillingOverview(t2!);
    expect(overview.access.state).toBe("blocked");
    expect(overview.plans.map((p) => p.code)).not.toContain("trial");
    expect(overview.studentsUsed).toBe(1);
  });
});

describe("platform admin", () => {
  it("is refused to non-admins", async () => {
    const t = await trainer();
    await expect(listWorkspaces(t, { page: 1 })).rejects.toThrow(AppError);
    await expect(setWorkspaceStatus(t, t.membership!.workspaceId, "suspended", "teste de abuso", meta())).rejects.toThrow(AppError);
    await expect(overrideSubscription(t, t.membership!.workspaceId, { op: "extend_trial", days: 30 }, "tentativa", meta())).rejects.toThrow(AppError);
    await expect(updatePlan(t, "00000000-0000-0000-0000-000000000000", { name: "x", priceCents: 0, maxStudents: 1, storageQuotaMb: 1, isActive: true }, meta())).rejects.toThrow(AppError);
  });

  it("finds workspaces, suspends and reactivates them, with audit", async () => {
    const a = await admin();
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const found = await listWorkspaces(a, { q: t.email, page: 1 });
    expect(found.rows.map((r) => r.id)).toEqual([ws]);
    expect(found.rows[0]!.access.state).toBe("trial");

    await setWorkspaceStatus(a, ws, "suspended", "Pedido do titular", meta());
    expect((await refresh(t.email))!.membership).toBeNull();
    await setWorkspaceStatus(a, ws, "active", "Resolvido", meta());
    expect((await refresh(t.email))!.membership!.workspaceId).toBe(ws);

    const detail = await getWorkspaceAdmin(a, ws);
    expect(detail.adminHistory.map((h) => h.action)).toEqual(["admin.workspace_reactivated", "admin.workspace_suspended"]);
    expect(detail.adminHistory[1]!.metadata.reason).toBe("Pedido do titular");
    const audit = await listAuditLogs(a, { workspaceId: ws, actionPrefix: "admin.", page: 1 });
    expect(audit.length).toBe(2);
  });

  it("overrides subscriptions: extend trial, grant a paid plan, expire", async () => {
    const a = await admin();
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const before = (await getWorkspaceAdmin(a, ws)).subscription!.trialEndsAt!;
    await overrideSubscription(a, ws, { op: "extend_trial", days: 10 }, "Cortesia", meta());
    const extended = (await getWorkspaceAdmin(a, ws)).subscription!.trialEndsAt!;
    expect(Math.round((extended.getTime() - before.getTime()) / DAY)).toBe(10);

    const pro = (await listPlansAdmin(a)).find((p) => p.code === "pro")!;
    const until = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10);
    await overrideSubscription(a, ws, { op: "grant", planId: pro.id, until }, "Pagou por Pix direto", meta());
    let d = await getWorkspaceAdmin(a, ws);
    expect(d.subscription!.status).toBe("active");
    expect(d.subscription!.planName).toBe(pro.name);
    expect(d.access.state).toBe("active");
    // Extending a trial that is no longer a trial is refused.
    await expect(overrideSubscription(a, ws, { op: "extend_trial", days: 5 }, "erro", meta())).rejects.toThrow(AppError);
    // Granting the trial plan or a past date is refused.
    const trialPlan = (await listPlansAdmin(a)).find((p) => p.code === "trial")!;
    await expect(overrideSubscription(a, ws, { op: "grant", planId: trialPlan.id, until }, "erro", meta())).rejects.toThrow(AppError);
    await expect(overrideSubscription(a, ws, { op: "grant", planId: pro.id, until: "2020-01-01" }, "erro", meta())).rejects.toThrow(AppError);

    await overrideSubscription(a, ws, { op: "expire" }, "Chargeback", meta());
    d = await getWorkspaceAdmin(a, ws);
    expect(d.access.state).toBe("blocked");
    expect((await refresh(t.email))!.membership!.access!.state).toBe("blocked");
  });

  it("suspends users (ending their sessions) but never admins or itself", async () => {
    const a = await admin();
    const t = await trainer();
    const session = await loginAs(t.email);
    await setUserStatus(a, t.userId, "suspended", "Fraude no cadastro", meta());
    expect(await resolveActor(session.token)).toBeNull();
    await expect(loginAs(t.email)).rejects.toThrow();
    await setUserStatus(a, t.userId, "active", "Verificado", meta());
    expect(await resolveActor((await loginAs(t.email)).token)).not.toBeNull();

    await expect(setUserStatus(a, a.userId, "suspended", "eu mesmo", meta())).rejects.toThrow(AppError);
    const listed = await listUsers(a, { q: t.email, page: 1 });
    expect(listed.rows.map((r) => r.id)).toEqual([t.userId]);
  });

  it("edits plans but keeps the trial free and available", async () => {
    const a = await admin();
    const plans = await listPlansAdmin(a);
    const starter = plans.find((p) => p.code === "starter")!;
    const trialPlan = plans.find((p) => p.code === "trial")!;
    const original = { name: starter.name, priceCents: starter.priceCents, maxStudents: starter.maxStudents, storageQuotaMb: starter.storageQuotaMb, isActive: starter.isActive };
    try {
      await updatePlan(a, starter.id, { ...original, priceCents: 8900 }, meta());
      expect((await listPlansAdmin(a)).find((p) => p.id === starter.id)!.priceCents).toBe(8900);
    } finally {
      await updatePlan(a, starter.id, original, meta());
    }
    const t = { name: trialPlan.name, priceCents: 0, maxStudents: trialPlan.maxStudents, storageQuotaMb: trialPlan.storageQuotaMb, isActive: true };
    await expect(updatePlan(a, trialPlan.id, { ...t, isActive: false }, meta())).rejects.toThrow(AppError);
    await expect(updatePlan(a, trialPlan.id, { ...t, priceCents: 100 }, meta())).rejects.toThrow(AppError);
  });

  it("cannot read student data through the admin context", async () => {
    const a = await admin();
    const t = await trainer();
    await studentOf(t);
    const { studentHealthRecords, workoutSessions } = await import("@/server/db/schema");
    const rows = await withTenant({ userId: a.userId, isPlatformAdmin: true }, async (tx) => ({
      health: await tx.select().from(studentHealthRecords),
      sessions: await tx.select().from(workoutSessions),
    }));
    expect(rows.health).toEqual([]);
    expect(rows.sessions).toEqual([]);
  });
});
