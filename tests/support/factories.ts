import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { login, registerTrainer, verifyEmail } from "@/server/auth/service";
import { db } from "@/server/db/client";
import { setTenantContext } from "@/server/db/context";
import { users, workspaceMembers, workspaces } from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { testOutbox } from "@/server/mail/mailer";
import { requestMetaFrom, type RequestMeta } from "@/server/http/request-meta";

export const PASSWORD = "correct-horse-battery";

/** A fresh client IP per call, so per-IP limits from one test never affect another. */
export function meta(ip = `10.${rand()}.${rand()}.${rand()}`): RequestMeta {
  return requestMetaFrom(new Headers({ "x-forwarded-for": ip, "user-agent": "vitest" }));
}
const rand = () => Math.floor(Math.random() * 250) + 1;

export const uniqueEmail = (prefix = "user") => `${prefix}-${randomUUID().slice(0, 8)}@example.com`;

export function lastTokenFor(email: string, kind: "verificar-email" | "redefinir-senha"): string {
  const mail = [...testOutbox].reverse().find((m) => m.to === email && m.text.includes(kind));
  const token = mail?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error(`no ${kind} mail for ${email}`);
  return token;
}

/** Registers a trainer through the real service, confirms the email and returns ids. */
export async function createTrainer(name = "Treinador") {
  const email = uniqueEmail("trainer");
  await registerTrainer({ displayName: name, email, password: PASSWORD, workspaceName: `${name} Consultoria`, acceptTerms: "on" }, meta());
  await verifyEmail(lastTokenFor(email, "verificar-email"), meta());
  const [u] = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
  const [w] = await db().transaction(async (tx) => {
    await setTenantContext(tx, { userId: u!.id });
    return tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerUserId, u!.id));
  });
  return { email, userId: u!.id, workspaceId: w!.id };
}

/** Adds a verified student to a workspace, acting as that workspace's trainer (as Phase 2 invites will). */
export async function createStudent(trainer: { userId: string; workspaceId: string }) {
  const email = uniqueEmail("student");
  const [u] = await db()
    .insert(users)
    .values({ email, passwordHash: await hashPassword(PASSWORD), displayName: "Aluno Teste", emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  await db().transaction(async (tx) => {
    await setTenantContext(tx, { userId: trainer.userId, workspaceId: trainer.workspaceId });
    await tx.insert(workspaceMembers).values({ workspaceId: trainer.workspaceId, userId: u!.id, role: "student", status: "active", joinedAt: new Date() });
  });
  return { email, userId: u!.id, workspaceId: trainer.workspaceId };
}

export async function loginAs(email: string) {
  const r = await login({ email, password: PASSWORD }, meta());
  if ("mfaRequired" in r) throw new Error("account has MFA: use completeMfaLogin");
  return r;
}
