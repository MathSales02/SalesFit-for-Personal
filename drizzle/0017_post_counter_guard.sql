-- Fix: like_count and comment_count could be changed by a direct UPDATE from the
-- post's author (fake likes would later feed rankings). Counters may now change
-- only when the update comes from the counting triggers (trigger depth > 1).

CREATE OR REPLACE FUNCTION posts_guard() RETURNS trigger
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

    IF (NEW.like_count, NEW.comment_count) IS DISTINCT FROM (OLD.like_count, OLD.comment_count) AND pg_trigger_depth() <= 1 THEN
      RAISE EXCEPTION 'counters are maintained by the database' USING ERRCODE = '42501';
    END IF;
    IF (NEW.workspace_id, NEW.author_member_id, NEW.kind, NEW.body, NEW.media_asset_id, NEW.session_id, NEW.workout, NEW.created_at)
       IS DISTINCT FROM (OLD.workspace_id, OLD.author_member_id, OLD.kind, OLD.body, OLD.media_asset_id, OLD.session_id, OLD.workout, OLD.created_at) THEN
      RAISE EXCEPTION 'post content cannot be edited' USING ERRCODE = '42501';
    END IF;
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
    IF app_member_role(NEW.workspace_id) = 'trainer' THEN RETURN NEW; END IF;
    IF NEW.pinned IS DISTINCT FROM OLD.pinned OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'removed') THEN
      RAISE EXCEPTION 'only the trainer can moderate posts' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
