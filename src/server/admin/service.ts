import "server-only";
import { annualPriceCents } from "@/lib/plan-features";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { revokeUserSessions } from "../auth/session";
import { assertCan, type Actor } from "../authz/policy";
import { billingAccess } from "../billing/access";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { auditLogs, plans, securityEvents, sessions, subscriptions, users, workspaceMembers, workspaces } from "../db/schema";
import type { RequestMeta } from "../http/request-meta";
import { AppError, Errors } from "../lib/errors";
import { audit, recordSecurityEvent } from "../security/audit";

/**
 * Platform administration. Admins see accounts, workspaces, plans and
 * subscriptions, plus counts. They never read training, health, progress,
 * community or message data: RLS on those tables has no admin branch.
 * Every change is audited with the admin's reason.
 */

export const ADMIN_PAGE_SIZE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const asAdmin = <T>(actor: Actor, fn: (tx: Tx) => Promise<T>) => withTenant({ userId: actor.userId, isPlatformAdmin: true }, fn);

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function listWorkspaces(actor: Actor, opts: { q?: string; status?: "active" | "suspended" | "archived"; page: number }) {
  assertCan(actor, "admin.workspaces.read");
  return asAdmin(actor, async (tx) => {
    const filters: SQL[] = [];
    if (opts.status) filters.push(eq(workspaces.status, opts.status));
    if (opts.q) filters.push(or(ilike(workspaces.name, likeTerm(opts.q)), ilike(users.email, likeTerm(opts.q)))!);
    const where = filters.length ? and(...filters) : undefined;
    const rows = await tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        status: workspaces.status,
        createdAt: workspaces.createdAt,
        ownerName: users.displayName,
        ownerEmail: users.email,
        planName: plans.name,
        subStatus: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        students: sql<number>`(select count(*)::int from workspace_members m where m.workspace_id = ${workspaces.id} and m.role = 'student' and m.status = 'active')`,
      })
      .from(workspaces)
      .innerJoin(users, eq(users.id, workspaces.ownerUserId))
      .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(where)
      .orderBy(desc(workspaces.createdAt), asc(workspaces.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((opts.page - 1) * ADMIN_PAGE_SIZE);
    const [total] = await tx.select({ n: count() }).from(workspaces).innerJoin(users, eq(users.id, workspaces.ownerUserId)).where(where);
    return {
      rows: rows.map((r) => ({
        ...r,
        access: r.subStatus ? billingAccess({ status: r.subStatus, trialEndsAt: r.trialEndsAt, currentPeriodEnd: r.currentPeriodEnd }) : billingAccess(null),
      })),
      total: total?.n ?? 0,
    };
  });
}

export async function getWorkspaceAdmin(actor: Actor, workspaceId: string) {
  assertCan(actor, "admin.workspaces.read");
  return asAdmin(actor, async (tx) => {
    const [ws] = await tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        status: workspaces.status,
        createdAt: workspaces.createdAt,
        ownerId: users.id,
        ownerName: users.displayName,
        ownerEmail: users.email,
      })
      .from(workspaces)
      .innerJoin(users, eq(users.id, workspaces.ownerUserId))
      .where(eq(workspaces.id, workspaceId));
    if (!ws) throw Errors.notFound();
    const [sub] = await tx
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        provider: subscriptions.provider,
        planId: plans.id,
        planName: plans.name,
        maxStudents: plans.maxStudents,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.workspaceId, workspaceId));
    const members = await tx
      .select({ status: workspaceMembers.status, n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "student")))
      .groupBy(workspaceMembers.status);
    // Only the action names and who did them: metadata can describe students.
    const history = await tx
      .select({ id: auditLogs.id, action: auditLogs.action, actorUserId: auditLogs.actorUserId, createdAt: auditLogs.createdAt, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, workspaceId), sql`${auditLogs.action} like 'admin.%'`))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20);
    return {
      workspace: ws,
      subscription: sub ?? null,
      access: billingAccess(sub),
      students: Object.fromEntries(members.map((m) => [m.status, m.n])) as Record<string, number>,
      adminHistory: history,
    };
  });
}

