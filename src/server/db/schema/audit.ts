import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only. The runtime role has INSERT and SELECT only (see 0001_security.sql),
 * so the application cannot alter or remove entries.
 * Never put passwords, tokens, message bodies or health data in metadata.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id"),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_ws_time_idx").on(t.workspaceId, t.createdAt),
    index("audit_logs_actor_time_idx").on(t.actorUserId, t.createdAt),
  ],
);

export const securitySeverity = pgEnum("security_severity", ["info", "warning", "critical"]);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    severity: securitySeverity("severity").notNull(),
    userId: uuid("user_id"),
    workspaceId: uuid("workspace_id"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_events_time_idx").on(t.createdAt), index("security_events_type_time_idx").on(t.type, t.createdAt)],
);

/**
 * Break-glass: a platform admin's time-limited, read-only support access to
 * one workspace, with a mandatory reason. The workspace owner is notified and
 * can see every grant. Health data, photos and messages stay out of reach.
 */
export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    adminUserId: uuid("admin_user_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("support_grants_ws_idx").on(t.workspaceId, t.createdAt), index("support_grants_admin_idx").on(t.adminUserId, t.expiresAt)],
);
