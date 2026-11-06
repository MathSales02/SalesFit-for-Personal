import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { db, type Tx } from "../db/client";
import { setTenantContext, withTenant } from "../db/context";
import {
  consents,
  invitations,
  plans,
  studentProfiles,
  subscriptions,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { assertCan, assertEmailVerified, requireMembership, type Actor } from "../authz/policy";
import { hashPassword } from "../auth/password";
import { createSession, setActiveWorkspace } from "../auth/session";
import { AppError, Errors } from "../lib/errors";
import { generateToken, hashToken } from "../lib/crypto";
import { errorFields, log } from "../lib/logger";
import { sendMail } from "../mail/mailer";
import { invitationEmail } from "../mail/templates";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Placeholder user for the system context before the invitee has an account. */
const NO_USER = "00000000-0000-0000-0000-000000000000";

const seatsFull = () =>
  new AppError("PLAN_LIMIT", "Você atingiu o limite de alunos do seu plano. Arquive alunos inativos ou mude de plano.");

/**
 * Seats in use: active and suspended students plus open invitations. Archived
 * students free their seat. Call inside a transaction holding the workspace lock.
 */
async function seatUsage(tx: Tx, workspaceId: string) {
  const [members] = await tx
    .select({ n: count() })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "student"), inArray(workspaceMembers.status, ["active", "suspended"])));
  const [open] = await tx
    .select({ n: count() })
    .from(invitations)
    .where(and(eq(invitations.workspaceId, workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())));
  const [plan] = await tx
    .select({ max: plans.maxStudents, status: subscriptions.status })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.workspaceId, workspaceId));
  return { used: (members?.n ?? 0) + (open?.n ?? 0), max: plan?.max ?? 0, subscriptionStatus: plan?.status };
}

/** Serializes seat-consuming operations per workspace so two requests cannot both take the last seat. */
async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`seats:${workspaceId}`}, 0))`);
}

export async function assertSeatAvailable(tx: Tx, workspaceId: string, extra = 1) {
  const usage = await seatUsage(tx, workspaceId);
  if (usage.subscriptionStatus === "expired" || usage.subscriptionStatus === "canceled") {
    throw new AppError("PLAN_LIMIT", "Sua assinatura não está ativa. Regularize o plano para adicionar alunos.");
  }
  if (usage.used + extra > usage.max) throw seatsFull();
}

// ---------------------------------------------------------------------------
// Trainer side
// ---------------------------------------------------------------------------

export async function inviteStudent(actor: Actor, email: string, meta: RequestMeta): Promise<void> {
  assertCan(actor, "students.manage");
  assertEmailVerified(actor);
  const m = requireMembership(actor);
  await enforceRateLimit("invite_create_user", actor.userId);

  const token = generateToken();
  const workspaceName = await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    await lockWorkspace(tx, m.workspaceId);

    const existing = await tx
      .select({ status: workspaceMembers.status, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), sql`lower(${users.email}) = ${email}`))
      .limit(1);
    if (existing[0] && existing[0].status !== "archived") {
      throw new AppError("CONFLICT", existing[0].role === "trainer" ? "Esse e-mail é o seu." : "Essa pessoa já é sua aluna.");
    }

    // Re-inviting replaces the open invitation (and its link) instead of taking a second seat.
    const revoked = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.workspaceId, m.workspaceId), sql`lower(${invitations.email}) = ${email}`, isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id });
    if (revoked.length === 0) await assertSeatAvailable(tx, m.workspaceId);

    const [inv] = await tx
      .insert(invitations)
      .values({
        workspaceId: m.workspaceId,
        email,
        tokenHash: hashToken(token),
        invitedByUserId: actor.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      })
      .returning({ id: invitations.id });
    await audit(tx, {
      action: revoked.length ? "students.invitation_resent" : "students.invited",
      actorUserId: actor.userId,
      workspaceId: m.workspaceId,
      targetType: "invitation",
      targetId: inv!.id,
      ipHash: meta.ipHash,
    });
    const [ws] = await tx.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, m.workspaceId));
    return ws!.name;
  });

  try {
    await sendMail(invitationEmail(email, actor.displayName, workspaceName, token));
  } catch (err) {
    log.error("invitation mail not sent", errorFields(err));
    throw new AppError("INTERNAL", "Não foi possível enviar o e-mail do convite. Tente reenviar em instantes.");
  }
}

export async function listOpenInvitations(actor: Actor) {
  assertCan(actor, "students.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) =>
    tx
      .select({
        id: invitations.id,
        email: invitations.email,
        createdAt: invitations.createdAt,
        expired: sql<boolean>`${invitations.expiresAt} < now()`,
      })
      .from(invitations)
      .where(and(eq(invitations.workspaceId, m.workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt))
      .limit(100),
  );
}

export async function revokeInvitation(actor: Actor, invitationId: string, meta: RequestMeta) {
  assertCan(actor, "students.manage");
  const m = requireMembership(actor);
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const res = await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), eq(invitations.workspaceId, m.workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: "students.invitation_revoked", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "invitation", targetId: invitationId, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Invitee side
// ---------------------------------------------------------------------------

export type InvitationPreview = { email: string; workspaceName: string; accountExists: boolean };

const INVALID_INVITE = () => new AppError("NOT_FOUND", "Este convite é inválido, expirou ou já foi usado. Peça um novo ao seu treinador.");

/** Reads the open invitation for a token (system context: the invitee is not a member yet). */
async function loadOpenInvitation(tx: Tx, token: string, forUpdate: boolean) {
  const q = tx
    .select({ id: invitations.id, workspaceId: invitations.workspaceId, email: invitations.email, workspaceName: workspaces.name, workspaceStatus: workspaces.status })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  const [row] = forUpdate ? await q.for("update", { of: invitations }) : await q;
  if (!row || row.workspaceStatus !== "active") return null;
  return row;
}

export async function previewInvitation(token: string, meta: RequestMeta): Promise<InvitationPreview | null> {
  await enforceRateLimit("token_redeem_ip", meta.ipHash);
  return db().transaction(async (tx) => {
    await setTenantContext(tx, { userId: NO_USER, isSystem: true });
    const inv = await loadOpenInvitation(tx, token, false);
    if (!inv) return null;
    const [u] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`).limit(1);
    return { email: inv.email, workspaceName: inv.workspaceName, accountExists: !!u };
  });
}

