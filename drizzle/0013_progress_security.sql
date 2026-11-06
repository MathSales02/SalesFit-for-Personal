-- Phase 3C: body measurements, progress photos and private media.

-- Private media belongs to one student of the same workspace and is always an image.
ALTER TABLE media_assets ADD CONSTRAINT media_assets_owner_fk
  FOREIGN KEY (owner_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_visibility_ck CHECK (
  (visibility = 'workspace' AND owner_member_id IS NULL)
  OR (visibility = 'private' AND owner_member_id IS NOT NULL AND kind = 'image')
);
--> statement-breakpoint

CREATE FUNCTION app_media_shared_with_trainer(asset uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM progress_photos p WHERE p.media_asset_id = asset AND p.shared_with_trainer) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_media_shared_with_trainer(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_media_shared_with_trainer(uuid) TO cadencia_app;
--> statement-breakpoint

DROP POLICY media_select ON media_assets;
--> statement-breakpoint
DROP POLICY media_insert ON media_assets;
--> statement-breakpoint
DROP POLICY media_update ON media_assets;
--> statement-breakpoint
CREATE POLICY media_select ON media_assets FOR SELECT TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility = 'workspace' AND app_member_role(workspace_id) IS NOT NULL)
      OR (visibility = 'private' AND app_member_user(owner_member_id) = (SELECT app_user_id()))
      OR (visibility = 'private' AND app_member_role(workspace_id) = 'trainer' AND app_media_shared_with_trainer(id))
    )
  );
--> statement-breakpoint
CREATE POLICY media_insert ON media_assets FOR INSERT TO cadencia_app
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id()) AND uploaded_by_user_id = (SELECT app_user_id())
    AND (
      (visibility = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility = 'private' AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY media_update ON media_assets FOR UPDATE TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility = 'private' AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  )
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility = 'private' AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint

-- Body measurements -------------------------------------------------------------
ALTER TABLE body_measurements ADD CONSTRAINT body_measurements_member_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE body_measurements ADD CONSTRAINT body_measurements_ck CHECK (
  (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400)
  AND (body_fat_pct IS NULL OR body_fat_pct BETWEEN 2 AND 70)
  AND (waist_cm IS NULL OR waist_cm BETWEEN 30 AND 250)
  AND (hip_cm IS NULL OR hip_cm BETWEEN 30 AND 250)
  AND (chest_cm IS NULL OR chest_cm BETWEEN 30 AND 250)
  AND (arm_cm IS NULL OR arm_cm BETWEEN 10 AND 100)
  AND (thigh_cm IS NULL OR thigh_cm BETWEEN 20 AND 150)
  AND length(notes) <= 300
  AND num_nonnulls(weight_kg, body_fat_pct, waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm) >= 1
);
--> statement-breakpoint
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY measurements_self ON body_measurements FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY measurements_trainer_select ON body_measurements FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id));
--> statement-breakpoint
CREATE POLICY measurements_trainer_insert ON body_measurements FOR INSERT TO cadencia_app
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND app_health_consent(member_id)
    AND recorded_by_user_id = (SELECT app_user_id())
  );
--> statement-breakpoint
REVOKE TRUNCATE ON body_measurements FROM cadencia_app;
--> statement-breakpoint

-- Progress photos -----------------------------------------------------------------
ALTER TABLE progress_photos ADD CONSTRAINT progress_photos_member_fk
  FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE progress_photos ADD CONSTRAINT progress_photos_asset_fk
  FOREIGN KEY (media_asset_id, workspace_id) REFERENCES media_assets (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint

-- A progress photo must use a private image owned by the same student.
CREATE FUNCTION progress_photo_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM media_assets a
      WHERE a.id = NEW.media_asset_id AND a.visibility = 'private' AND a.kind = 'image'
        AND a.owner_member_id = NEW.member_id AND a.status = 'ready'
    ) THEN
      RAISE EXCEPTION 'photo must be a verified private image of the same student' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER progress_photos_guard BEFORE INSERT OR UPDATE OF media_asset_id, member_id ON progress_photos
  FOR EACH ROW EXECUTE FUNCTION progress_photo_guard();
--> statement-breakpoint
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY photos_self ON progress_photos FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY photos_trainer_select ON progress_photos FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer' AND shared_with_trainer);
--> statement-breakpoint
REVOKE TRUNCATE ON progress_photos FROM cadencia_app;
