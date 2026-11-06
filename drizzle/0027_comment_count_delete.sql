-- Comments are normally hidden, not deleted, but account deletion removes them
-- (cascade). Keep posts.comment_count right in that case too.
CREATE OR REPLACE FUNCTION post_comment_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status <> 'published' THEN
      UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = NEW.post_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'published' AND NEW.status = 'published' THEN
      UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
      UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
  END $$;
--> statement-breakpoint
DROP TRIGGER comments_count ON comments;
--> statement-breakpoint
CREATE TRIGGER comments_count AFTER INSERT OR DELETE OR UPDATE OF status ON comments FOR EACH ROW EXECUTE FUNCTION post_comment_count();
