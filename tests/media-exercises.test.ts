import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { exercises, mediaAssets, securityEvents } from "@/server/db/schema";
import {
  archiveExercise,
  attachVideo,
  copyExercise,
  createExercise,
  getExercise,
  listExercises,
  removeVideo,
  setPlatformVideoUrl,
  updateExercise,
} from "@/server/exercises/service";
import { AppError } from "@/server/lib/errors";
import { completeUpload, playbackUrls, requestUpload, type UploadTicket } from "@/server/media/service";
import { headObject } from "@/server/storage/s3";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { testOutbox } from "@/server/mail/mailer";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

const MP4_HEAD = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 2, 0, ...new TextEncoder().encode("isomiso2")]);
const fakeMp4 = (size = 2048) => {
  const b = new Uint8Array(size);
  b.set(MP4_HEAD);
  return b;
};

async function trainer(): Promise<Actor & { workspaceId: string }> {
  const t = await createTrainer();
  const { token } = await loginAs(t.email);
  return Object.assign((await resolveActor(token))!, { workspaceId: t.workspaceId });
}

async function studentOf(tr: Actor): Promise<Actor> {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const mail = [...testOutbox].reverse().find((m) => m.to === email)!;
  const token = mail.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  const s = await acceptInvitationWithNewAccount({ token, displayName: "Aluna", password: PASSWORD }, meta());
  return (await resolveActor(s.token))!;
}

/** Plays the browser's part: posts the signed form straight to storage. */
async function browserUpload(ticket: UploadTicket, bytes: Uint8Array<ArrayBuffer>, contentType: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
  fd.append("file", new Blob([bytes], { type: contentType }));
  return (await fetch(ticket.url, { method: "POST", body: fd })).status;
}

async function uploadVideo(actor: Actor, bytes = fakeMp4()) {
  const ticket = await requestUpload(actor, { contentType: "video/mp4", sizeBytes: bytes.length }, meta());
  expect(await browserUpload(ticket, bytes, "video/mp4")).toBe(204);
  await completeUpload(actor, ticket.assetId, meta());
  return ticket.assetId;
}

async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}

