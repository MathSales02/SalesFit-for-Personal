import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { bodyMeasurements, mediaAssets, progressPhotos } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { completeUpload, playbackUrls, requestUpload, type UploadTicket } from "@/server/media/service";
import {
  addMeasurementAsTrainer,
  addOwnMeasurement,
  addOwnPhoto,
  deleteOwnPhoto,
  getOwnProgress,
  getStudentProgress,
  setPhotoSharing,
} from "@/server/progress/service";
import { headObject } from "@/server/storage/s3";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { setHealthConsent } from "@/server/students/students";
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
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: "Aluna", password: PASSWORD }, meta())).token))!;
}
async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}

/** A real JPEG carrying camera metadata, as phones produce. */
async function phoneJpeg(): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#c08060" } })
    .withExif({ IFD0: { Make: "PhoneMaker", Model: "X1", Artist: "Aluna Teste" } })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

async function browserUpload(ticket: UploadTicket, bytes: Uint8Array<ArrayBuffer>, type: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
  fd.append("file", new Blob([bytes], { type }));
  return (await fetch(ticket.url, { method: "POST", body: fd })).status;
}

async function uploadPhoto(s: Actor, bytes?: Uint8Array<ArrayBuffer>) {
  const data = bytes ?? (await phoneJpeg());
  const ticket = await requestUpload(s, { contentType: "image/jpeg", sizeBytes: data.length }, meta(), "private");
  expect(await browserUpload(ticket, data, "image/jpeg")).toBe(204);
  await completeUpload(s, ticket.assetId, meta());
  await addOwnPhoto(s, { assetId: ticket.assetId, takenOn: "2026-11-01", pose: "front" }, meta());
  const own = await getOwnProgress(s);
  return own.photos.find((p) => p.mediaAssetId === ticket.assetId)!;
}

describe("progress photos", () => {
  it("are re-encoded on the server: metadata stripped, size bounded, original deleted", async () => {
    const s = await studentOf(await trainer());
    const photo = await uploadPhoto(s);
    const [asset] = await withTenant({ userId: s.userId, workspaceId: s.membership!.workspaceId }, (tx) => tx.select().from(mediaAssets).where(eq(mediaAssets.id, photo.mediaAssetId)));
    expect(asset!.contentType).toBe("image/webp");
    expect(asset!.storageKey.endsWith(".webp")).toBe(true);
    expect(await headObject(asset!.storageKey.replace(/\.webp$/, ".orig"))).toBeNull();

    const served = new Uint8Array(await (await fetch(photo.url!)).arrayBuffer());
    const metadata = await sharp(served).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(Math.max(metadata.width!, metadata.height!)).toBe(1600);
  });

  it("a file that only looks like an image is rejected and deleted", async () => {
    const s = await studentOf(await trainer());
    const fake = new Uint8Array(4096);
    fake.set([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes followed by garbage
    const ticket = await requestUpload(s, { contentType: "image/jpeg", sizeBytes: fake.length }, meta(), "private");
    await browserUpload(ticket, fake, "image/jpeg");
    expect(await code(completeUpload(s, ticket.assetId, meta()))).toBe("VALIDATION");
    expect(await code(addOwnPhoto(s, { assetId: ticket.assetId, takenOn: "2026-11-01", pose: "front" }, meta()))).toBe("NOT_FOUND");
  });

  it("are private by default: the trainer only sees photos the student shares", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const photo = await uploadPhoto(s);
    const memberId = s.membership!.memberId;

    expect((await getStudentProgress(t, memberId, meta())).photos).toHaveLength(0);
    expect((await playbackUrls(t, [photo.mediaAssetId])).size).toBe(0);

    await setPhotoSharing(s, photo.id, true, meta());
    const shared = await getStudentProgress(t, memberId, meta());
    expect(shared.photos).toHaveLength(1);
    expect(shared.photos[0]!.url).toContain("X-Amz-Signature");

    await setPhotoSharing(s, photo.id, false, meta());
    expect((await getStudentProgress(t, memberId, meta())).photos).toHaveLength(0);
    expect((await playbackUrls(t, [photo.mediaAssetId])).size).toBe(0);
  });

  it("other students never see someone else's photos, even shared ones or by direct query", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const photo = await uploadPhoto(a);
    await setPhotoSharing(a, photo.id, true, meta());
    expect((await playbackUrls(b, [photo.mediaAssetId])).size).toBe(0);
    const ctxB = { userId: b.userId, workspaceId: b.membership!.workspaceId };
    expect(await withTenant(ctxB, (tx) => tx.select().from(progressPhotos))).toHaveLength(0);
    expect(await withTenant(ctxB, (tx) => tx.select().from(mediaAssets).where(eq(mediaAssets.id, photo.mediaAssetId)))).toHaveLength(0);
    expect(await code(setPhotoSharing(b, photo.id, false, meta()))).toBe("NOT_FOUND");
    expect(await code(deleteOwnPhoto(b, photo.id, meta()))).toBe("NOT_FOUND");
  });

  it("a student cannot register another student's upload as their photo", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const photo = await uploadPhoto(a);
    expect(await code(addOwnPhoto(b, { assetId: photo.mediaAssetId, takenOn: "2026-11-01", pose: "front" }, meta()))).toBe("NOT_FOUND");
  });

  it("trainers cannot upload private photos; students cannot upload videos as private media", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    expect(await code(requestUpload(t, { contentType: "image/jpeg", sizeBytes: 100 }, meta(), "private"))).toBe("FORBIDDEN");
    expect(await code(requestUpload(s, { contentType: "video/mp4", sizeBytes: 100 }, meta(), "private"))).toBe("VALIDATION");
    expect(await code(requestUpload(s, { contentType: "image/jpeg", sizeBytes: 100 }, meta()))).toBe("FORBIDDEN");
  });

  it("deleting a photo removes the file from storage", async () => {
    const s = await studentOf(await trainer());
    const photo = await uploadPhoto(s);
    const [asset] = await withTenant({ userId: s.userId, workspaceId: s.membership!.workspaceId }, (tx) => tx.select().from(mediaAssets).where(eq(mediaAssets.id, photo.mediaAssetId)));
    await deleteOwnPhoto(s, photo.id, meta());
    expect(await headObject(asset!.storageKey)).toBeNull();
    expect((await getOwnProgress(s)).photos).toHaveLength(0);
  });
});

