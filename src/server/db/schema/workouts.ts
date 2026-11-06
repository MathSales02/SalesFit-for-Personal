import { sql } from "drizzle-orm";
import { boolean, index, integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { exercises } from "./training";

export const sessionStatus = pgEnum("workout_session_status", ["in_progress", "completed", "abandoned"]);

/**
 * One workout performed by a student. It points at the exact program version
 * and day used, so later edits to the program never change history.
 * Timing and completion are set by the server, never by the client.
 */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    programId: uuid("program_id").notNull(),
    versionId: uuid("version_id").notNull(),
    dayId: uuid("day_id").notNull(),
    status: sessionStatus("status").notNull().default("in_progress"),
    // Millisecond precision: history cursors round-trip exactly through JavaScript dates.
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    /** Student's own note about the session (e.g. "senti o ombro"). Not health data by design; kept short. */
    notes: text("notes"),
    /** Perceived effort, 1 (very easy) to 10 (maximal). */
    effort: smallint("effort"),
  },
  (t) => [
    uniqueIndex("workout_sessions_one_open_uq").on(t.memberId).where(sql`status = 'in_progress'`),
    index("workout_sessions_member_time_idx").on(t.memberId, t.startedAt),
    index("workout_sessions_ws_time_idx").on(t.workspaceId, t.startedAt),
  ],
);

/** A logged set. Load is in kilograms. */
export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    programExerciseId: uuid("program_exercise_id").notNull(),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    setNumber: smallint("set_number").notNull(),
    reps: smallint("reps").notNull(),
    loadKg: numeric("load_kg", { precision: 6, scale: 2, mode: "number" }),
    isPersonalRecord: boolean("is_personal_record").notNull().default(false),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workout_sets_slot_uq").on(t.sessionId, t.programExerciseId, t.setNumber),
    index("workout_sets_member_exercise_idx").on(t.memberId, t.exerciseId, t.loggedAt),
  ],
);

/**
 * Personal records, detected by the server when a session is completed.
 * A new row is added each time a record is beaten, so the history of records is kept.
 * e1rm = estimated one-rep max (Epley), used to compare sets with different reps.
 */
export const personalRecords = pgTable(
  "personal_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    setId: uuid("set_id").notNull(),
    reps: smallint("reps").notNull(),
    loadKg: numeric("load_kg", { precision: 6, scale: 2, mode: "number" }).notNull(),
    e1rmKg: numeric("e1rm_kg", { precision: 7, scale: 2, mode: "number" }).notNull(),
    previousE1rmKg: numeric("previous_e1rm_kg", { precision: 7, scale: 2, mode: "number" }),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("personal_records_member_exercise_idx").on(t.memberId, t.exerciseId, t.achievedAt), uniqueIndex("personal_records_set_uq").on(t.setId)],
);
