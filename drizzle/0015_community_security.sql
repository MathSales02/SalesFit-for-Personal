-- Phase 4A: community feed, comments, likes, follows, blocks, reports.
-- Note: 'community' was added to media_visibility in the previous migration, and
-- migrations run in one transaction, so it is compared as text here.

-- Media: community images (post photos) -------------------------------------------
ALTER TABLE media_assets DROP CONSTRAINT media_assets_visibility_ck;
--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_visibility_ck CHECK (
  (visibility::text = 'workspace' AND owner_member_id IS NULL)
  OR (visibility::text IN ('private', 'community') AND owner_member_id IS NOT NULL AND kind = 'image')
);
--> statement-breakpoint
CREATE FUNCTION app_media_in_published_post(asset uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM posts p WHERE p.media_asset_id = asset AND p.status = 'published') $$;
--> statement-breakpoint
-- True when either member blocked the other. Used by feed queries without exposing who blocked whom.
CREATE FUNCTION app_block_between(a uuid, b uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM member_blocks x WHERE (x.blocker_member_id = a AND x.blocked_member_id = b) OR (x.blocker_member_id = b AND x.blocked_member_id = a)) $$;
--> statement-breakpoint
CREATE FUNCTION app_post_visible(p uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM posts x
      WHERE x.id = p AND x.status = 'published' AND x.workspace_id = app_workspace_id() AND app_member_role(x.workspace_id) IS NOT NULL
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_media_in_published_post(uuid), app_block_between(uuid, uuid), app_post_visible(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_media_in_published_post(uuid), app_block_between(uuid, uuid), app_post_visible(uuid) TO cadencia_app;
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
      (visibility::text = 'workspace' AND app_member_role(workspace_id) IS NOT NULL)
      OR (visibility::text IN ('private', 'community') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
      OR (visibility::text = 'private' AND app_member_role(workspace_id) = 'trainer' AND app_media_shared_with_trainer(id))
      OR (visibility::text = 'community' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text = 'community' AND app_member_role(workspace_id) IS NOT NULL AND app_media_in_published_post(id))
    )
  );
--> statement-breakpoint
CREATE POLICY media_insert ON media_assets FOR INSERT TO cadencia_app
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id()) AND uploaded_by_user_id = (SELECT app_user_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY media_update ON media_assets FOR UPDATE TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  )
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint
-- The automated screening result can only be written in the system context.
CREATE FUNCTION media_moderation_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF session_user = 'cadencia_app' AND NOT app_is_system()
       AND (NEW.moderation IS DISTINCT FROM coalesce(OLD.moderation, 'not_checked') OR NEW.moderation_scores IS DISTINCT FROM OLD.moderation_scores) THEN
      RAISE EXCEPTION 'moderation is set by the server' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER media_assets_moderation_guard BEFORE INSERT OR UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION media_moderation_guard();
--> statement-breakpoint

-- Settings ---------------------------------------------------------------------
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY settings_read ON workspace_settings FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY settings_trainer ON workspace_settings FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON workspace_settings FROM cadencia_app;
--> statement-breakpoint

-- Posts ------------------------------------------------------------------------------
ALTER TABLE posts ADD CONSTRAINT posts_author_fk FOREIGN KEY (author_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE posts ADD CONSTRAINT posts_media_fk FOREIGN KEY (media_asset_id, workspace_id) REFERENCES media_assets (id, workspace_id) ON DELETE SET NULL (media_asset_id);
--> statement-breakpoint
ALTER TABLE posts ADD CONSTRAINT posts_session_fk FOREIGN KEY (session_id) REFERENCES workout_sessions (id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE posts ADD CONSTRAINT posts_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
ALTER TABLE posts ADD CONSTRAINT posts_ck CHECK (
  length(body) <= 2000 AND (body IS NOT NULL OR media_asset_id IS NOT NULL OR workout IS NOT NULL)
  AND like_count >= 0 AND comment_count >= 0
);
--> statement-breakpoint
CREATE FUNCTION posts_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE author_role member_role; a record; s record; needs_approval boolean;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    SELECT role INTO author_role FROM workspace_members WHERE id = NEW.author_member_id;

    IF TG_OP = 'INSERT' THEN
      IF NEW.status NOT IN ('published', 'pending_review') OR NEW.like_count <> 0 OR NEW.comment_count <> 0 OR NEW.removed_at IS NOT NULL THEN
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

    -- UPDATE: counters are maintained by triggers and may always change.
    IF (NEW.workspace_id, NEW.author_member_id, NEW.kind, NEW.body, NEW.media_asset_id, NEW.session_id, NEW.workout, NEW.created_at)
       IS DISTINCT FROM (OLD.workspace_id, OLD.author_member_id, OLD.kind, OLD.body, OLD.media_asset_id, OLD.session_id, OLD.workout, OLD.created_at) THEN
      RAISE EXCEPTION 'post content cannot be edited' USING ERRCODE = '42501';
    END IF;
    IF app_member_role(NEW.workspace_id) = 'trainer' THEN RETURN NEW; END IF;
    -- Authors may only remove their own post.
    IF NEW.pinned IS DISTINCT FROM OLD.pinned OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'removed') THEN
      RAISE EXCEPTION 'only the trainer can moderate posts' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER posts_guard BEFORE INSERT OR UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION posts_guard();
--> statement-breakpoint
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY posts_select ON posts FOR SELECT TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL
    AND (status = 'published' OR app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer')
  );
--> statement-breakpoint
CREATE POLICY posts_insert ON posts FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(author_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY posts_update ON posts FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer'))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer'));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON posts FROM cadencia_app;
--> statement-breakpoint