export async function setWorkspaceStatus(actor: Actor, workspaceId: string, status: "active" | "suspended", reason: string, meta: RequestMeta) {
  assertCan(actor, "admin.workspaces.suspend");
  await asAdmin(actor, async (tx) => {
    const res = await tx.update(workspaces).set({ status, updatedAt: new Date() }).where(and(eq(workspaces.id, workspaceId), inArray(workspaces.status, ["active", "suspended"]))).returning({ id: workspaces.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, {
      action: status === "suspended" ? "admin.workspace_suspended" : "admin.workspace_reactivated",
      actorUserId: actor.userId,
      workspaceId,
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { reason },
      ipHash: meta.ipHash,
    });
  });
  if (status === "suspended") await recordSecurityEvent({ type: "admin.workspace_suspended", severity: "warning", userId: actor.userId, workspaceId, ipHash: meta.ipHash });
}

export type SubscriptionOverride =
  | { op: "extend_trial"; days: number }
  | { op: "grant"; planId: string; until: string }
  | { op: "change_plan"; planId: string }
  | { op: "expire" };

/**
 * Manual subscription changes (support, courtesy periods, payments received
 * outside the provider). Webhooks from the payment provider may later
 * overwrite what is set here; the audit log keeps both.
 */
export async function overrideSubscription(actor: Actor, workspaceId: string, input: SubscriptionOverride, reason: string, meta: RequestMeta) {
  assertCan(actor, "admin.billing.manage");
  await asAdmin(actor, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
    if (!sub) throw Errors.notFound();
    const now = new Date();
    let patch: Partial<typeof subscriptions.$inferInsert>;
    switch (input.op) {
      case "extend_trial": {
        if (sub.status !== "trialing") throw new AppError("CONFLICT", "Só dá para estender o teste de uma consultoria em teste grátis.");
        const base = Math.max(now.getTime(), sub.trialEndsAt?.getTime() ?? 0);
        patch = { trialEndsAt: new Date(base + input.days * DAY_MS) };
        break;
      }
      case "grant": {
        const [plan] = await tx.select({ id: plans.id, code: plans.code }).from(plans).where(eq(plans.id, input.planId));
        if (!plan || plan.code === "trial") throw Errors.validation({ planId: ["Escolha um plano pago."] });
        const until = new Date(`${input.until}T23:59:59-03:00`);
        if (until.getTime() <= now.getTime()) throw Errors.validation({ until: ["A data precisa ser futura."] });
        patch = { status: "active", planId: plan.id, currentPeriodEnd: until, provider: sub.provider ?? "manual" };
        break;
      }
      case "change_plan": {
        const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId));
        if (!plan) throw Errors.validation({ planId: ["Plano não encontrado."] });
        patch = { planId: plan.id };
        break;
      }
      case "expire":
        patch = { status: "expired", trialEndsAt: sub.status === "trialing" ? now : sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd && sub.currentPeriodEnd > now ? now : sub.currentPeriodEnd };
        break;
    }
    await tx.update(subscriptions).set({ ...patch, updatedAt: now }).where(eq(subscriptions.id, sub.id));
    await audit(tx, {
      action: `admin.subscription_${input.op}`,
      actorUserId: actor.userId,
      workspaceId,
      targetType: "subscription",
      targetId: sub.id,
      metadata: { ...input, reason, previous: { status: sub.status, planId: sub.planId, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd } },
      ipHash: meta.ipHash,
    });
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(actor: Actor, opts: { q?: string; page: number }) {
  assertCan(actor, "admin.users.read");
  return asAdmin(actor, async (tx) => {
    const where = and(sql`${users.deletedAt} is null`, opts.q ? or(ilike(users.email, likeTerm(opts.q)), ilike(users.displayName, likeTerm(opts.q))) : undefined);
    const rows = await tx
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        status: users.status,
        isPlatformAdmin: users.isPlatformAdmin,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        lastSeenAt: sql<Date | null>`(select max(s.last_seen_at) from sessions s where s.user_id = ${users.id})`.mapWith(sessions.lastSeenAt),
        roles: sql<string[]>`coalesce((select array_agg(distinct m.role::text) from workspace_members m where m.user_id = ${users.id} and m.status = 'active'), '{}')`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((opts.page - 1) * ADMIN_PAGE_SIZE);
    const [total] = await tx.select({ n: count() }).from(users).where(where);
    return { rows, total: total?.n ?? 0 };
  });
}

export async function setUserStatus(actor: Actor, userId: string, status: "active" | "suspended", reason: string, meta: RequestMeta) {
  assertCan(actor, "admin.users.suspend");
  if (userId === actor.userId) throw new AppError("FORBIDDEN", "Você não pode alterar a própria conta por aqui.");
  await asAdmin(actor, async (tx) => {
    const [u] = await tx.select({ id: users.id, isPlatformAdmin: users.isPlatformAdmin, status: users.status }).from(users).where(and(eq(users.id, userId), sql`${users.deletedAt} is null`));
    if (!u) throw Errors.notFound();
    if (u.isPlatformAdmin) throw new AppError("FORBIDDEN", "Contas de administrador não podem ser suspensas pelo painel.");
    if (u.status === "deactivated") throw new AppError("CONFLICT", "Esta conta foi desativada pelo titular.");
    await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    if (status === "suspended") await revokeUserSessions(tx, userId, "admin_suspended");
    await audit(tx, {
      action: status === "suspended" ? "admin.user_suspended" : "admin.user_reactivated",
      actorUserId: actor.userId,
      targetType: "user",
      targetId: userId,
      metadata: { reason },
      ipHash: meta.ipHash,
    });
  });
  if (status === "suspended") await recordSecurityEvent({ type: "admin.user_suspended", severity: "warning", userId: actor.userId, ipHash: meta.ipHash, metadata: { targetUserId: userId } });
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function listPlansAdmin(actor: Actor) {
  assertCan(actor, "admin.plans.manage");
  return asAdmin(actor, async (tx) => {
    const rows = await tx
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        priceCents: plans.priceCents,
        maxStudents: plans.maxStudents,
        storageQuotaMb: plans.storageQuotaMb,
        isActive: plans.isActive,
        subscribers: sql<number>`(select count(*)::int from subscriptions s where s.plan_id = ${plans.id})`,
      })
      .from(plans)
      .orderBy(asc(plans.priceCents));
    return rows;
  });
}

