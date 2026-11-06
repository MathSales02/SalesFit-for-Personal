import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /** Plan being bought: becomes planId when the provider confirms the first payment. */
    pendingPlanId: uuid("pending_plan_id").references(() => plans.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("subscriptions_workspace_uq").on(t.workspaceId)],
);

/**
 * Charges mirrored from the payment provider, written only by the system
 * (checkout and verified webhooks). The trainer reads them on the billing page.
 */
export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    status: text("status").notNull(),
    valueCents: integer("value_cents").notNull(),
    dueDate: date("due_date").notNull(),
    invoiceUrl: text("invoice_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("billing_invoices_provider_uq").on(t.provider, t.providerPaymentId), index("billing_invoices_ws_due_idx").on(t.workspaceId, t.dueDate)],
);

export const billingEventStatus = pgEnum("billing_event_status", ["received", "processed", "ignored", "failed"]);

/**
 * Every webhook delivery, stored before it is processed. The unique event id
 * makes redeliveries harmless; failed events can be reprocessed by an admin.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    workspaceId: uuid("workspace_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: billingEventStatus("status").notNull().default("received"),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("billing_events_provider_event_uq").on(t.provider, t.eventId), index("billing_events_status_idx").on(t.status, t.receivedAt)],
);
