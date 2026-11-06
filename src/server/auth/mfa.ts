import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import QRCode from "qrcode";
import type { Actor } from "../authz/policy";
import { db, type Executor } from "../db/client";
import { mfaRecoveryCodes, users } from "../db/schema";
import type { RequestMeta } from "../http/request-meta";
import { decryptSecret, encryptSecret, hashToken } from "../lib/crypto";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { sendMail } from "../mail/mailer";
import { mfaChangedEmail } from "../mail/templates";
import { audit, recordSecurityEvent } from "../security/audit";
import { enforceRateLimit, resetRateLimit } from "../security/rate-limit";
import { verifyPassword } from "./password";
import { revokeUserSessions } from "./session";
import { matchTotp, newTotpSecret, otpauthUri } from "./totp";

/**
 * Two-step verification with an authenticator app (TOTP) plus one-time
 * recovery codes. Secrets are encrypted at rest; each TOTP code is accepted
 * once; verification is rate limited per user (fail closed).
 */

export const RECOVERY_CODES = 10;
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i

function newRecoveryCode() {
  const pick = () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${Array.from({ length: 5 }, pick).join("")}-${Array.from({ length: 5 }, pick).join("")}`;
}
const normalizeRecovery = (code: string) => code.trim().toLowerCase().replace(/\s/g, "");

async function replaceRecoveryCodes(exec: Executor, userId: string): Promise<string[]> {
  await exec.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
  const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
  await exec.insert(mfaRecoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashToken(c) })));
  return codes;
}

/**
 * Verifies a TOTP or recovery code for the user. TOTP steps are consumed
 * atomically (no replay); recovery codes are single use.
 */
export async function verifySecondFactor(exec: Executor, userId: string, code: string): Promise<"totp" | "recovery" | null> {
  await enforceRateLimit("otp_verify_user", userId);
  const [u] = await exec.select({ secret: users.mfaSecret }).from(users).where(eq(users.id, userId));
  if (!u?.secret) return null;
  const digits = code.replace(/\s/g, "");
  if (/^\d{6}$/.test(digits)) {
    const step = matchTotp(decryptSecret(u.secret), digits);
    if (step === null) return null;
    const used = await exec
      .update(users)
      .set({ mfaLastStep: step })
      .where(and(eq(users.id, userId), or(isNull(users.mfaLastStep), lt(users.mfaLastStep, step))))
      .returning({ id: users.id });
    if (!used.length) return null;
    await resetRateLimit("otp_verify_user", userId);
    return "totp";
  }
  const [rc] = await exec
    .update(mfaRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(mfaRecoveryCodes.userId, userId), eq(mfaRecoveryCodes.codeHash, hashToken(normalizeRecovery(code))), isNull(mfaRecoveryCodes.usedAt)))
    .returning({ id: mfaRecoveryCodes.id });
  if (!rc) return null;
  await resetRateLimit("otp_verify_user", userId);
  return "recovery";
}

/** Step 1: a fresh secret (not active yet) and its QR code. */
export async function startMfaEnrollment(actor: Actor) {
  await enforceRateLimit("account_change_user", actor.userId);
  const [u] = await db().select({ enabled: users.mfaEnabled }).from(users).where(eq(users.id, actor.userId));
  if (!u) throw Errors.notFound();
  if (u.enabled) throw new AppError("CONFLICT", "A verificação em duas etapas já está ativa.");
  const secret = newTotpSecret();
  await db().update(users).set({ mfaSecret: encryptSecret(secret), mfaLastStep: null }).where(eq(users.id, actor.userId));
  const uri = otpauthUri(secret, actor.email);
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" }) };
}

/** Step 2: proves the app is set up; turns MFA on and returns the recovery codes (shown once). */
export async function confirmMfaEnrollment(actor: Actor, code: string, meta: RequestMeta): Promise<string[]> {
  const codes = await db().transaction(async (tx) => {
    const [u] = await tx.select({ enabled: users.mfaEnabled, secret: users.mfaSecret }).from(users).where(eq(users.id, actor.userId)).for("update");
    if (!u?.secret) throw new AppError("CONFLICT", "Comece a configuração novamente.");
    if (u.enabled) throw new AppError("CONFLICT", "A verificação em duas etapas já está ativa.");
    if ((await verifySecondFactor(tx, actor.userId, code)) !== "totp") throw Errors.validation({ code: ["Código inválido. Confira o horário do celular e tente o código atual."] });
    await tx.update(users).set({ mfaEnabled: true }).where(eq(users.id, actor.userId));
    const list = await replaceRecoveryCodes(tx, actor.userId);
    // Other devices signed in with the password alone must sign in again.
    await revokeUserSessions(tx, actor.userId, "mfa_enabled", actor.sessionId);
    await audit(tx, { action: "auth.mfa_enabled", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash });
    return list;
  });
  await recordSecurityEvent({ type: "auth.mfa_enabled", severity: "info", userId: actor.userId, ipHash: meta.ipHash });
  await sendMail(mfaChangedEmail(actor.email, true)).catch((err: unknown) => log.error("mfa mail failed", errorFields(err)));
  return codes;
}

export async function disableMfa(actor: Actor, input: { password: string; code: string }, meta: RequestMeta) {
  if (actor.isPlatformAdmin) throw new AppError("FORBIDDEN", "Administradores precisam manter a verificação em duas etapas.");
  await enforceRateLimit("account_change_user", actor.userId);
  await db().transaction(async (tx) => {
    const [u] = await tx.select({ hash: users.passwordHash, enabled: users.mfaEnabled }).from(users).where(eq(users.id, actor.userId)).for("update");
    if (!u?.enabled) throw new AppError("CONFLICT", "A verificação em duas etapas não está ativa.");
    if (!(await verifyPassword(u.hash, input.password))) throw Errors.validation({ password: ["Senha incorreta."] });
    if (!(await verifySecondFactor(tx, actor.userId, input.code))) throw Errors.validation({ code: ["Código inválido."] });
    await tx.update(users).set({ mfaEnabled: false, mfaSecret: null, mfaLastStep: null }).where(eq(users.id, actor.userId));
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, actor.userId));
    await audit(tx, { action: "auth.mfa_disabled", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash });
  });
  await recordSecurityEvent({ type: "auth.mfa_disabled", severity: "warning", userId: actor.userId, ipHash: meta.ipHash });
  await sendMail(mfaChangedEmail(actor.email, false)).catch((err: unknown) => log.error("mfa mail failed", errorFields(err)));
}

export async function regenerateRecoveryCodes(actor: Actor, code: string, meta: RequestMeta): Promise<string[]> {
  return db().transaction(async (tx) => {
    const [u] = await tx.select({ enabled: users.mfaEnabled }).from(users).where(eq(users.id, actor.userId));
    if (!u?.enabled) throw new AppError("CONFLICT", "A verificação em duas etapas não está ativa.");
    if ((await verifySecondFactor(tx, actor.userId, code)) !== "totp") throw Errors.validation({ code: ["Código inválido."] });
    const list = await replaceRecoveryCodes(tx, actor.userId);
    await audit(tx, { action: "auth.mfa_recovery_regenerated", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash });
    return list;
  });
}

export async function remainingRecoveryCodes(userId: string) {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(mfaRecoveryCodes)
    .where(and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.usedAt)));
  return r?.n ?? 0;
}

/** What the settings page needs: on/off, a pending enrollment's QR, remaining recovery codes. */
export async function getMfaState(actor: Actor) {
  const [u] = await db().select({ enabled: users.mfaEnabled, secret: users.mfaSecret }).from(users).where(eq(users.id, actor.userId));
  if (!u) throw Errors.notFound();
  if (u.enabled) return { status: "on" as const, remaining: await remainingRecoveryCodes(actor.userId) };
  if (u.secret) {
    const secret = decryptSecret(u.secret);
    return { status: "pending" as const, secret, qr: await QRCode.toDataURL(otpauthUri(secret, actor.email), { margin: 1, width: 220, errorCorrectionLevel: "M" }) };
  }
  return { status: "off" as const };
}
