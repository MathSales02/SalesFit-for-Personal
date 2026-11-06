-- Phase 6B: account deletion (LGPD) and break-glass support access.

-- Account deletion removes the user row and everything cascades from it.
-- Guards that freeze history must let those cascaded deletes through:
-- they arrive from a referential action (trigger depth > 1), never from a direct statement.
CREATE OR REPLACE FUNCTION workout_set_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE s record; pe record;
  BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    SELECT status, day_id INTO s FROM workout_sessions WHERE id = coalesce(NEW.session_id, OLD.session_id);
    IF session_user = 'cadencia_app' AND (s.status IS DISTINCT FROM 'in_progress') THEN
      RAISE EXCEPTION 'sets can only change while the session is in progress' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    SELECT day_id, exercise_id, variation_exercise_id INTO pe FROM program_exercises WHERE id = NEW.program_exercise_id;
    IF pe.day_id IS DISTINCT FROM s.day_id THEN
      RAISE EXCEPTION 'exercise is not part of this workout day' USING ERRCODE = '42501';
    END IF;
    IF NEW.exercise_id <> pe.exercise_id AND NEW.exercise_id IS DISTINCT FROM pe.variation_exercise_id THEN
      RAISE EXCEPTION 'exercise does not match the prescription' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION competition_participants_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE c record; r member_role;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN coalesce(NEW, OLD); END IF;
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
    SELECT ends_on, closed_at, cancelled_at INTO c FROM competitions WHERE id = coalesce(NEW.competition_id, OLD.competition_id);
    IF c.closed_at IS NOT NULL OR c.cancelled_at IS NOT NULL OR c.ends_on < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'competition is not open' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT role INTO r FROM workspace_members WHERE id = NEW.member_id;
      IF r IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'only students take part in competitions' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN coalesce(NEW, OLD);
  END $$;
--> statement-breakpoint

-- Storage keys of every file owned by the current user's memberships, so the
-- files can be removed from object storage after the rows are deleted.
CREATE FUNCTION app_own_storage_keys() RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT a.storage_key FROM media_assets a
    JOIN workspace_members m ON m.id = a.owner_member_id
    WHERE m.user_id = app_user_id()
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_own_storage_keys() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_own_storage_keys() TO cadencia_app;
--> statement-breakpoint

-- Support access grants ----------------------------------------------------------------
ALTER TABLE support_access_grants ADD CONSTRAINT support_grants_ws_fk FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE support_access_grants ADD CONSTRAINT support_grants_ck CHECK (
  length(reason) BETWEEN 20 AND 500 AND expires_at > created_at AND expires_at <= created_at + interval '2 hours'
);
--> statement-breakpoint
ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Admins see and create grants; the workspace's trainer sees every grant on their workspace.
CREATE POLICY support_grants_read ON support_access_grants FOR SELECT TO cadencia_app
  USING ((SELECT app_is_platform_admin()) OR app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY support_grants_insert ON support_access_grants FOR INSERT TO cadencia_app
  WITH CHECK ((SELECT app_is_platform_admin()) AND admin_user_id = (SELECT app_user_id()));
--> statement-breakpoint
-- Only an admin may end a grant early, and only by setting revoked_at.
CREATE POLICY support_grants_revoke ON support_access_grants FOR UPDATE TO cadencia_app
  USING ((SELECT app_is_platform_admin())) WITH CHECK ((SELECT app_is_platform_admin()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON support_access_grants FROM cadencia_app;
--> statement-breakpoint
CREATE FUNCTION support_grants_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF NEW.workspace_id <> OLD.workspace_id OR NEW.admin_user_id <> OLD.admin_user_id OR NEW.reason <> OLD.reason
       OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at OR OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'support grants can only be revoked' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER support_grants_guard BEFORE UPDATE ON support_access_grants
  FOR EACH ROW EXECUTE FUNCTION support_grants_guard();
