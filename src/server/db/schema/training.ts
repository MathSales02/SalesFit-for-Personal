import { sql } from "drizzle-orm";
import { bigint, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
