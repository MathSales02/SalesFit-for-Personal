import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workspaces } from "./tenancy";

/** Trainer-configurable scoring. Values reward consistency (one check-in a day), never volume. */
export const gamificationSettings = pgTable("gamification_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  rankingEnabled: boolean("ranking_enabled").notNull().default(true),
  manualCheckinsEnabled: boolean("manual_checkins_enabled").notNull().default(true),
  workoutPoints: smallint("workout_points").notNull().default(10),
  manualCheckinPoints: smallint("manual_checkin_points").notNull().default(3),
  weeklyGoalPoints: smallint("weekly_goal_points").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const checkinSource = pgEnum("checkin_source", ["workout", "manual"]);

/**
 * At most one check-in per student per day (local date). A completed workout
 * check-in can replace a manual one on the same day; never the other way round.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    day: date("day").notNull(),
    source: checkinSource("source").notNull(),
    sessionId: uuid("session_id"),
    /** Short label for manual check-ins, e.g. "Corrida". */
    activity: text("activity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("checkins_member_day_uq").on(t.memberId, t.day), index("checkins_ws_day_idx").on(t.workspaceId, t.day)],
);

export const pointsReason = pgEnum("points_reason", ["checkin_workout", "checkin_manual", "checkin_upgrade", "weekly_goal", "adjustment"]);

/**
 * Append-only points ledger. A balance is always the sum of entries; rankings
 * are computed from it on demand and never stored as the source of truth.
 * idempotency_key makes every award happen at most once.
 */
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    points: integer("points").notNull(),
    reason: pointsReason("reason").notNull(),
    /** Local date the points belong to, used for weekly/monthly rankings. */
    occurredOn: date("occurred_on").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("points_ledger_idem_uq").on(t.workspaceId, t.idempotencyKey),
    index("points_ledger_ws_day_idx").on(t.workspaceId, t.occurredOn),
    index("points_ledger_member_idx").on(t.memberId, t.occurredOn),
  ],
);

/** Students can hide themselves from rankings others see. */
export const rankingPreferences = pgTable(
  "ranking_preferences",
  {
    memberId: uuid("member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId] })],
);

/**
 * A time-boxed competition ranked by consistency points earned in the period.
 * The prize is optional. Winners are frozen into `results` when the trainer closes it.
 */
export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    prize: text("prize"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    results: jsonb("results").$type<{ memberId: string; name: string; points: number; position: number }[]>(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [index("competitions_ws_idx").on(t.workspaceId, t.endsOn)],
);

export const competitionParticipants = pgTable(
  "competition_participants",
  {
    competitionId: uuid("competition_id").notNull(),
    memberId: uuid("member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.memberId] }), index("competition_participants_member_idx").on(t.memberId)],
);

