import "server-only";
import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Difficulty, MuscleGroup } from "@/lib/validation/exercises";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { demoSyncRuns, exercises, mediaAssets } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { deleteObject } from "../storage/s3";
import { exerciseDb, type DemoSource } from "./exercisedb";

export type ExerciseInput = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  description: string | null;
  instructions: string | null;
  secondaryMuscles?: MuscleGroup[];
  difficulty?: Difficulty | null;
  videoUrl?: string | null;
  tips?: string | null;
  commonMistakes?: string | null;
};

/** The main group never repeats among the secondary ones. */
const clean = (input: ExerciseInput): ExerciseInput =>
  input.secondaryMuscles ? { ...input, secondaryMuscles: input.secondaryMuscles.filter((g) => g !== input.muscleGroup) } : input;

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
        secondaryMuscles: exercises.secondaryMuscles,
        equipment: exercises.equipment,
        difficulty: exercises.difficulty,
        videoUrl: exercises.videoUrl,
        demoUrl: exercises.demoUrl,
        sourceExerciseId: exercises.sourceExerciseId,
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
      .limit(1000),
  );
}

/**
 * Links the animated demonstration of the equivalent platform exercise (same name, a known
 * alias, or the exercise it was copied from). Runs whenever a trainer's exercise is created,
 * renamed or copied, so nobody has to attach media by hand.
 */
async function linkDemo(tx: Tx, exerciseId: string) {
  await tx.execute(sql`
    UPDATE exercises e
    SET demo_external_id = p.demo_external_id, demo_url = p.demo_url,
        demo_status = (CASE WHEN p.id IS NULL THEN 'unmatched' ELSE 'matched' END)::exercise_demo_status,
        demo_synced_at = now()
    FROM (SELECT app_demo_source(x.name, x.source_exercise_id) AS source FROM exercises x WHERE x.id = ${exerciseId}) r
    LEFT JOIN exercises p ON p.id = r.source
    WHERE e.id = ${exerciseId} AND e.workspace_id IS NOT NULL
  `);
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
  if (e.workspaceId !== workspaceId) throw new AppError("FORBIDDEN", "Exercícios da biblioteca SalesFit não podem ser editados. Faça uma cópia.");
  return e;
}

export async function getExercise(actor: Actor, exerciseId: string) {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const e = await loadVisible(tx, m.workspaceId, exerciseId);
    const own = e.workspaceId !== null;
    // For a platform exercise: the trainer's copy, if there is one already.
    const copyId = own ? null : await findCopy(tx, m.workspaceId, exerciseId);
    return { ...e, own, copyId };
  });
}

async function findCopy(tx: Tx, workspaceId: string, sourceId: string): Promise<string | null> {
  const [copy] = await tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.workspaceId, workspaceId), eq(exercises.sourceExerciseId, sourceId), isNull(exercises.archivedAt)))
    .orderBy(asc(exercises.createdAt))
    .limit(1);
  return copy?.id ?? null;
}

