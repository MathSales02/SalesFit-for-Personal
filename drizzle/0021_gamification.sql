CREATE TYPE "public"."checkin_source" AS ENUM('workout', 'manual');--> statement-breakpoint
CREATE TYPE "public"."points_reason" AS ENUM('checkin_workout', 'checkin_manual', 'checkin_upgrade', 'weekly_goal', 'adjustment');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" "checkin_source" NOT NULL,
	"session_id" uuid,
	"activity" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competition_participants" (
	"competition_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_participants_competition_id_member_id_pk" PRIMARY KEY("competition_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"prize" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"results" jsonb,
	"closed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gamification_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"ranking_enabled" boolean DEFAULT true NOT NULL,
	"manual_checkins_enabled" boolean DEFAULT true NOT NULL,
	"workout_points" smallint DEFAULT 10 NOT NULL,
	"manual_checkin_points" smallint DEFAULT 3 NOT NULL,
	"weekly_goal_points" smallint DEFAULT 20 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" "points_reason" NOT NULL,
	"occurred_on" date NOT NULL,
	"idempotency_key" text NOT NULL,
	"reference_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_preferences" (
	"member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_preferences_member_id_pk" PRIMARY KEY("member_id")
);
--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_settings" ADD CONSTRAINT "gamification_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_member_day_uq" ON "checkins" USING btree ("member_id","day");--> statement-breakpoint
CREATE INDEX "checkins_ws_day_idx" ON "checkins" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "competition_participants_member_idx" ON "competition_participants" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "competitions_ws_idx" ON "competitions" USING btree ("workspace_id","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_idem_uq" ON "points_ledger" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "points_ledger_ws_day_idx" ON "points_ledger" USING btree ("workspace_id","occurred_on");--> statement-breakpoint
CREATE INDEX "points_ledger_member_idx" ON "points_ledger" USING btree ("member_id","occurred_on");