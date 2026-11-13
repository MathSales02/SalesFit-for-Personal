-- Push notifications on phones (Web Push): who may read and write the subscribed devices,
-- what the sender may see, and the daily scan for students who stopped training.

-- Devices -----------------------------------------------------------------------------------
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_session_fk FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_ck CHECK (
  endpoint LIKE 'https://%' AND length(endpoint) <= 2048
  AND p256dh ~ '^[A-Za-z0-9_-]{80,100}$'
  AND auth ~ '^[A-Za-z0-9_-]{16,32}$'
  AND locale IN ('pt-BR', 'en', 'es')
);
--> statement-breakpoint
CREATE INDEX push_subscriptions_session_idx ON push_subscriptions (session_id) WHERE session_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Each person sees and removes their own devices; writing goes through app_save_push_subscription.
CREATE POLICY push_own_select ON push_subscriptions FOR SELECT TO cadencia_app
  USING (user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY push_own_delete ON push_subscriptions FOR DELETE TO cadencia_app
  USING (user_id = (SELECT app_user_id()));
--> statement-breakpoint
-- The sender records successful deliveries and drops devices the push service no longer knows.
CREATE POLICY push_system ON push_subscriptions FOR ALL TO cadencia_app
  USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint
REVOKE TRUNCATE ON push_subscriptions FROM cadencia_app;
--> statement-breakpoint

-- Subscribing: the device becomes the current user's, whoever had it before (a shared phone
-- that changed accounts must stop showing the previous person's notifications).
CREATE FUNCTION app_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_locale text, p_session uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE me uuid := app_user_id();
  BEGIN
    IF me IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
    IF p_session IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = p_session AND s.user_id = me) THEN
      RAISE EXCEPTION 'session of another user' USING ERRCODE = '42501';
    END IF;
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, locale, session_id)
    VALUES (me, p_endpoint, p_p256dh, p_auth, p_locale, p_session)
    ON CONFLICT (endpoint) DO UPDATE
      SET user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, locale = excluded.locale,
          session_id = excluded.session_id,
          created_at = CASE WHEN push_subscriptions.user_id = me THEN push_subscriptions.created_at ELSE now() END;
    -- At most 10 devices per person: the oldest ones go.
    DELETE FROM push_subscriptions WHERE id IN (
      SELECT id FROM push_subscriptions WHERE user_id = me ORDER BY created_at DESC OFFSET 10
    );
  END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_save_push_subscription(text, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_save_push_subscription(text, text, text, text, uuid) TO cadencia_app;
--> statement-breakpoint

-- What the sender needs for notifications that were just created: their text parts and the
-- recipient's devices. System context only; one row per notification and device.
CREATE FUNCTION app_push_targets(p_ids uuid[]) RETURNS TABLE (
  notification_id uuid, created_at timestamptz, type text, data jsonb, target_id uuid,
  recipient_role text, actor_name text,
  subscription_id uuid, endpoint text, p256dh text, auth text, locale text
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT app_is_system() THEN RAISE EXCEPTION 'system only' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
      SELECT n.id, n.created_at, n.type::text, n.data, n.target_id, rm.role::text, au.display_name,
             ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.locale
      FROM notifications n
      JOIN workspace_members rm ON rm.id = n.recipient_member_id AND rm.status = 'active'
      JOIN users ru ON ru.id = rm.user_id AND ru.status = 'active' AND ru.deleted_at IS NULL
      JOIN push_subscriptions ps ON ps.user_id = rm.user_id
      LEFT JOIN workspace_members am ON am.id = n.actor_member_id
      LEFT JOIN users au ON au.id = am.user_id
      WHERE n.id = ANY (p_ids) AND n.read_at IS NULL;
  END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_push_targets(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_push_targets(uuid[]) TO cadencia_app;
--> statement-breakpoint

-- Active students of active workspaces without a finished workout for p_days (counted from
-- joining when they never trained), with the trainers to tell. System context only. p_workspace narrows it (tests).
CREATE FUNCTION app_inactive_students(p_now timestamptz, p_days int, p_workspace uuid DEFAULT NULL) RETURNS TABLE (
  workspace_id uuid, member_id uuid, since timestamptz, never_trained boolean, has_program boolean, trainer_ids uuid[]
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT app_is_system() THEN RAISE EXCEPTION 'system only' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
      SELECT m.workspace_id, m.id, coalesce(last.at, m.joined_at, m.created_at), last.at IS NULL,
             EXISTS (SELECT 1 FROM program_assignments a WHERE a.member_id = m.id AND a.status = 'active'),
             ARRAY(SELECT t.id FROM workspace_members t WHERE t.workspace_id = m.workspace_id AND t.role = 'trainer' AND t.status = 'active')
      FROM workspace_members m
      JOIN workspaces w ON w.id = m.workspace_id AND w.status = 'active' AND w.deleted_at IS NULL
      JOIN users u ON u.id = m.user_id AND u.status = 'active' AND u.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT max(s.started_at) AS at FROM workout_sessions s WHERE s.member_id = m.id AND s.status = 'completed'
      ) last ON true
      WHERE m.role = 'student' AND m.status = 'active'
        AND (p_workspace IS NULL OR m.workspace_id = p_workspace)
        AND coalesce(last.at, m.joined_at, m.created_at) < p_now - make_interval(days => p_days);
  END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_inactive_students(timestamptz, int, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_inactive_students(timestamptz, int, uuid) TO cadencia_app;
