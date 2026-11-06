CREATE TYPE "public"."workout_session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"reps" smallint NOT NULL,
	"load_kg" numeric(6, 2) NOT NULL,
	"e1rm_kg" numeric(7, 2) NOT NULL,
	"previous_e1rm_kg" numeric(7, 2),
	"achieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"status" "workout_session_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_seconds" integer,
	"notes" text,
	"effort" smallint
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"program_exercise_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_number" smallint NOT NULL,
	"reps" smallint NOT NULL,
	"load_kg" numeric(6, 2),
	"is_personal_record" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_records_member_exercise_idx" ON "personal_records" USING btree ("member_id","exercise_id","achieved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "personal_records_set_uq" ON "personal_records" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_open_uq" ON "workout_sessions" USING btree ("member_id") WHERE status = 'in_progress';--> statement-breakpoint
CREATE INDEX "workout_sessions_member_time_idx" ON "workout_sessions" USING btree ("member_id","started_at");--> statement-breakpoint
CREATE INDEX "workout_sessions_ws_time_idx" ON "workout_sessions" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sets_slot_uq" ON "workout_sets" USING btree ("session_id","program_exercise_id","set_number");--> statement-breakpoint
CREATE INDEX "workout_sets_member_exercise_idx" ON "workout_sets" USING btree ("member_id","exercise_id","logged_at");