import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { todayInBrazil, type MeasurementKey } from "@/lib/validation/progress";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { bodyMeasurements, consents, mediaAssets, progressPhotos, workspaceMembers } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { deleteObject } from "../storage/s3";
import { playbackUrls } from "../media/service";

export type MeasurementInput = { measuredOn: string; notes: string | null } & Record<MeasurementKey, number | null>;

function assertDate(d: string) {
  if (d > todayInBrazil() || d < "2000-01-01") throw Errors.validation({ measuredOn: ["Use uma data entre 2000 e hoje."] });
}

async function consentActive(tx: Tx, memberId: string) {
  const [m] = await tx.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.id, memberId));
  if (!m) return false;
  const [c] = await tx
    .select({ granted: consents.granted })
    .from(consents)
    .where(and(eq(consents.userId, m.userId), eq(consents.purpose, "health_data_processing")))
    .orderBy(desc(consents.createdAt), desc(consents.id))
    .limit(1);
  return c?.granted ?? false;
}

const measurementColumns = {
  id: bodyMeasurements.id,
  measuredOn: bodyMeasurements.measuredOn,
  weightKg: bodyMeasurements.weightKg,
  bodyFatPct: bodyMeasurements.bodyFatPct,
  waistCm: bodyMeasurements.waistCm,
  hipCm: bodyMeasurements.hipCm,
  chestCm: bodyMeasurements.chestCm,
  armCm: bodyMeasurements.armCm,
  thighCm: bodyMeasurements.thighCm,
  notes: bodyMeasurements.notes,
  recordedByUserId: bodyMeasurements.recordedByUserId,
};

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

function studentScope(actor: Actor) {
  assertCan(actor, "progress.manage_own");
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

export async function getOwnProgress(actor: Actor) {
  const { m, ctx } = studentScope(actor);
  const data = await withTenant(ctx, async (tx) => ({
    measurements: await tx.select(measurementColumns).from(bodyMeasurements).where(eq(bodyMeasurements.memberId, m.memberId)).orderBy(desc(bodyMeasurements.measuredOn), desc(bodyMeasurements.createdAt)).limit(200),
    photos: await tx.select().from(progressPhotos).where(eq(progressPhotos.memberId, m.memberId)).orderBy(desc(progressPhotos.takenOn), desc(progressPhotos.createdAt)).limit(300),
    consent: await consentActive(tx, m.memberId),
  }));
  const urls = await playbackUrls(actor, data.photos.map((p) => p.mediaAssetId));
  return { ...data, photos: data.photos.map((p) => ({ ...p, url: urls.get(p.mediaAssetId) ?? null })) };
}

export async function addOwnMeasurement(actor: Actor, input: MeasurementInput, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  assertDate(input.measuredOn);
  await enforceRateLimit("account_change_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    const [row] = await tx
      .insert(bodyMeasurements)
      .values({ ...input, workspaceId: m.workspaceId, memberId: m.memberId, recordedByUserId: actor.userId })
      .returning({ id: bodyMeasurements.id });
    await audit(tx, { action: "progress.measurement_added", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "measurement", targetId: row!.id, ipHash: meta.ipHash });
  });
}

/** Students may delete any of their measurements, including ones the trainer recorded (their data). */
export async function deleteOwnMeasurement(actor: Actor, measurementId: string, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  await withTenant(ctx, async (tx) => {
    const res = await tx
      .delete(bodyMeasurements)
      .where(and(eq(bodyMeasurements.id, measurementId), eq(bodyMeasurements.memberId, m.memberId)))
      .returning({ id: bodyMeasurements.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: "progress.measurement_deleted", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "measurement", targetId: measurementId, ipHash: meta.ipHash });
  });
}

/** Registers a verified private upload as a progress photo (private by default). */
export async function addOwnPhoto(actor: Actor, input: { assetId: string; takenOn: string; pose: "front" | "side" | "back" | "other" }, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  assertDate(input.takenOn);
  await withTenant(ctx, async (tx) => {
    const [asset] = await tx
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, input.assetId), eq(mediaAssets.ownerMemberId, m.memberId), eq(mediaAssets.status, "ready")));
    if (!asset) throw Errors.notFound();
    const [row] = await tx
      .insert(progressPhotos)
      .values({ workspaceId: m.workspaceId, memberId: m.memberId, mediaAssetId: input.assetId, takenOn: input.takenOn, pose: input.pose })
      .returning({ id: progressPhotos.id });
    await audit(tx, { action: "progress.photo_added", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "photo", targetId: row!.id, ipHash: meta.ipHash });
  });
}

