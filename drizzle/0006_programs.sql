CREATE TYPE "public"."assignment_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."program_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "program_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" "assignment_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "program_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"exercise_id" uuid NOT NULL,
	"variation_exercise_id" uuid,
	"sets" smallint NOT NULL,
	"reps" text NOT NULL,
	"load" text,
	"rest_seconds" smallint,
	"tempo" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "program_version_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_variation_exercise_id_exercises_id_fk" FOREIGN KEY ("variation_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_assignments_one_active_uq" ON "program_assignments" USING btree ("member_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "program_assignments_program_idx" ON "program_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_days_position_uq" ON "program_days" USING btree ("version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "program_exercises_position_uq" ON "program_exercises" USING btree ("day_id","position");--> statement-breakpoint
CREATE INDEX "program_exercises_version_idx" ON "program_exercises" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_number_uq" ON "program_versions" USING btree ("program_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_one_draft_uq" ON "program_versions" USING btree ("program_id") WHERE status = 'draft';--> statement-breakpoint
CREATE INDEX "programs_ws_idx" ON "programs" USING btree ("workspace_id");