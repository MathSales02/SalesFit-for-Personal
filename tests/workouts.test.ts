import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { personalRecords, programDays, workoutSessions, workoutSets } from "@/server/db/schema";
import { listExercises } from "@/server/exercises/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { assignProgram, createProgram, getProgram, publishDraft, saveDraft, startDraft } from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import {
  abandonSession,
  finishSession,
  getSessionView,
  getStudentTraining,
  listHistory,
  logSet,
  removeSet,
  startSession,
} from "@/server/workouts/service";
import { estimatedOneRepMax } from "@/lib/validation/workouts";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor) {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: "Aluno", password: PASSWORD }, meta())).token))!;
}
async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}
const presc = (exerciseId: string, sets = 3) => ({ exerciseId, variationExerciseId: null, sets, reps: "8-12", load: null, restSeconds: 90, tempo: null, notes: null });

/** Trainer, student and an assigned two-day program. */
async function setup() {
  const t = await trainer();
  const s = await studentOf(t);
  const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
  const remada = (await listExercises(t, { q: "Remada curvada com barra" }))[0]!.id;
  const agacha = (await listExercises(t, { q: "Agachamento livre" }))[0]!.id;
  const programId = await createProgram(t, { name: "Força", description: null, isTemplate: false }, meta());
  await saveDraft(t, programId, [
    { name: "A", notes: null, exercises: [presc(supino), presc(remada)] },
    { name: "B", notes: null, exercises: [presc(agacha)] },
  ], meta());
  await publishDraft(t, programId, meta());
  await assignProgram(t, { programId, memberIds: [s.membership!.memberId], startsOn: "2026-11-01", endsOn: null }, meta());
  const p = await getProgram(t, programId);
  const [dayA, dayB] = p.published!.content.days;
  return { t, s, programId, dayA: dayA!, dayB: dayB!, supino };
}

async function doWorkout(s: Actor, dayId: string, sets: { pe: string; ex: string; reps: number; load: number }[]) {
  const r = await startSession(s, dayId, meta());
  if (!("sessionId" in r)) throw new Error("conflict");
  const counter = new Map<string, number>();
  for (const x of sets) {
    const n = (counter.get(x.pe) ?? 0) + 1;
    counter.set(x.pe, n);
    await logSet(s, { sessionId: r.sessionId, programExerciseId: x.pe, exerciseId: x.ex, setNumber: n, reps: x.reps, loadKg: x.load });
  }
  return { sessionId: r.sessionId, summary: await finishSession(s, { sessionId: r.sessionId, effort: 7, notes: null }, meta()) };
}

