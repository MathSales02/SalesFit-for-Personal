import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import type { DraftDay } from "@/lib/validation/programs";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import {
  exercises,
  programAssignments,
  programDays,
  programExercises,
  programs,
  programVersions,
  users,
  workspaceMembers,
} from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { notify } from "../notifications/service";

function scope(actor: Actor) {
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

async function loadProgram(tx: Tx, workspaceId: string, programId: string) {
  const [p] = await tx.select().from(programs).where(and(eq(programs.id, programId), eq(programs.workspaceId, workspaceId), isNull(programs.archivedAt)));
  if (!p) throw Errors.notFound();
  return p;
}

async function versionOf(tx: Tx, programId: string, status: "draft" | "published") {
  const [v] = await tx
    .select()
    .from(programVersions)
    .where(and(eq(programVersions.programId, programId), eq(programVersions.status, status)))
    .orderBy(desc(programVersions.number))
    .limit(1);
  return v ?? null;
}

export type ProgramContent = {
  days: {
    id: string;
    name: string;
    notes: string | null;
    exercises: {
      id: string;
      exerciseId: string;
      exerciseName: string;
      videoAssetId: string | null;
      instructions: string | null;
      variationExerciseId: string | null;
      variationName: string | null;
      sets: number;
      reps: string;
      load: string | null;
      restSeconds: number | null;
      tempo: string | null;
      notes: string | null;
    }[];
  }[];
};

/** Loads a version's days and exercises in two queries (no N+1). */
export async function loadContent(tx: Tx, versionId: string): Promise<ProgramContent> {
  const days = await tx.select().from(programDays).where(eq(programDays.versionId, versionId)).orderBy(asc(programDays.position));
  if (days.length === 0) return { days: [] };
  const variation = sql<string | null>`(select e2.name from exercises e2 where e2.id = ${programExercises.variationExerciseId})`;
  const rows = await tx
    .select({
      id: programExercises.id,
      dayId: programExercises.dayId,
      exerciseId: programExercises.exerciseId,
      exerciseName: exercises.name,
      videoAssetId: exercises.videoAssetId,
      instructions: exercises.instructions,
      variationExerciseId: programExercises.variationExerciseId,
      variationName: variation,
      sets: programExercises.sets,
      reps: programExercises.reps,
      load: programExercises.load,
      restSeconds: programExercises.restSeconds,
      tempo: programExercises.tempo,
      notes: programExercises.notes,
    })
    .from(programExercises)
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(eq(programExercises.versionId, versionId))
    .orderBy(asc(programExercises.position));
  return {
    days: days.map((d) => ({
      id: d.id,
      name: d.name,
      notes: d.notes,
      exercises: rows.filter((r) => r.dayId === d.id).map(({ dayId: _dayId, ...r }) => r),
    })),
  };
}

async function writeContent(tx: Tx, ids: { workspaceId: string; programId: string; versionId: string }, days: DraftDay[]) {
  // Every referenced exercise must be visible to this workspace (also enforced by a trigger).
  const exerciseIds = [...new Set(days.flatMap((d) => d.exercises.flatMap((e) => [e.exerciseId, e.variationExerciseId]).filter((x): x is string => !!x)))];
  if (exerciseIds.length) {
    const visible = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(inArray(exercises.id, exerciseIds), or(isNull(exercises.workspaceId), eq(exercises.workspaceId, ids.workspaceId))));
    if (visible.length !== exerciseIds.length) throw new AppError("VALIDATION", "Algum exercício escolhido não está disponível.");
  }
  for (const [dayPos, day] of days.entries()) {
    const [d] = await tx
      .insert(programDays)
      .values({ ...ids, position: dayPos, name: day.name, notes: day.notes })
      .returning({ id: programDays.id });
    if (day.exercises.length) {
      await tx.insert(programExercises).values(day.exercises.map((e, pos) => ({ ...ids, dayId: d!.id, position: pos, ...e })));
    }
  }
}

// ---------------------------------------------------------------------------
// Trainer: programs
// ---------------------------------------------------------------------------

