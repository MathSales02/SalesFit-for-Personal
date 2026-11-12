import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { users } from "./identity";
import { workspaces } from "./tenancy";

export const mediaKind = pgEnum("media_kind", ["video", "image"]);
export const mediaStatus = pgEnum("media_status", ["pending", "ready", "rejected", "deleted"]);
export const mediaVisibility = pgEnum("media_visibility", ["workspace", "private", "community", "message"]);
export const mediaModeration = pgEnum("media_moderation", ["not_checked", "clear", "review"]);

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
    /**
     * workspace: visible to every member (exercise videos).
     * private: visible to the owning student only, and to their trainer only
     * when the student shares that specific photo.
     */
    visibility: mediaVisibility("visibility").notNull().default("workspace"),
    ownerMemberId: uuid("owner_member_id"),
    /** Automated image screening result for community images (NSFW classifier). */
    moderation: mediaModeration("moderation").notNull().default("not_checked"),
    moderationScores: jsonb("moderation_scores").$type<Record<string, number>>(),
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

/** matched: found automatically; manual: chosen by an admin; unmatched: nothing reliable, needs review. */
export const exerciseDemoStatus = pgEnum("exercise_demo_status", ["matched", "manual", "unmatched"]);

export const exerciseDifficulty = pgEnum("exercise_difficulty", ["beginner", "intermediate", "advanced"]);

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
    /** Other muscles the movement trains, besides the main group. */
    secondaryMuscles: muscleGroup("secondary_muscles").array().notNull().default(sql`'{}'`),
    difficulty: exerciseDifficulty("difficulty"),
    /** External demonstration (canonical YouTube watch URL), used when there is no uploaded video. */
    videoUrl: text("video_url"),
    tips: text("tips"),
    commonMistakes: text("common_mistakes"),
    /**
     * Animated demonstration from the external catalogue (ExerciseDB). Platform exercises hold the
     * reference; trainers' exercises receive theirs by name, alias or origin (app_propagate_exercise_demos).
     */
    demoExternalId: text("demo_external_id"),
    demoUrl: text("demo_url"),
    demoStatus: exerciseDemoStatus("demo_status"),
    demoSyncedAt: timestamp("demo_synced_at", { withTimezone: true }),
    /** Platform exercises: other names trainers use for the same movement (normalized keys). */
    aliases: text("aliases").array().notNull().default(sql`'{}'`),
    /** The platform exercise this one was copied from, so the same exercise is not copied twice. */
    sourceExerciseId: uuid("source_exercise_id").references((): AnyPgColumn => exercises.id, { onDelete: "set null" }),
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

/** One row per run of the demonstration sync, for the admin panel. */
export const demoSyncRuns = pgTable("demo_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  /** Platform exercises whose media was checked, and how many answered / were broken. */
  checked: integer("checked").notNull().default(0),
  available: integer("available").notNull().default(0),
  broken: integer("broken").notNull().default(0),
  /** Trainers' exercises after propagation. */
  trainerMatched: integer("trainer_matched").notNull().default(0),
  trainerUnmatched: integer("trainer_unmatched").notNull().default(0),
  error: text("error"),
});

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
