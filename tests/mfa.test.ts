import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import { confirmMfaEnrollment, disableMfa, getMfaState, regenerateRecoveryCodes, startMfaEnrollment } from "@/server/auth/mfa";
import { completeMfaLogin, login } from "@/server/auth/service";
import { base32Encode, currentStep, matchTotp, totpAt } from "@/server/auth/totp";
import type { Actor } from "@/server/authz/policy";
import { closeDb, db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { decryptSecret, encryptSecret } from "@/server/lib/crypto";
import { AppError } from "@/server/lib/errors";
import { createTrainer, loginAs, meta, PASSWORD } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
/** The code for the next time step: valid (clock drift window) and not yet used. */
const nextCode = (secret: string, offset = 1) => totpAt(secret, currentStep() + offset);

async function enrolled(a: Actor) {
  const { secret } = await startMfaEnrollment(a);
  const step = currentStep();
  const codes = await confirmMfaEnrollment(a, totpAt(secret, step), meta());
  return { secret, codes, step };
}

describe("TOTP and secret storage", () => {
  it("matches the RFC 6238 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpAt(secret, 1)).toBe("287082"); // T = 59 s
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(matchTotp(secret, "287082", 59_000)).toBe(1);
    expect(matchTotp(secret, "287083", 59_000)).toBeNull();
    expect(matchTotp(secret, "28708", 59_000)).toBeNull();
  });

  it("encrypts secrets with authentication", () => {
    const sealed = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const parts = sealed.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("enrollment and login", () => {
  it("enrolls with a valid code, stores the secret encrypted and ends other sessions", async () => {
    const t = await trainer();
    const other = await loginAs(t.email);
    const { secret } = await startMfaEnrollment(t);
    expect((await getMfaState(t)).status).toBe("pending");
    const [row] = await db().select({ secret: users.mfaSecret }).from(users).where(eq(users.id, t.userId));
    expect(row!.secret).not.toContain(secret);

    await expect(confirmMfaEnrollment(t, "000000", meta())).rejects.toMatchObject({ code: "VALIDATION" });
    const codes = await confirmMfaEnrollment(t, totpAt(secret, currentStep()), meta());
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(await resolveActor(other.token)).toBeNull();
    expect((await getMfaState(t)).status).toBe("on");
  });

  it("login needs the second factor; codes cannot be replayed; challenges are single use", async () => {
    const t = await trainer();
    const { secret, step } = await enrolled(t);
    const first = await login({ email: t.email, password: PASSWORD }, meta());
    expect("mfaRequired" in first && first.mfaRequired).toBe(true);
    if (!("mfaRequired" in first)) return;

    await expect(completeMfaLogin({ challenge: first.challenge, code: "123456" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    // The enrollment code (current step) was already used.
    await expect(completeMfaLogin({ challenge: first.challenge, code: totpAt(secret, step) }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await completeMfaLogin({ challenge: first.challenge, code: nextCode(secret) }, meta());
    const actor = await resolveActor(ok.token);
    expect(actor!.userId).toBe(t.userId);
    expect(actor!.mfaEnabled).toBe(true);
    // Same challenge again: refused even with a fresh code.
    await expect(completeMfaLogin({ challenge: first.challenge, code: nextCode(secret) }, meta())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(completeMfaLogin({ challenge: "x".repeat(43), code: "123456" }, meta())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("recovery codes work once; regenerating invalidates the old ones", async () => {
    const t = await trainer();
    const { secret, codes } = await enrolled(t);
    const start = async () => {
      const r = await login({ email: t.email, password: PASSWORD }, meta());
      if (!("mfaRequired" in r)) throw new Error("expected MFA");
      return r.challenge;
    };
    await completeMfaLogin({ challenge: await start(), code: codes[0]!.toUpperCase() }, meta());
    await expect(completeMfaLogin({ challenge: await start(), code: codes[0]! }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await getMfaState(t)).status === "on" && (await getMfaState(t))).toMatchObject({ remaining: 9 });

    const fresh = await regenerateRecoveryCodes(t, nextCode(secret), meta());
    await expect(completeMfaLogin({ challenge: await start(), code: codes[1]! }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await completeMfaLogin({ challenge: await start(), code: fresh[0]! }, meta());
  });

  it("disabling needs the password and a code; admins cannot disable", async () => {
    const t = await trainer();
    const { secret } = await enrolled(t);
    await expect(disableMfa(t, { password: "wrong-password-1", code: nextCode(secret) }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(disableMfa({ ...t, isPlatformAdmin: true }, { password: PASSWORD, code: nextCode(secret) }, meta())).rejects.toThrow(AppError);
    await disableMfa(t, { password: PASSWORD, code: nextCode(secret) }, meta());
    expect((await getMfaState(t)).status).toBe("off");
    const r = await login({ email: t.email, password: PASSWORD }, meta());
    expect("token" in r).toBe(true);
  });
});
