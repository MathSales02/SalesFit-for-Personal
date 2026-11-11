CREATE TYPE "public"."exercise_difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "secondary_muscles" "muscle_group"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "difficulty" "exercise_difficulty";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "tips" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "common_mistakes" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "source_exercise_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_source_exercise_id_exercises_id_fk" FOREIGN KEY ("source_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;