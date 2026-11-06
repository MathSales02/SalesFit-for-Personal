import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { workspaces } from "./tenancy";

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    maxStudents: integer("max_students").notNull(),
    storageQuotaMb: integer("storage_quota_mb").notNull(),
    /** Feature flags enabled by this plan, e.g. { "challenges": true }. */
    features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("plans_code_uq").on(t.code)],
);

export const subscriptionStatus = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled", "expired"]);

/**
 * One row per workspace. Status changes only come from the server (trial
 * creation, admin action, or a verified payment webhook), never from the client.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("subscriptions_workspace_uq").on(t.workspaceId)],
);
