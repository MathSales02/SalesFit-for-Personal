import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * A direct conversation between exactly two members of the same workspace.
 * member_a_id < member_b_id, so each pair has a single conversation.
 * Only the two participants can read it (RLS); the trainer cannot read
 * conversations between students.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    memberAId: uuid("member_a_id").notNull(),
    memberBId: uuid("member_b_id").notNull(),
    aLastReadAt: timestamp("a_last_read_at", { withTimezone: true }),
    bLastReadAt: timestamp("b_last_read_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_pair_uq").on(t.workspaceId, t.memberAId, t.memberBId),
    index("conversations_a_idx").on(t.memberAId, t.lastMessageAt),
    index("conversations_b_idx").on(t.memberBId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    senderMemberId: uuid("sender_member_id").notNull(),
    body: text("body"),
    mediaAssetId: uuid("media_asset_id"),
    // Millisecond precision: cursor values round-trip exactly through JavaScript dates.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    /** Set when the sender deletes it; content is wiped. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt, t.id)],
);

export const notificationType = pgEnum("notification_type", [
  "post_liked",
  "post_commented",
  "comment_replied",
  "new_follower",
  "message_received",
  "program_assigned",
  "program_updated",
  "post_approved",
  "post_removed",
  "announcement",
]);

/**
 * In-app notifications, created only by the server. dedupe_key collapses
 * repeats (e.g. like/unlike/like, or many messages in one conversation) into
 * one row. Text is rendered from type + data; private message content is never stored here.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    recipientMemberId: uuid("recipient_member_id").notNull(),
    type: notificationType("type").notNull(),
    actorMemberId: uuid("actor_member_id"),
    targetId: uuid("target_id"),
    data: jsonb("data").$type<Record<string, string | number>>().notNull().default({}),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Delivery bookkeeping for future channels (email, push). */
    deliveredChannels: jsonb("delivered_channels").$type<string[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_uq").on(t.recipientMemberId, t.dedupeKey),
    index("notifications_recipient_idx").on(t.recipientMemberId, t.createdAt).where(sql`read_at is null`),
    index("notifications_recipient_all_idx").on(t.recipientMemberId, t.createdAt),
  ],
);

/** Notification types a member turned off. */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    memberId: uuid("member_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    mutedTypes: jsonb("muted_types").$type<string[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId] })],
);
