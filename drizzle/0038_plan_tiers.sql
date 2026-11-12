CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'yearly');--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "annual_price_cents" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_cycle" "billing_cycle" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_cycle" "billing_cycle";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_installment_id" text;