-- Phase 6C: payment provider (Asaas) invoices and webhook events.
-- Both tables are written only from the system context (checkout and verified webhooks).

ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_ck CHECK (value_cents >= 0 AND length(status) <= 40 AND length(provider_payment_id) <= 100 AND length(invoice_url) <= 500);
--> statement-breakpoint
ALTER TABLE billing_events ADD CONSTRAINT billing_events_ck CHECK (length(event_id) <= 100 AND length(event_type) <= 100 AND length(error) <= 500);
--> statement-breakpoint

ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY billing_invoices_read ON billing_invoices FOR SELECT TO cadencia_app
  USING (app_member_role(workspace_id) = 'trainer' OR (SELECT app_is_platform_admin()) OR (SELECT app_is_system()));
--> statement-breakpoint
CREATE POLICY billing_invoices_system_write ON billing_invoices FOR ALL TO cadencia_app
  USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON billing_invoices FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY billing_events_read ON billing_events FOR SELECT TO cadencia_app
  USING ((SELECT app_is_platform_admin()) OR (SELECT app_is_system()));
--> statement-breakpoint
CREATE POLICY billing_events_system_write ON billing_events FOR ALL TO cadencia_app
  USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON billing_events FROM cadencia_app;
