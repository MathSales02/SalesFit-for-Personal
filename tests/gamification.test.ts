import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { checkins, competitions, pointsLedger } from "@/server/db/schema";
import { listExercises } from "@/server/exercises/service";
import {
  adjustPoints,
  closeCompetition,
  createCompetition,
  getCompetition,
  getMyGamification,
  getRanking,
  manualCheckin,
  setParticipation,
  setRankingHidden,
  updateGamificationSettings,
} from "@/server/gamification/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { assignProgram, createProgram, getProgram, publishDraft, saveDraft } from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { updateStudentProfile } from "@/server/students/students";
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
async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}
const mid = (a: Actor) => a.membership!.memberId;
const ctxOf = (a: Actor) => ({ userId: a.userId, workspaceId: a.membership!.workspaceId });
const DEFAULTS = { rankingEnabled: true, manualCheckinsEnabled: true, workoutPoints: 10, manualCheckinPoints: 3, weeklyGoalPoints: 20 };

/** Trainer with a published program assigned to the given students. */
async function withProgram(t: Actor, students: Actor[]) {
  const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
  const programId = await createProgram(t, { name: "Base", description: null, isTemplate: false }, meta());
  await saveDraft(t, programId, [{ name: "A", notes: null, exercises: [{ exerciseId: supino, variationExerciseId: null, sets: 1, reps: "8", load: null, restSeconds: 60, tempo: null, notes: null }] }], meta());
  await publishDraft(t, programId, meta());
  await assignProgram(t, { programId, memberIds: students.map(mid), startsOn: "2026-11-01", endsOn: null }, meta());
  const day = (await getProgram(t, programId)).published!.content.days[0]!;
  return async (s: Actor) => {
    const r = (await startSession(s, day.id, meta())) as { sessionId: string };
    await logSet(s, { sessionId: r.sessionId, programExerciseId: day.exercises[0]!.id, exerciseId: supino, setNumber: 1, reps: 8, loadKg: 40 });
    return finishSession(s, { sessionId: r.sessionId, effort: 6, notes: null }, meta());
  };
}

const total = async (s: Actor) => (await getMyGamification(s)).totalPoints;

describe("check-ins and points", () => {
  it("a completed workout checks in once a day; a second workout the same day earns nothing more", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const workout = await withProgram(t, [s]);
    await workout(s);
    expect(await total(s)).toBe(10);
    await workout(s);
    expect(await total(s)).toBe(10);
    const me = await getMyGamification(s);
    expect(me.checkedInToday).toBe("workout");
  });

  it("manual check-in once a day; a workout later the same day upgrades it (only the difference is added)", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const workout = await withProgram(t, [s]);
    await manualCheckin(s, "Corrida", meta());
    expect(await total(s)).toBe(3);
    expect(await code(manualCheckin(s, "Corrida de novo", meta()))).toBe("CONFLICT");
    await workout(s);
    expect(await total(s)).toBe(10);
    const rows = await withTenant(ctxOf(s), (tx) => tx.select().from(checkins).where(eq(checkins.memberId, mid(s))));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("workout");
  });

  it("after a workout, a manual check-in the same day is refused", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const workout = await withProgram(t, [s]);
    await workout(s);
    expect(await code(manualCheckin(s, null, meta()))).toBe("CONFLICT");
  });

  it("the weekly goal bonus is awarded once when the target is reached", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    await updateStudentProfile(t, { memberId: mid(s), goal: null, fitnessLevel: null, weeklyFrequency: 1, trainerNotes: null }, meta());
    await manualCheckin(s, null, meta());
    const me = await getMyGamification(s);
    expect(me.totalPoints).toBe(3 + 20);
    expect(me.weekCheckins).toBe(1);
    expect(me.streakWeeks).toBe(1);
  });

  it("the trainer can turn manual check-ins off and change the values", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    await updateGamificationSettings(t, { ...DEFAULTS, manualCheckinsEnabled: false }, meta());
    expect(await code(manualCheckin(s, null, meta()))).toBe("FORBIDDEN");
    expect(await code(updateGamificationSettings(t, { ...DEFAULTS, manualCheckinPoints: 50, workoutPoints: 10 }, meta()))).toBe("VALIDATION");
    expect(await code(updateGamificationSettings(s, DEFAULTS, meta()))).toBe("FORBIDDEN");
  });
});

