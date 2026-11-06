-- Phase 4B: direct messages and notifications.
-- 'message' was just added to media_visibility, so it is compared as text here.

-- Who may talk to whom: both active members of the same workspace, no block
-- between them, and student-to-student only while the trainer allows it.
CREATE FUNCTION app_dm_allowed(a uuid, b uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM workspace_members ma JOIN workspace_members mb ON mb.workspace_id = ma.workspace_id
      WHERE ma.id = a AND mb.id = b AND a <> b AND ma.status = 'active' AND mb.status = 'active'
        AND NOT app_block_between(a, b)
        AND (ma.role = 'trainer' OR mb.role = 'trainer'
             OR coalesce((SELECT s.student_direct_messages FROM workspace_settings s WHERE s.workspace_id = ma.workspace_id), true))
    )
  $$;
--> statement-breakpoint
CREATE FUNCTION app_conversation_member(conv uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conv AND (app_member_user(c.member_a_id) = app_user_id() OR app_member_user(c.member_b_id) = app_user_id())
    )
  $$;
--> statement-breakpoint
CREATE FUNCTION app_media_in_my_conversation(asset uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.media_asset_id = asset AND m.deleted_at IS NULL
        AND (app_member_user(c.member_a_id) = app_user_id() OR app_member_user(c.member_b_id) = app_user_id())
    )
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_dm_allowed(uuid, uuid), app_conversation_member(uuid), app_media_in_my_conversation(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_dm_allowed(uuid, uuid), app_conversation_member(uuid), app_media_in_my_conversation(uuid) TO cadencia_app;
--> statement-breakpoint

-- Media: message images ------------------------------------------------------------
ALTER TABLE media_assets DROP CONSTRAINT media_assets_visibility_ck;
--> statement-breakpoint
ALTER TABLE media_assets ADD CONSTRAINT media_assets_visibility_ck CHECK (
  (visibility::text = 'workspace' AND owner_member_id IS NULL)
  OR (visibility::text IN ('private', 'community', 'message') AND owner_member_id IS NOT NULL AND kind = 'image')
);
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
      OR (visibility::text IN ('private', 'community', 'message') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
      OR (visibility::text = 'private' AND app_member_role(workspace_id) = 'trainer' AND app_media_shared_with_trainer(id))
      OR (visibility::text = 'community' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text = 'community' AND app_member_role(workspace_id) IS NOT NULL AND app_media_in_published_post(id))
      OR (visibility::text = 'message' AND app_media_in_my_conversation(id))
    )
  );
--> statement-breakpoint
CREATE POLICY media_insert ON media_assets FOR INSERT TO cadencia_app
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id()) AND uploaded_by_user_id = (SELECT app_user_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community', 'message') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint
CREATE POLICY media_update ON media_assets FOR UPDATE TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community', 'message') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  )
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id())
    AND (
      (visibility::text = 'workspace' AND app_member_role(workspace_id) = 'trainer')
      OR (visibility::text IN ('private', 'community', 'message') AND app_member_user(owner_member_id) = (SELECT app_user_id()))
    )
  );
--> statement-breakpoint

