import "server-only";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { estimatedOneRepMax } from "@/lib/validation/workouts";
import { setTenantContext, withTenant } from "../db/context";
import type { Tx } from "../db/client";
import {
  exercises,
  personalRecords,
  programAssignments,
  programDays,
  programExercises,
  programs,
  programVersions,
  users,
  workoutSessions,
  workoutSets,
  workspaceMembers,
} from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { loadContent, type ProgramContent } from "../programs/service";
import { recordWorkoutCheckin } from "../gamification/service";

function studentScope(actor: Actor) {
  assertCan(actor, "training.log_own");
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

async function loadOwnSession(tx: Tx, memberId: string, sessionId: string) {
  const [s] = await tx.select().from(workoutSessions).where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.memberId, memberId)));
  if (!s) throw Errors.notFound();
  return s;
}

// ---------------------------------------------------------------------------
// Running a workout
// ---------------------------------------------------------------------------

export type StartResult = { sessionId: string } | { conflict: { sessionId: string; dayName: string } };

/**
 * Starts a workout on a day of the student's current program (latest published
 * version). If a workout is already open, returns it instead of opening a second one.
 */
export async function startSession(actor: Actor, dayId: string, meta: RequestMeta, opts: { replaceOpen?: boolean } = {}): Promise<StartResult> {
  const { m, ctx } = studentScope(actor);
  await enforceRateLimit("workout_log_user", actor.userId);
  return withTenant(ctx, async (tx) => {
    const [day] = await tx
      .select({ id: programDays.id, versionId: programDays.versionId, programId: programDays.programId, name: programDays.name })
      .from(programDays)
      .innerJoin(programAssignments, and(eq(programAssignments.programId, programDays.programId), eq(programAssignments.memberId, m.memberId), eq(programAssignments.status, "active")))
      .innerJoin(programVersions, and(eq(programVersions.id, programDays.versionId), eq(programVersions.status, "published")))
      .where(eq(programDays.id, dayId));
    if (!day) throw Errors.notFound();
    const [latest] = await tx
      .select({ id: programVersions.id })
      .from(programVersions)
      .where(and(eq(programVersions.programId, day.programId), eq(programVersions.status, "published")))
      .orderBy(desc(programVersions.number))
      .limit(1);
    if (latest?.id !== day.versionId) throw new AppError("CONFLICT", "Seu treino foi atualizado. Recarregue a página para ver a versão nova.");

    const [open] = await tx
      .select({ id: workoutSessions.id, dayId: workoutSessions.dayId, dayName: programDays.name })
      .from(workoutSessions)
      .innerJoin(programDays, eq(programDays.id, workoutSessions.dayId))
      .where(and(eq(workoutSessions.memberId, m.memberId), eq(workoutSessions.status, "in_progress")));
    if (open) {
      if (open.dayId === dayId) return { sessionId: open.id };
      if (!opts.replaceOpen) return { conflict: { sessionId: open.id, dayName: open.dayName } };
      await tx.update(workoutSessions).set({ status: "abandoned" }).where(eq(workoutSessions.id, open.id));
    }

    const [s] = await tx
      .insert(workoutSessions)
      .values({ workspaceId: m.workspaceId, memberId: m.memberId, programId: day.programId, versionId: day.versionId, dayId })
      .returning({ id: workoutSessions.id });
    await audit(tx, { action: "workouts.started", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "session", targetId: s!.id, ipHash: meta.ipHash });
    return { sessionId: s!.id };
  });
}

export type PreviousSet = { setNumber: number; reps: number; loadKg: number | null };