export async function listPrograms(actor: Actor) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: programs.id,
        name: programs.name,
        isTemplate: programs.isTemplate,
        updatedAt: programs.updatedAt,
        publishedNumber: sql<number | null>`(select max(v.number) from program_versions v where v.program_id = ${programs.id} and v.status = 'published')`,
        hasDraft: sql<boolean>`exists (select 1 from program_versions v where v.program_id = ${programs.id} and v.status = 'draft')`,
        activeAssignments: sql<number>`(select count(*)::int from program_assignments a where a.program_id = ${programs.id} and a.status = 'active')`,
      })
      .from(programs)
      .where(and(eq(programs.workspaceId, m.workspaceId), isNull(programs.archivedAt)))
      .orderBy(desc(programs.isTemplate), asc(sql`lower(${programs.name})`))
      .limit(200);
    return rows;
  });
}

export async function createProgram(actor: Actor, input: { name: string; description: string | null; isTemplate: boolean }, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const [p] = await tx
      .insert(programs)
      .values({ workspaceId: m.workspaceId, name: input.name, description: input.description, isTemplate: input.isTemplate, createdByUserId: actor.userId })
      .returning({ id: programs.id });
    const [v] = await tx
      .insert(programVersions)
      .values({ workspaceId: m.workspaceId, programId: p!.id, number: 1, createdByUserId: actor.userId })
      .returning({ id: programVersions.id });
    await writeContent(tx, { workspaceId: m.workspaceId, programId: p!.id, versionId: v!.id }, [{ name: "Treino A", notes: null, exercises: [] }]);
    await audit(tx, { action: "programs.created", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: p!.id, ipHash: meta.ipHash });
    return p!.id;
  });
}

export async function updateProgramInfo(actor: Actor, programId: string, input: { name: string; description: string | null; isTemplate: boolean }, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    await tx.update(programs).set(input).where(eq(programs.id, programId));
    await audit(tx, { action: "programs.updated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, ipHash: meta.ipHash });
  });
}

/** Program page data: info, the latest published version, the draft (if any) and current assignments. */
export async function getProgram(actor: Actor, programId: string) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const p = await loadProgram(tx, m.workspaceId, programId);
    const published = await versionOf(tx, programId, "published");
    const draft = await versionOf(tx, programId, "draft");
    const assignments = await tx
      .select({
        id: programAssignments.id,
        memberId: programAssignments.memberId,
        displayName: users.displayName,
        startsOn: programAssignments.startsOn,
        endsOn: programAssignments.endsOn,
      })
      .from(programAssignments)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, programAssignments.memberId))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(programAssignments.programId, programId), eq(programAssignments.status, "active")))
      .orderBy(asc(users.displayName));
    return {
      program: p,
      published: published ? { number: published.number, publishedAt: published.publishedAt, content: await loadContent(tx, published.id) } : null,
      draft: draft ? { number: draft.number, content: await loadContent(tx, draft.id) } : null,
      assignments,
    };
  });
}

