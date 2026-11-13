import { TRIAL_DAYS } from "@/lib/plan-features";
import "server-only";
import { verifySecondFactor } from "./mfa";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { registerTrainerSchema } from "@/lib/validation/auth";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { db, type Executor } from "../db/client";
import { setTenantContext } from "../db/context";
import {
  authTokens,
  consents,
  loginAttempts,
  plans,
  sessions,
  subscriptions,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { AppError, Errors } from "../lib/errors";
import { generateToken, hashToken, hmacPii } from "../lib/crypto";
import { errorFields, log } from "../lib/logger";
import { sendMail } from "../mail/mailer";
import { existingAccountEmail, passwordChangedEmail, passwordResetEmail, verificationEmail } from "../mail/templates";
import type { RequestMeta } from "../http/request-meta";
import { audit, recordSecurityEvent } from "../security/audit";
import { enforceRateLimit, resetRateLimit } from "../security/rate-limit";
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from "./password";
import { createSession, revokeSession, revokeUserSessions } from "./session";

export { TRIAL_DAYS } from "@/lib/plan-features";
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Progressive delay: after FREE_FAILURES failed logins, each new failure doubles the wait, up to MAX_LOCK_MS. */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FREE_FAILURES = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;

const emailHash = (email: string) => hmacPii("email", email.toLowerCase());

function slugify(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "consultoria"}-${generateToken(4).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

async function findUserByEmail(exec: Executor, email: string) {
  const [u] = await exec
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, isNull(users.deletedAt)))
    .limit(1);
  return u;
}

type TokenPurpose = "email_verification" | "password_reset" | "mfa_challenge";

