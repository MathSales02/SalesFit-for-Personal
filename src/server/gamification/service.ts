import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { setTenantContext, withTenant, type DbContext } from "../db/context";
import type { Tx } from "../db/client";
import {
  checkins,
  competitionParticipants,
  competitions,
  gamificationSettings,
  pointsLedger,
  rankingPreferences,
  studentProfiles,
  workspaceMembers,
} from "../db/schema";
import { assertCan, assertFeature, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";

/**
 * Consistency scoring. Rules:
 * - at most one check-in per student per local day (workout or manual);
 * - a completed workout is worth more than a manual check-in, and upgrades a
 *   manual check-in made the same day (only the difference is awarded);
 * - a weekly bonus when the student reaches their weekly training target;
 * - every award goes through the append-only ledger with an idempotency key,
 *   written only from the system context, so nothing is ever counted twice and
 *   clients cannot grant themselves points.
 * Days are local to Brazil (America/Sao_Paulo).
 */

export type GamificationSettings = {
  rankingEnabled: boolean;
  manualCheckinsEnabled: boolean;
  workoutPoints: number;
  manualCheckinPoints: number;
  weeklyGoalPoints: number;
};
const DEFAULTS: GamificationSettings = { rankingEnabled: true, manualCheckinsEnabled: true, workoutPoints: 10, manualCheckinPoints: 3, weeklyGoalPoints: 20 };
const DEFAULT_WEEKLY_TARGET = 3;

async function readSettings(tx: Tx, workspaceId: string): Promise<GamificationSettings> {
  const [s] = await tx
    .select({
      rankingEnabled: gamificationSettings.rankingEnabled,
      manualCheckinsEnabled: gamificationSettings.manualCheckinsEnabled,
      workoutPoints: gamificationSettings.workoutPoints,
      manualCheckinPoints: gamificationSettings.manualCheckinPoints,
      weeklyGoalPoints: gamificationSettings.weeklyGoalPoints,
    })
    .from(gamificationSettings)
    .where(eq(gamificationSettings.workspaceId, workspaceId));
  return s ?? DEFAULTS;
}

/** Today and the start of this week/month, in Brazil, computed by the database clock. */
async function localDates(tx: Tx) {
  const r = await tx.execute<{ today: string; week: string; month: string }>(sql`
    select (now() at time zone 'America/Sao_Paulo')::date::text as today,
           date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date::text as week,
           date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date::text as month`);
  return r.rows[0]!;
}

async function award(
  tx: Tx,
  e: { workspaceId: string; memberId: string; points: number; reason: (typeof pointsLedger.$inferInsert)["reason"]; occurredOn: string; key: string; referenceId?: string | null; note?: string | null; by?: string | null },
) {
  if (e.points === 0) return false;
  const res = await tx
    .insert(pointsLedger)
    .values({
      workspaceId: e.workspaceId,
      memberId: e.memberId,
      points: e.points,
      reason: e.reason,
      occurredOn: e.occurredOn,
      idempotencyKey: e.key,
      referenceId: e.referenceId ?? null,
      note: e.note ?? null,
      createdByUserId: e.by ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: pointsLedger.id });
  return res.length > 0;
}

async function weeklyGoalCheck(tx: Tx, workspaceId: string, memberId: string, s: GamificationSettings) {
  const d = await localDates(tx);
  const [p] = await tx.select({ target: studentProfiles.weeklyFrequency }).from(studentProfiles).where(eq(studentProfiles.memberId, memberId));
  const target = p?.target ?? DEFAULT_WEEKLY_TARGET;
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(checkins)
    .where(and(eq(checkins.memberId, memberId), sql`${checkins.day} between ${d.week}::date and ${d.today}::date`));
  if (n >= target) {
    await award(tx, { workspaceId, memberId, points: s.weeklyGoalPoints, reason: "weekly_goal", occurredOn: d.today, key: `weekly_goal:${memberId}:${d.week}` });
  }
}

/**
 * Called inside finishSession's transaction after a workout is completed.
 * Runs in the system context and restores the caller's context afterwards.
 */
export async function recordWorkoutCheckin(tx: Tx, ctx: DbContext, input: { workspaceId: string; memberId: string; sessionId: string }) {
  await setTenantContext(tx, { ...ctx, isSystem: true });
  try {
    const s = await readSettings(tx, input.workspaceId);
    const d = await localDates(tx);
    const [existing] = await tx.select().from(checkins).where(and(eq(checkins.memberId, input.memberId), eq(checkins.day, d.today)));
    if (!existing) {
      await tx.insert(checkins).values({ workspaceId: input.workspaceId, memberId: input.memberId, day: d.today, source: "workout", sessionId: input.sessionId });
      await award(tx, { workspaceId: input.workspaceId, memberId: input.memberId, points: s.workoutPoints, reason: "checkin_workout", occurredOn: d.today, key: `checkin:${input.memberId}:${d.today}`, referenceId: input.sessionId });
    } else if (existing.source === "manual") {
      await tx.update(checkins).set({ source: "workout", sessionId: input.sessionId }).where(eq(checkins.id, existing.id));
      await award(tx, {
        workspaceId: input.workspaceId,
        memberId: input.memberId,
        points: s.workoutPoints - s.manualCheckinPoints,
        reason: "checkin_upgrade",
        occurredOn: d.today,
        key: `checkin_upgrade:${input.memberId}:${d.today}`,
        referenceId: input.sessionId,
      });
    }
    // A second workout on the same day earns nothing more: consistency, not volume.
    await weeklyGoalCheck(tx, input.workspaceId, input.memberId, s);
  } finally {
    await setTenantContext(tx, ctx);
  }
}

function studentScope(actor: Actor) {
  assertCan(actor, "training.log_own");
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

/** Manual check-in for training outside the program (run, class…). Today only, once a day. */
export async function manualCheckin(actor: Actor, activity: string | null, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  await enforceRateLimit("challenge_join_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    const s = await readSettings(tx, m.workspaceId);
    if (!s.manualCheckinsEnabled) throw new AppError("FORBIDDEN", "Seu treinador desativou o check-in manual. Conclua um treino do programa para marcar o dia.");
    await setTenantContext(tx, { ...ctx, isSystem: true });
    const d = await localDates(tx);
    const inserted = await tx
      .insert(checkins)
      .values({ workspaceId: m.workspaceId, memberId: m.memberId, day: d.today, source: "manual", activity })
      .onConflictDoNothing()
      .returning({ id: checkins.id });
    if (inserted.length === 0) throw new AppError("CONFLICT", "Você já fez check-in hoje.");
    await award(tx, { workspaceId: m.workspaceId, memberId: m.memberId, points: s.manualCheckinPoints, reason: "checkin_manual", occurredOn: d.today, key: `checkin:${m.memberId}:${d.today}`, referenceId: inserted[0]!.id });
    await weeklyGoalCheck(tx, m.workspaceId, m.memberId, s);
    await setTenantContext(tx, ctx);
    await audit(tx, { action: "gamification.manual_checkin", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "checkin", targetId: inserted[0]!.id, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

export type RankingPeriod = "week" | "month" | "all";
export type RankingRow = { position: number; memberId: string; name: string; points: number; checkins: number; hidden: boolean; isMe: boolean };

async function rankingIn(tx: Tx, myMemberId: string, from: string, to: string, competitionId: string | null): Promise<RankingRow[]> {
  const r = await tx.execute<{ member_id: string; name: string; points: string; checkins: string; hidden: boolean }>(
    sql`select * from app_ranking(${from}::date, ${to}::date, ${competitionId}::uuid)`,
  );
  const rows = r.rows
    .map((x) => ({ memberId: x.member_id, name: x.name, points: Number(x.points), checkins: Number(x.checkins), hidden: x.hidden }))
    .sort((a, b) => b.points - a.points || b.checkins - a.checkins || a.name.localeCompare(b.name, "pt-BR"));
  let position = 0;
  let prev: { points: number; checkins: number } | null = null;
  return rows.map((row, i) => {
    if (!prev || prev.points !== row.points || prev.checkins !== row.checkins) position = i + 1;
    prev = row;
    return { ...row, position, isMe: row.memberId === myMemberId };
  });
}

function periodRange(d: { today: string; week: string; month: string }, period: RankingPeriod) {
  return period === "week" ? { from: d.week, to: d.today } : period === "month" ? { from: d.month, to: d.today } : { from: "2000-01-01", to: d.today };
}

export async function getRanking(actor: Actor, period: RankingPeriod) {
  assertCan(actor, "community.read");
  assertFeature(actor, "ranking");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const s = await readSettings(tx, m.workspaceId);
    if (!s.rankingEnabled && m.role !== "trainer") return { enabled: false, rows: [] as RankingRow[] };
    const d = await localDates(tx);
    const { from, to } = periodRange(d, period);
    return { enabled: s.rankingEnabled, rows: await rankingIn(tx, m.memberId, from, to, null) };
  });
}

/** The student's own numbers for the home screen. */
export async function getMyGamification(actor: Actor) {
  const { m, ctx } = studentScope(actor);
  return withTenant(ctx, async (tx) => {
    const s = await readSettings(tx, m.workspaceId);
    const d = await localDates(tx);
    const [today] = await tx.select({ source: checkins.source }).from(checkins).where(and(eq(checkins.memberId, m.memberId), eq(checkins.day, d.today)));
    const [p] = await tx.select({ target: studentProfiles.weeklyFrequency }).from(studentProfiles).where(eq(studentProfiles.memberId, m.memberId));
    const sum = (from: string) =>
      tx
        .select({ n: sql<number>`coalesce(sum(${pointsLedger.points}), 0)::int` })
        .from(pointsLedger)
        .where(and(eq(pointsLedger.memberId, m.memberId), sql`${pointsLedger.occurredOn} between ${from}::date and ${d.today}::date`))
        .then((r) => r[0]?.n ?? 0);
    const [{ n: weekCheckins } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(checkins)
      .where(and(eq(checkins.memberId, m.memberId), sql`${checkins.day} between ${d.week}::date and ${d.today}::date`));
    // Days with a check-in in the last 4 weeks (for the home charts).
    const recent = await tx
      .select({ day: checkins.day, source: checkins.source })
      .from(checkins)
      .where(and(eq(checkins.memberId, m.memberId), sql`${checkins.day} > ${d.today}::date - 28`))
      .orderBy(checkins.day);
    // Streak: consecutive weeks (ending this week or last week) in which the weekly goal was reached.
    const goalWeeks = await tx
      .select({ key: pointsLedger.idempotencyKey })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.memberId, m.memberId), eq(pointsLedger.reason, "weekly_goal")));
    const weeks = new Set(goalWeeks.map((g) => g.key.split(":").pop()!));
    let streak = 0;
    const cursor = new Date(`${d.week}T12:00:00Z`);
    if (!weeks.has(d.week)) cursor.setUTCDate(cursor.getUTCDate() - 7);
    while (weeks.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 7);
    }
    const ranking = s.rankingEnabled ? await rankingIn(tx, m.memberId, d.week, d.today, null) : [];
    const [pref] = await tx.select({ hidden: rankingPreferences.hidden }).from(rankingPreferences).where(eq(rankingPreferences.memberId, m.memberId));
    return {
      settings: s,
      checkedInToday: today?.source ?? null,
      weekPoints: await sum(d.week),
      monthPoints: await sum(d.month),
      totalPoints: await sum("2000-01-01"),
      weekCheckins,
      weeklyTarget: p?.target ?? DEFAULT_WEEKLY_TARGET,
      streakWeeks: streak,
      weekPosition: ranking.find((r) => r.isMe)?.position ?? null,
      weekParticipants: ranking.length,
      hidden: pref?.hidden ?? false,
      today: d.today,
      weekStart: d.week,
      recentCheckins: recent.map((c) => ({ day: String(c.day), source: c.source })),
    };
  });
}

export async function setRankingHidden(actor: Actor, hidden: boolean) {
  const { m, ctx } = studentScope(actor);
  await withTenant(ctx, (tx) =>
    tx
      .insert(rankingPreferences)
      .values({ memberId: m.memberId, workspaceId: m.workspaceId, hidden })
      .onConflictDoUpdate({ target: rankingPreferences.memberId, set: { hidden, updatedAt: new Date() } }),
  );
}

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

export async function getGamificationSettings(actor: Actor) {
  assertCan(actor, "gamification.configure");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) => readSettings(tx, m.workspaceId));
}

