import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { consents, studentHealthRecords, studentProfiles, users, workspaceMembers } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { assertSeatAvailable } from "./invitations";

export const STUDENTS_PAGE_SIZE = 30;

type MemberStatus = "active" | "suspended" | "archived";

export type HealthInput = { restrictions: string | null; injuries: string | null; medicalNotes: string | null };

function ctxFor(actor: Actor) {
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

/** Loads a student membership of the actor's workspace, or NOT_FOUND (also for other workspaces). */
async function loadStudentMember(tx: Tx, workspaceId: string, memberId: string) {
  const [row] = await tx
    .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, status: workspaceMembers.status })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "student")));
  if (!row) throw Errors.notFound();
  return row;
}

async function healthConsentActive(tx: Tx, userId: string) {
  const [last] = await tx
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.userId, userId), eq(consents.purpose, "health_data_processing")))
    .orderBy(desc(consents.createdAt), desc(consents.id))
    .limit(1);
  return last?.granted ?? false;
}

// ---------------------------------------------------------------------------
// Trainer side
// ---------------------------------------------------------------------------

export async function listStudents(actor: Actor, opts: { status: MemberStatus; page: number }) {
  assertCan(actor, "students.read");
  const { m, ctx } = ctxFor(actor);
  return withTenant(ctx, async (tx) => {
    const where = and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), eq(workspaceMembers.status, opts.status));
    const rows = await tx
      .select({
        memberId: workspaceMembers.id,
        displayName: users.displayName,
        email: users.email,
        status: workspaceMembers.status,
        joinedAt: workspaceMembers.joinedAt,
        fitnessLevel: studentProfiles.fitnessLevel,
        weeklyFrequency: studentProfiles.weeklyFrequency,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .leftJoin(studentProfiles, eq(studentProfiles.memberId, workspaceMembers.id))
      .where(where)
      .orderBy(asc(sql`lower(${users.displayName})`), asc(workspaceMembers.id))
      .limit(STUDENTS_PAGE_SIZE)
      .offset((opts.page - 1) * STUDENTS_PAGE_SIZE);
    const [total] = await tx.select({ n: count() }).from(workspaceMembers).where(where);
    return { rows, total: total?.n ?? 0 };
  });
}

/**
 * Full student file for the trainer. Health data is only returned while the
 * student's consent is active (enforced again by RLS), and each read is audited.
 */