-- Conversations -------------------------------------------------------------------------
ALTER TABLE conversations ADD CONSTRAINT conversations_a_fk FOREIGN KEY (member_a_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_b_fk FOREIGN KEY (member_b_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_order_ck CHECK (member_a_id < member_b_id);
--> statement-breakpoint
ALTER TABLE conversations ADD CONSTRAINT conversations_id_ws_uq UNIQUE (id, workspace_id);
--> statement-breakpoint
CREATE FUNCTION conversations_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE me uuid := app_user_id();
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' THEN
      IF NOT app_dm_allowed(NEW.member_a_id, NEW.member_b_id) THEN
        RAISE EXCEPTION 'conversation not allowed' USING ERRCODE = '42501';
      END IF;
      IF NEW.a_last_read_at IS NOT NULL OR NEW.b_last_read_at IS NOT NULL OR NEW.last_message_at IS NOT NULL THEN
        RAISE EXCEPTION 'invalid initial conversation state' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
    IF (NEW.workspace_id, NEW.member_a_id, NEW.member_b_id, NEW.created_at) IS DISTINCT FROM (OLD.workspace_id, OLD.member_a_id, OLD.member_b_id, OLD.created_at) THEN
      RAISE EXCEPTION 'conversation participants cannot change' USING ERRCODE = '42501';
    END IF;
    IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;  -- last_message_at from the message trigger
    IF NEW.last_message_at IS DISTINCT FROM OLD.last_message_at THEN
      RAISE EXCEPTION 'last_message_at is maintained by the database' USING ERRCODE = '42501';
    END IF;
    -- Each participant may only move their own read marker.
    IF NEW.a_last_read_at IS DISTINCT FROM OLD.a_last_read_at AND app_member_user(NEW.member_a_id) IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'cannot change the other participant''s read state' USING ERRCODE = '42501';
    END IF;
    IF NEW.b_last_read_at IS DISTINCT FROM OLD.b_last_read_at AND app_member_user(NEW.member_b_id) IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'cannot change the other participant''s read state' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER conversations_guard BEFORE INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION conversations_guard();
--> statement-breakpoint
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY conversations_participants ON conversations FOR ALL TO cadencia_app
  USING (
    workspace_id = (SELECT app_workspace_id())
    AND (app_member_user(member_a_id) = (SELECT app_user_id()) OR app_member_user(member_b_id) = (SELECT app_user_id()))
  )
  WITH CHECK (
    workspace_id = (SELECT app_workspace_id())
    AND (app_member_user(member_a_id) = (SELECT app_user_id()) OR app_member_user(member_b_id) = (SELECT app_user_id()))
  );
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON conversations FROM cadencia_app;
--> statement-breakpoint

-- Messages ---------------------------------------------------------------------------------
ALTER TABLE messages ADD CONSTRAINT messages_conversation_fk FOREIGN KEY (conversation_id, workspace_id) REFERENCES conversations (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE messages ADD CONSTRAINT messages_sender_fk FOREIGN KEY (sender_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE messages ADD CONSTRAINT messages_media_fk FOREIGN KEY (media_asset_id, workspace_id) REFERENCES media_assets (id, workspace_id) ON DELETE SET NULL (media_asset_id);
--> statement-breakpoint
ALTER TABLE messages ADD CONSTRAINT messages_ck CHECK (
  length(body) <= 2000 AND (deleted_at IS NOT NULL OR body IS NOT NULL OR media_asset_id IS NOT NULL)
);
--> statement-breakpoint
CREATE FUNCTION messages_guard() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  DECLARE c record; a record;
  BEGIN
    IF session_user <> 'cadencia_app' THEN RETURN NEW; END IF;
    SELECT member_a_id, member_b_id INTO c FROM conversations WHERE id = NEW.conversation_id;
    IF TG_OP = 'INSERT' THEN
      IF NEW.sender_member_id NOT IN (c.member_a_id, c.member_b_id) THEN
        RAISE EXCEPTION 'sender is not in this conversation' USING ERRCODE = '42501';
      END IF;
      -- Re-checked on every message: a block or the trainer's switch stops sending immediately.
      IF NOT app_dm_allowed(c.member_a_id, c.member_b_id) THEN
        RAISE EXCEPTION 'messaging not allowed' USING ERRCODE = '42501';
      END IF;
      IF NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'invalid initial message state' USING ERRCODE = '42501';
      END IF;
      IF NEW.media_asset_id IS NOT NULL THEN
        SELECT status, owner_member_id, visibility::text AS vis, moderation INTO a FROM media_assets WHERE id = NEW.media_asset_id;
        IF a.status IS DISTINCT FROM 'ready' OR a.owner_member_id IS DISTINCT FROM NEW.sender_member_id OR a.vis <> 'message' OR a.moderation <> 'clear' THEN
          RAISE EXCEPTION 'message image must be a screened image of the sender' USING ERRCODE = '42501';
        END IF;
      END IF;
      RETURN NEW;
    END IF;
    -- UPDATE: only the sender, only to delete (content is wiped).
    IF app_member_user(OLD.sender_member_id) IS DISTINCT FROM app_user_id() OR OLD.deleted_at IS NOT NULL
       OR NEW.deleted_at IS NULL OR NEW.body IS NOT NULL OR NEW.media_asset_id IS NOT NULL
       OR (NEW.conversation_id, NEW.sender_member_id, NEW.created_at, NEW.workspace_id) IS DISTINCT FROM (OLD.conversation_id, OLD.sender_member_id, OLD.created_at, OLD.workspace_id) THEN
      RAISE EXCEPTION 'messages can only be deleted by their sender' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER messages_guard BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION messages_guard();
--> statement-breakpoint
CREATE FUNCTION messages_touch_conversation() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
  AS $$
  BEGIN
    UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
    RETURN NULL;
  END $$;
--> statement-breakpoint
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION messages_touch_conversation();
--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY messages_participants_select ON messages FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_conversation_member(conversation_id));
--> statement-breakpoint
CREATE POLICY messages_send ON messages FOR INSERT TO cadencia_app
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(sender_member_id) = (SELECT app_user_id()) AND app_conversation_member(conversation_id));
--> statement-breakpoint
CREATE POLICY messages_sender_delete ON messages FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(sender_member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(sender_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
-- A reported message is shown to the trainer from the system context only (the reporter disclosed it).
CREATE POLICY messages_system_select ON messages FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON messages FROM cadencia_app;
--> statement-breakpoint

-- Notifications ------------------------------------------------------------------------------
ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
CREATE FUNCTION notifications_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public
  AS $$
  BEGIN
    IF session_user <> 'cadencia_app' OR app_is_system() THEN RETURN NEW; END IF;
    IF (NEW.workspace_id, NEW.recipient_member_id, NEW.type, NEW.actor_member_id, NEW.target_id, NEW.data, NEW.dedupe_key, NEW.created_at, NEW.delivered_channels)
       IS DISTINCT FROM (OLD.workspace_id, OLD.recipient_member_id, OLD.type, OLD.actor_member_id, OLD.target_id, OLD.data, OLD.dedupe_key, OLD.created_at, OLD.delivered_channels) THEN
      RAISE EXCEPTION 'recipients can only mark notifications as read' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END $$;
--> statement-breakpoint
CREATE TRIGGER notifications_guard BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION notifications_guard();
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_recipient ON notifications FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(recipient_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY notifications_mark_read ON notifications FOR UPDATE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(recipient_member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(recipient_member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY notifications_system ON notifications FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON notifications FROM cadencia_app;
--> statement-breakpoint

ALTER TABLE notification_preferences ADD CONSTRAINT notification_prefs_member_fk FOREIGN KEY (member_id, workspace_id) REFERENCES workspace_members (id, workspace_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_prefs_self ON notification_preferences FOR ALL TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()))
  WITH CHECK (workspace_id = (SELECT app_workspace_id()) AND app_member_user(member_id) = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY notification_prefs_system_read ON notification_preferences FOR SELECT TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON notification_preferences FROM cadencia_app;