describe("uploads", () => {
  it("a verified video gets a short-lived playback URL that works", async () => {
    const a = await trainer();
    const assetId = await uploadVideo(a);
    const urls = await playbackUrls(a, [assetId]);
    const url = urls.get(assetId)!;
    expect(url).toContain("X-Amz-Expires=900");
    const res = await fetch(url, { headers: { Range: "bytes=0-11" } });
    expect(res.status).toBe(206);
  });

  it("rejects disallowed types and oversized declarations before issuing a URL", async () => {
    const a = await trainer();
    expect(await code(requestUpload(a, { contentType: "text/html", sizeBytes: 100 }, meta()))).toBe("VALIDATION");
    expect(await code(requestUpload(a, { contentType: "application/x-msdownload", sizeBytes: 100 }, meta()))).toBe("VALIDATION");
    expect(await code(requestUpload(a, { contentType: "video/mp4", sizeBytes: 300 * 1024 * 1024 }, meta()))).toBe("VALIDATION");
  });

  it("storage refuses a file larger than declared", async () => {
    const a = await trainer();
    const ticket = await requestUpload(a, { contentType: "video/mp4", sizeBytes: 1000 }, meta());
    expect(await browserUpload(ticket, fakeMp4(5000), "video/mp4")).toBe(400);
  });

  it("a file whose content does not match its type is deleted and rejected", async () => {
    const a = await trainer();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(512, " "));
    const ticket = await requestUpload(a, { contentType: "video/mp4", sizeBytes: html.length }, meta());
    expect(await browserUpload(ticket, html, "video/mp4")).toBe(204);
    expect(await code(completeUpload(a, ticket.assetId, meta()))).toBe("VALIDATION");

    const [row] = await withTenant({ userId: a.userId, workspaceId: a.workspaceId }, (tx) => tx.select().from(mediaAssets).where(eq(mediaAssets.id, ticket.assetId)));
    expect(row!.status).toBe("rejected");
    expect(await headObject(row!.storageKey)).toBeNull();
    expect((await playbackUrls(a, [ticket.assetId])).size).toBe(0);
    const events = await withTenant({ userId: a.userId, isPlatformAdmin: true }, (tx) =>
      tx.select().from(securityEvents).where(and(eq(securityEvents.type, "media.upload_rejected"), eq(securityEvents.userId, a.userId))),
    );
    expect(events).toHaveLength(1);
  });

  it("enforces the plan storage quota (pending uploads count)", async () => {
    const a = await trainer(); // trial plan: 1024 MB
    for (let i = 0; i < 5; i++) await requestUpload(a, { contentType: "video/mp4", sizeBytes: 200 * 1024 * 1024 }, meta());
    expect(await code(requestUpload(a, { contentType: "video/mp4", sizeBytes: 200 * 1024 * 1024 }, meta()))).toBe("PLAN_LIMIT");
  });

  it("students cannot upload", async () => {
    const a = await trainer();
    const s = await studentOf(a);
    expect(await code(requestUpload(s, { contentType: "video/mp4", sizeBytes: 100 }, meta()))).toBe("FORBIDDEN");
  });

  it("another workspace cannot complete, play or attach someone else's video", async () => {
    const a = await trainer();
    const b = await trainer();
    const assetId = await uploadVideo(a);
    expect(await code(completeUpload(b, assetId, meta()))).toBe("NOT_FOUND");
    expect((await playbackUrls(b, [assetId])).size).toBe(0);
    const bExercise = await createExercise(b, { name: "Exercício B", muscleGroup: "chest", equipment: null, description: null, instructions: null }, meta());
    expect(await code(attachVideo(b, bExercise, assetId, meta()))).toBe("NOT_FOUND");
  });

  it("students of the workspace can watch its videos; students elsewhere cannot", async () => {
    const a = await trainer();
    const b = await trainer();
    const assetId = await uploadVideo(a);
    expect((await playbackUrls(await studentOf(a), [assetId])).size).toBe(1);
    expect((await playbackUrls(await studentOf(b), [assetId])).size).toBe(0);
  });
});