export async function setPhotoSharing(actor: Actor, photoId: string, shared: boolean, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  await withTenant(ctx, async (tx) => {
    const res = await tx
      .update(progressPhotos)
      .set({ sharedWithTrainer: shared })
      .where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.memberId, m.memberId)))
      .returning({ id: progressPhotos.id });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: shared ? "progress.photo_shared" : "progress.photo_unshared", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "photo", targetId: photoId, ipHash: meta.ipHash });
  });
}

/** Deletes the photo, its database record and the file in storage. */
export async function deleteOwnPhoto(actor: Actor, photoId: string, meta: RequestMeta) {
  const { m, ctx } = studentScope(actor);
  const key = await withTenant(ctx, async (tx) => {
    const [photo] = await tx.select().from(progressPhotos).where(and(eq(progressPhotos.id, photoId), eq(progressPhotos.memberId, m.memberId)));
    if (!photo) throw Errors.notFound();
    await tx.delete(progressPhotos).where(eq(progressPhotos.id, photoId));
    const [asset] = await tx
      .update(mediaAssets)
      .set({ status: "deleted" })
      .where(and(eq(mediaAssets.id, photo.mediaAssetId), eq(mediaAssets.ownerMemberId, m.memberId)))
      .returning({ key: mediaAssets.storageKey });
    await audit(tx, { action: "progress.photo_deleted", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "photo", targetId: photoId, ipHash: meta.ipHash });
    return asset?.key ?? null;
  });
  if (key) await deleteObject(key).catch((err: unknown) => log.error("could not delete photo file", errorFields(err)));
}

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

/**
 * Measurements (only with the student's health consent) and the photos the
 * student chose to share. Each access to this data is audited.
 */
export async function getStudentProgress(actor: Actor, memberId: string, meta: RequestMeta) {
  assertCan(actor, "students.read");
  const m = requireMembership(actor);
  const data = await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [member] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student")));
    if (!member) throw Errors.notFound();
    const consent = await consentActive(tx, memberId);
    // RLS enforces the same rules: without consent no measurement rows come back; only shared photos do.
    const measurements = consent
      ? await tx.select(measurementColumns).from(bodyMeasurements).where(eq(bodyMeasurements.memberId, memberId)).orderBy(desc(bodyMeasurements.measuredOn)).limit(200)
      : [];
    const photos = await tx
      .select()
      .from(progressPhotos)
      .where(and(eq(progressPhotos.memberId, memberId), eq(progressPhotos.sharedWithTrainer, true)))
      .orderBy(desc(progressPhotos.takenOn))
      .limit(100);
    if (measurements.length || photos.length) {
      await audit(tx, { action: "progress.viewed_by_trainer", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
    }
    return { consent, measurements, photos };
  });
  const urls = await playbackUrls(actor, data.photos.map((p) => p.mediaAssetId));
  return { ...data, photos: data.photos.map((p) => ({ ...p, url: urls.get(p.mediaAssetId) ?? null })) };
}

/** Physical assessment recorded by the trainer; needs the student's active health consent. */
export async function addMeasurementAsTrainer(actor: Actor, memberId: string, input: MeasurementInput, meta: RequestMeta) {
  assertCan(actor, "students.manage");
  const m = requireMembership(actor);
  assertDate(input.measuredOn);
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    const [member] = await tx
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student")));
    if (!member) throw Errors.notFound();
    if (!(await consentActive(tx, memberId))) throw new AppError("FORBIDDEN", "O aluno ainda não autorizou o registro de dados de saúde.");
    const [row] = await tx
      .insert(bodyMeasurements)
      .values({ ...input, workspaceId: m.workspaceId, memberId, recordedByUserId: actor.userId })
      .returning({ id: bodyMeasurements.id });
    await audit(tx, { action: "progress.measurement_added_by_trainer", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "measurement", targetId: row!.id, ipHash: meta.ipHash });
  });
}

/** Last weight entries (oldest first) for the home chart. Same access rules as getOwnProgress. */
export async function getOwnWeightTrend(actor: Actor) {
  const { m, ctx } = studentScope(actor);
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({ measuredOn: bodyMeasurements.measuredOn, weightKg: bodyMeasurements.weightKg })
      .from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.memberId, m.memberId), isNotNull(bodyMeasurements.weightKg)))
      .orderBy(desc(bodyMeasurements.measuredOn), desc(bodyMeasurements.createdAt))
      .limit(12),
  );
  return rows.reverse().map((r) => ({ day: String(r.measuredOn), kg: Number(r.weightKg) }));
}
