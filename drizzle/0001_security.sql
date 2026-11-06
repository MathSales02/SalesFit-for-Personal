-- Database-level tenant isolation (defense in depth).
--
-- The application connects as cadencia_app, which is not the table owner and
-- has no BYPASSRLS, so every policy below is enforced on every query.
-- Server code sets the request context per transaction with set_config(..., true):
--   app.user_id            authenticated user id
--   app.workspace_id       active workspace (tenant) id
--   app.is_platform_admin  'on' only after the server verified users.is_platform_admin
--   app.is_system          'on' only inside trusted internal jobs (billing, trials)
-- With no context set, tenant tables return no rows (deny by default).
--
-- Membership and roles are NOT taken from the context: they are looked up in
-- workspace_members by app_member_role(), so a forged role cannot widen access.

CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(current_setting('app.is_platform_admin', true), '') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT coalesce(current_setting('app.is_system', true), '') = 'on' $$;
--> statement-breakpoint

-- SECURITY DEFINER so policies can read memberships without recursing into
-- workspace_members' own policies. search_path is pinned to avoid hijacking.
CREATE FUNCTION app_member_role(ws uuid) RETURNS member_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT m.role FROM workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = app_user_id() AND m.status = 'active'
  $$;
--> statement-breakpoint
CREATE FUNCTION app_owns_workspace(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = ws AND w.owner_user_id = app_user_id()) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_member_role(uuid), app_owns_workspace(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_member_role(uuid), app_owns_workspace(uuid) TO cadencia_app;
--> statement-breakpoint

-- workspaces ---------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workspaces_select ON workspaces FOR SELECT TO cadencia_app
  USING (owner_user_id = (SELECT app_user_id()) OR app_member_role(id) IS NOT NULL OR (SELECT app_is_platform_admin()));
--> statement-breakpoint
CREATE POLICY workspaces_insert ON workspaces FOR INSERT TO cadencia_app
  WITH CHECK (owner_user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY workspaces_update ON workspaces FOR UPDATE TO cadencia_app
  USING (app_member_role(id) = 'trainer' OR (SELECT app_is_platform_admin()))
  WITH CHECK (app_member_role(id) = 'trainer' OR (SELECT app_is_platform_admin()));
--> statement-breakpoint
-- No DELETE policy: workspaces are archived (soft delete), never removed by the app.

-- workspace_members --------------------------------------------------------
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY members_select ON workspace_members FOR SELECT TO cadencia_app
  USING (
    user_id = (SELECT app_user_id())
    OR (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL)
    OR (SELECT app_is_platform_admin())
  );
--> statement-breakpoint
CREATE POLICY members_insert ON workspace_members FOR INSERT TO cadencia_app
  WITH CHECK (
    -- the owner adding themselves as trainer when the workspace is created
    (role = 'trainer' AND user_id = (SELECT app_user_id()) AND app_owns_workspace(workspace_id))
    -- a trainer of the active workspace adding a student
    OR (role = 'student' AND workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  );
--> statement-breakpoint
CREATE POLICY members_update ON workspace_members FOR UPDATE TO cadencia_app
  USING ((workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer') OR (SELECT app_is_platform_admin()))
  WITH CHECK ((workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer') OR (SELECT app_is_platform_admin()));
--> statement-breakpoint

-- plans: readable by everyone, writable only by platform admins -------------
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plans_select ON plans FOR SELECT TO cadencia_app USING (true);
--> statement-breakpoint
CREATE POLICY plans_write ON plans FOR ALL TO cadencia_app
  USING ((SELECT app_is_platform_admin())) WITH CHECK ((SELECT app_is_platform_admin()));
--> statement-breakpoint

-- subscriptions: trainers can read their own; only system jobs or admins write.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO cadencia_app
  USING (app_member_role(workspace_id) = 'trainer' OR (SELECT app_is_platform_admin()) OR (SELECT app_is_system()));
--> statement-breakpoint
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO cadencia_app
  WITH CHECK ((SELECT app_is_system()) OR (SELECT app_is_platform_admin()));
--> statement-breakpoint
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO cadencia_app
  USING ((SELECT app_is_system()) OR (SELECT app_is_platform_admin()))
  WITH CHECK ((SELECT app_is_system()) OR (SELECT app_is_platform_admin()));
--> statement-breakpoint

-- audit_logs: append-only --------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_select ON audit_logs FOR SELECT TO cadencia_app
  USING (
    (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
    OR (SELECT app_is_platform_admin())
  );
--> statement-breakpoint
CREATE POLICY audit_insert ON audit_logs FOR INSERT TO cadencia_app WITH CHECK (true);
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM cadencia_app;
--> statement-breakpoint

-- security_events: append-only, readable by platform admins only -------------
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY security_select ON security_events FOR SELECT TO cadencia_app USING ((SELECT app_is_platform_admin()));
--> statement-breakpoint
CREATE POLICY security_insert ON security_events FOR INSERT TO cadencia_app WITH CHECK (true);
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON security_events FROM cadencia_app;
--> statement-breakpoint

-- Identity tables: append-only logs. Retention cleanup runs as the owner role.
REVOKE UPDATE, DELETE, TRUNCATE ON login_attempts, consents FROM cadencia_app;
--> statement-breakpoint
REVOKE TRUNCATE ON users, sessions, auth_tokens, workspaces, workspace_members, plans, subscriptions FROM cadencia_app;
--> statement-breakpoint

-- Seed plans. Prices and limits are placeholders for the business to confirm.
INSERT INTO plans (code, name, max_students, storage_quota_mb, features, price_cents) VALUES
  ('trial', 'Teste grátis', 10, 1024, '{"community": true, "challenges": true, "rewards": true}', 0),
  ('starter', 'Inicial', 30, 10240, '{"community": true, "challenges": true, "rewards": false}', 7900),
  ('pro', 'Profissional', 150, 51200, '{"community": true, "challenges": true, "rewards": true}', 14900);
