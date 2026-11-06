import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "../db/context";
import { plans, securityEvents, subscriptions, users, workspaceMembers, workspaces } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";

export type TrainerOverview = {
  workspaceName: string;
  students: { active: number; invited: number; suspended: number };
  plan: { name: string; maxStudents: number; storageQuotaMb: number } | null;
  subscription: { status: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null;
};

/** Everything here runs under RLS for the actor's own workspace. */
export async function getTrainerOverview(actor: Actor): Promise<TrainerOverview> {
  assertCan(actor, "students.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [ws] = await tx.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, m.workspaceId));
    const counts = await tx
      .select({ status: workspaceMembers.status, n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student")))
      .groupBy(workspaceMembers.status);
    const [sub] = await tx
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        planName: plans.name,
        maxStudents: plans.maxStudents,
        storageQuotaMb: plans.storageQuotaMb,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.workspaceId, m.workspaceId));

    const by = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
    return {
      workspaceName: ws?.name ?? m.workspaceName,
      students: { active: by("active"), invited: by("invited"), suspended: by("suspended") },
      plan: sub ? { name: sub.planName, maxStudents: sub.maxStudents, storageQuotaMb: sub.storageQuotaMb } : null,
      subscription: sub ? { status: sub.status, trialEndsAt: sub.trialEndsAt, currentPeriodEnd: sub.currentPeriodEnd } : null,
    };
  });
}

export type AdminOverview = {
  workspaces: { active: number; suspended: number; archived: number };
  users: number;
  subscriptions: Record<string, number>;
  recentSecurityEvents: { id: string; type: string; severity: string; createdAt: Date }[];
};

/** Aggregates only: no student data, health data or messages are read here. */
export async function getAdminOverview(actor: Actor): Promise<AdminOverview> {
  assertCan(actor, "admin.dashboard");
  return withTenant({ userId: actor.userId, isPlatformAdmin: true }, async (tx) => {
    const ws = await tx.select({ status: workspaces.status, n: count() }).from(workspaces).groupBy(workspaces.status);
    const [u] = await tx.select({ n: count() }).from(users).where(sql`${users.deletedAt} is null`);
    const subs = await tx.select({ status: subscriptions.status, n: count() }).from(subscriptions).groupBy(subscriptions.status);
    const events = await tx
      .select({ id: securityEvents.id, type: securityEvents.type, severity: securityEvents.severity, createdAt: securityEvents.createdAt })
      .from(securityEvents)
      .orderBy(desc(securityEvents.createdAt))
      .limit(15);
    const by = (s: string) => ws.find((w) => w.status === s)?.n ?? 0;
    return {
      workspaces: { active: by("active"), suspended: by("suspended"), archived: by("archived") },
      users: u?.n ?? 0,
      subscriptions: Object.fromEntries(subs.map((s) => [s.status, s.n])),
      recentSecurityEvents: events,
    };
  });
}
