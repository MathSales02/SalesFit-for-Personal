-- Community as a social network: saved posts, editable posts, social profiles
-- (photo, bio, goal) and "who trained today".

-- Saved posts: private to each member -------------------------------------------------
ALTER TABLE post_saves ADD CONSTRAINT post_saves_post_fk FOREIGN KEY (post_id, workspace_id) REFERENCES posts (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE post_saves ADD CONSTRAINT post_saves_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE post_saves ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY saves_select ON post_saves FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY saves_insert ON post_saves FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()) AND app_post_visible(post_id));
--> statement-breakpoint
CREATE POLICY saves_delete ON post_saves FOR DELETE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON post_saves FROM cadencia_app;
--> statement-breakpoint

-- Social profiles: everyone in the workspace reads, each member writes their own ---------
ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_avatar_fk FOREIGN KEY (avatar_asset_id, workspace_id) REFERENCES media_assets (id, workspace_id) ON DELETE SET NULL (avatar_asset_id);
--> statement-breakpoint
ALTER TABLE member_profiles ADD CONSTRAINT member_profiles_ck CHECK (
  length(bio) <= 160
  AND (goal IS NULL OR goal IN ('hypertrophy', 'fat_loss', 'conditioning', 'strength', 'health', 'performance'))
);
--> statement-breakpoint
CREATE INDEX member_profiles_avatar_idx ON member_profiles (avatar_asset_id) WHERE avatar_asset_id IS NOT NULL;
--> statement-breakpoint
-- A profile photo must be the member's own community image that screened fully clear
-- (nobody reviews profile photos, so "review" is not enough).
CREATE FUNCTION member_profiles_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE a record;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.member_id, NEW.workspace_id) IS DISTINCT FROM (OLD.member_id, OLD.workspace_id) THEN
      RAISE EXCEPTION 'a profile cannot change owner' USING ERRCODE = '42501';
    END IF;
    IF NEW.avatar_asset_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.avatar_asset_id IS DISTINCT FROM OLD.avatar_asset_id) THEN
      SELECT status, owner_member_id, visibility::text AS vis, moderation INTO a FROM media_assets WHERE id = NEW.avatar_asset_id;
      IF a.status IS DISTINCT FROM 'ready' OR a.owner_member_id IS DISTINCT FROM NEW.member_id OR a.vis <> 'community' OR a.moderation <> 'clear' THEN
        RAISE EXCEPTION 'profile photo must be a cleared community image of the member' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER member_profiles_guard BEFORE INSERT OR UPDATE ON member_profiles FOR EACH ROW EXECUTE FUNCTION member_profiles_guard();
--> statement-breakpoint
ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profiles_select ON member_profiles FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY profiles_insert ON member_profiles FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY profiles_update ON member_profiles FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON member_profiles FROM cadencia_app;
--> statement-breakpoint

-- Profile photos are visible to the whole workspace ----------------------------------------
CREATE FUNCTION app_media_is_avatar(asset uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM member_profiles p WHERE p.avatar_asset_id = asset) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_media_is_avatar(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_media_is_avatar(uuid) TO cadencia_app;
--> statement-breakpoint
DROP POLICY media_select ON media_assets;
--> statement-breakpoint
CREATE POLICY media_select ON media_assets FOR SELECT TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) IS NOT NULL)
      OR (visibility::text IN ('private', 'community', 'message') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
      OR (visibility::text = 'private' AND app_member_role(workspace_id) = 'trainer' AND app_media_shared_with_trainer(id))
      OR (visibility::text = 'community' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text = 'community' AND app_member_role(workspace_id) IS NOT NULL AND (app_media_in_published_post(id) OR app_media_is_avatar(id)))
      OR (visibility::text = 'message' AND app_media_in_my_conversation(id))
    )
  );
--> statement-breakpoint

