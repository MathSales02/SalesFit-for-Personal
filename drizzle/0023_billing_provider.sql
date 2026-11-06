CREATE TYPE "public"."billing_event_status" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"workspace_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "billing_event_status" DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"status" text NOT NULL,
	"value_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"invoice_url" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_provider_event_uq" ON "billing_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "billing_events_status_idx" ON "billing_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_provider_uq" ON "billing_invoices" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_ws_due_idx" ON "billing_invoices" USING btree ("workspace_id","due_date");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;