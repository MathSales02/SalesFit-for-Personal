-- Phase 2B-2: programs, versions, days, prescribed exercises, assignments.

-- Same-workspace integrity down the whole tree (composite foreign keys) ----
ALTER TABLE programs ADD CONSTRAINT programs_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
ALTER TABLE program_versions ADD CONSTRAINT program_versions_program_fk
  FOREIGN KEY (program_id, workspace_id) REFERENCES programs (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE program_versions ADD CONSTRAINT program_versions_key_uq UNIQUE (id, program_id, workspace_id);
--> statement-breakpoint
ALTER TABLE program_days ADD CONSTRAINT program_days_version_fk
  FOREIGN KEY (version_id, program_id, workspace_id) REFERENCES program_versions (id, program_id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE program_days ADD CONSTRAINT program_days_key_uq UNIQUE (id, version_id, program_id, workspace_id);
--> statement-breakpoint
ALTER TABLE program_exercises ADD CONSTRAINT program_exercises_day_fk
  FOREIGN KEY (day_id, version_id, program_id, workspace_id) REFERENCES program_days (id, version_id, program_id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE program_assignments ADD CONSTRAINT program_assignments_program_fk
  FOREIGN KEY (program_id, workspace_id) REFERENCES programs (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE program_assignments ADD CONSTRAINT program_assignments_member_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint

-- Bounds --------------------------------------------------------------------
ALTER TABLE programs ADD CONSTRAINT programs_len_ck CHECK (length(name) BETWEEN 2 AND 80 AND length(description) <= 1000);
--> statement-breakpoint
ALTER TABLE program_versions ADD CONSTRAINT program_versions_number_ck CHECK (number >= 1);
--> statement-breakpoint
ALTER TABLE program_days ADD CONSTRAINT program_days_ck CHECK (position BETWEEN 0 AND 13 AND length(name) BETWEEN 1 AND 60 AND length(notes) <= 500);
--> statement-breakpoint
ALTER TABLE program_exercises ADD CONSTRAINT program_exercises_ck CHECK (
  position BETWEEN 0 AND 39 AND sets BETWEEN 1 AND 20 AND length(reps) BETWEEN 1 AND 20
  AND length(load) <= 30 AND rest_seconds BETWEEN 0 AND 900 AND length(tempo) <= 15 AND length(notes) <= 500
);
--> statement-breakpoint
ALTER TABLE program_assignments ADD CONSTRAINT program_assignments_dates_ck CHECK (ends_on IS NULL OR ends_on >= starts_on);
--> statement-breakpoint

-- A prescribed exercise must come from the platform library or the same workspace.
CREATE FUNCTION program_exercise_visible() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = NEW.exercise_id AND (e.workspace_id IS NULL OR e.workspace_id = NEW.workspace_id)) THEN
      RAISE EXCEPTION 'exercise not available in this workspace' USING ERRCODE = '42501';
    END IF;
    IF NEW.variation_exercise_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM exercises e WHERE e.id = NEW.variation_exercise_id AND (e.workspace_id IS NULL OR e.workspace_id = NEW.workspace_id)
    ) THEN
      RAISE EXCEPTION 'variation not available in this workspace' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER program_exercises_visible BEFORE INSERT OR UPDATE ON program_exercises
  FOR EACH ROW EXECUTE FUNCTION program_exercise_visible();
--> statement-breakpoint

-- Published versions are immutable for the application role (history must not change).
-- Maintenance as the owner role (e.g. deleting a closed account) is not affected.
CREATE FUNCTION program_version_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  DECLARE v_status program_version_status;
  BEGIN
    IF current_user <> 'cadencia_app' THEN RETURN coalesce(NEW, OLD); END IF;
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
CREATE TRIGGER program_versions_guard BEFORE UPDATE OR DELETE ON program_versions
  FOR EACH ROW EXECUTE FUNCTION program_version_guard();
--> statement-breakpoint
CREATE TRIGGER program_days_guard BEFORE INSERT OR UPDATE OR DELETE ON program_days
  FOR EACH ROW EXECUTE FUNCTION program_version_guard();
--> statement-breakpoint
CREATE TRIGGER program_exercises_guard BEFORE INSERT OR UPDATE OR DELETE ON program_exercises
  FOR EACH ROW EXECUTE FUNCTION program_version_guard();
--> statement-breakpoint

-- RLS helpers -----------------------------------------------------------------
CREATE FUNCTION app_assigned_program(p uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM program_assignments a JOIN workspace_members m ON m.id = a.member_id
      WHERE a.program_id = p AND a.status = 'active' AND m.user_id = app_user_id() AND m.status = 'active'
    )
  $$;
--> statement-breakpoint
CREATE FUNCTION app_version_published(v uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM program_versions pv WHERE pv.id = v AND pv.status = 'published') $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_assigned_program(uuid), app_version_published(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_assigned_program(uuid), app_version_published(uuid) TO cadencia_app;
--> statement-breakpoint

-- Policies: trainers manage everything in their workspace; students read only
-- the published content of the program assigned to them.
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY programs_trainer ON programs FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY programs_student ON programs FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_assigned_program(id));
--> statement-breakpoint

ALTER TABLE program_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY versions_trainer ON program_versions FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY versions_student ON program_versions FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND status = 'published' AND app_assigned_program(program_id));
--> statement-breakpoint

ALTER TABLE program_days ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY days_trainer ON program_days FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY days_student ON program_days FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_assigned_program(program_id) AND app_version_published(version_id));
--> statement-breakpoint

ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pex_trainer ON program_exercises FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY pex_student ON program_exercises FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_assigned_program(program_id) AND app_version_published(version_id));
--> statement-breakpoint

ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY assignments_trainer ON program_assignments FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
CREATE POLICY assignments_student ON program_assignments FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint

REVOKE DELETE ON programs, program_assignments FROM cadencia_app;
--> statement-breakpoint
REVOKE TRUNCATE ON programs, program_versions, program_days, program_exercises, program_assignments FROM cadencia_app;
