CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "support_grants_ws_idx" ON "support_access_grants" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "support_grants_admin_idx" ON "support_access_grants" USING btree ("admin_user_id","expires_at");