/** Opens a draft for editing: a copy of the latest published version. */
export async function startDraft(actor: Actor, programId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    if (await versionOf(tx, programId, "draft")) return;
    const published = await versionOf(tx, programId, "published");
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(${max(programVersions.number)}, 0) + 1` })
      .from(programVersions)
      .where(eq(programVersions.programId, programId));
    const [v] = await tx
      .insert(programVersions)
      .values({ workspaceId: m.workspaceId, programId, number: next, createdByUserId: actor.userId })
      .returning({ id: programVersions.id });
    const content = published ? await loadContent(tx, published.id) : { days: [] };
    await writeContent(tx, { workspaceId: m.workspaceId, programId, versionId: v!.id }, toDraftDays(content));
    await audit(tx, { action: "programs.draft_started", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, ipHash: meta.ipHash });
  });
}

function toDraftDays(content: ProgramContent): DraftDay[] {
  const days = content.days.map((d) => ({
    name: d.name,
    notes: d.notes,
    exercises: d.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      variationExerciseId: e.variationExerciseId,
      sets: e.sets,
      reps: e.reps,
      load: e.load,
      restSeconds: e.restSeconds,
      tempo: e.tempo,
      notes: e.notes,
    })),
  }));
  return days.length ? days : [{ name: "Treino A", notes: null, exercises: [] }];
}

/** Replaces the draft content. Only drafts can change; published versions are immutable. */
export async function saveDraft(actor: Actor, programId: string, days: DraftDay[], meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    const draft = await versionOf(tx, programId, "draft");
    if (!draft) throw new AppError("CONFLICT", "Não há rascunho aberto. Clique em Editar treino.");
    await tx.delete(programDays).where(eq(programDays.versionId, draft.id));
    await writeContent(tx, { workspaceId: m.workspaceId, programId, versionId: draft.id }, days);
    await tx.update(programs).set({ updatedAt: new Date() }).where(eq(programs.id, programId));
    await audit(tx, { action: "programs.draft_saved", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, ipHash: meta.ipHash });
  });
}

/** Publishes the draft as the new current version. Students see it on their next visit. */
export async function publishDraft(actor: Actor, programId: string, meta: RequestMeta): Promise<number> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    const draft = await versionOf(tx, programId, "draft");
    if (!draft) throw new AppError("CONFLICT", "Não há rascunho para publicar.");
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(programExercises).where(eq(programExercises.versionId, draft.id));
    if (n === 0) throw new AppError("VALIDATION", "Adicione pelo menos um exercício antes de publicar.");
    await tx.update(programVersions).set({ status: "published", publishedAt: new Date() }).where(eq(programVersions.id, draft.id));
    await audit(tx, { action: "programs.published", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, metadata: { version: draft.number }, ipHash: meta.ipHash });
    if (draft.number > 1) {
      const following = await tx
        .select({ memberId: programAssignments.memberId, name: programs.name })
        .from(programAssignments)
        .innerJoin(programs, eq(programs.id, programAssignments.programId))
        .where(and(eq(programAssignments.programId, programId), eq(programAssignments.status, "active")));
      await notify(
        tx,
        ctx,
        following.map((f) => ({
          recipientMemberId: f.memberId,
          type: "program_updated" as const,
          actorMemberId: m.memberId,
          targetId: programId,
          data: { programName: f.name, version: draft.number },
          dedupeKey: `program_updated:${programId}:${draft.number}`,
        })),
      );
    }
    return draft.number;
  });
}

export async function discardDraft(actor: Actor, programId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    if (!(await versionOf(tx, programId, "published"))) throw new AppError("CONFLICT", "Um programa novo precisa de rascunho. Publique-o ou arquive o programa.");
    await tx.delete(programVersions).where(and(eq(programVersions.programId, programId), eq(programVersions.status, "draft")));
    await audit(tx, { action: "programs.draft_discarded", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, ipHash: meta.ipHash });
  });
}

/** Copies a program (e.g. a template) into a new program whose draft holds the same content. */
export async function duplicateProgram(actor: Actor, programId: string, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const src = await loadProgram(tx, m.workspaceId, programId);
    const from = (await versionOf(tx, programId, "published")) ?? (await versionOf(tx, programId, "draft"));
    const content = from ? await loadContent(tx, from.id) : { days: [] };
    const [p] = await tx
      .insert(programs)
      .values({ workspaceId: m.workspaceId, name: `${src.name.slice(0, 70)} (cópia)`, description: src.description, isTemplate: false, createdByUserId: actor.userId })
      .returning({ id: programs.id });
    const [v] = await tx
      .insert(programVersions)
      .values({ workspaceId: m.workspaceId, programId: p!.id, number: 1, createdByUserId: actor.userId })
      .returning({ id: programVersions.id });
    await writeContent(tx, { workspaceId: m.workspaceId, programId: p!.id, versionId: v!.id }, toDraftDays(content));
    await audit(tx, { action: "programs.duplicated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: p!.id, metadata: { from: programId }, ipHash: meta.ipHash });
    return p!.id;
  });
}

/** Archiving ends active assignments; versions and history are kept. */
export async function archiveProgram(actor: Actor, programId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, programId);
    await tx
      .update(programAssignments)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(programAssignments.programId, programId), eq(programAssignments.status, "active")));
    await tx.update(programs).set({ archivedAt: new Date() }).where(eq(programs.id, programId));
    await audit(tx, { action: "programs.archived", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: programId, ipHash: meta.ipHash });
  });
}

// ---------------------------------------------------------------------------
// Trainer: assignments
// ---------------------------------------------------------------------------

/** Assigns a published program to students, replacing their current program. */
export async function assignProgram(
  actor: Actor,
  input: { programId: string; memberIds: string[]; startsOn: string; endsOn: string | null },
  meta: RequestMeta,
): Promise<number> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    await loadProgram(tx, m.workspaceId, input.programId);
    if (!(await versionOf(tx, input.programId, "published"))) throw new AppError("CONFLICT", "Publique o programa antes de atribuir.");
    const memberIds = [...new Set(input.memberIds)];
    const students = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(inArray(workspaceMembers.id, memberIds), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), eq(workspaceMembers.status, "active")));
    if (students.length !== memberIds.length) throw Errors.notFound();

    await tx
      .update(programAssignments)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(inArray(programAssignments.memberId, memberIds), eq(programAssignments.status, "active")));
    await tx.insert(programAssignments).values(
      memberIds.map((memberId) => ({
        workspaceId: m.workspaceId,
        programId: input.programId,
        memberId,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        createdByUserId: actor.userId,
      })),
    );
    await audit(tx, { action: "programs.assigned", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "program", targetId: input.programId, metadata: { members: memberIds.length }, ipHash: meta.ipHash });
    const [prog] = await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, input.programId));
    await notify(
      tx,
      ctx,
      memberIds.map((memberId) => ({
        recipientMemberId: memberId,
        type: "program_assigned" as const,
        actorMemberId: m.memberId,
        targetId: input.programId,
        data: { programName: prog?.name ?? "" },
        dedupeKey: `assigned:${input.programId}:${input.startsOn}`,
      })),
    );
    return memberIds.length;
  });
}

export async function endAssignment(actor: Actor, assignmentId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    const res = await tx
      .update(programAssignments)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(programAssignments.id, assignmentId), eq(programAssignments.workspaceId, m.workspaceId), eq(programAssignments.status, "active")))
      .returning({ id: programAssignments.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: "programs.assignment_ended", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "assignment", targetId: assignmentId, ipHash: meta.ipHash });
  });
}

/** Active students for the assignment picker. */
export async function assignableStudents(actor: Actor) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, (tx) =>
    tx
      .select({
        memberId: workspaceMembers.id,
        displayName: users.displayName,
        currentProgram: sql<string | null>`(select p.name from program_assignments a join programs p on p.id = a.program_id where a.member_id = ${workspaceMembers.id} and a.status = 'active')`,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), eq(workspaceMembers.status, "active")))
      .orderBy(asc(sql`lower(${users.displayName})`))
      .limit(500),
  );
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

/** The student's current program: latest published version of their active assignment. */
export async function getMyProgram(actor: Actor) {
  assertCan(actor, "training.read_own");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const [a] = await tx
      .select({ programId: programAssignments.programId, startsOn: programAssignments.startsOn, endsOn: programAssignments.endsOn })
      .from(programAssignments)
      .where(and(eq(programAssignments.memberId, m.memberId), eq(programAssignments.status, "active")));
    if (!a) return null;
    const [p] = await tx.select({ name: programs.name, description: programs.description }).from(programs).where(eq(programs.id, a.programId));
    const v = await versionOf(tx, a.programId, "published");
    if (!p || !v) return null;
    return { name: p.name, description: p.description, startsOn: a.startsOn, endsOn: a.endsOn, version: v.number, versionId: v.id, content: await loadContent(tx, v.id) };
  });
}
