-- Phase 2A: invitations, student profiles and health records.

-- Cross-tenant integrity: a profile or health record must point at a member of
-- the SAME workspace. A composite foreign key makes a mismatch impossible.
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_member_ws_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE student_health_records ADD CONSTRAINT student_health_member_ws_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_frequency_ck CHECK (weekly_frequency BETWEEN 1 AND 7);
--> statement-breakpoint
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_len_ck CHECK (length(goal) <= 500 AND length(trainer_notes) <= 2000);
--> statement-breakpoint
ALTER TABLE student_health_records ADD CONSTRAINT student_health_len_ck
  CHECK (length(restrictions) <= 2000 AND length(injuries) <= 2000 AND length(medical_notes) <= 2000);
--> statement-breakpoint

-- Helpers (SECURITY DEFINER, pinned search_path) ----------------------------
CREATE FUNCTION app_member_user(member uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT m.user_id FROM workspace_members m WHERE m.id = member $$;
--> statement-breakpoint
-- Latest health-data consent decision of the member's user (LGPD art. 11, I).
CREATE FUNCTION app_health_consent(member uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT coalesce((
      SELECT c.granted FROM consents c
      WHERE c.user_id = (SELECT m.user_id FROM workspace_members m WHERE m.id = member)
        AND c.purpose = 'health_data_processing'
      ORDER BY c.created_at DESC, c.id DESC LIMIT 1
    ), false)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_member_user(uuid), app_health_consent(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_member_user(uuid), app_health_consent(uuid) TO cadencia_app;
--> statement-breakpoint

-- Memberships: invitation acceptance runs in the trusted system context -------
DROP POLICY members_insert ON workspace_members;
--> statement-breakpoint
CREATE POLICY members_insert ON workspace_members FOR INSERT TO cadencia_app
  WITH CHECK (
    (role = 'trainer' AND user_id = (SELECT app_user_id()) AND app_owns_workspace(workspace_id))
    OR (role = 'student' AND workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
    OR (role = 'student' AND (SELECT app_is_system()))
  );
--> statement-breakpoint
DROP POLICY members_update ON workspace_members;
--> statement-breakpoint
CREATE POLICY members_update ON workspace_members FOR UPDATE TO cadencia_app
  USING (
    (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
    OR (SELECT app_is_platform_admin())
    OR (role = 'student' AND (SELECT app_is_system()))
  )
  WITH CHECK (
    (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
    OR (SELECT app_is_platform_admin())
    OR (role = 'student' AND (SELECT app_is_system()))
  );
--> statement-breakpoint
DROP POLICY members_select ON workspace_members;
--> statement-breakpoint
CREATE POLICY members_select ON workspace_members FOR SELECT TO cadencia_app
  USING (
    user_id = (SELECT app_user_id())
    OR (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL)
    OR (SELECT app_is_platform_admin())
    OR (SELECT app_is_system())
  );
--> statement-breakpoint
DROP POLICY workspaces_select ON workspaces;
--> statement-breakpoint
CREATE POLICY workspaces_select ON workspaces FOR SELECT TO cadencia_app
  USING (
    owner_user_id = (SELECT app_user_id())
    OR app_member_role(id) IS NOT NULL
    OR (SELECT app_is_platform_admin())
    OR (SELECT app_is_system())
  );
--> statement-breakpoint

-- Invitations: managed by the workspace trainer; looked up by token only in the system context.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitations_trainer ON invitations FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY invitations_system ON invitations FOR ALL TO cadencia_app
  USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON invitations FROM cadencia_app;
--> statement-breakpoint

-- Student profiles: trainer reads and writes; the student reads their own.
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profiles_trainer ON student_profiles FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY profiles_self_select ON student_profiles FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY profiles_system_insert ON student_profiles FOR INSERT TO cadencia_app
  WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON student_profiles FROM cadencia_app;
--> statement-breakpoint

-- Health records: the student always; the trainer only while consent is active.
-- Deliberately NO platform-admin clause.
ALTER TABLE student_health_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY health_self ON student_health_records FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY health_trainer_select ON student_health_records FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id));
--> statement-breakpoint
CREATE POLICY health_trainer_insert ON student_health_records FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id));
--> statement-breakpoint
CREATE POLICY health_trainer_update ON student_health_records FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id));
--> statement-breakpoint
REVOKE TRUNCATE ON student_health_records FROM cadencia_app;
