import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./identity";
import { workspaceMembers, workspaces } from "./tenancy";

/**
 * Student invitations. The token is stored hashed; the raw token only exists in
 * the email. One open invitation per email per workspace.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_uq").on(t.tokenHash),
    uniqueIndex("invitations_open_email_uq")
      .on(t.workspaceId, sql`lower(${t.email})`)
      .where(sql`accepted_at is null and revoked_at is null`),
    index("invitations_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const fitnessLevel = pgEnum("fitness_level", ["beginner", "intermediate", "advanced"]);

/** Training profile of a student inside one workspace. Not health data. */
export const studentProfiles = pgTable(
  "student_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => workspaceMembers.id, { onDelete: "cascade" }),
    goal: text("goal"),
    fitnessLevel: fitnessLevel("fitness_level"),
    weeklyFrequency: smallint("weekly_frequency"),
    /** Visible to the trainer only (never selected for the student). */
    trainerNotes: text("trainer_notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("student_profiles_member_uq").on(t.memberId), index("student_profiles_ws_idx").on(t.workspaceId)],
);

/**
 * Sensitive personal data (LGPD art. 11): injuries, restrictions, medical notes.
 * RLS only lets the student and their trainer see it, and the trainer only while
 * the student's health-data consent is active. Platform admins have no access.
 */
export const studentHealthRecords = pgTable(
  "student_health_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => workspaceMembers.id, { onDelete: "cascade" }),
    restrictions: text("restrictions"),
    injuries: text("injuries"),
    medicalNotes: text("medical_notes"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("student_health_member_uq").on(t.memberId)],
);