/** Everything the workout player needs, in a fixed number of queries. */
export async function getSessionView(actor: Actor, sessionId: string) {
  const { m, ctx } = studentScope(actor);
  return withTenant(ctx, async (tx) => {
    const s = await loadOwnSession(tx, m.memberId, sessionId);
    const content: ProgramContent = await loadContent(tx, s.versionId);
    const day = content.days.find((d) => d.id === s.dayId);
    if (!day) throw Errors.notFound();
    const [program] = await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, s.programId));

    const sets = await tx
      .select({ programExerciseId: workoutSets.programExerciseId, exerciseId: workoutSets.exerciseId, setNumber: workoutSets.setNumber, reps: workoutSets.reps, loadKg: workoutSets.loadKg, isPersonalRecord: workoutSets.isPersonalRecord })
      .from(workoutSets)
      .where(eq(workoutSets.sessionId, sessionId));

    const exerciseIds = day.exercises.flatMap((e) => [e.exerciseId, e.variationExerciseId]).filter((x): x is string => !!x);
    return { session: s, programName: program?.name ?? "", day, sets, previous: await previousPerformance(tx, m.memberId, exerciseIds, sessionId) };
  });
}

/** Sets from the most recent completed session in which each exercise was done. */
async function previousPerformance(tx: Tx, memberId: string, exerciseIds: string[], excludeSessionId: string) {
  const out = new Map<string, PreviousSet[]>();
  if (exerciseIds.length === 0) return out;
  const rows = await tx
    .select({ exerciseId: workoutSets.exerciseId, sessionId: workoutSets.sessionId, setNumber: workoutSets.setNumber, reps: workoutSets.reps, loadKg: workoutSets.loadKg })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
    .where(and(eq(workoutSets.memberId, memberId), inArray(workoutSets.exerciseId, [...new Set(exerciseIds)]), eq(workoutSessions.status, "completed"), ne(workoutSessions.id, excludeSessionId)))
    .orderBy(desc(workoutSessions.startedAt), workoutSets.setNumber)
    .limit(400);
  const sessionFor = new Map<string, string>();
  for (const r of rows) {
    if (!sessionFor.has(r.exerciseId)) sessionFor.set(r.exerciseId, r.sessionId);
    if (sessionFor.get(r.exerciseId) !== r.sessionId) continue;
    const list = out.get(r.exerciseId) ?? [];
    list.push({ setNumber: r.setNumber, reps: r.reps, loadKg: r.loadKg });
    out.set(r.exerciseId, list);
  }
  return out;
}

export async function logSet(
  actor: Actor,
  input: { sessionId: string; programExerciseId: string; exerciseId: string; setNumber: number; reps: number; loadKg: number | null },
) {
  const { m, ctx } = studentScope(actor);
  await enforceRateLimit("workout_log_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    const s = await loadOwnSession(tx, m.memberId, input.sessionId);
    if (s.status !== "in_progress") throw new AppError("CONFLICT", "Este treino já foi encerrado.");
    const [pe] = await tx
      .select({ exerciseId: programExercises.exerciseId, variationExerciseId: programExercises.variationExerciseId, sets: programExercises.sets })
      .from(programExercises)
      .where(and(eq(programExercises.id, input.programExerciseId), eq(programExercises.dayId, s.dayId)));
    if (!pe) throw Errors.notFound();
    if (input.exerciseId !== pe.exerciseId && input.exerciseId !== pe.variationExerciseId) throw Errors.notFound();
    if (input.setNumber > pe.sets + 5) throw new AppError("VALIDATION", "Séries demais para este exercício.");

    const values = { reps: input.reps, loadKg: input.loadKg, exerciseId: input.exerciseId, loggedAt: new Date() };
    await tx
      .insert(workoutSets)
      .values({ workspaceId: m.workspaceId, memberId: m.memberId, sessionId: s.id, programExerciseId: input.programExerciseId, setNumber: input.setNumber, ...values })
      .onConflictDoUpdate({ target: [workoutSets.sessionId, workoutSets.programExerciseId, workoutSets.setNumber], set: values });
  });
}

