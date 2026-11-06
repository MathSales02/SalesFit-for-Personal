-- Break-glass support view. The admin role has no RLS access to training data;
-- this function returns a fixed, minimal read-only summary, and only while the
-- calling admin holds an active (unexpired, unrevoked) grant for the workspace.
-- Health, photos, measurements, messages and community content are never included.
CREATE FUNCTION app_support_overview(ws uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT app_is_platform_admin() OR NOT EXISTS (
      SELECT 1 FROM support_access_grants g
      WHERE g.workspace_id = ws AND g.admin_user_id = app_user_id() AND g.revoked_at IS NULL AND g.expires_at > now()
    ) THEN
      RAISE EXCEPTION 'no active support access' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
      'students', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', u.display_name,
          'status', m.status,
          'joinedAt', m.joined_at,
          'program', (SELECT p.name FROM program_assignments a JOIN programs p ON p.id = a.program_id WHERE a.member_id = m.id AND a.status = 'active' LIMIT 1),
          'lastWorkoutAt', (SELECT max(s.started_at) FROM workout_sessions s WHERE s.member_id = m.id AND s.status = 'completed'),
          'workouts30d', (SELECT count(*) FROM workout_sessions s WHERE s.member_id = m.id AND s.status = 'completed' AND s.started_at > now() - interval '30 days')
        ) ORDER BY lower(u.display_name)), '[]'::jsonb)
        FROM workspace_members m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ws AND m.role = 'student'
      ),
      'programs', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', p.name,
          'isTemplate', p.is_template,
          'archived', p.archived_at IS NOT NULL,
          'activeAssignments', (SELECT count(*) FROM program_assignments a WHERE a.program_id = p.id AND a.status = 'active')
        ) ORDER BY p.created_at DESC), '[]'::jsonb)
        FROM programs p WHERE p.workspace_id = ws
      ),
      'openInvitations', (
        SELECT count(*) FROM invitations i
        WHERE i.workspace_id = ws AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
      )
    );
  END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_support_overview(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_support_overview(uuid) TO cadencia_app;
