import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveActor } from "../auth/actor";
import { sessionCookieName } from "../auth/session";
import { assertCan, type Actor, type Permission } from "../authz/policy";
import { Errors } from "../lib/errors";
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

/** For pages: sends unauthenticated visitors to login and unauthorized ones to their home. */
export async function requirePageActor(permission?: Permission): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/entrar");
  if (permission) {
    try {
      assertCan(actor, permission);
    } catch {
      redirect("/inicio");
    }
  }
  return actor;
}

/**
 * For server actions: requires a session (and optionally a permission) and
 * applies the per-user and per-workspace rate limits every action shares.
 */
export async function requireActionActor(permission?: Permission): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw Errors.unauthenticated();
  await enforceRateLimit("user_default", actor.userId);
  if (actor.membership) await enforceRateLimit("workspace_default", actor.membership.workspaceId);
  if (permission) assertCan(actor, permission);
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

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(sessionCookieName());
}