export async function createExercise(actor: Actor, input: ExerciseInput, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  try {
    return await withTenant(ctx, async (tx) => {
      const [row] = await tx
        .insert(exercises)
        .values({ ...clean(input), workspaceId: m.workspaceId, createdByUserId: actor.userId })
        .returning({ id: exercises.id });
      await linkDemo(tx, row!.id);
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
      await tx.update(exercises).set(clean(input)).where(eq(exercises.id, exerciseId));
      await linkDemo(tx, exerciseId);
      await audit(tx, { action: "exercises.updated", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "exercise", targetId: exerciseId, ipHash: meta.ipHash });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

/**
 * Copies an exercise into the trainer's library so it can be customized. A platform exercise is
 * copied once: asking again returns the copy the trainer already has, with their changes intact.
 */
export async function copyExercise(actor: Actor, exerciseId: string, meta: RequestMeta): Promise<string> {
  assertCan(actor, "training.manage");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const src = await loadVisible(tx, m.workspaceId, exerciseId);
    if (src.workspaceId === null) {
      const existing = await findCopy(tx, m.workspaceId, exerciseId);
      if (existing) return existing;
    }
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
        secondaryMuscles: src.secondaryMuscles,
        difficulty: src.difficulty,
        videoUrl: src.videoUrl,
        tips: src.tips,
        commonMistakes: src.commonMistakes,
        sourceExerciseId: src.workspaceId === null ? src.id : src.sourceExerciseId,
        // Videos stay with their workspace; a platform exercise has none to copy.
        videoAssetId: src.workspaceId === m.workspaceId ? src.videoAssetId : null,
        createdByUserId: actor.userId,
      })
      .returning({ id: exercises.id });
    await linkDemo(tx, row!.id);
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

// ---------------------------------------------------------------------------
// Platform library and demonstration sync (admins)
// ---------------------------------------------------------------------------

const asAdmin = <T>(actor: Actor, fn: (tx: Tx) => Promise<T>) => withTenant({ userId: actor.userId, isPlatformAdmin: true }, fn);

export async function listPlatformExercises(actor: Actor) {
  assertCan(actor, "admin.exercises.manage");
  return asAdmin(actor, (tx) =>
    tx
      .select({
        id: exercises.id,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        videoUrl: exercises.videoUrl,
        demoExternalId: exercises.demoExternalId,
        demoUrl: exercises.demoUrl,
        demoStatus: exercises.demoStatus,
        aliases: exercises.aliases,
      })
      .from(exercises)
      .where(and(isNull(exercises.workspaceId), isNull(exercises.archivedAt)))
      .orderBy(asc(exercises.muscleGroup), asc(sql`lower(${exercises.name})`)),
  );
}

async function propagate(tx: Tx): Promise<{ matched: number; unmatched: number }> {
  const res = await tx.execute(sql`SELECT matched, unmatched FROM app_propagate_exercise_demos()`);
  const row = res.rows[0] as { matched: number; unmatched: number } | undefined;
  return { matched: row?.matched ?? 0, unmatched: row?.unmatched ?? 0 };
}

export type PlatformMediaInput = { videoUrl: string | null; demoExternalId: string | null; aliases: string[] };

/**
 * Admin's manual review of one platform exercise: the YouTube link, the catalogue entry used as
 * demonstration (checked against the source before it is accepted) and the other names trainers
 * use for it. Trainers' exercises follow right away.
 */
export async function setPlatformMedia(actor: Actor, exerciseId: string, input: PlatformMediaInput, meta: RequestMeta, source: DemoSource = exerciseDb) {
  assertCan(actor, "admin.exercises.manage");
  const [current] = await asAdmin(actor, (tx) =>
    tx.select({ demoExternalId: exercises.demoExternalId }).from(exercises).where(and(eq(exercises.id, exerciseId), isNull(exercises.workspaceId))),
  );
  if (!current) throw Errors.notFound();

  let demo: { demoExternalId: string | null; demoUrl: string | null; demoStatus: "manual" | "unmatched"; demoSyncedAt: Date } | undefined;
  if (input.demoExternalId !== current.demoExternalId) {
    if (input.demoExternalId === null) demo = { demoExternalId: null, demoUrl: null, demoStatus: "unmatched", demoSyncedAt: new Date() };
    else {
      let found;
      try {
        found = await source.fetchExercise(input.demoExternalId);
        if (found && !(await source.mediaAvailable(found.gifUrl))) found = null;
      } catch (err) {
        log.error("exercisedb lookup failed", errorFields(err));
        throw new AppError("CONFLICT", "Não foi possível consultar a ExerciseDB agora. Tente de novo em instantes.");
      }
      if (!found) throw Errors.validation({ demoExternalId: ["Este ID não existe na ExerciseDB ou está sem animação."] });
      demo = { demoExternalId: found.id, demoUrl: found.gifUrl, demoStatus: "manual", demoSyncedAt: new Date() };
    }
  }

  await asAdmin(actor, async (tx) => {
    await tx
      .update(exercises)
      .set({ videoUrl: input.videoUrl, aliases: input.aliases, ...demo })
      .where(and(eq(exercises.id, exerciseId), isNull(exercises.workspaceId)));
    await propagate(tx);
    await audit(tx, { action: "admin.exercise_media_set", actorUserId: actor.userId, targetType: "exercise", targetId: exerciseId, metadata: { ...input }, ipHash: meta.ipHash });
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export type DemoSyncResult = { checked: number; available: number; broken: number; trainerMatched: number; trainerUnmatched: number };

/**
 * Checks the media of every platform exercise against the source, refreshes addresses that
 * changed, drops the ones that no longer exist, and passes the result on to trainers' exercises.
 * Running it again changes nothing that is already right. If the source looks down (most checks
 * fail), nothing is touched.
 */
export async function syncDemos(actor: Actor, meta: RequestMeta, source: DemoSource = exerciseDb): Promise<DemoSyncResult> {
  assertCan(actor, "admin.exercises.manage");
  const rows = await asAdmin(actor, (tx) =>
    tx
      .select({ id: exercises.id, demoExternalId: exercises.demoExternalId, demoUrl: exercises.demoUrl, demoStatus: exercises.demoStatus })
      .from(exercises)
      .where(and(isNull(exercises.workspaceId), isNull(exercises.archivedAt), isNotNull(exercises.demoExternalId))),
  );

  type Check = { id: string; url: string | null; failed: boolean };
  const checks = await mapLimit(rows, 6, async (r): Promise<Check> => {
    try {
      if (r.demoUrl && (await source.mediaAvailable(r.demoUrl))) return { id: r.id, url: r.demoUrl, failed: false };
      // The file moved or is gone: ask the catalogue for the current address.
      const fresh = await source.fetchExercise(r.demoExternalId!);
      if (fresh && (await source.mediaAvailable(fresh.gifUrl))) return { id: r.id, url: fresh.gifUrl, failed: false };
      return { id: r.id, url: null, failed: false };
    } catch {
      return { id: r.id, url: r.demoUrl, failed: true };
    }
  });

  const failed = checks.filter((c) => c.failed).length;
  if (rows.length > 0 && failed > rows.length / 2) {
    const error = "A ExerciseDB não respondeu à maioria das consultas. Nada foi alterado.";
    await asAdmin(actor, (tx) => tx.insert(demoSyncRuns).values({ actorUserId: actor.userId, finishedAt: new Date(), checked: rows.length, error }));
    throw new AppError("CONFLICT", `${error} Tente de novo mais tarde.`);
  }

  const before = new Map(rows.map((r) => [r.id, r]));
  return asAdmin(actor, async (tx) => {
    let available = 0;
    let broken = 0;
    for (const c of checks) {
      if (c.failed) continue;
      const was = before.get(c.id)!;
      if (c.url) available++;
      else broken++;
      const status = c.url ? (was.demoStatus === "manual" ? "manual" : "matched") : "unmatched";
      if (c.url !== was.demoUrl || status !== was.demoStatus) {
        await tx.update(exercises).set({ demoUrl: c.url, demoStatus: status, demoSyncedAt: new Date() }).where(eq(exercises.id, c.id));
      }
    }
    const p = await propagate(tx);
    const result = { checked: rows.length, available, broken, trainerMatched: p.matched, trainerUnmatched: p.unmatched };
    await tx.insert(demoSyncRuns).values({ actorUserId: actor.userId, finishedAt: new Date(), ...result });
    await audit(tx, { action: "admin.exercise_demos_synced", actorUserId: actor.userId, targetType: "exercise", metadata: result, ipHash: meta.ipHash });
    return result;
  });
}

/** Numbers and lists for the admin panel. */
export async function getDemoOverview(actor: Actor) {
  assertCan(actor, "admin.exercises.manage");
  return asAdmin(actor, async (tx) => {
    const [platform] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        withDemo: sql<number>`count(*) filter (where ${exercises.demoUrl} is not null)::int`,
      })
      .from(exercises)
      .where(and(isNull(exercises.workspaceId), isNull(exercises.archivedAt)));
    const unmatchedNames = (await tx.execute(sql`SELECT name_key, sample, uses FROM app_unmatched_exercise_names()`)).rows as { name_key: string; sample: string; uses: number }[];
    const runs = await tx.select().from(demoSyncRuns).orderBy(desc(demoSyncRuns.startedAt)).limit(5);
    return { platform: platform!, unmatchedNames, runs };
  });
}