export async function removeSet(actor: Actor, input: { sessionId: string; programExerciseId: string; setNumber: number }) {
  const { m, ctx } = studentScope(actor);
  await enforceRateLimit("workout_log_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    const s = await loadOwnSession(tx, m.memberId, input.sessionId);
    if (s.status !== "in_progress") throw new AppError("CONFLICT", "Este treino já foi encerrado.");
    await tx
      .delete(workoutSets)
      .where(and(eq(workoutSets.sessionId, s.id), eq(workoutSets.programExerciseId, input.programExerciseId), eq(workoutSets.setNumber, input.setNumber)));
  });
}

export type SessionSummary = {
  sessionId: string;
  dayName: string;
  programName: string;
  completedAt: Date | null;
  durationSeconds: number | null;
  effort: number | null;
  notes: string | null;
  totalSets: number;
  totalReps: number;
  volumeKg: number;
  exercisesDone: number;
  exercisesPlanned: number;
  records: { exerciseName: string; reps: number; loadKg: number; e1rmKg: number; previousE1rmKg: number | null }[];
};

/**
 * Finishes a workout. Idempotent: finishing twice returns the same summary and
 * never creates duplicate records. Duration and completion time come from the
 * database clock; personal records are computed here, in the trusted system
 * context, from sets stored on the server.
 */
export async function finishSession(actor: Actor, input: { sessionId: string; effort: number | null; notes: string | null }, meta: RequestMeta): Promise<SessionSummary> {
  const { m, ctx } = studentScope(actor);
  await withTenant(ctx, async (tx) => {
    const [s] = await tx
      .select()
      .from(workoutSessions)
      .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.memberId, m.memberId)))
      .for("update");
    if (!s) throw Errors.notFound();
    if (s.status === "completed") return;
    if (s.status === "abandoned") throw new AppError("CONFLICT", "Este treino foi abandonado.");
    const sets = await tx.select().from(workoutSets).where(eq(workoutSets.sessionId, s.id));
    if (sets.length === 0) throw new AppError("VALIDATION", "Registre pelo menos uma série antes de concluir, ou abandone o treino.");

    // Records first (sets can only change while the session is open), in the
    // system context so students can never write them directly.
    await setTenantContext(tx, { ...ctx, isSystem: true });
    await detectRecords(tx, { workspaceId: m.workspaceId, memberId: m.memberId, sessionId: s.id }, sets);
    await setTenantContext(tx, ctx);

    await tx.update(workoutSessions).set({ status: "completed", effort: input.effort, notes: input.notes }).where(eq(workoutSessions.id, s.id));
    // Same transaction: the check-in and its points exist only if the workout was really completed.
    await recordWorkoutCheckin(tx, ctx, { workspaceId: m.workspaceId, memberId: m.memberId, sessionId: s.id });
    await audit(tx, { action: "workouts.completed", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "session", targetId: s.id, metadata: { sets: sets.length }, ipHash: meta.ipHash });
  });
  return getSessionSummary(actor, input.sessionId);
}