async function issueToken(exec: Executor, userId: string, purpose: TokenPurpose, ttlMs: number) {
  // A new token invalidates earlier unused ones of the same purpose.
  await exec
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const token = generateToken();
  await exec.insert(authTokens).values({ userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Atomically marks a token used. Returns its user id, or null when it is unknown, used or expired. */
async function consumeToken(exec: Executor, token: string, purpose: TokenPurpose) {
  const [row] = await exec
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authTokens.userId });
  return row?.userId ?? null;
}

/** Mail failures are logged but never change the response, so they cannot reveal whether an account exists. */
async function sendQuietly(mail: Parameters<typeof sendMail>[0]) {
  try {
    await sendMail(mail);
  } catch (err) {
    log.error("auth mail not sent", errorFields(err));
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type RegisterTrainerInput = z.infer<typeof registerTrainerSchema>;

/**
 * Creates a trainer account, its workspace, membership, trial subscription and
 * consent records in one transaction. The response is identical whether or not
 * the email is already registered (prevents account enumeration).
 */
export async function registerTrainer(input: RegisterTrainerInput, meta: RequestMeta): Promise<void> {
  await enforceRateLimit("register_ip", meta.ipHash);

  const passwordHash = await hashPassword(input.password);
  const existing = await findUserByEmail(db(), input.email);
  if (existing) {
    await sendQuietly(await existingAccountEmail(existing.email));
    return;
  }

  let verificationToken: string;
  try {
    verificationToken = await db().transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, displayName: input.displayName })
        .returning({ id: users.id });
      const userId = user!.id;
      const workspaceId = crypto.randomUUID();

      await setTenantContext(tx, { userId, workspaceId });
      await tx.insert(workspaces).values({ id: workspaceId, name: input.workspaceName, slug: slugify(input.workspaceName), ownerUserId: userId });
      await tx.insert(workspaceMembers).values({ workspaceId, userId, role: "trainer", status: "active", joinedAt: new Date() });

      // Billing rows are only writable from the trusted system context.
      await setTenantContext(tx, { userId, workspaceId, isSystem: true });
      const [trial] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "trial")).limit(1);
      if (!trial) throw new Error("trial plan missing: run migrations");
      await tx.insert(subscriptions).values({
        workspaceId,
        planId: trial.id,
        status: "trialing",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      });
      await setTenantContext(tx, { userId, workspaceId });

      await tx.insert(consents).values([
        { userId, purpose: "terms_of_service", documentVersion: LEGAL_DOCUMENT_VERSION, granted: true, ipHash: meta.ipHash },
        { userId, purpose: "privacy_policy", documentVersion: LEGAL_DOCUMENT_VERSION, granted: true, ipHash: meta.ipHash },
      ]);
      await audit(tx, { action: "auth.register_trainer", actorUserId: userId, workspaceId, targetType: "user", targetId: userId, ipHash: meta.ipHash });
      return issueToken(tx, userId, "email_verification", EMAIL_VERIFICATION_TTL_MS);
    });
  } catch (err) {
    // A concurrent registration with the same email hits the unique index: respond the same way.
    if ((err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505") return;
    throw err;
  }

  await sendQuietly(await verificationEmail(input.email, input.displayName, verificationToken));
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

const INVALID_CREDENTIALS = () => new AppError("UNAUTHENTICATED", "E-mail ou senha incorretos.");

async function recentFailures(emailH: string) {
  const since = new Date(Date.now() - FAILURE_WINDOW_MS);
  const rows = await db()
    .select({ success: loginAttempts.success, createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.emailHash, emailH), gt(loginAttempts.createdAt, since)))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(50);
  const failures: Date[] = [];
  for (const r of rows) {
    if (r.success) break; // only failures since the last success count
    failures.push(r.createdAt);
  }
  return failures;
}

/** Remaining lock time in ms given the failures since the last success (most recent first). */
export function lockRemainingMs(failures: Date[], now = Date.now()): number {
  if (failures.length < FREE_FAILURES) return 0;
  const lockMs = Math.min(BASE_LOCK_MS * 2 ** (failures.length - FREE_FAILURES), MAX_LOCK_MS);
  return Math.max(0, failures[0]!.getTime() + lockMs - now);
}

export type SessionResult = { token: string; expiresAt: Date; userId: string };
/** Either a session, or (for accounts with MFA) a short-lived challenge to complete with a code. */
export type LoginResult = SessionResult | { mfaRequired: true; challenge: string };
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function login(input: { email: string; password: string }, meta: RequestMeta): Promise<LoginResult> {
  const emailH = emailHash(input.email);
  await enforceRateLimit("login_ip", meta.ipHash);
  await enforceRateLimit("login_account", emailH);

  const failures = await recentFailures(emailH);
  const lockMs = lockRemainingMs(failures);
  if (lockMs > 0) {
    await db().insert(loginAttempts).values({ emailHash: emailH, ipHash: meta.ipHash, success: false, reason: "locked" });
    throw Errors.rateLimited(Math.ceil(lockMs / 1000));
  }

  const user = await findUserByEmail(db(), input.email);
  const passwordOk = user ? await verifyPassword(user.passwordHash, input.password) : (await burnPasswordCheck(input.password), false);

  if (!user || !passwordOk) {
    await db().insert(loginAttempts).values({ emailHash: emailH, userId: user?.id, ipHash: meta.ipHash, success: false, reason: "bad_credentials" });
    if (failures.length + 1 === FREE_FAILURES) {
      await recordSecurityEvent({ type: "auth.login_lockout", severity: "warning", userId: user?.id, ipHash: meta.ipHash });
    }
    throw INVALID_CREDENTIALS();
  }

  // From here the caller proved they know the password, so specific messages do not leak anything.
  if (user.status !== "active") {
    await db().insert(loginAttempts).values({ emailHash: emailH, userId: user.id, ipHash: meta.ipHash, success: false, reason: `status_${user.status}` });
    throw new AppError("FORBIDDEN", "Esta conta está suspensa. Fale com o suporte.");
  }
  if (!user.emailVerifiedAt) {
    throw new AppError("FORBIDDEN", "Confirme seu e-mail antes de entrar. Enviamos um link quando você se cadastrou.", {});
  }

  if (needsRehash(user.passwordHash)) {
    await db().update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, user.id));
  }

  if (user.mfaEnabled) {
    // The password is right, but no session until the second factor is checked.
    const challenge = await issueToken(db(), user.id, "mfa_challenge", MFA_CHALLENGE_TTL_MS);
    return { mfaRequired: true, challenge };
  }
  const result = await openSession(user.id, emailH, meta, null);
  await resetRateLimit("login_account", emailH);
  return result;
}

