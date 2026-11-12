CREATE TYPE "public"."exercise_demo_status" AS ENUM('matched', 'manual', 'unmatched');--> statement-breakpoint
CREATE TABLE "demo_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"actor_user_id" uuid,
	"checked" integer DEFAULT 0 NOT NULL,
	"available" integer DEFAULT 0 NOT NULL,
	"broken" integer DEFAULT 0 NOT NULL,
	"trainer_matched" integer DEFAULT 0 NOT NULL,
	"trainer_unmatched" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "demo_external_id" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "demo_url" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "demo_status" "exercise_demo_status";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "demo_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "demo_sync_runs" ADD CONSTRAINT "demo_sync_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;