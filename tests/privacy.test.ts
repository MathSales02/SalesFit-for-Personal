import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { activeSupportGrant, closeSupportAccess, getSupportOverview, listSupportAccessForTrainer, openSupportAccess } from "@/server/admin/support";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { addComment, createPost, listFeed, toggleLike } from "@/server/community/service";
import { closeDb, db } from "@/server/db/client";
import { withSystem, withTenant } from "@/server/db/context";
import { auditLogs, competitions, supportAccessGrants, users, workoutSessions, workoutSets } from "@/server/db/schema";
import { listExercises } from "@/server/exercises/service";
import { closeCompetition, createCompetition, manualCheckin, setParticipation } from "@/server/gamification/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { openConversation, sendMessage } from "@/server/messaging/service";
import { deleteMyAccount, exportMyData } from "@/server/privacy/service";
import { assignProgram, createProgram, getProgram, publishDraft, saveDraft } from "@/server/programs/service";
import { addOwnMeasurement } from "@/server/progress/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { listStudents, setHealthConsent, updateOwnHealth } from "@/server/students/students";
import { finishSession, logSet, startSession } from "@/server/workouts/service";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor, name = "Aluno") {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: name, password: PASSWORD }, meta())).token))!;
}
const mid = (a: Actor) => a.membership!.memberId;

/** A student with data in every area: training, health, progress, community, messages, points, a closed competition. */
async function busyStudent() {
  const t = await trainer();
  const s = await studentOf(t, "Bia Souza");
  const other = await studentOf(t, "Caio Lima");

  const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
  const programId = await createProgram(t, { name: "Base", description: null, isTemplate: false }, meta());
  await saveDraft(t, programId, [{ name: "A", notes: null, exercises: [{ exerciseId: supino, variationExerciseId: null, sets: 1, reps: "8", load: null, restSeconds: 60, tempo: null, notes: null }] }], meta());
  await publishDraft(t, programId, meta());
  await assignProgram(t, { programId, memberIds: [mid(s)], startsOn: "2026-11-01", endsOn: null }, meta());
  const day = (await getProgram(t, programId)).published!.content.days[0]!;
  const r = (await startSession(s, day.id, meta())) as { sessionId: string };
  await logSet(s, { sessionId: r.sessionId, programExerciseId: day.exercises[0]!.id, exerciseId: supino, setNumber: 1, reps: 8, loadKg: 40 });
  await finishSession(s, { sessionId: r.sessionId, effort: 6, notes: null }, meta());

  await setHealthConsent(s, true, meta());
  await updateOwnHealth(s, { restrictions: "Joelho", injuries: null, medicalNotes: null }, meta());
  await addOwnMeasurement(s, { measuredOn: "2026-11-01", weightKg: 70, bodyFatPct: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, notes: null }, meta());

  const post = await createPost(s, { body: "Treino feito!", imageAssetId: null, announcement: false }, meta());
  const otherPost = await createPost(other, { body: "Bora", imageAssetId: null, announcement: false }, meta());
  await toggleLike(s, otherPost.postId);
  await addComment(s, { postId: otherPost.postId, parentCommentId: null, body: "Boa!" }, meta());
  await toggleLike(other, post.postId);

  const conv = await openConversation(s, mid(t));
  await sendMessage(s, { conversationId: conv, body: "Oi, treinador", imageAssetId: null }, meta());
  await sendMessage(t, { conversationId: conv, body: "Oi, Bia", imageAssetId: null }, meta());

  // A competition the student joined, then closed (frozen history).
  const compId = await createCompetition(t, { title: "Desafio", description: null, prize: null, startsOn: "2026-11-01", endsOn: "2026-12-31" }, meta());
  await setParticipation(s, compId, true);
  await manualCheckin(other, null, meta()).catch(() => undefined);
  await withSystem({ userId: t.userId, workspaceId: t.membership!.workspaceId }, (tx) =>
    tx.execute(sql`update competitions set starts_on = '2020-01-01', ends_on = '2020-01-31' where id = ${compId}`),
  );
  await closeCompetition(t, compId, meta());

  return { t, s, other, otherPostId: otherPost.postId, sessionId: r.sessionId };
}

describe("data export", () => {
  it("contains the user's own data and no secrets", async () => {
    const { s } = await busyStudent();
    const data = await exportMyData(s, meta());
    const text = JSON.stringify(data);
    expect(data.account.email).toBe(s.email);
    const ws = data.workspaces[0]! as unknown as Record<string, unknown[]>;
    expect(ws.workoutSessions).toHaveLength(1);
    expect(ws.workoutSets).toHaveLength(1);
    expect(ws.healthRecord).toHaveLength(1);
    expect(ws.bodyMeasurements).toHaveLength(1);
    expect(ws.posts).toHaveLength(1);
    expect(ws.comments).toHaveLength(1);
    expect(ws.messagesSent).toHaveLength(1);
    expect(text).toContain("Oi, treinador");
    expect(text).not.toContain("Oi, Bia"); // the trainer's words are not the student's data
    expect(text).not.toMatch(/password|argon2|token_hash|storage_key|storageKey/i);
  });
});