-- Posts: the author may now edit the text (and only the text) ------------------------------
CREATE OR REPLACE FUNCTION posts_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE author_role member_role; a record; s record; needs_approval boolean; body_changed boolean;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    SELECT role INTO author_role FROM workspace_members WHERE id = NEW.author_member_id;

    IF TG_OP = 'INSERT' THEN
      IF NEW.status NOT IN ('published', 'pending_review') OR NEW.like_count <> 0 OR NEW.comment_count <> 0 OR NEW.removed_at IS NOT NULL OR NEW.edited_at IS NOT NULL THEN
        RAISE EXCEPTION 'invalid initial post state' USING ERRCODE = '42501';
      END IF;
      IF (NEW.kind = 'announcement' OR NEW.pinned) AND author_role <> 'trainer' THEN
        RAISE EXCEPTION 'only trainers post announcements' USING ERRCODE = '42501';
      END IF;
      IF NEW.media_asset_id IS NOT NULL THEN
        SELECT status, owner_member_id, visibility::text AS vis, moderation INTO a FROM media_assets WHERE id = NEW.media_asset_id;
        IF a.status IS DISTINCT FROM 'ready' OR a.owner_member_id IS DISTINCT FROM NEW.author_member_id OR a.vis <> 'community' OR a.moderation = 'not_checked' THEN
          RAISE EXCEPTION 'post image must be a screened community image of the author' USING ERRCODE = '42501';
        END IF;
        IF a.moderation = 'review' AND NEW.status <> 'pending_review' THEN
          RAISE EXCEPTION 'flagged images need review before publishing' USING ERRCODE = '42501';
        END IF;
      END IF;
      IF NEW.session_id IS NOT NULL THEN
        SELECT member_id, status INTO s FROM workout_sessions WHERE id = NEW.session_id;
        IF s.member_id IS DISTINCT FROM NEW.author_member_id OR s.status <> 'completed' THEN
          RAISE EXCEPTION 'only your own completed workouts can be shared' USING ERRCODE = '42501';
        END IF;
      END IF;
      SELECT coalesce((SELECT student_posts_require_approval FROM workspace_settings WHERE workspace_id = NEW.workspace_id), false) INTO needs_approval;
      IF needs_approval AND author_role = 'student' AND NEW.status <> 'pending_review' THEN
        RAISE EXCEPTION 'posts in this community need approval' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    IF (NEW.like_count, NEW.comment_count) IS DISTINCT FROM (OLD.like_count, OLD.comment_count) AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'counters are maintained by the database' USING ERRCODE = '42501';
    END IF;
    IF (NEW.workspace_id, NEW.author_member_id, NEW.kind, NEW.media_asset_id, NEW.session_id, NEW.workout, NEW.created_at)
       IS DISTINCT FROM (OLD.workspace_id, OLD.author_member_id, OLD.kind, OLD.media_asset_id, OLD.session_id, OLD.workout, OLD.created_at) THEN
      RAISE EXCEPTION 'post content cannot be edited' USING ERRCODE = '42501';
    END IF;
    body_changed := NEW.body IS DISTINCT FROM OLD.body;
    IF body_changed THEN
      -- Only the author, only while the post is not removed. The edit time is set here, not by the client.
      IF app_member_user(OLD.author_member_id) IS DISTINCT FROM app_user_id() OR OLD.status = 'removed' THEN
        RAISE EXCEPTION 'only the author can edit the text' USING ERRCODE = '42501';
      END IF;
      SELECT coalesce((SELECT student_posts_require_approval FROM workspace_settings WHERE workspace_id = NEW.workspace_id), false) INTO needs_approval;
      IF needs_approval AND author_role = 'student' AND NEW.status = 'published' THEN
        RAISE EXCEPTION 'edited posts in this community need approval' USING ERRCODE = '42501';
      END IF;
      NEW.edited_at := now();
    ELSIF NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'the edit time is set by the database' USING ERRCODE = '42501';
    END IF;
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
    IF app_member_role(NEW.workspace_id) = 'trainer' THEN RETURN NEW; END IF;
    -- Authors may remove their own post, or send an edited one back to review.
    IF NEW.pinned IS DISTINCT FROM OLD.pinned
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'removed' AND NOT (body_changed AND NEW.status = 'pending_review')) THEN
      RAISE EXCEPTION 'only the trainer can moderate posts' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint

-- Who checked in on a given day, for the "treinaram hoje" row. Students cannot read each
-- other's check-ins, so this returns only member ids, honours the ranking opt-out and the
-- trainer's ranking switch, and never says what the activity was.
CREATE FUNCTION app_checked_in_on(target_day date) RETURNS TABLE (member_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT c.member_id
    FROM checkins c
    JOIN workspace_members s ON s.id = c.member_id AND s.status = 'active'
    LEFT JOIN ranking_preferences p ON p.member_id = c.member_id
    WHERE c.workspace_id = app_workspace_id() AND c.day = target_day
      AND app_member_role(c.workspace_id) IS NOT NULL
      AND coalesce((SELECT g.ranking_enabled FROM gamification_settings g WHERE g.workspace_id = c.workspace_id), true)
      AND (NOT coalesce(p.hidden, false) OR app_member_user(c.member_id) = app_user_id())
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_checked_in_on(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_checked_in_on(date) TO cadencia_app;
