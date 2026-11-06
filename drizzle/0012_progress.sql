CREATE TYPE "public"."media_visibility" AS ENUM('workspace', 'private');--> statement-breakpoint
CREATE TYPE "public"."photo_pose" AS ENUM('front', 'side', 'back', 'other');--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_pct" numeric(4, 1),
	"waist_cm" numeric(5, 1),
	"hip_cm" numeric(5, 1),
	"chest_cm" numeric(5, 1),
	"arm_cm" numeric(5, 1),
	"thigh_cm" numeric(5, 1),
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"pose" "photo_pose" DEFAULT 'front' NOT NULL,
	"shared_with_trainer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "visibility" "media_visibility" DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_measurements_member_date_idx" ON "body_measurements" USING btree ("member_id","measured_on");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_photos_asset_uq" ON "progress_photos" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "progress_photos_member_date_idx" ON "progress_photos" USING btree ("member_id","taken_on");