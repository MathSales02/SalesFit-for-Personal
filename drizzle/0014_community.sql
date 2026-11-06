CREATE TYPE "public"."media_moderation" AS ENUM('not_checked', 'clear', 'review');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('published', 'pending_review', 'removed');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('text', 'workout', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'nudity', 'hate', 'unsafe_training', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('post', 'comment', 'member', 'message');--> statement-breakpoint
ALTER TYPE "public"."media_visibility" ADD VALUE 'community';--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_member_id" uuid NOT NULL,
	"followed_member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_member_id_followed_member_id_pk" PRIMARY KEY("follower_member_id","followed_member_id")
);
--> statement-breakpoint
CREATE TABLE "member_blocks" (
	"blocker_member_id" uuid NOT NULL,
	"blocked_member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_blocks_blocker_member_id_blocked_member_id_pk" PRIMARY KEY("blocker_member_id","blocked_member_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_member_id_pk" PRIMARY KEY("post_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"kind" "post_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"media_asset_id" uuid,
	"session_id" uuid,
	"workout" jsonb,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"review_reason" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reporter_member_id" uuid NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"community_enabled" boolean DEFAULT true NOT NULL,
	"student_posts_require_approval" boolean DEFAULT false NOT NULL,
	"student_direct_messages" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "moderation" "media_moderation" DEFAULT 'not_checked' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "moderation_scores" jsonb;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "follows_followed_idx" ON "follows" USING btree ("followed_member_id");--> statement-breakpoint
CREATE INDEX "member_blocks_blocked_idx" ON "member_blocks" USING btree ("blocked_member_id");--> statement-breakpoint
CREATE INDEX "post_likes_member_idx" ON "post_likes" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("workspace_id","created_at","id") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_session_uq" ON "posts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree ("reporter_member_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_ws_open_idx" ON "reports" USING btree ("workspace_id","created_at") WHERE status = 'open';