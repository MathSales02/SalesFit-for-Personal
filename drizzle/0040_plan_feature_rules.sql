-- Plan features, readable inside security rules.

-- Whether the workspace's current plan includes a feature. Members cannot read the
-- subscription themselves; this answers only yes or no.
CREATE FUNCTION app_plan_feature(ws uuid, key text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT coalesce(
      (SELECT (p.features ->> key)::boolean FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.workspace_id = ws),
      false)
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_plan_feature(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_plan_feature(uuid, text) TO cadencia_app;
--> statement-breakpoint

-- Who may talk to whom: both active members of the same workspace, no block between them.
-- Trainer and student always may. Student to student needs the plan to include it and the
-- trainer to leave it on. Conversations that already exist stop accepting new messages when
-- the plan no longer includes it; nothing is deleted.
CREATE OR REPLACE FUNCTION app_dm_allowed(a uuid, b uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM workspace_members ma JOIN workspace_members mb ON mb.workspace_id = ma.workspace_id
      WHERE ma.id = a AND mb.id = b AND a <> b AND ma.status = 'active' AND mb.status = 'active'
        AND NOT app_block_between(a, b)
        AND (ma.role = 'trainer' OR mb.role = 'trainer'
             OR (app_plan_feature(ma.workspace_id, 'student_dm')
                 AND coalesce((SELECT s.student_direct_messages FROM workspace_settings s WHERE s.workspace_id = ma.workspace_id), true)))
    )
  $$;
