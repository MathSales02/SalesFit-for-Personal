import "server-only";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { MuscleGroup } from "@/lib/validation/exercises";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { exercises, mediaAssets } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { deleteObject } from "../storage/s3";

export type ExerciseInput = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  description: string | null;
  instructions: string | null;
};

function scope(actor: Actor) {
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

const duplicateName = () => new AppError("CONFLICT", "Você já tem um exercício com esse nome.");
const isUniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string } }).cause?.code === "23505" || (err as { code?: string }).code === "23505";

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listExercises(actor: Actor, opts: { q: string; group?: MuscleGroup }) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  if (opts.q) await enforceRateLimit("search_user", actor.userId);
  return withTenant(ctx, (tx) =>
    tx
      .select({
        id: exercises.id,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        equipment: exercises.equipment,
        own: sql<boolean>`${exercises.workspaceId} is not null`,
        hasVideo: sql<boolean>`${exercises.videoAssetId} is not null`,
      })
      .from(exercises)
      .where(
        and(
          or(isNull(exercises.workspaceId), eq(exercises.workspaceId, m.workspaceId)),
          isNull(exercises.archivedAt),
          opts.q ? ilike(exercises.name, likePattern(opts.q)) : undefined,
          opts.group ? eq(exercises.muscleGroup, opts.group) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${exercises.name})`))
      .limit(300),
  );
}

async function loadVisible(tx: Tx, workspaceId: string, exerciseId: string) {
  const [e] = await tx
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), or(isNull(exercises.workspaceId), eq(exercises.workspaceId, workspaceId)), isNull(exercises.archivedAt)));
  if (!e) throw Errors.notFound();
  return e;
}

async function loadOwn(tx: Tx, workspaceId: string, exerciseId: string) {
  const e = await loadVisible(tx, workspaceId, exerciseId);
  if (e.workspaceId !== workspaceId) throw new AppError("FORBIDDEN", "Exercícios da biblioteca Cadência não podem ser editados. Faça uma cópia.");
  return e;
}

export async function getExercise(actor: Actor, exerciseId: string) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const e = await loadVisible(tx, m.workspaceId, exerciseId);
    return { ...e, own: e.workspaceId !== null };
  });
}

export async function createExercise(actor: Actor, input: ExerciseInput, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(exercises)
        .values({ ...input, workspaceId: m.workspaceId, createdByUserId: actor.userId })
        .returning({ id: exercises.id });
      await audit(tx, { action: "exercises.created", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: row!.id, ipHash: meta.ipHash });
      return row!.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

export async function updateExercise(actor: Actor, exerciseId: string, input: ExerciseInput, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  try {
    await withTenant(ctx, async (tx) => {
      await loadOwn(tx, m.workspaceId, exerciseId);
      await tx.update(exercises).set(input).where(eq(exercises.id, exerciseId));
      await audit(tx, { action: "exercises.updated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: exerciseId, ipHash: meta.ipHash });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

/** Copies a platform exercise into the trainer's library so it can be customized. */
export async function copyExercise(actor: Actor, exerciseId: string, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const src = await loadVisible(tx, m.workspaceId, exerciseId);
    let name = src.workspaceId ? `${src.name} (cópia)` : src.name;
    const [taken] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.workspaceId, m.workspaceId), isNull(exercises.archivedAt), sql`lower(${exercises.name}) = lower(${name})`));
    if (taken) name = `${name.slice(0, 70)} (minha)`;
    const [row] = await tx
      .insert(exercises)
      .values({
        workspaceId: m.workspaceId,
        name,
        muscleGroup: src.muscleGroup,
        equipment: src.equipment,
        description: src.description,
        instructions: src.instructions,
        // Videos stay with their workspace; a platform exercise has none to copy.
        videoAssetId: src.workspaceId === m.workspaceId ? src.videoAssetId : null,
        createdByUserId: actor.userId,
      })
      .returning({ id: exercises.id });
    await audit(tx, { action: "exercises.copied", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: row!.id, metadata: { from: exerciseId }, ipHash: meta.ipHash });
    return row!.id;
  });
}

/** Archived exercises disappear from the library but stay referenced by existing programs and history. */
export async function archiveExercise(actor: Actor, exerciseId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await loadOwn(tx, m.workspaceId, exerciseId);
    await tx.update(exercises).set({ archivedAt: new Date() }).where(eq(exercises.id, exerciseId));
    await audit(tx, { action: "exercises.archived", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: exerciseId, ipHash: meta.ipHash });
  });
}

/** Attaches a verified video of the same workspace. Replacing a video removes the old file from storage. */
export async function attachVideo(actor: Actor, exerciseId: string, assetId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  const oldKey = await withTenant(ctx, async (tx) => {
    const e = await loadOwn(tx, m.workspaceId, exerciseId);
    const [asset] = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.workspaceId, m.workspaceId), eq(mediaAssets.status, "ready"), eq(mediaAssets.kind, "video")));
    if (!asset) throw Errors.notFound();
    await tx.update(exercises).set({ videoAssetId: assetId }).where(eq(exercises.id, exerciseId));
    const old = e.videoAssetId && e.videoAssetId !== assetId ? await retireAsset(tx, m.workspaceId, e.videoAssetId) : null;
    await audit(tx, { action: "exercises.video_attached", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: exerciseId, metadata: { assetId }, ipHash: meta.ipHash });
    return old;
  });
  if (oldKey) await deleteObject(oldKey).catch((err: unknown) => log.error("could not delete replaced video", errorFields(err)));
}

export async function removeVideo(actor: Actor, exerciseId: string, meta: RequestMeta) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  const oldKey = await withTenant(ctx, async (tx) => {
    const e = await loadOwn(tx, m.workspaceId, exerciseId);
    if (!e.videoAssetId) return null;
    await tx.update(exercises).set({ videoAssetId: null }).where(eq(exercises.id, exerciseId));
    const key = await retireAsset(tx, m.workspaceId, e.videoAssetId);
    await audit(tx, { action: "exercises.video_removed", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: exerciseId, ipHash: meta.ipHash });
    return key;
  });
  if (oldKey) await deleteObject(oldKey).catch((err: unknown) => log.error("could not delete removed video", errorFields(err)));
}

/** Marks an asset deleted (frees quota) unless another exercise still uses it; returns the key to delete. */
async function retireAsset(tx: Tx, workspaceId: string, assetId: string): Promise<string | null> {
  const [stillUsed] = await tx.select({ id: exercises.id }).from(exercises).where(eq(exercises.videoAssetId, assetId)).limit(1);
  if (stillUsed) return null;
  const [a] = await tx
    .update(mediaAssets)
    .set({ status: "deleted" })
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.workspaceId, workspaceId)))
    .returning({ key: mediaAssets.storageKey });
  return a?.key ?? null;
}