async function detectRecords(tx: Tx, ids: { workspaceId: string; memberId: string; sessionId: string }, sets: (typeof workoutSets.$inferSelect)[]) {
  const best = new Map<string, { set: (typeof sets)[number]; e1rm: number }>();
  for (const st of sets) {
    const e1rm = estimatedOneRepMax(st.loadKg ?? 0, st.reps);
    if (e1rm <= 0) continue;
    const cur = best.get(st.exerciseId);
    if (!cur || e1rm > cur.e1rm) best.set(st.exerciseId, { set: st, e1rm });
  }
  if (best.size === 0) return;

  const history = await tx
    .select({ exerciseId: workoutSets.exerciseId, reps: workoutSets.reps, loadKg: workoutSets.loadKg })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
    .where(and(eq(workoutSets.memberId, ids.memberId), inArray(workoutSets.exerciseId, [...best.keys()]), eq(workoutSessions.status, "completed"), ne(workoutSessions.id, ids.sessionId)));
  const previousBest = new Map<string, number>();
  for (const h of history) {
    const e = estimatedOneRepMax(h.loadKg ?? 0, h.reps);
    if (e > (previousBest.get(h.exerciseId) ?? 0)) previousBest.set(h.exerciseId, e);
  }

  for (const [exerciseId, { set, e1rm }] of best) {
    const prev = previousBest.get(exerciseId);
    // The first time an exercise is logged is a baseline, not a record.
    if (prev === undefined || e1rm <= prev) continue;
    const inserted = await tx
      .insert(personalRecords)
      .values({ ...ids, exerciseId, setId: set.id, reps: set.reps, loadKg: set.loadKg ?? 0, e1rmKg: e1rm, previousE1rmKg: prev })
      .onConflictDoNothing()
      .returning({ id: personalRecords.id });
    if (inserted.length) await tx.update(workoutSets).set({ isPersonalRecord: true }).where(eq(workoutSets.id, set.id));
  }
}

export async function getSessionSummary(actor: Actor, sessionId: string): Promise<SessionSummary> {
  const { m, ctx } = studentScope(actor);
  return withTenant(ctx, (tx) => buildSummary(tx, m.memberId, sessionId));
}

async function buildSummary(tx: Tx, memberId: string, sessionId: string): Promise<SessionSummary> {
  const s = await loadOwnSession(tx, memberId, sessionId);
  const [day] = await tx.select({ name: programDays.name }).from(programDays).where(eq(programDays.id, s.dayId));
  const [program] = await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, s.programId));
  const sets = await tx.select().from(workoutSets).where(eq(workoutSets.sessionId, sessionId));
  const [{ planned } = { planned: 0 }] = await tx.select({ planned: sql<number>`count(*)::int` }).from(programExercises).where(eq(programExercises.dayId, s.dayId));
  const records = await tx
    .select({ exerciseName: exercises.name, reps: personalRecords.reps, loadKg: personalRecords.loadKg, e1rmKg: personalRecords.e1rmKg, previousE1rmKg: personalRecords.previousE1rmKg })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(eq(personalRecords.sessionId, sessionId));
  return {
    sessionId,
    dayName: day?.name ?? "",
    programName: program?.name ?? "",
    completedAt: s.completedAt,
    durationSeconds: s.durationSeconds,
    effort: s.effort,
    notes: s.notes,
    totalSets: sets.length,
    totalReps: sets.reduce((a, x) => a + x.reps, 0),
    volumeKg: Math.round(sets.reduce((a, x) => a + x.reps * (x.loadKg ?? 0), 0)),
    exercisesDone: new Set(sets.map((x) => x.programExerciseId)).size,
    exercisesPlanned: planned,
    records,
  };
}

export async function abandonSession(actor: Actor, sessionId: string, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  await withTenant(ctx, async (tx) => {
    const s = await loadOwnSession(tx, m.memberId, sessionId);
    if (s.status !== "in_progress") return;
    await tx.update(workoutSessions).set({ status: "abandoned" }).where(eq(workoutSessions.id, s.id));
    await audit(tx, { action: "workouts.abandoned", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "session", targetId: s.id, ipHash: meta.ipHash });
  });
}

/** Open workout (if any), so the home screen can offer to resume it. */
export async function getOpenSession(actor: Actor) {
  const { m, ctx } = studentScope(actor);
  return withTenant(ctx, async (tx) => {
    const [s] = await tx
      .select({ id: workoutSessions.id, dayName: programDays.name, startedAt: workoutSessions.startedAt })
      .from(workoutSessions)
      .innerJoin(programDays, eq(programDays.id, workoutSessions.dayId))
      .where(and(eq(workoutSessions.memberId, m.memberId), eq(workoutSessions.status, "in_progress")));
    return s ?? null;
  });
}

export const HISTORY_PAGE = 20;