export async function updateGamificationSettings(actor: Actor, input: GamificationSettings, meta: RequestMeta) {
  assertCan(actor, "gamification.configure");
  const m = requireMembership(actor);
  if (input.manualCheckinPoints > input.workoutPoints) throw Errors.validation({ manualCheckinPoints: ["O check-in manual não pode valer mais que um treino concluído."] });
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    await tx
      .insert(gamificationSettings)
      .values({ workspaceId: m.workspaceId, ...input })
      .onConflictDoUpdate({ target: gamificationSettings.workspaceId, set: { ...input, updatedAt: new Date() } });
    await audit(tx, { action: "gamification.settings_updated", actorUserId: actor.userId, workspaceId: m.workspaceId, metadata: { ...input }, ipHash: meta.ipHash });
  });
}

/** Manual correction by the trainer (e.g. a cheat), always with a reason and audited. */
export async function adjustPoints(actor: Actor, input: { memberId: string; points: number; note: string }, meta: RequestMeta) {
  assertCan(actor, "gamification.configure");
  const m = requireMembership(actor);
  const ctx = { userId: actor.userId, workspaceId: m.workspaceId };
  await withTenant(ctx, async (tx) => {
    const [student] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student")));
    if (!student) throw Errors.notFound();
    const d = await localDates(tx);
    const id = randomUUID();
    await setTenantContext(tx, { ...ctx, isSystem: true });
    await award(tx, { workspaceId: m.workspaceId, memberId: input.memberId, points: input.points, reason: "adjustment", occurredOn: d.today, key: `adjust:${id}`, note: input.note, by: actor.userId });
    await setTenantContext(tx, ctx);
    await audit(tx, { action: "gamification.points_adjusted", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: input.memberId, metadata: { points: input.points, note: input.note }, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

export type CompetitionStatus = "upcoming" | "active" | "ended" | "closed" | "cancelled";

function statusOf(c: typeof competitions.$inferSelect, today: string): CompetitionStatus {
  if (c.cancelledAt) return "cancelled";
  if (c.closedAt) return "closed";
  if (today < c.startsOn) return "upcoming";
  if (today > c.endsOn) return "ended";
  return "active";
}

export async function listCompetitions(actor: Actor) {
  assertCan(actor, "community.read");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const d = await localDates(tx);
    const rows = await tx
      .select({
        c: competitions,
        participants: sql<number>`(select count(*)::int from competition_participants p where p.competition_id = ${competitions.id})`,
        joined: sql<boolean>`exists (select 1 from competition_participants p where p.competition_id = ${competitions.id} and p.member_id = ${m.memberId}::uuid)`,
      })
      .from(competitions)
      .where(eq(competitions.workspaceId, m.workspaceId))
      .orderBy(desc(competitions.endsOn))
      .limit(50);
    return rows.map((r) => ({ ...r.c, status: statusOf(r.c, d.today), participants: r.participants, joined: r.joined }));
  });
}

export async function getCompetition(actor: Actor, competitionId: string) {
  assertCan(actor, "community.read");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [c] = await tx.select().from(competitions).where(and(eq(competitions.id, competitionId), eq(competitions.workspaceId, m.workspaceId)));
    if (!c) throw Errors.notFound();
    const d = await localDates(tx);
    const [joined] = await tx
      .select({ id: competitionParticipants.memberId })
      .from(competitionParticipants)
      .where(and(eq(competitionParticipants.competitionId, c.id), eq(competitionParticipants.memberId, m.memberId)));
    const to = d.today < c.endsOn ? d.today : c.endsOn;
    const ranking = c.results ? null : d.today < c.startsOn ? [] : await rankingIn(tx, m.memberId, c.startsOn, to, c.id);
    return { competition: c, status: statusOf(c, d.today), joined: !!joined, ranking, results: c.results };
  });
}

export async function createCompetition(
  actor: Actor,
  input: { title: string; description: string | null; prize: string | null; startsOn: string; endsOn: string },
  meta: RequestMeta,
) {
  assertCan(actor, "challenges.manage");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const d = await localDates(tx);
    if (input.endsOn < d.today) throw Errors.validation({ endsOn: ["A competição não pode terminar no passado."] });
    const [c] = await tx
      .insert(competitions)
      .values({ workspaceId: m.workspaceId, ...input, createdByUserId: actor.userId })
      .returning({ id: competitions.id });
    await audit(tx, { action: "gamification.competition_created", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "competition", targetId: c!.id, ipHash: meta.ipHash });
    return c!.id;
  });
}

