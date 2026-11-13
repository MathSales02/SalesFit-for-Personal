import { and, eq, isNull } from "drizzle-orm";
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
  getDemoOverview,
  listPlatformExercises,
  setPlatformMedia,
  syncDemos,
  updateExercise,
} from "@/server/exercises/service";
import type { DemoSource } from "@/server/exercises/exercisedb";
import { en } from "@/i18n/catalog/en";
import { libraryEn } from "@/i18n/catalog/library-en";
import { libraryEs } from "@/i18n/catalog/library-es";
import { es } from "@/i18n/catalog/es";
import { equipmentText, translator } from "@/i18n/config";
import { AppError } from "@/server/lib/errors";
import { completeUpload, playbackUrls, requestUpload, type UploadTicket } from "@/server/media/service";
import { headObject } from "@/server/storage/s3";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { testOutbox } from "@/server/mail/mailer";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

const SYS_USER = "00000000-0000-0000-0000-000000000000";

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

  it("only YouTube links fit as an external video", async () => {
    const a = await trainer();
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

describe("animated demonstrations", () => {
  const admin = async (): Promise<Actor> => ({ ...(await trainer()), isPlatformAdmin: true, membership: null });
  const demoOf = async (a: Actor, id: string) => {
    const e = await getExercise(a, id);
    return { url: e.demoUrl, status: e.demoStatus, externalId: e.demoExternalId };
  };
  /** A source where everything answers, except what the test says is gone. */
  const source = (gone: string[] = [], catalogue: Record<string, string> = {}): DemoSource => ({
    fetchExercise: async (id) => (catalogue[id] ? { id, name: "catalogue name", gifUrl: catalogue[id]! } : null),
    mediaAvailable: async (url) => !gone.includes(url),
  });
  const down: DemoSource = {
    fetchExercise: async () => {
      throw new Error("timeout");
    },
    mediaAvailable: async () => {
      throw new Error("timeout");
    },
  };

  it("the platform library comes with its demonstrations, and the few without a reliable match are flagged", async () => {
    const a = await trainer();
    const all = await listExercises(a, { q: "" });
    const platform = all.filter((e) => !e.own);
    expect(platform.length).toBeGreaterThanOrEqual(138);
    const without = platform.filter((e) => !e.demoUrl).map((e) => e.name).sort();
    expect(without).toEqual(["Mobilidade de quadril 90/90", "Prancha frontal", "Rotação torácica"]);
    for (const e of platform) if (e.demoUrl) expect(e.demoUrl).toMatch(/^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9_-]+\.gif$/);
    // No two exercises share an animation.
    const urls = platform.map((e) => e.demoUrl).filter(Boolean);
    expect(new Set(urls).size).toBe(urls.length);
    const bench = platform.find((e) => e.name === "Supino reto com barra")!;
    expect(await demoOf(a, bench.id)).toEqual({ url: "https://static.exercisedb.dev/media/EIeI8Vf.gif", status: "matched", externalId: "EIeI8Vf" });
  });

  it("every exercise and piece of equipment of the platform library has an English and a Spanish name", async () => {
    const a = await trainer();
    const platform = (await listExercises(a, { q: "" })).filter((e) => !e.own);
    for (const [lang, catalog] of [["en", en], ["es", es]] as const) {
      const missing = platform.flatMap((e) => [e.name, e.equipment]).filter((text): text is string => !!text && !(text in catalog));
      expect(missing, lang).toEqual([]);
      const t = translator(lang, catalog);
      // A name shared by an exercise and its equipment gets the right one in each place.
      expect(t("Barra fixa")).toBe(lang === "en" ? "Pull-up" : "Dominadas");
      expect(equipmentText(t, "Barra fixa")).toBe(lang === "en" ? "Pull-up bar" : "Barra de dominadas");
      expect(equipmentText(t, "Halteres")).toBe(lang === "en" ? "Dumbbells" : "Mancuernas");
    }
  });

  it("every sentence of the library's descriptions, steps, tips and mistakes has an English and a Spanish version", async () => {
    const rows = await withTenant({ userId: SYS_USER, isPlatformAdmin: true }, (tx) =>
      tx
        .select({ description: exercises.description, instructions: exercises.instructions, tips: exercises.tips, commonMistakes: exercises.commonMistakes })
        .from(exercises)
        .where(and(isNull(exercises.workspaceId), isNull(exercises.archivedAt))),
    );
    const sentences = new Set(rows.flatMap((r) => [r.description, r.instructions, r.tips, r.commonMistakes]).flatMap((text) => (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean)));
    expect(sentences.size).toBeGreaterThan(700);
    expect([...sentences].filter((l) => !(l in libraryEn))).toEqual([]);
    expect([...sentences].filter((l) => !(l in libraryEs))).toEqual([]);
  });

  it("a trainer's exercise gets its demonstration by itself: same name, another usual name, or the copy's origin", async () => {
    const a = await trainer();
    const base = { muscleGroup: "chest" as const, equipment: null, description: null, instructions: null };
    const benchUrl = "https://static.exercisedb.dev/media/EIeI8Vf.gif";

    // Accents, case and punctuation do not matter; neither does the trainer's short name for it.
    const alias = await createExercise(a, { ...base, name: "SUPINO  RETO" }, meta());
    expect(await demoOf(a, alias)).toMatchObject({ url: benchUrl, status: "matched" });
    const sameName = await createExercise(a, { ...base, name: "cadeira extensora" }, meta());
    expect((await demoOf(a, sameName)).url).toBe("https://static.exercisedb.dev/media/my33uHU.gif");

    // Nothing reliable: no animation, flagged for review instead of a guess.
    const unknown = await createExercise(a, { ...base, name: "Supino do Zé com elástico" }, meta());
    expect(await demoOf(a, unknown)).toEqual({ url: null, status: "unmatched", externalId: null });
    // Renaming it to something known links the animation; renaming back removes it.
    await updateExercise(a, unknown, { ...base, name: "Hip thrust" }, meta());
    expect((await demoOf(a, unknown)).url).toBe("https://static.exercisedb.dev/media/qg2PGl6.gif");
    await updateExercise(a, unknown, { ...base, name: "Movimento secreto" }, meta());
    expect((await demoOf(a, unknown)).status).toBe("unmatched");

    // A copy keeps the animation of its origin even under a personal name.
    const [platform] = await listExercises(a, { q: "Rosca martelo" });
    const copy = await copyExercise(a, platform!.id, meta());
    await updateExercise(a, copy, { ...base, muscleGroup: "biceps", name: "Martelo da casa" }, meta());
    expect((await demoOf(a, copy)).url).toBe("https://static.exercisedb.dev/media/2NpxjC1.gif");
    // The list the library and the workout builder read carries it too.
    expect((await listExercises(a, { q: "Martelo da casa" }))[0]!.demoUrl).toBe("https://static.exercisedb.dev/media/2NpxjC1.gif");
  });

  it("only platform admins sync or review, and the sync is repeatable", async () => {
    const a = await trainer();
    expect(await code(syncDemos(a, meta(), source()))).toBe("FORBIDDEN");
    expect(await code(getDemoOverview(a))).toBe("FORBIDDEN");
    const [platform] = await listExercises(a, { q: "Peck deck" });
    expect(await code(setPlatformMedia(a, platform!.id, { videoUrl: null, demoExternalId: null, aliases: [] }, meta(), source()))).toBe("FORBIDDEN");

    const ad = await admin();
    const first = await syncDemos(ad, meta(), source());
    expect(first.checked).toBeGreaterThanOrEqual(135);
    expect(first).toMatchObject({ available: first.checked, broken: 0 });
    const again = await syncDemos(ad, meta(), source());
    expect(again).toMatchObject({ checked: first.checked, available: first.checked, broken: 0 });
    const overview = await getDemoOverview(ad);
    expect(overview.platform.withDemo).toBe(first.checked);
    expect(overview.runs[0]).toMatchObject({ checked: first.checked, broken: 0, error: null });
  });

  it("an animation that left the source is dropped everywhere, and comes back when the source has it again", async () => {
    const a = await trainer();
    const ad = await admin();
    const url = "https://static.exercisedb.dev/media/j9Q5crt.gif"; // Simulador de escada
    const mine = await createExercise(a, { name: "Simulador de escada", muscleGroup: "cardio", equipment: null, description: null, instructions: null }, meta());
    expect((await demoOf(a, mine)).url).toBe(url);

    const r = await syncDemos(ad, meta(), source([url]));
    expect(r.broken).toBe(1);
    expect(await demoOf(a, mine)).toMatchObject({ url: null, status: "unmatched" });
    expect((await getDemoOverview(ad)).unmatchedNames.some((u) => u.name_key === "simulador de escada")).toBe(true);

    // The source moved the file: the catalogue gives the new address and everything is linked again.
    const moved = "https://static.exercisedb.dev/media/j9Q5crt-2.gif";
    await syncDemos(ad, meta(), source([url], { j9Q5crt: moved }));
    expect(await demoOf(a, mine)).toMatchObject({ url: moved, status: "matched" });
    // Back to the original address for the other tests.
    await syncDemos(ad, meta(), source([moved], { j9Q5crt: url }));
    expect((await demoOf(a, mine)).url).toBe(url);
  });

  it("when the source is down nothing is touched", async () => {
    const a = await trainer();
    const ad = await admin();
    const [platform] = await listExercises(a, { q: "Leg press 45" });
    const before = await demoOf(a, platform!.id);
    expect(await code(syncDemos(ad, meta(), down))).toBe("CONFLICT");
    expect(await demoOf(a, platform!.id)).toEqual(before);
    expect((await getDemoOverview(ad)).runs[0]!.error).toContain("não respondeu");
  });

  it("manual review: an id is checked against the source, and a new usual name reaches trainers at once", async () => {
    const a = await trainer();
    const ad = await admin();
    const row = (await listPlatformExercises(ad)).find((e) => e.name === "Prancha frontal")!;
    expect(row.demoUrl).toBeNull();
    const keep = { videoUrl: null, aliases: row.aliases };
    const plank = "https://static.exercisedb.dev/media/planktest.gif";

    expect(await code(setPlatformMedia(ad, row.id, { ...keep, demoExternalId: "missing" }, meta(), source()))).toBe("VALIDATION");
    expect(await code(setPlatformMedia(ad, row.id, { ...keep, demoExternalId: "planktest" }, meta(), down))).toBe("CONFLICT");

    const mine = await createExercise(a, { name: "Prancha isométrica", muscleGroup: "core", equipment: null, description: null, instructions: null }, meta());
    expect((await demoOf(a, mine)).status).toBe("unmatched");
    await setPlatformMedia(ad, row.id, { videoUrl: null, aliases: ["prancha isometrica"], demoExternalId: "planktest" }, meta(), source([], { planktest: plank }));
    expect(await demoOf(a, row.id)).toEqual({ url: plank, status: "manual", externalId: "planktest" });
    expect(await demoOf(a, mine)).toMatchObject({ url: plank, status: "matched" });
    // A manual choice survives the sync.
    await syncDemos(ad, meta(), source());
    expect((await demoOf(a, row.id)).status).toBe("manual");

    // Clearing it puts both back in the review list.
    await setPlatformMedia(ad, row.id, { ...keep, demoExternalId: null }, meta(), source());
    expect(await demoOf(a, row.id)).toEqual({ url: null, status: "unmatched", externalId: null });
    expect((await demoOf(a, mine)).status).toBe("unmatched");
  });
});