/** Completed workouts, newest first, keyset-paginated by start time. */
export async function listHistory(actor: Actor, before?: Date) {
  const { m, ctx } = studentScope(actor);
  return withTenant(ctx, (tx) => sessionList(tx, m.memberId, before, HISTORY_PAGE));
}

async function sessionList(tx: Tx, memberId: string, before: Date | undefined, limit: number) {
  return tx
    .select({
      id: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      durationSeconds: workoutSessions.durationSeconds,
      effort: workoutSessions.effort,
      dayName: programDays.name,
      sets: sql<number>`(select count(*)::int from workout_sets ws where ws.session_id = ${workoutSessions.id})`,
      records: sql<number>`(select count(*)::int from personal_records pr where pr.session_id = ${workoutSessions.id})`,
    })
    .from(workoutSessions)
    .innerJoin(programDays, eq(programDays.id, workoutSessions.dayId))
    .where(and(eq(workoutSessions.memberId, memberId), eq(workoutSessions.status, "completed"), before ? lt(workoutSessions.startedAt, before) : undefined))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Trainer view of a student's training
// ---------------------------------------------------------------------------

export type TrainingOverview = {
  currentProgram: { name: string; startsOn: string } | null;
  weeks: { weekStart: string; sessions: number }[];
  recentSessions: Awaited<ReturnType<typeof sessionList>>;
  recentRecords: { exerciseName: string; reps: number; loadKg: number; e1rmKg: number; achievedAt: Date }[];
  daysSinceLastWorkout: number | null;
};

/** Consistency, recent workouts and records of one student, for their trainer. */
export async function getStudentTraining(actor: Actor, memberId: string): Promise<TrainingOverview> {
  assertCan(actor, "students.read");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [member] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student")));
    if (!member) throw Errors.notFound();
    return trainingOverview(tx, memberId);
  });
}

export async function trainingOverview(tx: Tx, memberId: string): Promise<TrainingOverview> {
  const [current] = await tx
    .select({ name: programs.name, startsOn: programAssignments.startsOn })
    .from(programAssignments)
    .innerJoin(programs, eq(programs.id, programAssignments.programId))
    .where(and(eq(programAssignments.memberId, memberId), eq(programAssignments.status, "active")));

  const since = new Date(Date.now() - 8 * 7 * 86_400_000);
  const weekRows = await tx
    .select({
      weekStart: sql<string>`to_char(date_trunc('week', ${workoutSessions.startedAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')`,
      sessions: sql<number>`count(*)::int`,
    })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.memberId, memberId), eq(workoutSessions.status, "completed"), gte(workoutSessions.startedAt, since)))
    .groupBy(sql`1`);
  const byWeek = new Map(weekRows.map((w) => [w.weekStart, w.sessions]));
  const weeks: TrainingOverview["weeks"] = [];
  const monday = new Date();
  monday.setUTCHours(12, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * 86_400_000).toISOString().slice(0, 10);
    weeks.push({ weekStart: d, sessions: byWeek.get(d) ?? 0 });
  }

  const recentSessions = await sessionList(tx, memberId, undefined, 10);
  const recentRecords = await tx
    .select({ exerciseName: exercises.name, reps: personalRecords.reps, loadKg: personalRecords.loadKg, e1rmKg: personalRecords.e1rmKg, achievedAt: personalRecords.achievedAt })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .where(eq(personalRecords.memberId, memberId))
    .orderBy(desc(personalRecords.achievedAt))
    .limit(10);
  const last = recentSessions[0]?.startedAt;
  return {
    currentProgram: current ?? null,
    weeks,
    recentSessions,
    recentRecords,
    daysSinceLastWorkout: last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null,
  };
}

/** Display name of a student, used in trainer pages. */
export async function memberName(tx: Tx, memberId: string) {
  const [u] = await tx.select({ name: users.displayName }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.id, memberId));
  return u?.name ?? "";
}
