-- Fix: inside SECURITY DEFINER functions current_user is the function owner,
-- so "current_user = 'cadencia_app'" never matched and the immutability checks
-- of workout sessions and sets were skipped. session_user is always the login
-- role of the connection (the app cannot SET ROLE), so every guard now uses it.

CREATE OR REPLACE FUNCTION workout_session_guard() RETURNS trigger
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
    IF session_user = 'cadencia_app' AND OLD.status <> 'in_progress' THEN
      RAISE EXCEPTION 'finished sessions are immutable' USING ERRCODE = '42501';
    END IF;
    IF session_user = 'cadencia_app' AND (NEW.member_id <> OLD.member_id OR NEW.day_id <> OLD.day_id OR NEW.version_id <> OLD.version_id OR NEW.started_at <> OLD.started_at) THEN
      RAISE EXCEPTION 'session identity cannot change' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION workout_set_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE s record; pe record;
  BEGIN
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

CREATE OR REPLACE FUNCTION program_version_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  DECLARE v_status program_version_status;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN coalesce(NEW, OLD); END IF;
    IF TG_TABLE_NAME = 'program_versions' THEN
      IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'published program versions are immutable' USING ERRCODE = '42501';
      END IF;
      RETURN coalesce(NEW, OLD);
    END IF;
    SELECT status INTO v_status FROM program_versions WHERE id = coalesce(NEW.version_id, OLD.version_id);
    IF v_status = 'published' THEN
      RAISE EXCEPTION 'published program versions are immutable' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce(NEW, OLD);
  END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION workout_set_record_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF session_user = 'cadencia_app' AND NOT app_is_system() THEN
      IF TG_OP = 'INSERT' AND NEW.is_personal_record THEN
        RAISE EXCEPTION 'records are set by the server' USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.is_personal_record IS DISTINCT FROM OLD.is_personal_record THEN
        RAISE EXCEPTION 'records are set by the server' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
