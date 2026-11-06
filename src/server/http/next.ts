import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveActor } from "../auth/actor";
import { sessionCookieName } from "../auth/session";
import { assertCan, type Actor, type Permission } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { enforceRateLimit } from "../security/rate-limit";
import { requestMetaFrom, type RequestMeta } from "./request-meta";

/** Next.js adapters. Business logic stays in services, which never import next/*. */

export async function requestMeta(): Promise<RequestMeta> {
  return requestMetaFrom(await headers());
}

/** The current actor, resolved once per request. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  return resolveActor(jar.get(sessionCookieName())?.value);
});

/**
 * Pages and actions refuse to run while the workspace's subscription is blocked,
 * except the few that must keep working (account, billing, the blocked notice).
 */
type Gate = { allowInactive?: boolean };

/** Platform administration is only available with two-step verification on. */
const needsMfa = (actor: Actor, permission?: Permission) => !!permission?.startsWith("admin.") && !actor.mfaEnabled;

const isBlocked = (actor: Actor) => actor.membership?.access?.state === "blocked";

/** Where a blocked member is sent. */
export function blockedPathFor(actor: Actor) {
  return actor.membership?.role === "trainer" ? "/treinador/assinatura" : "/aluno/indisponivel";
}

/** For pages: sends unauthenticated visitors to login and unauthorized ones to their home. */
export async function requirePageActor(permission?: Permission, gate: Gate = {}): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/entrar");
  if (permission) {
    try {
      assertCan(actor, permission);
    } catch {
      redirect("/inicio");
    }
  }
  if (needsMfa(actor, permission)) redirect("/conta/duas-etapas?obrigatorio=1");
  if (!gate.allowInactive && isBlocked(actor)) redirect(blockedPathFor(actor));
  return actor;
}

/**
 * For server actions: requires a session (and optionally a permission) and
 * applies the per-user and per-workspace rate limits every action shares.
 */
export async function requireActionActor(permission?: Permission, gate: Gate = {}): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw Errors.unauthenticated();
  await enforceRateLimit("user_default", actor.userId);
  if (actor.membership) await enforceRateLimit("workspace_default", actor.membership.workspaceId);
  if (permission) assertCan(actor, permission);
  if (needsMfa(actor, permission)) throw new AppError("FORBIDDEN", "Ative a verificação em duas etapas para usar a administração.");
  if (!gate.allowInactive && isBlocked(actor)) {
    throw new AppError(
      "PLAN_LIMIT",
      actor.membership?.role === "trainer"
        ? "A assinatura da consultoria está inativa. Regularize em Assinatura para continuar."
        : "Esta consultoria está temporariamente indisponível. Fale com seu treinador.",
    );
  }
  return actor;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

const MFA_COOKIE = "cadencia_mfa";

/** Holds the pending MFA challenge between the password step and the code step (5 minutes, login pages only). */
export async function setMfaChallengeCookie(challenge: string) {
  const jar = await cookies();
  jar.set(MFA_COOKIE, challenge, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/entrar", maxAge: 5 * 60 });
}

export async function readMfaChallengeCookie() {
  return (await cookies()).get(MFA_COOKIE)?.value ?? null;
}

export async function clearMfaChallengeCookie() {
  (await cookies()).delete({ name: MFA_COOKIE, path: "/entrar" });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(sessionCookieName());
}
