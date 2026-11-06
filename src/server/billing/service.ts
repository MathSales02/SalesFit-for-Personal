import "server-only";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { withTenant } from "../db/context";
import { plans, subscriptions, workspaceMembers } from "../db/schema";
import { billingAccess } from "./access";

export type PlanOption = { id: string; code: string; name: string; priceCents: number; maxStudents: number; storageQuotaMb: number };

/** The trainer's subscription page: current state, usage and the plans that can be bought. */
export async function getBillingOverview(actor: Actor) {
  assertCan(actor, "subscription.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [sub] = await tx
      .select({
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        provider: subscriptions.provider,
        providerSubscriptionId: subscriptions.providerSubscriptionId,
        pendingPlanId: subscriptions.pendingPlanId,
        planId: plans.id,
        planCode: plans.code,
        planName: plans.name,
        maxStudents: plans.maxStudents,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.workspaceId, m.workspaceId));
    const [used] = await tx
      .select({ n: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), inArray(workspaceMembers.status, ["active", "invited"])));
    const options: PlanOption[] = await tx
      .select({ id: plans.id, code: plans.code, name: plans.name, priceCents: plans.priceCents, maxStudents: plans.maxStudents, storageQuotaMb: plans.storageQuotaMb })
      .from(plans)
      .where(and(eq(plans.isActive, true), ne(plans.code, "trial")))
      .orderBy(asc(plans.priceCents));
    return {
      subscription: sub ?? null,
      access: billingAccess(sub),
      studentsUsed: used?.n ?? 0,
      plans: options,
    };
  });
}

export const formatBRL = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
