import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "../db/context";
import { workspaceMembers, workspaces } from "../db/schema";
import type { Actor, Membership } from "../authz/policy";
import { validateSessionToken } from "./session";

/**
 * Builds the Actor for a raw session token. The membership is re-read from the
 * database on every request, so suspending a member or a workspace takes effect
 * immediately, without waiting for the session to expire.
 */
export async function resolveActor(token: string | undefined): Promise<Actor | null> {
  const valid = await validateSessionToken(token);
  if (!valid) return null;
  const { session, user } = valid;

  let membership: Membership | null = null;
  if (session.activeWorkspaceId) {
    membership = await withTenant({ userId: user.id, workspaceId: session.activeWorkspaceId }, async (tx) => {
      const [m] = await tx
        .select({
          workspaceId: workspaceMembers.workspaceId,
          workspaceName: workspaces.name,
          memberId: workspaceMembers.id,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, session.activeWorkspaceId!),
            eq(workspaceMembers.userId, user.id),
            eq(workspaceMembers.status, "active"),
            eq(workspaces.status, "active"),
          ),
        )
        .limit(1);
      return m ?? null;
    });
  }

  return {
    userId: user.id,
    sessionId: session.id,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    isPlatformAdmin: user.isPlatformAdmin,
    membership,
  };
}
