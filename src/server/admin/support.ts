import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { withTenant } from "../db/context";
import { supportAccessGrants, users, workspaces } from "../db/schema";
import type { RequestMeta } from "../http/request-meta";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { sendMail } from "../mail/mailer";
import { supportAccessEmail } from "../mail/templates";
import { audit, recordSecurityEvent } from "../security/audit";

/**
 * Break-glass support access. An admin opens a short, read-only window on one
 * workspace with a written reason; the owner is emailed and sees every grant.
 * The data itself comes from app_support_overview(), which re-checks the grant
 * in the database and never returns health, photos, messages or posts.
 */

export const SUPPORT_MINUTES = [15, 30, 60] as const;
const asAdmin = <T>(actor: Actor, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ userId: actor.userId, isPlatformAdmin: true }, fn);

export async function openSupportAccess(actor: Actor, workspaceId: string, input: { reason: string; minutes: (typeof SUPPORT_MINUTES)[number] }, meta: RequestMeta) {
  assertCan(actor, "admin.support_access");
  const expiresAt = new Date(Date.now() + input.minutes * 60_000);
  const owner = await asAdmin(actor, async (tx) => {
    const [ws] = await tx
      .select({ name: workspaces.name, ownerEmail: users.email, status: workspaces.status })
      .from(workspaces)
      .innerJoin(users, eq(users.id, workspaces.ownerUserId))
      .where(eq(workspaces.id, workspaceId));
    if (!ws) throw Errors.notFound();
    const [open] = await tx
      .select({ id: supportAccessGrants.id })
      .from(supportAccessGrants)
      .where(and(eq(supportAccessGrants.workspaceId, workspaceId), eq(supportAccessGrants.adminUserId, actor.userId), isNull(supportAccessGrants.revokedAt), gt(supportAccessGrants.expiresAt, new Date())));
    if (open) throw new AppError("CONFLICT", "Você já tem um acesso aberto a esta consultoria.");
    const [g] = await tx.insert(supportAccessGrants).values({ workspaceId, adminUserId: actor.userId, reason: input.reason, expiresAt }).returning({ id: supportAccessGrants.id });
    await audit(tx, {
      action: "admin.support_access_opened",
      actorUserId: actor.userId,
      workspaceId,
      targetType: "support_grant",
      targetId: g!.id,
      metadata: { reason: input.reason, minutes: input.minutes },
      ipHash: meta.ipHash,
    });
    return ws;
  });
  await recordSecurityEvent({ type: "admin.support_access_opened", severity: "warning", userId: actor.userId, workspaceId, ipHash: meta.ipHash, metadata: { minutes: input.minutes } });
  await sendMail(await supportAccessEmail(owner.ownerEmail, owner.name, input.reason, input.minutes)).catch((err: unknown) => log.error("support access email failed", errorFields(err)));
}

export async function closeSupportAccess(actor: Actor, workspaceId: string, meta: RequestMeta) {
  assertCan(actor, "admin.support_access");
  await asAdmin(actor, async (tx) => {
    const closed = await tx
      .update(supportAccessGrants)
      .set({ revokedAt: new Date() })
      .where(and(eq(supportAccessGrants.workspaceId, workspaceId), eq(supportAccessGrants.adminUserId, actor.userId), isNull(supportAccessGrants.revokedAt), gt(supportAccessGrants.expiresAt, new Date())))
      .returning({ id: supportAccessGrants.id });
    if (closed.length === 0) throw new AppError("CONFLICT", "Não há acesso aberto para encerrar.");
    await audit(tx, { action: "admin.support_access_closed", actorUserId: actor.userId, workspaceId, targetType: "support_grant", targetId: closed[0]!.id, ipHash: meta.ipHash });
  });
}

/** The admin's open grant on this workspace, if any. */
export async function activeSupportGrant(actor: Actor, workspaceId: string) {
  assertCan(actor, "admin.support_access");
  const [g] = await asAdmin(actor, (tx) =>
    tx
      .select({ id: supportAccessGrants.id, reason: supportAccessGrants.reason, expiresAt: supportAccessGrants.expiresAt })
      .from(supportAccessGrants)
      .where(and(eq(supportAccessGrants.workspaceId, workspaceId), eq(supportAccessGrants.adminUserId, actor.userId), isNull(supportAccessGrants.revokedAt), gt(supportAccessGrants.expiresAt, new Date()))),
  );
  return g ?? null;
}

export type SupportOverview = {
  students: { name: string; status: string; joinedAt: string | null; program: string | null; lastWorkoutAt: string | null; workouts30d: number }[];
  programs: { name: string; isTemplate: boolean; archived: boolean; activeAssignments: number }[];
  openInvitations: number;
};

/** Read-only support summary. Every read is audited. */
export async function getSupportOverview(actor: Actor, workspaceId: string, meta: RequestMeta): Promise<SupportOverview> {
  assertCan(actor, "admin.support_access");
  return asAdmin(actor, async (tx) => {
    let data: SupportOverview;
    try {
      const r = await tx.execute<{ data: SupportOverview }>(sql`select app_support_overview(${workspaceId}::uuid) as data`);
      data = r.rows[0]!.data;
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === "42501" || (err as { code?: string }).code === "42501") {
        throw new AppError("FORBIDDEN", "O acesso de suporte não está aberto ou já expirou.");
      }
      throw err;
    }
    await audit(tx, { action: "admin.support_viewed", actorUserId: actor.userId, workspaceId, targetType: "workspace", targetId: workspaceId, ipHash: meta.ipHash });
    return data;
  });
}

/** For the workspace's trainer: support accesses in the last 90 days (transparency). */
export async function listSupportAccessForTrainer(actor: Actor) {
  assertCan(actor, "workspace.audit.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) =>
    tx
      .select({ id: supportAccessGrants.id, reason: supportAccessGrants.reason, createdAt: supportAccessGrants.createdAt, expiresAt: supportAccessGrants.expiresAt, revokedAt: supportAccessGrants.revokedAt })
      .from(supportAccessGrants)
      .where(and(eq(supportAccessGrants.workspaceId, m.workspaceId), gt(supportAccessGrants.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))))
      .orderBy(desc(supportAccessGrants.createdAt))
      .limit(20),
  );
}