describe("anti-manipulation", () => {
  it("students cannot create, change or delete points or check-ins, nor backdate them", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    await manualCheckin(s, null, meta());
    const ctx = ctxOf(s);
    expect(
      await code(withTenant(ctx, (tx) => tx.insert(pointsLedger).values({ workspaceId: ctx.workspaceId, memberId: mid(s), points: 999, reason: "adjustment", occurredOn: "2026-11-01", idempotencyKey: "hack" }))),
    ).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(pointsLedger).set({ points: 999 }).where(eq(pointsLedger.memberId, mid(s)))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.delete(pointsLedger).where(eq(pointsLedger.memberId, mid(s)))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.insert(checkins).values({ workspaceId: ctx.workspaceId, memberId: mid(s), day: "2026-10-01", source: "manual" })))).toBe("42501");
    expect(await total(s)).toBe(3);
  });

  it("students cannot adjust points; the trainer's adjustment needs a student of their own and is ledgered", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    expect(await code(adjustPoints(s, { memberId: mid(s), points: 100, note: "eu mereço" }, meta()))).toBe("FORBIDDEN");
    const other = await studentOf(await trainer());
    expect(await code(adjustPoints(t, { memberId: mid(other), points: 5, note: "x" }, meta()))).toBe("NOT_FOUND");
    await adjustPoints(t, { memberId: mid(s), points: -2, note: "check-in indevido" }, meta());
    expect(await total(s)).toBe(-2);
  });
});

describe("rankings", () => {
  it("ranks by points then check-ins; hidden students vanish for others but see themselves; the trainer sees all", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const c = await studentOf(t, "Caio");
    const workout = await withProgram(t, [a, b]);
    await workout(a);
    await manualCheckin(b, null, meta());

    const r = await getRanking(c, "week");
    expect(r.rows.map((x) => [x.name, x.points, x.position])).toEqual([
      ["Ana", 10, 1],
      ["Beto", 3, 2],
      ["Caio", 0, 3],
    ]);

    await setRankingHidden(a, true);
    expect((await getRanking(c, "week")).rows.map((x) => x.name)).toEqual(["Beto", "Caio"]);
    expect((await getRanking(a, "week")).rows.find((x) => x.isMe)?.position).toBe(1);
    const forTrainer = await getRanking(t, "month");
    expect(forTrainer.rows.find((x) => x.name === "Ana")?.hidden).toBe(true);
  });

  it("rankings never cross workspaces, and can be turned off for students", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    await manualCheckin(a, null, meta());
    const outsider = await studentOf(await trainer(), "Zé");
    expect((await getRanking(outsider, "all")).rows.map((x) => x.name)).toEqual(["Zé"]);
    const direct = await withTenant({ ...ctxOf(outsider), workspaceId: a.membership!.workspaceId }, (tx) => tx.execute(sql`select * from app_ranking('2000-01-01', '2100-01-01', null)`));
    expect(direct.rows).toHaveLength(0);
    await updateGamificationSettings(t, { ...DEFAULTS, rankingEnabled: false }, meta());
    expect((await getRanking(a, "week")).enabled).toBe(false);
  });
});

describe("competitions", () => {
  it("only participants are ranked; the prize is optional; results freeze when closed", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const id = await createCompetition(t, { title: "Desafio de novembro", description: null, prize: null, startsOn: "2026-11-01", endsOn: "2026-11-30" > today ? "2026-11-30" : today }, meta());
    await setParticipation(a, id, true);
    await manualCheckin(a, null, meta());
    await manualCheckin(b, null, meta());
    const view = await getCompetition(b, id);
    expect(view.ranking?.map((r) => r.name)).toEqual(["Ana"]);
    expect(view.competition.prize).toBeNull();

    // Trainers cannot join; closing before the end is refused.
    expect(await code(setParticipation(t, id, true))).toBe("FORBIDDEN");
    expect(await code(closeCompetition(t, id, meta()))).toBe("CONFLICT");

    // Simulate the period being over (owner-level fixture change), then close.
    await withTenant(ctxOf(t), (tx) => tx.update(competitions).set({ startsOn: "2026-01-01", endsOn: "2026-01-31" }).where(eq(competitions.id, id)));
    await closeCompetition(t, id, meta());
    const closed = await getCompetition(a, id);
    // Participants are listed even with zero points in the period (no points inside January).
    expect(closed.results).toEqual([{ memberId: mid(a), name: "Ana", points: 0, position: 1 }]);
    expect(await code(withTenant(ctxOf(t), (tx) => tx.update(competitions).set({ results: [{ memberId: mid(a), name: "Ana", points: 999, position: 1 }] }).where(eq(competitions.id, id))))).toBe("42501");
    expect(await code(setParticipation(b, id, true))).toBe("42501");
  });

  it("students cannot create competitions; outsiders cannot see them", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    expect(await code(createCompetition(a, { title: "Meu desafio", description: null, prize: "tudo", startsOn: "2026-11-01", endsOn: "2026-12-01" }, meta()))).toBe("FORBIDDEN");
    const id = await createCompetition(t, { title: "Desafio", description: null, prize: "Camiseta", startsOn: "2026-11-01", endsOn: "2026-12-31" }, meta());
    const outsider = await studentOf(await trainer());
    expect(await code(getCompetition(outsider, id))).toBe("NOT_FOUND");
    expect(await code(setParticipation(outsider, id, true))).toBe("NOT_FOUND");
  });
});