describe("exercise library", () => {
  const input = { name: "Remada baixa", muscleGroup: "back" as const, equipment: "Polia baixa", description: null, instructions: "Puxe até o abdômen." };

  it("trainers see the platform library plus their own exercises, never another trainer's", async () => {
    const a = await trainer();
    const b = await trainer();
    await createExercise(a, input, meta());
    const listA = await listExercises(a, { q: "" });
    expect(listA.some((e) => e.name === "Supino reto com barra" && !e.own)).toBe(true);
    expect(listA.some((e) => e.name === "Remada baixa" && e.own)).toBe(true);
    // The platform has its own "Remada baixa na polia"; A's exercise is not among B's results.
    expect((await listExercises(b, { q: "Remada baixa" })).some((e) => e.own)).toBe(false);
  });

  it("platform exercises are read-only but can be copied and customized", async () => {
    const a = await trainer();
    const [platform] = await listExercises(a, { q: "Supino reto com barra" });
    expect(await code(updateExercise(a, platform!.id, { ...input, name: "Hack" }, meta()))).toBe("FORBIDDEN");
    const copyId = await copyExercise(a, platform!.id, meta());
    await updateExercise(a, copyId, { ...input, name: "Supino reto (meu jeito)" }, meta());
    expect((await getExercise(a, copyId)).own).toBe(true);
    expect((await getExercise(a, platform!.id)).name).toBe("Supino reto com barra");
  });

  it("a platform exercise is copied once, with its details, and the copy keeps the trainer's changes", async () => {
    const a = await trainer();
    const [platform] = await listExercises(a, { q: "Supino reto com barra" });
    const source = await getExercise(a, platform!.id);
    expect(source.copyId).toBeNull();
    expect(source.secondaryMuscles).toEqual(["triceps", "shoulders"]);
    expect(source.difficulty).toBe("intermediate");
    expect(source.commonMistakes).toContain("Quicar a barra no peito.");

    const copyId = await copyExercise(a, platform!.id, meta());
    const copy = await getExercise(a, copyId);
    expect(copy).toMatchObject({ own: true, name: source.name, secondaryMuscles: source.secondaryMuscles, tips: source.tips, sourceExerciseId: platform!.id });

    await updateExercise(a, copyId, { ...input, name: "Supino do meu jeito", secondaryMuscles: ["back", "biceps"], videoUrl: "https://www.youtube.com/watch?v=abcdefghijk" }, meta());
    // Copying again returns the same exercise, untouched.
    expect(await copyExercise(a, platform!.id, meta())).toBe(copyId);
    const again = await getExercise(a, copyId);
    expect(again.name).toBe("Supino do meu jeito");
    // The main group ("back") never repeats among the secondary ones.
    expect(again.secondaryMuscles).toEqual(["biceps"]);
    expect((await getExercise(a, platform!.id)).copyId).toBe(copyId);
    expect((await listExercises(a, { q: "" })).filter((e) => e.sourceExerciseId === platform!.id)).toHaveLength(1);

    // Another trainer still gets their own copy; the platform exercise is unchanged.
    const b = await trainer();
    expect(await copyExercise(b, platform!.id, meta())).not.toBe(copyId);
    expect((await getExercise(b, platform!.id)).name).toBe("Supino reto com barra");
  });

  it("only platform admins register the library's demonstration videos, and only YouTube links fit", async () => {
    const a = await trainer();
    const [platform] = await listExercises(a, { q: "Peck deck" });
    expect(await code(setPlatformVideoUrl(a, platform!.id, "https://www.youtube.com/watch?v=abcdefghijk", meta()))).toBe("FORBIDDEN");
    const id = await createExercise(a, input, meta());
    expect(await code(updateExercise(a, id, { ...input, videoUrl: "https://example.com/video.mp4" }, meta()))).toBe("23514");
  });

  it("RLS blocks direct writes to the platform library", async () => {
    const a = await trainer();
    const updated = await withTenant({ userId: a.userId, workspaceId: a.workspaceId }, (tx) =>
      tx.update(exercises).set({ name: "hacked" }).where(eq(exercises.name, "Prancha frontal")).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("rejects duplicate names within a workspace, and B cannot touch A's exercise", async () => {
    const a = await trainer();
    const b = await trainer();
    const id = await createExercise(a, input, meta());
    expect(await code(createExercise(a, { ...input, name: "REMADA BAIXA" }, meta()))).toBe("CONFLICT");
    expect(await code(getExercise(b, id))).toBe("NOT_FOUND");
    expect(await code(archiveExercise(b, id, meta()))).toBe("NOT_FOUND");
  });

  it("search treats wildcards literally", async () => {
    const a = await trainer();
    expect(await listExercises(a, { q: "%" })).toHaveLength(0);
  });

  it("replacing or removing a video frees storage and deletes the old file", async () => {
    const a = await trainer();
    const id = await createExercise(a, input, meta());
    const first = await uploadVideo(a);
    await attachVideo(a, id, first, meta());
    const second = await uploadVideo(a);
    await attachVideo(a, id, second, meta());
    const rows = await withTenant({ userId: a.userId, workspaceId: a.workspaceId }, (tx) => tx.select().from(mediaAssets));
    const old = rows.find((r) => r.id === first)!;
    expect(old.status).toBe("deleted");
    expect(await headObject(old.storageKey)).toBeNull();

    await removeVideo(a, id, meta());
    expect((await getExercise(a, id)).videoAssetId).toBeNull();
  });

  it("students cannot manage the library", async () => {
    const a = await trainer();
    const s = await studentOf(a);
    expect(await code(createExercise(s, input, meta()))).toBe("FORBIDDEN");
    expect(await code(listExercises(s, { q: "" }))).toBe("FORBIDDEN");
  });
});