export async function updatePlan(
  actor: Actor,
  planId: string,
  input: { name: string; priceCents: number; maxStudents: number; storageQuotaMb: number; isActive: boolean },
  meta: RequestMeta,
) {
  assertCan(actor, "admin.plans.manage");
  await asAdmin(actor, async (tx) => {
    const [p] = await tx.select().from(plans).where(eq(plans.id, planId));
    if (!p) throw Errors.notFound();
    if (p.code === "trial" && (!input.isActive || input.priceCents !== 0)) throw new AppError("CONFLICT", "O plano de teste grátis precisa continuar ativo e gratuito.");
    // Plans sold yearly keep the same discount when the monthly price changes.
    const annual = p.annualPriceCents === null ? null : annualPriceCents(input.priceCents);
    await tx.update(plans).set({ ...input, annualPriceCents: annual, updatedAt: new Date() }).where(eq(plans.id, planId));
    await audit(tx, {
      action: "admin.plan_updated",
      actorUserId: actor.userId,
      targetType: "plan",
      targetId: planId,
      metadata: { before: { name: p.name, priceCents: p.priceCents, maxStudents: p.maxStudents, storageQuotaMb: p.storageQuotaMb, isActive: p.isActive }, after: input },
      ipHash: meta.ipHash,
    });
  });
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export const LOG_PAGE_SIZE = 50;

export async function listSecurityEvents(actor: Actor, opts: { severity?: "info" | "warning" | "critical"; type?: string; page: number }) {
  assertCan(actor, "admin.security_events.read");
  return asAdmin(actor, (tx) =>
    tx
      .select()
      .from(securityEvents)
      .where(
        and(
          opts.severity ? eq(securityEvents.severity, opts.severity) : undefined,
          opts.type ? eq(securityEvents.type, opts.type) : undefined,
        ),
      )
      .orderBy(desc(securityEvents.createdAt), asc(securityEvents.id))
      .limit(LOG_PAGE_SIZE + 1)
      .offset((opts.page - 1) * LOG_PAGE_SIZE),
  );
}

export async function listAuditLogs(actor: Actor, opts: { workspaceId?: string; actionPrefix?: string; page: number }) {
  assertCan(actor, "admin.audit.read");
  return asAdmin(actor, (tx) =>
    tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        workspaceId: auditLogs.workspaceId,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        createdAt: auditLogs.createdAt,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(
        and(
          opts.workspaceId ? eq(auditLogs.workspaceId, opts.workspaceId) : undefined,
          opts.actionPrefix ? ilike(auditLogs.action, `${opts.actionPrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
      .limit(LOG_PAGE_SIZE + 1)
      .offset((opts.page - 1) * LOG_PAGE_SIZE),
  );
}
