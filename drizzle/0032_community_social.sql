CREATE TABLE "member_profiles" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"bio" text,
	"goal" text,
	"avatar_asset_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"post_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_saves_post_id_member_id_pk" PRIMARY KEY("post_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "post_saves_member_idx" ON "post_saves" USING btree ("member_id","created_at");