export async function setParticipation(actor: Actor, competitionId: string, join: boolean) {
  assertCan(actor, "challenges.join");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  await enforceRateLimit("challenge_join_user", actor.userId);
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [c] = await tx.select({ id: competitions.id }).from(competitions).where(and(eq(competitions.id, competitionId), eq(competitions.workspaceId, m.workspaceId)));
    if (!c) throw Errors.notFound();
    if (join) {
      await tx.insert(competitionParticipants).values({ competitionId, memberId: m.memberId, workspaceId: m.workspaceId }).onConflictDoNothing();
    } else {
      await tx.delete(competitionParticipants).where(and(eq(competitionParticipants.competitionId, competitionId), eq(competitionParticipants.memberId, m.memberId)));
    }
  });
}

/** After the end date the trainer closes it: the final ranking is frozen as the official result. */
export async function closeCompetition(actor: Actor, competitionId: string, meta: RequestMeta) {
  assertCan(actor, "challenges.manage");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [c] = await tx.select().from(competitions).where(and(eq(competitions.id, competitionId), eq(competitions.workspaceId, m.workspaceId)));
    if (!c) throw Errors.notFound();
    const d = await localDates(tx);
    if (d.today <= c.endsOn) throw new AppError("CONFLICT", "A competição só pode ser encerrada depois da data final.");
    const ranking = await rankingIn(tx, m.memberId, c.startsOn, c.endsOn, c.id);
    const results = ranking.map((r) => ({ memberId: r.memberId, name: r.name, points: r.points, position: r.position }));
    await tx.update(competitions).set({ results, closedAt: new Date() }).where(eq(competitions.id, c.id));
    await audit(tx, { action: "gamification.competition_closed", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "competition", targetId: c.id, metadata: { participants: results.length }, ipHash: meta.ipHash });
  });
}

export async function cancelCompetition(actor: Actor, competitionId: string, meta: RequestMeta) {
  assertCan(actor, "challenges.manage");
  assertFeature(actor, "competitions");
  const m = requireMembership(actor);
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const res = await tx
      .update(competitions)
      .set({ cancelledAt: new Date() })
      .where(and(eq(competitions.id, competitionId), eq(competitions.workspaceId, m.workspaceId)))
      .returning({ id: competitions.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: "gamification.competition_cancelled", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "competition", targetId: competitionId, ipHash: meta.ipHash });
  });
}

/** Ledger entries of one student, for the trainer's audit view. */
export async function memberLedger(actor: Actor, memberId: string) {
  assertCan(actor, "gamification.configure");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) =>
    tx
      .select({ id: pointsLedger.id, points: pointsLedger.points, reason: pointsLedger.reason, occurredOn: pointsLedger.occurredOn, note: pointsLedger.note })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.memberId, memberId), eq(pointsLedger.workspaceId, m.workspaceId)))
      .orderBy(desc(pointsLedger.createdAt))
      .limit(100),
  );
}

