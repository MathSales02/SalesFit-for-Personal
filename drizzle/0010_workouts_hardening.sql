-- Server-truth for values that will feed rewards later (Phase 5):
-- 1. Only the trusted system context may flag a set as a personal record.
-- 2. Completion time and duration come from the database clock, not the client.

CREATE FUNCTION workout_set_record_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF current_user = 'cadencia_app' AND NOT app_is_system() THEN
      IF TG_OP = 'INSERT' AND NEW.is_personal_record THEN
        RAISE EXCEPTION 'records are set by the server' USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.is_personal_record IS DISTINCT FROM OLD.is_personal_record THEN
        RAISE EXCEPTION 'records are set by the server' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER workout_sets_record_guard BEFORE INSERT OR UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION workout_set_record_guard();
--> statement-breakpoint

CREATE FUNCTION workout_session_finish() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF NEW.status <> 'in_progress' AND OLD.status = 'in_progress' THEN
      NEW.completed_at := now();
      NEW.duration_seconds := least(greatest(extract(epoch FROM now() - OLD.started_at)::int, 0), 21600);
    ELSIF NEW.status = 'in_progress' THEN
      NEW.completed_at := NULL;
      NEW.duration_seconds := NULL;
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER workout_sessions_finish BEFORE UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION workout_session_finish();