describe("account deletion", () => {
  it("requires the password and refuses workspace owners", async () => {
    const { t, s } = await busyStudent();
    await expect(deleteMyAccount(s, { password: "wrong-password-123" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteMyAccount(t, { password: PASSWORD }, meta())).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("erases the student and everything they own, keeping others' data consistent", async () => {
    const { t, s, other, otherPostId, sessionId } = await busyStudent();
    await deleteMyAccount(s, { password: PASSWORD }, meta());

    expect(await db().select().from(users).where(eq(users.id, s.userId))).toEqual([]);
    await expect(loginAs(s.email)).rejects.toThrow(AppError);

    const leftovers = await withSystem({ userId: t.userId, workspaceId: t.membership!.workspaceId }, async (tx) => ({
      sessions: await tx.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId)),
      sets: await tx.select().from(workoutSets).where(eq(workoutSets.sessionId, sessionId)),
    }));
    expect(leftovers.sessions).toEqual([]);
    expect(leftovers.sets).toEqual([]);

    // The trainer no longer lists the student; the other student's post lost the like and the comment.
    expect((await listStudents(t, { status: "active", page: 1 })).rows.map((r) => r.memberId)).toEqual([mid(other)]);
    const feed = await listFeed(other, { scope: "all", cursor: null });
    const p = feed.posts.find((x) => x.id === otherPostId)!;
    expect(p.likeCount).toBe(0);
    expect(p.commentCount).toBe(0);

    // The closed competition keeps its frozen result (names included) for the others.
    const [c] = await withTenant({ userId: t.userId, workspaceId: t.membership!.workspaceId }, (tx) => tx.select().from(competitions).where(eq(competitions.workspaceId, t.membership!.workspaceId)));
    expect(c!.closedAt).not.toBeNull();

    // An audit trail remains with ids only.
    const trail = await withTenant({ userId: t.userId, workspaceId: t.membership!.workspaceId }, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.action, "privacy.account_deleted")));
    expect(trail.some((a) => a.actorUserId === s.userId)).toBe(true);
  });
});

describe("break-glass support access", () => {
  const reason = "Treinador relatou que os treinos não aparecem para os alunos (chamado 123).";
  const adminOf = async (): Promise<Actor> => ({ ...(await trainer()), isPlatformAdmin: true, membership: null });

  it("needs an open grant, is read-only and minimal, and is visible to the trainer", async () => {
    const { t, s } = await busyStudent();
    const ws = t.membership!.workspaceId;
    const admin = await adminOf();
    const other = await adminOf();

    await expect(openSupportAccess(t, ws, { reason, minutes: 15 }, meta())).rejects.toThrow(AppError);
    await expect(getSupportOverview(admin, ws, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });

    await openSupportAccess(admin, ws, { reason, minutes: 15 }, meta());
    const mail = [...testOutbox].reverse().find((m) => m.to === t.email)!;
    expect(mail.subject).toBe("Acesso de suporte à sua consultoria");
    expect(mail.text).toContain(reason);
    await expect(openSupportAccess(admin, ws, { reason, minutes: 15 }, meta())).rejects.toMatchObject({ code: "CONFLICT" });

    const view = await getSupportOverview(admin, ws, meta());
    expect(view.students.map((x) => x.name).sort()).toEqual(["Bia Souza", "Caio Lima"]);
    expect(view.students.find((x) => x.name === "Bia Souza")!.workouts30d).toBe(1);
    expect(view.programs[0]!.name).toBe("Base");
    const text = JSON.stringify(view);
    expect(text).not.toContain("Joelho"); // health
    expect(text).not.toContain("Oi, treinador"); // messages
    expect(text).not.toContain(s.email); // contact data

    // The grant belongs to one admin only.
    await expect(getSupportOverview(other, ws, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });

    const seen = await listSupportAccessForTrainer(t);
    expect(seen[0]!.reason).toBe(reason);

    await closeSupportAccess(admin, ws, meta());
    await expect(getSupportOverview(admin, ws, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await activeSupportGrant(admin, ws)).toBeNull();
  });

  it("the database refuses long, unexplained or edited grants", async () => {
    const t = await trainer();
    const ws = t.membership!.workspaceId;
    const admin = await adminOf();
    const insert = (r: string, hours: number) =>
      withTenant({ userId: admin.userId, isPlatformAdmin: true }, (tx) =>
        tx.insert(supportAccessGrants).values({ workspaceId: ws, adminUserId: admin.userId, reason: r, expiresAt: new Date(Date.now() + hours * 3600_000) }),
      );
    await expect(insert("curto", 1)).rejects.toThrow();
    await expect(insert(reason, 3)).rejects.toThrow();
    // Someone else cannot open a grant in an admin's name.
    await expect(
      withTenant({ userId: t.userId, isPlatformAdmin: true }, (tx) => tx.insert(supportAccessGrants).values({ workspaceId: ws, adminUserId: admin.userId, reason, expiresAt: new Date(Date.now() + 600_000) })),
    ).rejects.toThrow();
    await openSupportAccess(admin, ws, { reason, minutes: 15 }, meta());
    await expect(
      withTenant({ userId: admin.userId, isPlatformAdmin: true }, (tx) => tx.update(supportAccessGrants).set({ expiresAt: new Date(Date.now() + 3600_000) }).where(eq(supportAccessGrants.workspaceId, ws))),
    ).rejects.toThrow();
    // A trainer cannot open or extend grants.
    await expect(withTenant({ userId: t.userId, workspaceId: ws }, (tx) => tx.update(supportAccessGrants).set({ revokedAt: new Date() }).where(eq(supportAccessGrants.workspaceId, ws)))).resolves.toBeDefined();
    expect(await activeSupportGrant(admin, ws)).not.toBeNull();
  });
});
