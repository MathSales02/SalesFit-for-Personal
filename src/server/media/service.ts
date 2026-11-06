import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { mediaAssets, plans, subscriptions } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import type { RequestMeta } from "../http/request-meta";
import { audit, recordSecurityEvent } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { isUploadContentType, matchesSignature, UPLOAD_TYPES, type UploadContentType } from "../storage/file-signature";
import { deleteObject, headObject, presignPlayback, presignUpload, readHead } from "../storage/s3";

/** Pending uploads count against the quota only while their signed URL could still be used. */
const PENDING_WINDOW_MS = 60 * 60 * 1000;

async function storageUsage(tx: Tx, workspaceId: string) {
  const [used] = await tx
    .select({ bytes: sql<string>`coalesce(sum(${mediaAssets.sizeBytes}), 0)` })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.workspaceId, workspaceId),
        or(eq(mediaAssets.status, "ready"), and(eq(mediaAssets.status, "pending"), gt(mediaAssets.createdAt, new Date(Date.now() - PENDING_WINDOW_MS)))),
      ),
    );
  const [plan] = await tx
    .select({ quotaMb: plans.storageQuotaMb })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.workspaceId, workspaceId));
  return { usedBytes: Number(used?.bytes ?? 0), quotaBytes: (plan?.quotaMb ?? 0) * 1024 * 1024 };
}

export type UploadTicket = { assetId: string; url: string; fields: Record<string, string>; maxBytes: number };

/**
 * Step 1: reserve quota and hand the browser a signed form that only accepts
 * this key, this content type and at most the declared size.
 */
export async function requestUpload(actor: Actor, input: { contentType: string; sizeBytes: number }, meta: RequestMeta): Promise<UploadTicket> {
  assertCan(actor, "training.manage");
  const m = requireMembership(actor);
  await enforceRateLimit("upload_user", actor.userId);
  if (!isUploadContentType(input.contentType)) {
    throw new AppError("VALIDATION", "Formato não aceito. Envie vídeos MP4, MOV ou WebM, ou imagens JPG, PNG ou WebP.");
  }
  const type = UPLOAD_TYPES[input.contentType];
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > type.maxBytes) {
    throw new AppError("VALIDATION", `Arquivo grande demais. O limite é ${Math.round(type.maxBytes / 1024 / 1024)} MB.`);
  }

  const assetId = randomUUID();
  // Random, non-guessable key; nothing user-provided (like the file name) goes into it.
  const key = `ws/${m.workspaceId}/${assetId}.${type.ext}`;
  await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`storage:${m.workspaceId}`}, 0))`);
    const usage = await storageUsage(tx, m.workspaceId);
    if (usage.usedBytes + input.sizeBytes > usage.quotaBytes) {
      throw new AppError("PLAN_LIMIT", "O espaço de armazenamento do seu plano acabou. Remova vídeos que não usa mais ou mude de plano.");
    }
    await tx.insert(mediaAssets).values({
      id: assetId,
      workspaceId: m.workspaceId,
      uploadedByUserId: actor.userId,
      kind: type.kind,
      storageKey: key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    await audit(tx, { action: "media.upload_requested", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "media", targetId: assetId, metadata: { contentType: input.contentType, sizeBytes: input.sizeBytes }, ipHash: meta.ipHash });
  });

  const post = await presignUpload(key, input.contentType, input.sizeBytes);
  return { assetId, url: post.url, fields: post.fields, maxBytes: input.sizeBytes };
}

/**
 * Step 2: after the browser uploaded, verify what actually landed in storage
 * (exists, size within the declared limit, real file signature) before the
 * asset can be used anywhere. Anything that fails is deleted and rejected.
 */
export async function completeUpload(actor: Actor, assetId: string, meta: RequestMeta): Promise<{ status: "ready" }> {
  assertCan(actor, "training.manage");
  const m = requireMembership(actor);
  const ctx = { userId: actor.userId, workspaceId: m.workspaceId };
  const asset = await withTenant(ctx, async (tx) => {
    const [a] = await tx
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.workspaceId, m.workspaceId), eq(mediaAssets.status, "pending")));
    return a;
  });
  if (!asset) throw Errors.notFound();

  const reject = async (reason: string) => {
    await deleteObject(asset.storageKey).catch((err: unknown) => log.error("could not delete rejected upload", errorFields(err)));
    await withTenant(ctx, (tx) => tx.update(mediaAssets).set({ status: "rejected" }).where(eq(mediaAssets.id, asset.id)));
    await recordSecurityEvent({ type: "media.upload_rejected", severity: "warning", userId: actor.userId, workspaceId: m.workspaceId, ipHash: meta.ipHash, metadata: { reason } });
    throw new AppError("VALIDATION", "O arquivo enviado não é um vídeo ou imagem válido.");
  };

  const head = await headObject(asset.storageKey);
  if (!head) throw new AppError("VALIDATION", "O envio do arquivo não terminou. Tente de novo.");
  if (head.size <= 0 || head.size > asset.sizeBytes) await reject("size_mismatch");
  if (!isUploadContentType(asset.contentType) || !matchesSignature(asset.contentType as UploadContentType, await readHead(asset.storageKey))) {
    await reject("signature_mismatch");
  }
  // Malware scanning hook: plug an AV/content scanner here before marking ready (not configured yet).

  await withTenant(ctx, async (tx) => {
    await tx.update(mediaAssets).set({ status: "ready", sizeBytes: head.size, verifiedAt: new Date() }).where(eq(mediaAssets.id, asset.id));
    await audit(tx, { action: "media.upload_verified", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "media", targetId: asset.id, ipHash: meta.ipHash });
  });
  return { status: "ready" };
}

/**
 * Short-lived playback URLs for assets of the actor's workspace. Assets of
 * other workspaces or not yet verified are silently left out.
 */
export async function playbackUrls(actor: Actor, assetIds: string[]): Promise<Map<string, string>> {
  const m = requireMembership(actor);
  const ids = [...new Set(assetIds)].slice(0, 200);
  if (ids.length === 0) return new Map();
  const rows = await withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) =>
    tx
      .select({ id: mediaAssets.id, key: mediaAssets.storageKey, contentType: mediaAssets.contentType })
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.workspaceId, m.workspaceId), eq(mediaAssets.status, "ready"))),
  );
  const out = new Map<string, string>();
  await Promise.all(rows.map(async (r) => out.set(r.id, await presignPlayback(r.key, r.contentType))));
  return out;
}

export async function getStorageUsage(actor: Actor) {
  assertCan(actor, "training.manage");
  const m = requireMembership(actor);
  return withTenant({ userId: actor.userId, workspaceId: m.workspaceId }, (tx) => storageUsage(tx, m.workspaceId));
}