/** Adds or reactivates the student membership, creates the profile, and closes the invitation. */
async function joinWorkspace(tx: Tx, inv: { id: string; workspaceId: string }, userId: string) {
  const [existing] = await tx
    .select({ id: workspaceMembers.id, role: workspaceMembers.role, status: workspaceMembers.status })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, inv.workspaceId), eq(workspaceMembers.userId, userId)));
  if (existing?.role === "trainer") throw new AppError("CONFLICT", "Você já é o treinador desta consultoria.");

  let memberId: string;
  if (existing) {
    // The open invitation already holds this person's seat, so reactivation needs no new seat.
    await tx.update(workspaceMembers).set({ status: "active", joinedAt: new Date() }).where(eq(workspaceMembers.id, existing.id));
    memberId = existing.id;
  } else {
    const [created] = await tx
      .insert(workspaceMembers)
      .values({ workspaceId: inv.workspaceId, userId, role: "student", status: "active", joinedAt: new Date() })
      .returning({ id: workspaceMembers.id });
    memberId = created!.id;
  }
  await tx.insert(studentProfiles).values({ workspaceId: inv.workspaceId, memberId }).onConflictDoNothing();
  await tx.update(invitations).set({ acceptedAt: new Date(), acceptedByUserId: userId }).where(eq(invitations.id, inv.id));
  return memberId;
}

/** New person: creates the account (email proven by the invitation link), joins, and signs in. */
export async function acceptInvitationWithNewAccount(
  input: { token: string; displayName: string; password: string },
  meta: RequestMeta,
): Promise<{ token: string; expiresAt: Date }> {
  await enforceRateLimit("token_redeem_ip", meta.ipHash);
  const passwordHash = await hashPassword(input.password);
  return db().transaction(async (tx) => {
    await setTenantContext(tx, { userId: NO_USER, isSystem: true });
    const inv = await loadOpenInvitation(tx, input.token, true);
    if (!inv) throw INVALID_INVITE();
    const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${inv.email.toLowerCase()}`).limit(1);
    if (taken) throw new AppError("CONFLICT", "Já existe uma conta com este e-mail. Entre com ela para aceitar o convite.");

    const [user] = await tx
      .insert(users)
      .values({ email: inv.email.toLowerCase(), passwordHash, displayName: input.displayName, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    await setTenantContext(tx, { userId: user!.id, workspaceId: inv.workspaceId, isSystem: true });
    const memberId = await joinWorkspace(tx, inv, user!.id);
    await tx.insert(consents).values([
      { userId: user!.id, purpose: "terms_of_service", documentVersion: LEGAL_DOCUMENT_VERSION, granted: true, ipHash: meta.ipHash },
      { userId: user!.id, purpose: "privacy_policy", documentVersion: LEGAL_DOCUMENT_VERSION, granted: true, ipHash: meta.ipHash },
    ]);
    await audit(tx, { action: "students.invitation_accepted", actorUserId: user!.id, workspaceId: inv.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
    const s = await createSession(tx, user!.id, meta, inv.workspaceId);
    return { token: s.token, expiresAt: s.expiresAt };
  });
}

/** Existing account: the signed-in user must own the invited email address. */
export async function acceptInvitationAsActor(actor: Actor, token: string, meta: RequestMeta): Promise<void> {
  await enforceRateLimit("token_redeem_ip", meta.ipHash);
  await db().transaction(async (tx) => {
    await setTenantContext(tx, { userId: actor.userId, isSystem: true });
    const inv = await loadOpenInvitation(tx, token, true);
    if (!inv) throw INVALID_INVITE();
    if (inv.email.toLowerCase() !== actor.email.toLowerCase()) {
      throw new AppError("FORBIDDEN", `Este convite foi enviado para outro e-mail. Entre com a conta de ${inv.email}.`);
    }
    await setTenantContext(tx, { userId: actor.userId, workspaceId: inv.workspaceId, isSystem: true });
    const memberId = await joinWorkspace(tx, inv, actor.userId);
    await setActiveWorkspace(tx, actor.sessionId, inv.workspaceId);
    await audit(tx, { action: "students.invitation_accepted", actorUserId: actor.userId, workspaceId: inv.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
  });
}
