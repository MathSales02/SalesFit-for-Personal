-- Blocking someone removes their follow of the blocker too; that row belongs to the
-- other member, so it is deleted from the trusted system context.
CREATE POLICY follows_system_delete ON follows FOR DELETE TO cadencia_app
  USING (workspace_id = (SELECT app_workspace_id()) AND (SELECT app_is_system()));
