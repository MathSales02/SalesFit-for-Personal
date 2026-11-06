import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./identity";

/**
 * Tenant layer. Every table here (and every future domain table) carries a
 * workspace_id and is protected by Row-Level Security policies defined in
 * drizzle/0001_security.sql. The runtime database role cannot bypass them.
 */

export const workspaceStatus = pgEnum("workspace_status", ["active", "suspended", "archived"]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: workspaceStatus("status").notNull().default("active"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("workspaces_slug_uq").on(t.slug), index("workspaces_owner_idx").on(t.ownerUserId)],
);

export const memberRole = pgEnum("member_role", ["trainer", "student"]);
export const memberStatus = pgEnum("member_status", ["invited", "active", "suspended", "archived"]);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    status: memberStatus("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_members_ws_user_uq").on(t.workspaceId, t.userId),
    index("workspace_members_user_idx").on(t.userId),
    index("workspace_members_ws_role_idx").on(t.workspaceId, t.role).where(sql`status = 'active'`),
  ],
);