describe("body measurements", () => {
  const input = { measuredOn: "2026-11-01", weightKg: 72.5, bodyFatPct: 18, waistCm: 80, hipCm: null, chestCm: null, armCm: null, thighCm: null, notes: null };

  it("the trainer sees and records measurements only with the student's health consent", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    const memberId = s.membership!.memberId;
    await addOwnMeasurement(s, input, meta());

    expect((await getStudentProgress(t, memberId, meta())).measurements).toHaveLength(0);
    expect(await code(addMeasurementAsTrainer(t, memberId, input, meta()))).toBe("FORBIDDEN");
    const direct = await withTenant({ userId: t.userId, workspaceId: t.membership!.workspaceId }, (tx) => tx.select().from(bodyMeasurements));
    expect(direct).toHaveLength(0);

    await setHealthConsent(s, true, meta());
    await addMeasurementAsTrainer(t, memberId, { ...input, measuredOn: "2026-11-05", weightKg: 71.8 }, meta());
    const seen = await getStudentProgress(t, memberId, meta());
    expect(seen.measurements.map((m) => m.weightKg)).toEqual([71.8, 72.5]);
    expect((await getOwnProgress(s)).measurements).toHaveLength(2);
  });

  it("refuses future dates and values outside human ranges", async () => {
    const s = await studentOf(await trainer());
    expect(await code(addOwnMeasurement(s, { ...input, measuredOn: "2099-01-01" }, meta()))).toBe("VALIDATION");
    expect(await code(addOwnMeasurement(s, { ...input, weightKg: 900 }, meta()))).toBe("23514");
  });

  it("another trainer and platform admins cannot see measurements", async () => {
    const t = await trainer();
    const s = await studentOf(t);
    await setHealthConsent(s, true, meta());
    await addOwnMeasurement(s, input, meta());
    expect(await code(getStudentProgress(await trainer(), s.membership!.memberId, meta()))).toBe("NOT_FOUND");
    const admin = await withTenant({ userId: t.userId, workspaceId: t.membership!.workspaceId, isPlatformAdmin: true }, (tx) =>
      tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.memberId, "00000000-0000-0000-0000-000000000000")),
    );
    expect(admin).toHaveLength(0);
    const adminOnly = await withTenant({ userId: "00000000-0000-0000-0000-000000000001", isPlatformAdmin: true }, (tx) => tx.select().from(bodyMeasurements));
    expect(adminOnly).toHaveLength(0);
  });
});