async function openSession(userId: string, emailH: string, meta: RequestMeta, mfa: "totp" | "recovery" | null): Promise<SessionResult> {
  const activeWorkspaceId = await defaultWorkspaceFor(userId);
  const result = await db().transaction(async (tx) => {
    await tx.insert(loginAttempts).values({ emailHash: emailH, userId, ipHash: meta.ipHash, success: true });
    const s = await createSession(tx, userId, meta, activeWorkspaceId);
    await audit(tx, { action: "auth.login", actorUserId: userId, targetType: "session", targetId: s.sessionId, metadata: mfa ? { mfa } : {}, ipHash: meta.ipHash });
    return s;
  });
  return { token: result.token, expiresAt: result.expiresAt, userId };
}

/** Second step of a login with MFA: the challenge from login() plus an app or recovery code. */
export async function completeMfaLogin(input: { challenge: string; code: string }, meta: RequestMeta): Promise<SessionResult> {
  await enforceRateLimit("login_ip", meta.ipHash);
  const expired = () => new AppError("UNAUTHENTICATED", "O tempo para digitar o código acabou. Entre de novo com e-mail e senha.");
  const [pending] = await db()
    .select({ userId: authTokens.userId })
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(input.challenge)), eq(authTokens.purpose, "mfa_challenge"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!pending) throw expired();
  const [user] = await db().select().from(users).where(and(eq(users.id, pending.userId), isNull(users.deletedAt)));
  if (!user || user.status !== "active" || !user.mfaEnabled) throw expired();
  const emailH = emailHash(user.email);

  const method = await verifySecondFactor(db(), user.id, input.code);
  if (!method) {
    await db().insert(loginAttempts).values({ emailHash: emailH, userId: user.id, ipHash: meta.ipHash, success: false, reason: "bad_mfa_code" });
    throw Errors.validation({ code: ["Código inválido."] });
  }
  if (!(await consumeToken(db(), input.challenge, "mfa_challenge"))) throw expired();
  const result = await openSession(user.id, emailH, meta, method);
  await resetRateLimit("login_account", emailH);
  if (method === "recovery") {
    await recordSecurityEvent({ type: "auth.mfa_recovery_code_used", severity: "warning", userId: user.id, ipHash: meta.ipHash });
  }
  return result;
}

/** Picks the workspace a new session starts in: a trainer workspace first, then any active membership. */
export async function defaultWorkspaceFor(userId: string): Promise<string | null> {
  return db().transaction(async (tx) => {
    await setTenantContext(tx, { userId });
    const rows = await tx
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active"), eq(workspaces.status, "active")))
      .orderBy(workspaceMembers.role, workspaceMembers.createdAt)
      .limit(1);
    return rows[0]?.workspaceId ?? null;
  });
}

