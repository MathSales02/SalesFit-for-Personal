import "server-only";
import { eq, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { verifyPassword } from "../auth/password";
import type { Actor } from "../authz/policy";
import { db } from "../db/client";
import { withTenant } from "../db/context";
import {
  bodyMeasurements,
  checkins,
  comments,
  competitionParticipants,
  consents,
  conversations,
  exercises,
  follows,
  memberBlocks,
  messages,
  notificationPreferences,
  notifications,
  personalRecords,
  pointsLedger,
  postLikes,
  posts,
  programAssignments,
  programs,
  progressPhotos,
  rankingPreferences,
  reports,
  sessions,
  studentHealthRecords,
  studentProfiles,
  users,
  workoutSessions,
  workoutSets,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import type { RequestMeta } from "../http/request-meta";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { audit, recordSecurityEvent } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { deleteObject } from "../storage/s3";

/**
 * LGPD data subject rights: access/portability (export) and erasure (account deletion).
 */

/** Never exported: secrets and internal storage locations. */
const HIDDEN = /hash|token|secret|storage_?key/i;
function clean(rows: Record<string, unknown>[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !HIDDEN.test(k))));
}

/**
 * Everything the platform holds about the user, as JSON. Each workspace is
 * read under the user's own database context, so RLS limits it to what the
 * user may see. Messages: only the ones the user sent (others' words are theirs).
 */
export async function exportMyData(actor: Actor, meta: RequestMeta) {
  await enforceRateLimit("account_change_user", actor.userId);
  const [u] = await db()
    .select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, actor.userId));
  if (!u) throw Errors.notFound();

  const base = await withTenant({ userId: actor.userId }, async (tx) => ({
    consents: await tx.select().from(consents).where(eq(consents.userId, actor.userId)),
    sessions: await tx
      .select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, actor.userId)),
    memberships: await tx
      .select({ memberId: workspaceMembers.id, workspaceId: workspaceMembers.workspaceId, workspaceName: workspaces.name, role: workspaceMembers.role, status: workspaceMembers.status, joinedAt: workspaceMembers.joinedAt })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, actor.userId)),
  }));

  const perWorkspace = [];
  for (const m of base.memberships) {
    const data = await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
      const mine = <T extends PgTable>(table: T, column: AnyPgColumn) => tx.select().from(table as PgTable).where(eq(column, m.memberId)) as Promise<Record<string, unknown>[]>;
      const sessionRows = await mine(workoutSessions, workoutSessions.memberId);
      const sessionIds = sessionRows.map((s) => s.id as string);
      const convs = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(or(eq(conversations.memberAId, m.memberId), eq(conversations.memberBId, m.memberId)));
      return {
        studentProfile: await mine(studentProfiles, studentProfiles.memberId),
        healthRecord: await mine(studentHealthRecords, studentHealthRecords.memberId),
        programAssignments: await mine(programAssignments, programAssignments.memberId),
        workoutSessions: sessionRows,
        workoutSets: sessionIds.length ? await tx.select().from(workoutSets).where(inArray(workoutSets.sessionId, sessionIds)) : [],
        personalRecords: await mine(personalRecords, personalRecords.memberId),
        bodyMeasurements: await mine(bodyMeasurements, bodyMeasurements.memberId),
        progressPhotos: await mine(progressPhotos, progressPhotos.memberId),
        posts: await mine(posts, posts.authorMemberId),
        comments: await mine(comments, comments.authorMemberId),
        likes: await mine(postLikes, postLikes.memberId),
        following: await mine(follows, follows.followerMemberId),
        blocks: await mine(memberBlocks, memberBlocks.blockerMemberId),
        reportsMade: await mine(reports, reports.reporterMemberId),
        conversations: convs.length,
        messagesSent: await mine(messages, messages.senderMemberId),
        notifications: await mine(notifications, notifications.recipientMemberId),
        notificationPreferences: await mine(notificationPreferences, notificationPreferences.memberId),
        checkins: await mine(checkins, checkins.memberId),
        points: await mine(pointsLedger, pointsLedger.memberId),
        rankingPreferences: await mine(rankingPreferences, rankingPreferences.memberId),
        competitions: await mine(competitionParticipants, competitionParticipants.memberId),
        ...(m.role === "trainer"
          ? {
              programsCreated: await tx.select().from(programs).where(eq(programs.createdByUserId, actor.userId)),
              exercisesCreated: await tx.select().from(exercises).where(eq(exercises.createdByUserId, actor.userId)),
            }
          : {}),
      };
    });
    perWorkspace.push({
      workspace: { id: m.workspaceId, name: m.workspaceName, role: m.role, status: m.status, joinedAt: m.joinedAt },
      ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? clean(v as Record<string, unknown>[]) : v])),
    });
  }

  await withTenant({ userId: actor.userId }, (tx) => audit(tx, { action: "privacy.data_exported", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash }));

  return {
    format: "cadencia-export-v1",
    generatedAt: new Date().toISOString(),
    notes: [
      "Arquivos de fotos e vídeos não vão no arquivo; baixe-os pelo app enquanto a conta existir.",
      "Mensagens: incluímos só as que você enviou. As recebidas pertencem também a quem as escreveu.",
    ],
    account: u,
    consents: clean(base.consents as unknown as Record<string, unknown>[]),
    sessions: base.sessions,
    workspaces: perWorkspace,
  };
}