-- Likes -----------------------------------------------------------------------------
ALTER TABLE post_likes ADD CONSTRAINT post_likes_post_fk FOREIGN KEY (post_id, workspace_id) REFERENCES posts (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE post_likes ADD CONSTRAINT post_likes_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY likes_select ON post_likes FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY likes_insert ON post_likes FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()) AND app_post_visible(post_id));
--> statement-breakpoint
CREATE POLICY likes_delete ON post_likes FOR DELETE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON post_likes FROM cadencia_app;
--> statement-breakpoint

-- Comments -------------------------------------------------------------------------
ALTER TABLE comments ADD CONSTRAINT comments_post_fk FOREIGN KEY (post_id, workspace_id) REFERENCES posts (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE comments ADD CONSTRAINT comments_author_fk FOREIGN KEY (author_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE comments ADD CONSTRAINT comments_parent_fk FOREIGN KEY (parent_comment_id) REFERENCES comments (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE comments ADD CONSTRAINT comments_ck CHECK (length(body) BETWEEN 1 AND 1000);
--> statement-breakpoint
CREATE FUNCTION comments_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE parent record;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'published' OR NEW.removed_at IS NOT NULL THEN
        RAISE EXCEPTION 'invalid initial comment state' USING ERRCODE = '42501';
      END IF;
      IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT post_id, parent_comment_id INTO parent FROM comments WHERE id = NEW.parent_comment_id;
        IF parent.post_id IS DISTINCT FROM NEW.post_id OR parent.parent_comment_id IS NOT NULL THEN
          RAISE EXCEPTION 'replies must target a top-level comment of the same post' USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
    IF (NEW.post_id, NEW.author_member_id, NEW.parent_comment_id, NEW.body, NEW.created_at, NEW.workspace_id)
       IS DISTINCT FROM (OLD.post_id, OLD.author_member_id, OLD.parent_comment_id, OLD.body, OLD.created_at, OLD.workspace_id) THEN
      RAISE EXCEPTION 'comments cannot be edited' USING ERRCODE = '42501';
    END IF;
    IF app_member_role(NEW.workspace_id) <> 'trainer' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'removed' THEN
      RAISE EXCEPTION 'only the trainer can moderate comments' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER comments_guard BEFORE INSERT OR UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION comments_guard();
--> statement-breakpoint
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY comments_select ON comments FOR SELECT TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL
    AND (status = 'published' OR app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer')
  );
--> statement-breakpoint
CREATE POLICY comments_insert ON comments FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(author_member_id) = (SELECT app_user_id()) AND app_post_visible(post_id));
--> statement-breakpoint
CREATE POLICY comments_update ON comments FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer'))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(author_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer'));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON comments FROM cadencia_app;
--> statement-breakpoint

-- Counters, maintained by the database --------------------------------------------
CREATE FUNCTION post_like_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSE UPDATE posts SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.post_id; END IF;
    RETURN NULL;
  END $$;
--> statement-breakpoint
CREATE TRIGGER post_likes_count AFTER INSERT OR DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION post_like_count();
--> statement-breakpoint
CREATE FUNCTION post_comment_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status <> 'published' THEN
      UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'published' AND NEW.status = 'published' THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
    RETURN NULL;
  END $$;
--> statement-breakpoint
CREATE TRIGGER comments_count AFTER INSERT OR UPDATE OF status ON comments FOR EACH ROW EXECUTE FUNCTION post_comment_count();
--> statement-breakpoint

-- Follows ---------------------------------------------------------------------------
ALTER TABLE follows ADD CONSTRAINT follows_follower_fk FOREIGN KEY (follower_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE follows ADD CONSTRAINT follows_followed_fk FOREIGN KEY (followed_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE follows ADD CONSTRAINT follows_not_self_ck CHECK (follower_member_id <> followed_member_id);
--> statement-breakpoint
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY follows_select ON follows FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY follows_write ON follows FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(follower_member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(follower_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON follows FROM cadencia_app;
--> statement-breakpoint

-- Blocks: only the blocker sees their own blocks -----------------------------------------
ALTER TABLE member_blocks ADD CONSTRAINT blocks_blocker_fk FOREIGN KEY (blocker_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE member_blocks ADD CONSTRAINT blocks_blocked_fk FOREIGN KEY (blocked_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE member_blocks ADD CONSTRAINT blocks_not_self_ck CHECK (blocker_member_id <> blocked_member_id);
--> statement-breakpoint
ALTER TABLE member_blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY blocks_own ON member_blocks FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(blocker_member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(blocker_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
REVOKE UPDATE, TRUNCATE ON member_blocks FROM cadencia_app;
--> statement-breakpoint

-- Reports: the reporter files; the trainer reviews ------------------------------------------
ALTER TABLE reports ADD CONSTRAINT reports_reporter_fk FOREIGN KEY (reporter_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE reports ADD CONSTRAINT reports_ck CHECK (length(details) <= 500);
--> statement-breakpoint
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reports_insert ON reports FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(reporter_member_id) = (SELECT app_user_id()) AND status = 'open');
--> statement-breakpoint
CREATE POLICY reports_select ON reports FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (app_member_user(reporter_member_id) = (SELECT app_user_id()) OR app_member_role(workspace_id) = 'trainer'));
--> statement-breakpoint
CREATE POLICY reports_resolve ON reports FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer')
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_role(workspace_id) = 'trainer');
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON reports FROM cadencia_app;