describe("running a workout", () => {
  it("logs sets, finishes with a server-computed summary, and shows previous performance next time", async () => {
    const { s, dayA, supino } = await setup();
    const pe = dayA.exercises[0]!;
    const first = await doWorkout(s, dayA.id, [
      { pe: pe.id, ex: supino, reps: 10, load: 40 },
      { pe: pe.id, ex: supino, reps: 8, load: 45 },
    ]);
    expect(first.summary.totalSets).toBe(2);
    expect(first.summary.volumeKg).toBe(760);
    expect(first.summary.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(first.summary.records).toHaveLength(0); // the first time is a baseline

    const r = await startSession(s, dayA.id, meta());
    const view = await getSessionView(s, (r as { sessionId: string }).sessionId);
    expect(view.previous.get(supino)).toEqual([
      { setNumber: 1, reps: 10, loadKg: 40 },
      { setNumber: 2, reps: 8, loadKg: 45 },
    ]);
  });

  it("detects a personal record by estimated 1RM, once, and keeps finishing idempotent", async () => {
    const { s, dayA, supino } = await setup();
    const pe = dayA.exercises[0]!.id;
    await doWorkout(s, dayA.id, [{ pe, ex: supino, reps: 8, load: 50 }]);
    const second = await doWorkout(s, dayA.id, [{ pe, ex: supino, reps: 8, load: 55 }]);
    expect(second.summary.records).toEqual([{ exerciseName: "Supino reto com barra", reps: 8, loadKg: 55, e1rmKg: estimatedOneRepMax(55, 8), previousE1rmKg: estimatedOneRepMax(50, 8) }]);

    const again = await finishSession(s, { sessionId: second.sessionId, effort: 3, notes: "outra" }, meta());
    expect(again.records).toHaveLength(1);
    expect(again.effort).toBe(7);
  });

  it("only one open workout at a time; starting another day reports the open one", async () => {
    const { s, dayA, dayB } = await setup();
    const a = await startSession(s, dayA.id, meta());
    expect(await startSession(s, dayA.id, meta())).toEqual(a);
    const b = await startSession(s, dayB.id, meta());
    expect(b).toMatchObject({ conflict: { dayName: "A" } });
    const replaced = await startSession(s, dayB.id, meta(), { replaceOpen: true });
    expect("sessionId" in replaced).toBe(true);
  });

  it("an empty workout cannot be completed; it can be abandoned and then accepts no sets", async () => {
    const { s, dayA, supino } = await setup();
    const r = (await startSession(s, dayA.id, meta())) as { sessionId: string };
    expect(await code(finishSession(s, { sessionId: r.sessionId, effort: null, notes: null }, meta()))).toBe("VALIDATION");
    await abandonSession(s, r.sessionId, meta());
    expect(await code(logSet(s, { sessionId: r.sessionId, programExerciseId: dayA.exercises[0]!.id, exerciseId: supino, setNumber: 1, reps: 5, loadKg: 20 }))).toBe("CONFLICT");
  });

  it("history lists completed workouts only", async () => {
    const { s, dayA, supino } = await setup();
    await doWorkout(s, dayA.id, [{ pe: dayA.exercises[0]!.id, ex: supino, reps: 5, load: 30 }]);
    const open = (await startSession(s, dayA.id, meta())) as { sessionId: string };
    const history = await listHistory(s);
    expect(history).toHaveLength(1);
    expect(history.some((h) => h.id === open.sessionId)).toBe(false);
  });
});

describe("workout integrity and anti-manipulation", () => {
  it("cannot log an exercise from another day or an unrelated exercise", async () => {
    const { s, dayA, dayB } = await setup();
    const r = (await startSession(s, dayA.id, meta())) as { sessionId: string };
    const agachaPe = dayB.exercises[0]!;
    expect(await code(logSet(s, { sessionId: r.sessionId, programExerciseId: agachaPe.id, exerciseId: agachaPe.exerciseId, setNumber: 1, reps: 5, loadKg: 60 }))).toBe("NOT_FOUND");
    const pe = dayA.exercises[0]!;
    expect(await code(logSet(s, { sessionId: r.sessionId, programExerciseId: pe.id, exerciseId: agachaPe.exerciseId, setNumber: 1, reps: 5, loadKg: 60 }))).toBe("NOT_FOUND");
  });

  it("students cannot write records, mark sets as records, or alter finished workouts directly", async () => {
    const { s, dayA, supino } = await setup();
    const { sessionId } = await doWorkout(s, dayA.id, [{ pe: dayA.exercises[0]!.id, ex: supino, reps: 5, load: 30 }]);
    const ctx = { userId: s.userId, workspaceId: s.membership!.workspaceId };
    const [set] = await withTenant(ctx, (tx) => tx.select().from(workoutSets).where(eq(workoutSets.sessionId, sessionId)));

    expect(
      await code(
        withTenant(ctx, (tx) =>
          tx.insert(personalRecords).values({ workspaceId: ctx.workspaceId, memberId: s.membership!.memberId, exerciseId: supino, sessionId, setId: set!.id, reps: 5, loadKg: 999, e1rmKg: 999 }),
        ),
      ),
    ).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(workoutSets).set({ isPersonalRecord: true }).where(eq(workoutSets.id, set!.id))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(workoutSets).set({ loadKg: 500 }).where(eq(workoutSets.id, set!.id))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(workoutSessions).set({ durationSeconds: 1 }).where(eq(workoutSessions.id, sessionId))))).toBe("42501");
  });

  it("completion time and duration come from the database clock, not the client", async () => {
    const { s, dayA } = await setup();
    const r = (await startSession(s, dayA.id, meta())) as { sessionId: string };
    const ctx = { userId: s.userId, workspaceId: s.membership!.workspaceId };
    // A student trying to finish the session directly with a fake duration:
    await withTenant(ctx, (tx) => tx.update(workoutSessions).set({ status: "abandoned", durationSeconds: 9999, completedAt: new Date("2020-01-01") }).where(eq(workoutSessions.id, r.sessionId)));
    const [row] = await withTenant(ctx, (tx) => tx.select().from(workoutSessions).where(eq(workoutSessions.id, r.sessionId)));
    expect(row!.durationSeconds).toBeLessThan(60);
    expect(row!.completedAt!.getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it("a session cannot start on a program that is not assigned, nor on a draft", async () => {
    const { t, s, programId } = await setup();
    const other = await createProgram(t, { name: "Outro", description: null, isTemplate: false }, meta());
    const p = await getProgram(t, other);
    expect(await code(startSession(s, p.draft!.content.days[0]!.id, meta()))).toBe("NOT_FOUND");
    await startDraft(t, programId, meta());
    const draftDay = (await getProgram(t, programId)).draft!.content.days[0]!;
    expect(await code(startSession(s, draftDay.id, meta()))).toBe("NOT_FOUND");
    // Bypassing the service with a direct insert on the draft day is refused by the database.
    const [row] = await withTenant({ userId: t.userId, workspaceId: t.membership!.workspaceId }, (tx) =>
      tx.select().from(programDays).where(eq(programDays.id, draftDay.id)),
    );
    const direct = await code(
      withTenant({ userId: s.userId, workspaceId: s.membership!.workspaceId }, (tx) =>
        tx.insert(workoutSessions).values({ workspaceId: row!.workspaceId, memberId: s.membership!.memberId, programId: row!.programId, versionId: row!.versionId, dayId: row!.id }),
      ),
    );
    expect(direct).toBe("42501");
  });

  it("Student B cannot read or touch Student A's workout; trainers read but cannot write", async () => {
    const { t, s, dayA, supino } = await setup();
    const other = await studentOf(t);
    const { sessionId } = await doWorkout(s, dayA.id, [{ pe: dayA.exercises[0]!.id, ex: supino, reps: 5, load: 30 }]);
    expect(await code(getSessionView(other, sessionId))).toBe("NOT_FOUND");
    expect(await code(abandonSession(other, sessionId, meta()))).toBe("NOT_FOUND");
    const seen = await withTenant({ userId: other.userId, workspaceId: other.membership!.workspaceId }, (tx) => tx.select().from(workoutSessions));
    expect(seen).toHaveLength(0);
    expect(await code(startSession(t, dayA.id, meta()))).toBe("FORBIDDEN");

    const overview = await getStudentTraining(t, s.membership!.memberId);
    expect(overview.recentSessions).toHaveLength(1);
    expect(overview.weeks.reduce((a, w) => a + w.sessions, 0)).toBe(1);
    expect(overview.daysSinceLastWorkout).toBe(0);
    const b = await trainer();
    expect(await code(getStudentTraining(b, s.membership!.memberId))).toBe("NOT_FOUND");
  });

  it("removing a set works only while the workout is open", async () => {
    const { s, dayA, supino } = await setup();
    const pe = dayA.exercises[0]!.id;
    const r = (await startSession(s, dayA.id, meta())) as { sessionId: string };
    await logSet(s, { sessionId: r.sessionId, programExerciseId: pe, exerciseId: supino, setNumber: 1, reps: 5, loadKg: 30 });
    await logSet(s, { sessionId: r.sessionId, programExerciseId: pe, exerciseId: supino, setNumber: 2, reps: 5, loadKg: 30 });
    await removeSet(s, { sessionId: r.sessionId, programExerciseId: pe, setNumber: 2 });
    const summary = await finishSession(s, { sessionId: r.sessionId, effort: null, notes: null }, meta());
    expect(summary.totalSets).toBe(1);
    expect(await code(removeSet(s, { sessionId: r.sessionId, programExerciseId: pe, setNumber: 1 }))).toBe("CONFLICT");
  });
});
