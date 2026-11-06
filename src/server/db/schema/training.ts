import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./identity";
import { workspaces } from "./tenancy";

export const mediaKind = pgEnum("media_kind", ["video", "image"]);
export const mediaStatus = pgEnum("media_status", ["pending", "ready", "rejected", "deleted"]);

/**
 * Files in private object storage. The storage key is random and never shown
 * to users; playback uses short-lived presigned URLs issued after an
 * authorization check. "pending" rows exist between the signed upload and
 * server-side verification of size and file signature.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: mediaKind("kind").notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    /** Declared size while pending; verified size once ready. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("media_assets_key_uq").on(t.storageKey), index("media_assets_ws_status_idx").on(t.workspaceId, t.status)],
);

export const muscleGroup = pgEnum("muscle_group", [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "full_body",
  "cardio",
  "mobility",
]);

/**
 * Exercise library. workspace_id NULL = the platform library shared by every
 * trainer (read-only for them); otherwise a trainer's own exercise.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    muscleGroup: muscleGroup("muscle_group").notNull(),
    equipment: text("equipment"),
    description: text("description"),
    instructions: text("instructions"),
    videoAssetId: uuid("video_asset_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("exercises_name_uq")
      .on(sql`coalesce(${t.workspaceId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.name})`)
      .where(sql`archived_at is null`),
    index("exercises_ws_group_idx").on(t.workspaceId, t.muscleGroup),
  ],
);

/** A training program. Content lives in versions so edits never rewrite history. */
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isTemplate: boolean("is_template").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("programs_ws_idx").on(t.workspaceId)],
);

export const programVersionStatus = pgEnum("program_version_status", ["draft", "published"]);

/**
 * Published versions are immutable. Trainers edit a single draft per program
 * and publish it as the next version; workout logs reference the version used.
 */
export const programVersions = pgTable(
  "program_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    programId: uuid("program_id").notNull(),
    number: integer("number").notNull(),
    status: programVersionStatus("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_versions_number_uq").on(t.programId, t.number),
    uniqueIndex("program_versions_one_draft_uq").on(t.programId).where(sql`status = 'draft'`),
  ],
);

export const programDays = pgTable(
  "program_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    programId: uuid("program_id").notNull(),
    versionId: uuid("version_id").notNull(),
    position: smallint("position").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("program_days_position_uq").on(t.versionId, t.position)],
);

export const programExercises = pgTable(
  "program_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    programId: uuid("program_id").notNull(),
    versionId: uuid("version_id").notNull(),
    dayId: uuid("day_id").notNull(),
    position: smallint("position").notNull(),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "restrict" }),
    variationExerciseId: uuid("variation_exercise_id").references(() => exercises.id, { onDelete: "set null" }),
    sets: smallint("sets").notNull(),
    reps: text("reps").notNull(),
    load: text("load"),
    restSeconds: smallint("rest_seconds"),
    tempo: text("tempo"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("program_exercises_position_uq").on(t.dayId, t.position), index("program_exercises_version_idx").on(t.versionId)],
);

export const assignmentStatus = pgEnum("assignment_status", ["active", "ended"]);

/** Which program a student follows. One active assignment per student. */
export const programAssignments = pgTable(
  "program_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    programId: uuid("program_id").notNull(),
    memberId: uuid("member_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    status: assignmentStatus("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("program_assignments_one_active_uq").on(t.memberId).where(sql`status = 'active'`),
    index("program_assignments_program_idx").on(t.programId),
  ],
);