/**
 * Erasure. Deletes the user row; memberships and every member-owned row
 * (training, progress, health, community, messages, points) cascade from it,
 * and the files are removed from storage. Audit entries keep only the id.
 * Trainers who own a workspace and platform admins go through support.
 */
export async function deleteMyAccount(actor: Actor, input: { password: string }, meta: RequestMeta) {
  await enforceRateLimit("account_change_user", actor.userId);
  if (actor.isPlatformAdmin) throw new AppError("FORBIDDEN", "Contas de administrador são removidas pelo suporte.");
  const [u] = await db().select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.userId));
  if (!u) throw Errors.notFound();
  if (!(await verifyPassword(u.hash, input.password))) throw Errors.validation({ password: ["Senha incorreta."] });

  const [owned] = await withTenant({ userId: actor.userId }, (tx) => tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerUserId, actor.userId)).limit(1));
  if (owned) {
    throw new AppError(
      "CONFLICT",
      "Você é dono de uma consultoria. Para excluir sua conta, fale com o suporte: precisamos encerrar a consultoria e avisar seus alunos antes.",
    );
  }

  const keys = await withTenant({ userId: actor.userId }, async (tx) => {
    const r = await tx.execute<{ app_own_storage_keys: string }>(sql`select app_own_storage_keys()`);
    const files = r.rows.map((x) => x.app_own_storage_keys);
    const memberships = await tx.select({ id: workspaceMembers.id, ws: workspaceMembers.workspaceId }).from(workspaceMembers).where(eq(workspaceMembers.userId, actor.userId));
    for (const m of memberships) {
      await audit(tx, { action: "privacy.account_deleted", actorUserId: actor.userId, workspaceId: m.ws, targetType: "member", targetId: m.id, ipHash: meta.ipHash });
    }
    if (memberships.length === 0) await audit(tx, { action: "privacy.account_deleted", actorUserId: actor.userId, targetType: "user", targetId: actor.userId, ipHash: meta.ipHash });
    await tx.delete(users).where(eq(users.id, actor.userId));
    return files;
  });

  for (const key of keys) {
    await deleteObject(key).catch((err: unknown) => log.error("could not delete file of deleted account", errorFields(err)));
  }
  await recordSecurityEvent({ type: "privacy.account_deleted", severity: "info", ipHash: meta.ipHash, metadata: { files: keys.length } });
}
