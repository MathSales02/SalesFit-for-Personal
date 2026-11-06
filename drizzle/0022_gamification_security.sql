-- Phase 5A: check-ins, points ledger, rankings and competitions.

-- Integrity --------------------------------------------------------------------------
ALTER TABLE checkins ADD CONSTRAINT checkins_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE checkins ADD CONSTRAINT checkins_session_fk FOREIGN KEY (session_id) REFERENCES workout_sessions (id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE checkins ADD CONSTRAINT checkins_ck CHECK (length(activity) <= 60 AND (source <> 'workout' OR session_id IS NOT NULL));
--> statement-breakpoint
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE points_ledger ADD CONSTRAINT points_ledger_ck CHECK (points BETWEEN -1000 AND 1000 AND points <> 0 AND length(note) <= 200);
--> statement-breakpoint
ALTER TABLE ranking_preferences ADD CONSTRAINT ranking_prefs_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE gamification_settings ADD CONSTRAINT gamification_settings_ck CHECK (
  workout_points BETWEEN 0 AND 100 AND manual_checkin_points BETWEEN 0 AND 100 AND weekly_goal_points BETWEEN 0 AND 200
  AND manual_checkin_points <= workout_points
);
--> statement-breakpoint
ALTER TABLE competitions ADD CONSTRAINT competitions_ws_fk FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE competitions ADD CONSTRAINT competitions_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
ALTER TABLE competitions ADD CONSTRAINT competitions_ck CHECK (
  length(title) BETWEEN 3 AND 80 AND length(description) <= 1000 AND length(prize) <= 200
  AND ends_on >= starts_on AND ends_on - starts_on <= 366
);
--> statement-breakpoint
ALTER TABLE competition_participants ADD CONSTRAINT competition_participants_comp_fk FOREIGN KEY (competition_id, workspace_id) REFERENCES competitions (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE competition_participants ADD CONSTRAINT competition_participants_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint

-- Only students join, and only while the competition is open.
CREATE FUNCTION competition_participants_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE c record; r member_role;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN coalesce(NEW, OLD); END IF;
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
CREATE TRIGGER competition_participants_guard BEFORE INSERT OR DELETE ON competition_participants
  FOR EACH ROW EXECUTE FUNCTION competition_participants_guard();
--> statement-breakpoint

-- Closed competitions are frozen (results cannot be edited after closing).
CREATE FUNCTION competitions_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    IF OLD.closed_at IS NOT NULL OR OLD.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'closed or cancelled competitions cannot change' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER competitions_guard BEFORE UPDATE ON competitions FOR EACH ROW EXECUTE FUNCTION competitions_guard();
--> statement-breakpoint

-- Ranking -----------------------------------------------------------------------------
-- Points per active student in [from, to] from the ledger (the source of truth).
-- Students who hid themselves are left out for other students; the caller always
-- sees their own row, and trainers see everyone (with the hidden flag).
CREATE FUNCTION app_ranking(from_day date, to_day date, competition uuid DEFAULT NULL)
  RETURNS TABLE (member_id uuid, name text, points bigint, checkins bigint, hidden boolean)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    WITH me AS (
      SELECT m.id, m.role FROM workspace_members m
      WHERE m.workspace_id = app_workspace_id() AND m.user_id = app_user_id() AND m.status = 'active'
    )
    SELECT s.id, u.display_name,
      coalesce((SELECT sum(l.points) FROM points_ledger l WHERE l.member_id = s.id AND l.occurred_on BETWEEN from_day AND to_day), 0) AS points,
      (SELECT count(*) FROM checkins c WHERE c.member_id = s.id AND c.day BETWEEN from_day AND to_day) AS checkins,
      coalesce(p.hidden, false) AS hidden
    FROM workspace_members s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN ranking_preferences p ON p.member_id = s.id
    WHERE EXISTS (SELECT 1 FROM me)
      AND s.workspace_id = app_workspace_id() AND s.role = 'student' AND s.status = 'active'
      AND (competition IS NULL OR EXISTS (SELECT 1 FROM competition_participants cp WHERE cp.competition_id = competition AND cp.member_id = s.id))
      AND (NOT coalesce(p.hidden, false) OR s.id = (SELECT id FROM me) OR (SELECT role FROM me) = 'trainer')
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_ranking(date, date, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_ranking(date, date, uuid) TO cadencia_app;
--> statement-breakpoint

-- RLS ---------------------------------------------------------------------------------
ALTER TABLE gamification_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY gsettings_read ON gamification_settings FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY gsettings_trainer ON gamification_settings FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON gamification_settings FROM cadencia_app;
--> statement-breakpoint

-- Check-ins and points are written only by the server (system context).
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY checkins_read ON checkins FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer' OR (SELECT app_is_system())));
--> statement-breakpoint
CREATE POLICY checkins_system_write ON checkins FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON checkins FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ledger_read ON points_ledger FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer' OR (SELECT app_is_system())));
--> statement-breakpoint
CREATE POLICY ledger_system_insert ON points_ledger FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON points_ledger FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE ranking_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ranking_prefs_self ON ranking_preferences FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON ranking_preferences FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY competitions_read ON competitions FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY competitions_trainer ON competitions FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON competitions FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE competition_participants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY participants_read ON competition_participants FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY participants_self ON competition_participants FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY participants_self_leave ON competition_participants FOR DELETE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON competition_participants FROM cadencia_app;