export async function logout(sessionId: string, userId: string, meta: RequestMeta) {
  await db().transaction(async (tx) => {
    await revokeSession(tx, sessionId, "logout");
    await audit(tx, { action: "auth.logout", actorUserId: userId, targetType: "session", targetId: sessionId, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(token: string, meta: RequestMeta): Promise<boolean> {
  await enforceRateLimit("token_redeem_ip", meta.ipHash);
  return db().transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "email_verification");
    if (!userId) return false;
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
    await audit(tx, { action: "auth.email_verified", actorUserId: userId, targetType: "user", targetId: userId, ipHash: meta.ipHash });
    return true;
  });
}

/** Always resolves the same way, whether or not the email exists or is already verified. */
export async function resendVerification(email: string, meta: RequestMeta): Promise<void> {
  await enforceRateLimit("password_reset_ip", meta.ipHash);
  await enforceRateLimit("email_verification_user", emailHash(email));
  const user = await findUserByEmail(db(), email);
  if (!user || user.emailVerifiedAt || user.status !== "active") return;
  const token = await issueToken(db(), user.id, "email_verification", EMAIL_VERIFICATION_TTL_MS);
  await sendQuietly(await verificationEmail(user.email, user.displayName, token));
}

// ---------------------------------------------------------------------------
// Password reset and change
// ---------------------------------------------------------------------------

/** Always resolves the same way, whether or not the email exists. */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  await enforceRateLimit("password_reset_ip", meta.ipHash);
  await enforceRateLimit("password_reset_account", emailHash(email));
  const user = await findUserByEmail(db(), email);
  if (!user || user.status !== "active") return;
  const token = await issueToken(db(), user.id, "password_reset", PASSWORD_RESET_TTL_MS);
  await audit(db(), { action: "auth.password_reset_requested", actorUserId: user.id, targetType: "user", targetId: user.id, ipHash: meta.ipHash });
  await sendQuietly(await passwordResetEmail(user.email, token));
}

/** Sets a new password from a reset link and signs the user out everywhere. */
export async function resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<boolean> {
  await enforceRateLimit("token_redeem_ip", meta.ipHash);
  const passwordHash = await hashPassword(newPassword);
  const email = await db().transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "password_reset");
    if (!userId) return null;
    const now = new Date();
    const [u] = await tx
      .update(users)
      // Following the emailed link also proves ownership of the address.
      .set({ passwordHash, passwordChangedAt: now, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})` })
      .where(eq(users.id, userId))
      .returning({ email: users.email });
    await revokeUserSessions(tx, userId, "password_reset");
    await audit(tx, { action: "auth.password_reset", actorUserId: userId, targetType: "user", targetId: userId, ipHash: meta.ipHash });
    return u!.email;
  });
  if (!email) return false;
  await recordSecurityEvent({ type: "auth.password_reset", severity: "info", ipHash: meta.ipHash });
  await sendQuietly(await passwordChangedEmail(email));
  return true;
}

export async function changePassword(
  actor: { userId: string; sessionId: string },
  input: { currentPassword: string; password: string },
  meta: RequestMeta,
): Promise<void> {
  await enforceRateLimit("account_change_user", actor.userId);
  const [user] = await db().select().from(users).where(eq(users.id, actor.userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await recordSecurityEvent({ type: "auth.change_password_failed", severity: "warning", userId: actor.userId, ipHash: meta.ipHash });
    throw Errors.validation({ currentPassword: ["Senha atual incorreta."] });
  }
  const passwordHash = await hashPassword(input.password);
  await db().transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(users.id, actor.userId));
    await revokeUserSessions(tx, actor.userId, "password_changed", actor.sessionId);
    await audit(tx, { action: "auth.password_changed", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash });
  });
  await sendQuietly(await passwordChangedEmail(user.email));
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function listActiveSessions(userId: string) {
  const now = new Date();
  return db()
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.idleExpiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(50);
}

/** Revokes one of the actor's own sessions. A session id of another user is treated as not found (BOLA). */
export async function revokeOwnSession(actor: { userId: string }, sessionId: string, meta: RequestMeta) {
  await db().transaction(async (tx) => {
    const res = await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: "user_revoked" })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, actor.userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: "auth.session_revoked", actorUserId: actor.userId, targetType: "session", targetId: sessionId, ipHash: meta.ipHash });
  });
}

export async function revokeAllOtherSessions(actor: { userId: string; sessionId: string }, meta: RequestMeta) {
  await db().transaction(async (tx) => {
    await revokeUserSessions(tx, actor.userId, "user_revoked_all", actor.sessionId);
    await audit(tx, { action: "auth.sessions_revoked_all", actorUserId: actor.userId, ipHash: meta.ipHash });
  });
}
