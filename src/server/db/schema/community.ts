import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workspaces } from "./tenancy";

/** Per-workspace community switches, managed by the trainer. */
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  communityEnabled: boolean("community_enabled").notNull().default(true),
  /** When on, every student post waits for the trainer before it is published. */
  studentPostsRequireApproval: boolean("student_posts_require_approval").notNull().default(false),
  /** Student-to-student direct messages (Phase 4B). */
  studentDirectMessages: boolean("student_direct_messages").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postKind = pgEnum("post_kind", ["text", "workout", "announcement"]);
export const contentStatus = pgEnum("content_status", ["published", "pending_review", "removed"]);

/**
 * What a shared workout shows. Copied when the post is created, so the post never
 * needs to read the (private) workout tables and the student chooses what is public.
 */
export type WorkoutSnapshot = {
  dayName: string;
  programName: string;
  durationMinutes: number | null;
  sets: number;
  volumeKg: number;
  records: { exerciseName: string; reps: number; loadKg: number }[];
};

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    authorMemberId: uuid("author_member_id").notNull(),
    kind: postKind("kind").notNull().default("text"),
    body: text("body"),
    mediaAssetId: uuid("media_asset_id"),
    sessionId: uuid("session_id"),
    workout: jsonb("workout").$type<WorkoutSnapshot>(),
    status: contentStatus("status").notNull().default("published"),
    /** Why a post waits for review (e.g. "image_flagged", "approval_required"). */
    reviewReason: text("review_reason"),
    pinned: boolean("pinned").notNull().default(false),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("posts_feed_idx").on(t.workspaceId, t.createdAt, t.id).where(sql`status = 'published'`),
    index("posts_author_idx").on(t.authorMemberId, t.createdAt),
    uniqueIndex("posts_session_uq").on(t.sessionId),
  ],
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id").notNull(),
    memberId: uuid("member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.memberId] }), index("post_likes_member_idx").on(t.memberId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    postId: uuid("post_id").notNull(),
    authorMemberId: uuid("author_member_id").notNull(),
    /** One level of replies. */
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    status: contentStatus("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("comments_post_idx").on(t.postId, t.createdAt)],
);

export const follows = pgTable(
  "follows",
  {
    followerMemberId: uuid("follower_member_id").notNull(),
    followedMemberId: uuid("followed_member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerMemberId, t.followedMemberId] }), index("follows_followed_idx").on(t.followedMemberId)],
);

/** A block hides both people's content from each other and stops direct messages between them. */
export const memberBlocks = pgTable(
  "member_blocks",
  {
    blockerMemberId: uuid("blocker_member_id").notNull(),
    blockedMemberId: uuid("blocked_member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerMemberId, t.blockedMemberId] }), index("member_blocks_blocked_idx").on(t.blockedMemberId)],
);

export const reportTarget = pgEnum("report_target", ["post", "comment", "member", "message"]);
export const reportReason = pgEnum("report_reason", ["spam", "harassment", "nudity", "hate", "unsafe_training", "other"]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    reporterMemberId: uuid("reporter_member_id").notNull(),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: reportReason("reason").notNull(),
    details: text("details"),
    status: reportStatus("status").notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_once_uq").on(t.reporterMemberId, t.targetType, t.targetId),
    index("reports_ws_open_idx").on(t.workspaceId, t.createdAt).where(sql`status = 'open'`),
  ],
);
