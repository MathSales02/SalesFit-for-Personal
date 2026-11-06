import { boolean, date, index, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Body measurements. Treated as sensitive personal data (LGPD art. 11): the
 * student always sees their own; the trainer only while the student's
 * health-data consent is active. Platform admins never have access.
 */
export const bodyMeasurements = pgTable(
  "body_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    measuredOn: date("measured_on").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2, mode: "number" }),
    bodyFatPct: numeric("body_fat_pct", { precision: 4, scale: 1, mode: "number" }),
    waistCm: numeric("waist_cm", { precision: 5, scale: 1, mode: "number" }),
    hipCm: numeric("hip_cm", { precision: 5, scale: 1, mode: "number" }),
    chestCm: numeric("chest_cm", { precision: 5, scale: 1, mode: "number" }),
    armCm: numeric("arm_cm", { precision: 5, scale: 1, mode: "number" }),
    thighCm: numeric("thigh_cm", { precision: 5, scale: 1, mode: "number" }),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("body_measurements_member_date_idx").on(t.memberId, t.measuredOn)],
);

export const photoPose = pgEnum("photo_pose", ["front", "side", "back", "other"]);

/**
 * Progress photos: private by default. Each photo is shared with the trainer
 * only when the student turns sharing on for that photo. Never used in social features.
 */
export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    mediaAssetId: uuid("media_asset_id").notNull(),
    takenOn: date("taken_on").notNull(),
    pose: photoPose("pose").notNull().default("front"),
    sharedWithTrainer: boolean("shared_with_trainer").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("progress_photos_asset_uq").on(t.mediaAssetId), index("progress_photos_member_date_idx").on(t.memberId, t.takenOn)],
);
