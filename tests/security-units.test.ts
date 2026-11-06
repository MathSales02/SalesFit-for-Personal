import { describe, expect, it } from "vitest";
import { can, type Actor } from "@/server/authz/policy";
import { parseForm } from "@/server/http/action";
import { clientIp, requestMetaFrom } from "@/server/http/request-meta";
import { redact } from "@/server/lib/logger";
import { AppError } from "@/server/lib/errors";
import { checkRateLimit, enforceRateLimit } from "@/server/security/rate-limit";
import { MemoryRateLimitStore } from "@/server/security/rate-limit-store";
import { loginSchema, registerTrainerSchema } from "@/lib/validation/auth";
import { hashPassword, needsRehash, verifyPassword } from "@/server/auth/password";

const base: Actor = {
  userId: "u",
  sessionId: "s",
  displayName: "X",
  email: "x@example.com",
  emailVerified: true,
  isPlatformAdmin: false,
  membership: null,
};
const trainer: Actor = { ...base, membership: { workspaceId: "w", workspaceName: "W", memberId: "m", role: "trainer" } };
const student: Actor = { ...base, membership: { workspaceId: "w", workspaceName: "W", memberId: "m", role: "student" } };
const admin: Actor = { ...base, isPlatformAdmin: true };

describe("authorization policy", () => {
  it("denies everything to anonymous users", () => {
    expect(can(null, "workspace.read")).toBe(false);
    expect(can(null, "admin.dashboard")).toBe(false);
  });

  it("denies workspace permissions without a membership", () => {
    expect(can(base, "workspace.read")).toBe(false);
  });

  it("students cannot use trainer permissions", () => {
    expect(can(student, "students.manage")).toBe(false);
    expect(can(student, "rewards.manage")).toBe(false);
    expect(can(student, "gamification.configure")).toBe(false);
    expect(can(student, "rewards.redeem")).toBe(true);
  });

  it("trainers cannot use platform admin permissions", () => {
    expect(can(trainer, "admin.dashboard")).toBe(false);
    expect(can(trainer, "students.manage")).toBe(true);
  });

  it("platform admins get no workspace permissions by default", () => {
    expect(can(admin, "admin.workspaces.read")).toBe(true);
    expect(can(admin, "students.read")).toBe(false);
    expect(can(admin, "messages.use")).toBe(false);
  });

  it("unknown permissions are denied", () => {
    expect(can(trainer, "students.delete_everything" as never)).toBe(false);
  });
});

describe("input validation", () => {
  const form = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  };

  it("rejects unexpected fields (mass assignment)", () => {
    expect(() => parseForm(loginSchema, form({ email: "a@b.com", password: "x", isPlatformAdmin: "true" }))).toThrow(AppError);
  });

  it("rejects duplicated fields", () => {
    const f = form({ email: "a@b.com", password: "x" });
    f.append("email", "other@b.com");
    expect(() => parseForm(loginSchema, f)).toThrow(AppError);
  });

  it("rejects file uploads in text fields", () => {
    const f = form({ email: "a@b.com" });
    f.append("password", new Blob(["x"]));
    expect(() => parseForm(loginSchema, f)).toThrow(AppError);
  });

  it("ignores Next.js internal action fields", () => {
    const f = form({ email: "A@B.com", password: "x", "$ACTION_ID_abc": "" });
    expect(parseForm(loginSchema, f)).toEqual({ email: "a@b.com", password: "x" });
  });

  it("enforces password length and blocks common passwords", () => {
    const ok = { displayName: "Ana Souza", email: "a@b.com", workspaceName: "Ana Treinos", acceptTerms: "on" };
    expect(registerTrainerSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(registerTrainerSchema.safeParse({ ...ok, password: "1234567890" }).success).toBe(false);
    expect(registerTrainerSchema.safeParse({ ...ok, password: "x".repeat(129) }).success).toBe(false);
    expect(registerTrainerSchema.safeParse({ ...ok, password: "a long unique passphrase" }).success).toBe(true);
  });

  it("rejects markup in names", () => {
    const r = registerTrainerSchema.safeParse({ displayName: "<script>", email: "a@b.com", password: "a long unique passphrase", workspaceName: "W W", acceptTerms: "on" });
    expect(r.success).toBe(false);
  });
});

describe("client IP extraction", () => {
  it("ignores spoofed X-Forwarded-For entries added by the client", () => {
    // Client sent "1.1.1.1", the server appended the real socket address.
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.9" });
    expect(clientIp(h)).toBe("198.51.100.9");
  });

  it("hashes the IP before it is stored", () => {
    const m = requestMetaFrom(new Headers({ "x-forwarded-for": "198.51.100.9" }));
    expect(m.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(m.ipHash).not.toContain("198");
  });
});

describe("rate limiting", () => {
  it("returns retry-after once the limit is exceeded", async () => {
    const subject = `unit-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect((await checkRateLimit("register_ip", subject)).allowed).toBe(true);
    const blocked = await checkRateLimit("register_ip", subject);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    const err = await enforceRateLimit("register_ip", subject).catch((e: AppError) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(429);
  });

  it("keys are per subject, so one abuser does not block others", async () => {
    const a = `unit-a-${Math.random()}`;
    for (let i = 0; i < 6; i++) await checkRateLimit("register_ip", a);
    expect((await checkRateLimit("register_ip", `unit-b-${Math.random()}`)).allowed).toBe(true);
  });

  it("the sliding window frees slots as time passes", async () => {
    const store = new MemoryRateLimitStore();
    expect((await store.hit("k", 1, 50)).allowed).toBe(true);
    expect((await store.hit("k", 1, 50)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect((await store.hit("k", 1, 50)).allowed).toBe(true);
  });
});

describe("logging", () => {
  it("redacts secrets and message bodies", () => {
    const out = redact({ password: "p", newPassword: "p", sessionToken: "t", authorization: "b", body: "hi", nested: { token: "t" }, rule: "login_ip", errMessage: "ok" });
    expect(out).toEqual({ password: "[redacted]", newPassword: "[redacted]", sessionToken: "[redacted]", authorization: "[redacted]", body: "[redacted]", nested: { token: "[redacted]" }, rule: "login_ip", errMessage: "ok" });
  });
});

describe("password hashing", () => {
  it("uses Argon2id with current parameters", async () => {
    const h = await hashPassword("some long password");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(needsRehash(h)).toBe(false);
    expect(await verifyPassword(h, "some long password")).toBe(true);
    expect(await verifyPassword(h, "Some long password")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});
