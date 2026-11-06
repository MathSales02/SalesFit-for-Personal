import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  changePassword,
  lockRemainingMs,
  login,
  logout,
  registerTrainer,
  requestPasswordReset,
  resetPassword,
  revokeOwnSession,
  verifyEmail,
} from "@/server/auth/service";
import { resolveActor } from "@/server/auth/actor";
import { validateSessionToken } from "@/server/auth/session";
import { closeDb, db } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { auditLogs, sessions, users } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { createTrainer, lastTokenFor, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe("registration", () => {
  it("stores an Argon2id hash, never the plain password", async () => {
    const t = await createTrainer();
    const [u] = await db().select().from(users).where(eq(users.id, t.userId));
    expect(u!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(u!.passwordHash).not.toContain(PASSWORD);
  });

  it("responds the same for an existing email and does not create a second account", async () => {
    const t = await createTrainer();
    const before = testOutbox.length;
    await expect(
      registerTrainer({ displayName: "Outro", email: t.email.toUpperCase(), password: "another-long-password", workspaceName: "X Y", acceptTerms: "on" }, meta()),
    ).resolves.toBeUndefined();
    const rows = await db().select().from(users).where(eq(users.email, t.email));
    expect(rows).toHaveLength(1);
    // The owner is warned instead of a new verification link being sent.
    expect(testOutbox.slice(before).map((m) => m.subject)).toEqual(["Tentativa de cadastro com seu e-mail"]);
  });
});

describe("login", () => {
  it("refuses login until the email is verified", async () => {
    const email = uniqueEmail();
    await registerTrainer({ displayName: "Novo", email, password: PASSWORD, workspaceName: "Nova Consultoria", acceptTerms: "on" }, meta());
    await expectAppError(login({ email, password: PASSWORD }, meta()), "FORBIDDEN");
    expect(await verifyEmail(lastTokenFor(email, "verificar-email"), meta())).toBe(true);
    await expect(login({ email, password: PASSWORD }, meta())).resolves.toHaveProperty("token");
  });

  it("verification links are single use", async () => {
    const email = uniqueEmail();
    await registerTrainer({ displayName: "Novo", email, password: PASSWORD, workspaceName: "Nova Consultoria", acceptTerms: "on" }, meta());
    const token = lastTokenFor(email, "verificar-email");
    expect(await verifyEmail(token, meta())).toBe(true);
    expect(await verifyEmail(token, meta())).toBe(false);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const t = await createTrainer();
    const a = await expectAppError(login({ email: t.email, password: "wrong-password-123" }, meta()), "UNAUTHENTICATED");
    const b = await expectAppError(login({ email: uniqueEmail("ghost"), password: "wrong-password-123" }, meta()), "UNAUTHENTICATED");
    expect(a.publicMessage).toBe(b.publicMessage);
  });

  it("locks the account after repeated failures, even when the attacker rotates IPs", async () => {
    const t = await createTrainer();
    for (let i = 0; i < 5; i++) {
      await expectAppError(login({ email: t.email, password: `wrong-${i}-password` }, meta()), "UNAUTHENTICATED");
    }
    // Correct password, new IP: still locked, and the password is not even checked.
    const err = await expectAppError(login({ email: t.email, password: PASSWORD }, meta()), "RATE_LIMITED");
    expect(err.details?.retryAfterSec).toBeGreaterThan(0);
  });

  it("progressive delay doubles per failure and is capped", () => {
    const now = Date.now();
    const fails = (n: number) => Array.from({ length: n }, () => new Date(now));
    expect(lockRemainingMs(fails(4), now)).toBe(0);
    expect(lockRemainingMs(fails(5), now)).toBe(30_000);
    expect(lockRemainingMs(fails(6), now)).toBe(60_000);
    expect(lockRemainingMs(fails(20), now)).toBe(15 * 60_000);
  });

  it("limits attempts per IP across different accounts", async () => {
    const ip = meta("203.0.113.77");
    let limited = false;
    for (let i = 0; i < 35 && !limited; i++) {
      const err = await login({ email: uniqueEmail("spray"), password: "whatever-password" }, ip).catch((e: AppError) => e);
      limited = err instanceof AppError && err.code === "RATE_LIMITED";
    }
    expect(limited).toBe(true);
  });

  it("records login in the audit log without secrets", async () => {
    const t = await createTrainer();
    await loginAs(t.email);
    // Audit entries without a workspace are only readable by platform admins (RLS).
    const rows = await withTenant({ userId: t.userId, isPlatformAdmin: true }, (tx) =>
      tx.select().from(auditLogs).where(and(eq(auditLogs.actorUserId, t.userId), eq(auditLogs.action, "auth.login"))),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });
});

describe("sessions", () => {
  it("logout revokes the session server-side", async () => {
    const t = await createTrainer();
    const { token } = await loginAs(t.email);
    const s = await validateSessionToken(token);
    expect(s).not.toBeNull();
    await logout(s!.session.id, t.userId, meta());
    expect(await validateSessionToken(token)).toBeNull();
    expect(await resolveActor(token)).toBeNull();
  });

  it("expired sessions cannot access protected resources", async () => {
    const t = await createTrainer();
    const { token } = await loginAs(t.email);
    const s = await validateSessionToken(token);
    await db().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, s!.session.id));
    expect(await resolveActor(token)).toBeNull();
  });

  it("idle sessions expire", async () => {
    const t = await createTrainer();
    const { token } = await loginAs(t.email);
    const s = await validateSessionToken(token);
    await db().update(sessions).set({ idleExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, s!.session.id));
    expect(await resolveActor(token)).toBeNull();
  });

  it("suspending a user cuts off existing sessions immediately", async () => {
    const t = await createTrainer();
    const { token } = await loginAs(t.email);
    await db().update(users).set({ status: "suspended" }).where(eq(users.id, t.userId));
    expect(await resolveActor(token)).toBeNull();
  });

  it("rejects malformed and unknown tokens", async () => {
    expect(await resolveActor(undefined)).toBeNull();
    expect(await resolveActor("short")).toBeNull();
    expect(await resolveActor("A".repeat(43))).toBeNull();
  });

  it("a user cannot revoke another user's session (BOLA)", async () => {
    const a = await createTrainer();
    const b = await createTrainer();
    const { token } = await loginAs(b.email);
    const bs = await validateSessionToken(token);
    await expectAppError(revokeOwnSession({ userId: a.userId }, bs!.session.id, meta()), "NOT_FOUND");
    expect(await validateSessionToken(token)).not.toBeNull();
  });
});

describe("password reset and change", () => {
  it("does not reveal whether an email is registered", async () => {
    const before = testOutbox.length;
    await expect(requestPasswordReset(uniqueEmail("nobody"), meta())).resolves.toBeUndefined();
    expect(testOutbox.length).toBe(before);
  });

  it("reset is single use and signs out every session", async () => {
    const t = await createTrainer();
    const { token: sessionToken } = await loginAs(t.email);
    await requestPasswordReset(t.email, meta());
    const resetToken = lastTokenFor(t.email, "redefinir-senha");
    expect(await resetPassword(resetToken, "a-brand-new-password", meta())).toBe(true);
    expect(await resetPassword(resetToken, "yet-another-password", meta())).toBe(false);
    expect(await validateSessionToken(sessionToken)).toBeNull();
    await expect(login({ email: t.email, password: "a-brand-new-password" }, meta())).resolves.toHaveProperty("token");
  });

  it("a new reset link invalidates the previous one", async () => {
    const t = await createTrainer();
    await requestPasswordReset(t.email, meta());
    const first = lastTokenFor(t.email, "redefinir-senha");
    await requestPasswordReset(t.email, meta());
    expect(await resetPassword(first, "a-brand-new-password", meta())).toBe(false);
  });

  it("expired reset links are refused", async () => {
    const t = await createTrainer();
    await requestPasswordReset(t.email, meta());
    const token = lastTokenFor(t.email, "redefinir-senha");
    await db().execute(sql`update auth_tokens set expires_at = now() - interval '1 minute' where purpose = 'password_reset'`);
    expect(await resetPassword(token, "a-brand-new-password", meta())).toBe(false);
  });

  it("changing the password keeps the current session and revokes the others", async () => {
    const t = await createTrainer();
    const current = await loginAs(t.email);
    const other = await loginAs(t.email);
    const cs = await validateSessionToken(current.token);
    await changePassword({ userId: t.userId, sessionId: cs!.session.id }, { currentPassword: PASSWORD, password: "changed-password-ok" }, meta());
    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
  });

  it("changing the password requires the current one", async () => {
    const t = await createTrainer();
    const s = await validateSessionToken((await loginAs(t.email)).token);
    await expectAppError(
      changePassword({ userId: t.userId, sessionId: s!.session.id }, { currentPassword: "not-my-password", password: "changed-password-ok" }, meta()),
      "VALIDATION",
    );
  });
});
