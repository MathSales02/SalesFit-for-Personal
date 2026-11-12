import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { plans } from "../db/schema";

export type PublicPlan = { code: string; name: string; priceCents: number; annualPriceCents: number | null; maxStudents: number; storageQuotaMb: number; features: Record<string, boolean> };

/**
 * Plans for the public pricing page: the active ones, from the same table the
 * checkout charges. Read-only; plans are readable by everyone (RLS: plans_select).
 */
export async function listPublicPlans(): Promise<{ paid: PublicPlan[]; trial: PublicPlan | null }> {
  const rows = await db()
    .select({ code: plans.code, name: plans.name, priceCents: plans.priceCents, annualPriceCents: plans.annualPriceCents, maxStudents: plans.maxStudents, storageQuotaMb: plans.storageQuotaMb, features: plans.features })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.priceCents));
  return { paid: rows.filter((p) => p.code !== "trial"), trial: rows.find((p) => p.code === "trial") ?? null };
}