export async function getStudentForTrainer(actor: Actor, memberId: string, meta: RequestMeta) {
  assertCan(actor, "students.read");
  const { m, ctx } = ctxFor(actor);
  return withTenant(ctx, async (tx) => {
    const member = await loadStudentMember(tx, m.workspaceId, memberId);
    const [person] = await tx.select({ displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, member.userId));
    const [profile] = await tx.select().from(studentProfiles).where(eq(studentProfiles.memberId, memberId));
    const consent = await healthConsentActive(tx, member.userId);
    let health: typeof studentHealthRecords.$inferSelect | null = null;
    if (consent) {
      await enforceRateLimit("health_access_user", actor.userId);
      [health = null] = await tx.select().from(studentHealthRecords).where(eq(studentHealthRecords.memberId, memberId));
      await audit(tx, { action: "health.viewed", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
    }
    return {
      memberId,
      status: member.status,
      displayName: person!.displayName,
      email: person!.email,
      profile: {
        goal: profile?.goal ?? null,
        fitnessLevel: profile?.fitnessLevel ?? null,
        weeklyFrequency: profile?.weeklyFrequency ?? null,
        trainerNotes: profile?.trainerNotes ?? null,
      },
      healthConsent: consent,
      health: health ? { restrictions: health.restrictions, injuries: health.injuries, medicalNotes: health.medicalNotes, updatedAt: health.updatedAt } : null,
    };
  });
}

export async function updateStudentProfile(
  actor: Actor,
  input: { memberId: string; goal: string | null; fitnessLevel: "beginner" | "intermediate" | "advanced" | null; weeklyFrequency: number | null; trainerNotes: string | null },
  meta: RequestMeta,
) {
  assertCan(actor, "students.manage");
  const { m, ctx } = ctxFor(actor);
  await withTenant(ctx, async (tx) => {
    await loadStudentMember(tx, m.workspaceId, input.memberId);
    const values = { goal: input.goal, fitnessLevel: input.fitnessLevel, weeklyFrequency: input.weeklyFrequency, trainerNotes: input.trainerNotes };
    await tx
      .insert(studentProfiles)
      .values({ workspaceId: m.workspaceId, memberId: input.memberId, ...values })
      .onConflictDoUpdate({ target: studentProfiles.memberId, set: values });
    // Field names only: content stays out of the audit log.
    await audit(tx, { action: "students.profile_updated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: input.memberId, ipHash: meta.ipHash });
  });
}

export async function updateStudentHealthAsTrainer(actor: Actor, memberId: string, input: HealthInput, meta: RequestMeta) {
  assertCan(actor, "students.manage");
  const { m, ctx } = ctxFor(actor);
  await withTenant(ctx, async (tx) => {
    const member = await loadStudentMember(tx, m.workspaceId, memberId);
    if (!(await healthConsentActive(tx, member.userId))) {
      throw new AppError("FORBIDDEN", "O aluno ainda não autorizou o registro de dados de saúde.");
    }
    await upsertHealth(tx, m.workspaceId, memberId, actor.userId, input);
    await audit(tx, { action: "health.updated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
  });
}

async function upsertHealth(tx: Tx, workspaceId: string, memberId: string, userId: string, input: HealthInput) {
  const values = { ...input, updatedByUserId: userId };
  await tx
    .insert(studentHealthRecords)
    .values({ workspaceId, memberId, ...values })
    .onConflictDoUpdate({ target: studentHealthRecords.memberId, set: values });
}

/** Suspend, reactivate or archive a student. Reactivating an archived student needs a free seat. */
export async function setStudentStatus(actor: Actor, memberId: string, status: MemberStatus, meta: RequestMeta) {
  assertCan(actor, "students.manage");
  const { m, ctx } = ctxFor(actor);
  await withTenant(ctx, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`seats:${m.workspaceId}`}, 0))`);
    const member = await loadStudentMember(tx, m.workspaceId, memberId);
    if (member.status === status) return;
    if (member.status === "archived") await assertSeatAvailable(tx, m.workspaceId);
    await tx.update(workspaceMembers).set({ status }).where(eq(workspaceMembers.id, memberId));
    await audit(tx, {
      action: `students.status_${status}`,
      actorUserId: actor.userId,
      workspaceId: m.workspaceId,
      targetType: "member",
      targetId: memberId,
      metadata: { from: member.status },
      ipHash: meta.ipHash,
    });
  });
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export async function getOwnHealth(actor: Actor) {
  assertCan(actor, "training.read_own");
  const { m, ctx } = ctxFor(actor);
  return withTenant(ctx, async (tx) => {
    const consent = await healthConsentActive(tx, actor.userId);
    const [health] = await tx.select().from(studentHealthRecords).where(eq(studentHealthRecords.memberId, m.memberId));
    const [profile] = await tx
      .select({ goal: studentProfiles.goal, fitnessLevel: studentProfiles.fitnessLevel, weeklyFrequency: studentProfiles.weeklyFrequency })
      .from(studentProfiles)
      .where(eq(studentProfiles.memberId, m.memberId));
    return {
      consent,
      profile: profile ?? null,
      health: health ? { restrictions: health.restrictions, injuries: health.injuries, medicalNotes: health.medicalNotes } : null,
    };
  });
}

export async function updateOwnHealth(actor: Actor, input: HealthInput, meta: RequestMeta) {
  assertCan(actor, "training.read_own");
  const { m, ctx } = ctxFor(actor);
  await enforceRateLimit("account_change_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    await upsertHealth(tx, m.workspaceId, m.memberId, actor.userId, input);
    await audit(tx, { action: "health.updated_by_self", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: m.memberId, ipHash: meta.ipHash });
  });
}

/** Grants or withdraws consent to share health data with the trainer. Withdrawal takes effect immediately (RLS). */
export async function setHealthConsent(actor: Actor, granted: boolean, meta: RequestMeta) {
  assertCan(actor, "training.read_own");
  const { m, ctx } = ctxFor(actor);
  await enforceRateLimit("account_change_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    await tx.insert(consents).values({ userId: actor.userId, purpose: "health_data_processing", documentVersion: LEGAL_DOCUMENT_VERSION, granted, ipHash: meta.ipHash });
    await audit(tx, { action: granted ? "consent.health_granted" : "consent.health_withdrawn", actorUserId: actor.userId, workspaceId: m.workspaceId, ipHash: meta.ipHash });
  });
}

/** Erases the student's own health record (LGPD right to deletion). */
export async function deleteOwnHealth(actor: Actor, meta: RequestMeta) {
  assertCan(actor, "training.read_own");
  const { m, ctx } = ctxFor(actor);
  await withTenant(ctx, async (tx) => {
    await tx.delete(studentHealthRecords).where(eq(studentHealthRecords.memberId, m.memberId));
    await audit(tx, { action: "health.deleted_by_self", actorUserId: actor.userId, workspaceId: m.workspaceId, ipHash: meta.ipHash });
  });
}
