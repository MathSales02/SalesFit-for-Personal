CREATE TYPE "public"."notification_type" AS ENUM('post_liked', 'post_commented', 'comment_replied', 'new_follower', 'message_received', 'program_assigned', 'program_updated', 'post_approved', 'post_removed', 'announcement');--> statement-breakpoint
ALTER TYPE "public"."media_visibility" ADD VALUE 'message';--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_a_id" uuid NOT NULL,
	"member_b_id" uuid NOT NULL,
	"a_last_read_at" timestamp with time zone,
	"b_last_read_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_member_id" uuid NOT NULL,
	"body" text,
	"media_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"muted_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_member_id_pk" PRIMARY KEY("member_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"actor_member_id" uuid,
	"target_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"delivered_channels" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_uq" ON "conversations" USING btree ("workspace_id","member_a_id","member_b_id");--> statement-breakpoint
CREATE INDEX "conversations_a_idx" ON "conversations" USING btree ("member_a_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_b_idx" ON "conversations" USING btree ("member_b_id","last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("recipient_member_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_member_id","created_at") WHERE read_at is null;--> statement-breakpoint
CREATE INDEX "notifications_recipient_all_idx" ON "notifications" USING btree ("recipient_member_id","created_at");