import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { db, type Executor } from "../db/client";
import { sessions, users } from "../db/schema";
import { generateToken, hashToken } from "../lib/crypto";
import type { RequestMeta } from "../http/request-meta";

export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
/** last_seen_at is refreshed at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName() {
  // __Host- forces Secure, Path=/ and no Domain, so subdomains cannot set or read it.
  return process.env.NODE_ENV === "production" ? "__Host-cadencia_session" : "cadencia_session";
}

export async function createSession(exec: Executor, userId: string, meta: RequestMeta, activeWorkspaceId: string | null) {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_ABSOLUTE_MS);
  const [row] = await exec
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      activeWorkspaceId,
      idleExpiresAt: new Date(now + SESSION_IDLE_MS),
      expiresAt,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent.slice(0, 255),
    })
    .returning({ id: sessions.id });
  return { token, sessionId: row!.id, expiresAt };
}

export type ValidSession = {
  session: { id: string; activeWorkspaceId: string | null; expiresAt: Date };
  user: { id: string; email: string; displayName: string; isPlatformAdmin: boolean; emailVerified: boolean; mfaEnabled: boolean; createdAt: Date };
};

/**
 * Resolves a raw cookie token to a live session. Returns null for unknown,
 * revoked, expired or idle sessions, and for users who are no longer active.
 */
export async function validateSessionToken(token: string | undefined): Promise<ValidSession | null> {
  if (!token || token.length !== 43) return null;
  const now = new Date();
  const [row] = await db()
    .select({
      id: sessions.id,
      activeWorkspaceId: sessions.activeWorkspaceId,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      isPlatformAdmin: users.isPlatformAdmin,
      emailVerifiedAt: users.emailVerifiedAt,
      mfaEnabled: users.mfaEnabled,
      userCreatedAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
        gt(sessions.idleExpiresAt, now),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db()
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(Math.min(now.getTime() + SESSION_IDLE_MS, row.expiresAt.getTime())) })
      .where(eq(sessions.id, row.id));
  }

  return {
    session: { id: row.id, activeWorkspaceId: row.activeWorkspaceId, expiresAt: row.expiresAt },
    user: {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      isPlatformAdmin: row.isPlatformAdmin,
      emailVerified: row.emailVerifiedAt !== null,
      mfaEnabled: row.mfaEnabled,
      createdAt: row.userCreatedAt,
    },
  };
}

export async function revokeSession(exec: Executor, sessionId: string, reason: string) {
  await exec
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revokes every session of a user, optionally keeping the current one. */
export async function revokeUserSessions(exec: Executor, userId: string, reason: string, exceptSessionId?: string) {
  await exec
    .update(sessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
      ),
    );
}

/** Points a session at another workspace (after accepting an invitation). Membership is re-checked on every request. */
export async function setActiveWorkspace(exec: Executor, sessionId: string, workspaceId: string) {
  await exec.update(sessions).set({ activeWorkspaceId: workspaceId }).where(eq(sessions.id, sessionId));
}
