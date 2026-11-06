-- Phase 3A: workout sessions, logged sets and personal records.

-- Same-workspace / same-student integrity -------------------------------------
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_member_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_day_fk
  FOREIGN KEY (day_id, version_id, program_id, workspace_id) REFERENCES program_days (id, version_id, program_id, workspace_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_key_uq UNIQUE (id, member_id, workspace_id);
--> statement-breakpoint
ALTER TABLE workout_sets ADD CONSTRAINT workout_sets_session_fk
  FOREIGN KEY (session_id, member_id, workspace_id) REFERENCES workout_sessions (id, member_id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE workout_sets ADD CONSTRAINT workout_sets_key_uq UNIQUE (id, session_id, member_id, workspace_id);
--> statement-breakpoint
ALTER TABLE personal_records ADD CONSTRAINT personal_records_set_fk
  FOREIGN KEY (set_id, session_id, member_id, workspace_id) REFERENCES workout_sets (id, session_id, member_id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint

-- Bounds (no rewards for absurd volume: values are capped) -----------------------
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_ck CHECK (
  (effort IS NULL OR effort BETWEEN 1 AND 10) AND length(notes) <= 500
  AND (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 21600)
);
--> statement-breakpoint
ALTER TABLE workout_sets ADD CONSTRAINT workout_sets_ck CHECK (
  set_number BETWEEN 1 AND 30 AND reps BETWEEN 0 AND 200 AND (load_kg IS NULL OR load_kg BETWEEN 0 AND 1000)
);
--> statement-breakpoint

-- A session can only start on the published content of the student's own active program.
CREATE FUNCTION workout_session_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NOT EXISTS (SELECT 1 FROM program_versions v WHERE v.id = NEW.version_id AND v.status = 'published') THEN
        RAISE EXCEPTION 'session must use a published version' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM program_assignments a
        WHERE a.member_id = NEW.member_id AND a.program_id = NEW.program_id AND a.status = 'active'
      ) THEN
        RAISE EXCEPTION 'program is not assigned to this student' USING ERRCODE = '42501';
      END IF;
      IF NEW.status <> 'in_progress' OR NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'sessions start in progress' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    -- Finished sessions are history: the app role cannot change them.
    IF current_user = 'cadencia_app' AND OLD.status <> 'in_progress' THEN
      RAISE EXCEPTION 'finished sessions are immutable' USING ERRCODE = '42501';
    END IF;
    IF current_user = 'cadencia_app' AND (NEW.member_id <> OLD.member_id OR NEW.day_id <> OLD.day_id OR NEW.version_id <> OLD.version_id OR NEW.started_at <> OLD.started_at) THEN
      RAISE EXCEPTION 'session identity cannot change' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER workout_sessions_guard BEFORE INSERT OR UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION workout_session_guard();
--> statement-breakpoint

-- Sets: only in an open session, only for an exercise prescribed on that session's day.
CREATE FUNCTION workout_set_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE s record; pe record;
  BEGIN
    SELECT status, day_id INTO s FROM workout_sessions WHERE id = coalesce(NEW.session_id, OLD.session_id);
    IF current_user = 'cadencia_app' AND (s.status IS DISTINCT FROM 'in_progress') THEN
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
CREATE TRIGGER workout_sets_guard BEFORE INSERT OR UPDATE OR DELETE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION workout_set_guard();
--> statement-breakpoint

-- RLS: the student owns their sessions; the trainer reads; admins have no access.
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sessions_self ON workout_sessions FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY sessions_trainer_read ON workout_sessions FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint

ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sets_self ON workout_sets FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY sets_trainer_read ON workout_sets FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
-- Marking a set as a record happens only in the trusted system context.
CREATE POLICY sets_system_update ON workout_sets FOR UPDATE TO cadencia_app
  USING ((SELECT app_is_system())) WITH CHECK ((SELECT app_is_system()));
--> statement-breakpoint

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY prs_read ON personal_records FOR SELECT TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (app_member_user(member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer' OR (SELECT app_is_system()))
  );
--> statement-breakpoint
CREATE POLICY prs_system_insert ON personal_records FOR INSERT TO cadencia_app
  WITH CHECK ((SELECT app_is_system()) AND workspace_id = (SELECT app_workspace_id()));
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON personal_records FROM cadencia_app;
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON workout_sessions FROM cadencia_app;
--> statement-breakpoint
REVOKE TRUNCATE ON workout_sets FROM cadencia_app;
