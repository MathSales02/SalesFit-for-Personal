import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { resolveActor } from "@/server/auth/actor";
import type { Actor } from "@/server/authz/policy";
import {
  addComment,
  createPost,
  editPost,
  getDiscover,
  getModerationQueue,
  getPost,
  getProfile,
  listConnections,
  listFeed,
  listTrainedToday,
  moderatePost,
  removePost,
  report,
  resolveReport,
  setBlock,
  searchPeople,
  setFollow,
  shareWorkout,
  toggleLike,
  toggleSave,
  updateMyProfile,
  updateSettings,
} from "@/server/community/service";
import { closeDb } from "@/server/db/client";
import { withTenant } from "@/server/db/context";
import { comments, mediaAssets, memberProfiles, postSaves, posts, reports } from "@/server/db/schema";
import { manualCheckin, setRankingHidden } from "@/server/gamification/service";
import { listExercises } from "@/server/exercises/service";
import { AppError } from "@/server/lib/errors";
import { testOutbox } from "@/server/mail/mailer";
import { completeUpload, playbackUrls, requestUpload } from "@/server/media/service";
import { decide } from "@/server/moderation/image-screen";
import { assignProgram, createProgram, getProgram, publishDraft, saveDraft } from "@/server/programs/service";
import { acceptInvitationWithNewAccount, inviteStudent } from "@/server/students/invitations";
import { finishSession, logSet, startSession } from "@/server/workouts/service";
import { createTrainer, loginAs, meta, PASSWORD, uniqueEmail } from "./support/factories";

afterAll(closeDb);

async function trainer() {
  const t = await createTrainer();
  return (await resolveActor((await loginAs(t.email)).token))!;
}
async function studentOf(tr: Actor, name = "Aluno") {
  const email = uniqueEmail("aluno");
  await inviteStudent(tr, email, meta());
  const token = [...testOutbox].reverse().find((m) => m.to === email)!.text.match(/token=([A-Za-z0-9_-]{43})/)![1]!;
  return (await resolveActor((await acceptInvitationWithNewAccount({ token, displayName: name, password: PASSWORD }, meta())).token))!;
}
async function code(p: Promise<unknown>) {
  return p.then(
    () => "ok",
    (e: unknown) => (e instanceof AppError ? e.code : ((e as { cause?: { code?: string } }).cause?.code ?? String(e))),
  );
}
const ctxOf = (a: Actor) => ({ userId: a.userId, workspaceId: a.membership!.workspaceId });
const post = (a: Actor, body: string) => createPost(a, { body, imageAssetId: null, announcement: false }, meta());

async function uploadCommunityImage(a: Actor) {
  const bytes = new Uint8Array(await sharp({ create: { width: 900, height: 900, channels: 3, background: "#2f6f55" } }).jpeg().toBuffer());
  const ticket = await requestUpload(a, { contentType: "image/jpeg", sizeBytes: bytes.length }, meta(), "community");
  const fd = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
  fd.append("file", new Blob([bytes], { type: "image/jpeg" }));
  expect((await fetch(ticket.url, { method: "POST", body: fd })).status).toBe(204);
  const done = await completeUpload(a, ticket.assetId, meta());
  return { assetId: ticket.assetId, moderation: done.moderation };
}

describe("NSFW decision bands", () => {
  it("blocks explicit, holds suggestive for review, clears the rest", () => {
    expect(decide({ Porn: 0.8, Hentai: 0.05, Sexy: 0.1, Neutral: 0.05 })).toBe("block");
    expect(decide({ Porn: 0.3, Hentai: 0, Sexy: 0.2, Neutral: 0.5 })).toBe("review");
    expect(decide({ Porn: 0.05, Hentai: 0, Sexy: 0.5, Neutral: 0.45 })).toBe("review");
    expect(decide({ Porn: 0.02, Hentai: 0.01, Sexy: 0.1, Neutral: 0.87 })).toBe("clear");
  });
});

describe("posts, likes and comments", () => {
  it("members see each other's posts; likes are idempotent; comments and one level of replies work", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const { postId, status } = await post(a, "Primeiro treino da semana!");
    expect(status).toBe("published");

    const feed = await listFeed(b, { scope: "all", cursor: null });
    expect(feed.posts.map((p) => p.id)).toContain(postId);

    expect(await toggleLike(b, postId)).toEqual({ liked: true, likeCount: 1 });
    expect(await toggleLike(b, postId)).toEqual({ liked: false, likeCount: 0 });
    await toggleLike(b, postId);
    await toggleLike(t, postId);

    await addComment(b, { postId, parentCommentId: null, body: "Boa!" }, meta());
    const first = (await getPost(a, postId)).comments[0]!;
    await addComment(a, { postId, parentCommentId: first.id, body: "Valeu!" }, meta());
    const reply = (await getPost(a, postId)).comments.find((c) => c.parentCommentId === first.id)!;
    expect(await code(addComment(b, { postId, parentCommentId: reply.id, body: "Reply de reply" }, meta()))).toBe("NOT_FOUND");

    const view = await getPost(b, postId);
    expect(view.post.likeCount).toBe(2);
    expect(view.post.commentCount).toBe(2);
  });

  it("another trainer's community is invisible and untouchable", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const { postId } = await post(a, "Só para minha consultoria");
    const other = await studentOf(await trainer());
    expect((await listFeed(other, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(postId);
    expect(await code(getPost(other, postId))).toBe("NOT_FOUND");
    expect(await code(toggleLike(other, postId))).toBe("NOT_FOUND");
    expect(await code(addComment(other, { postId, parentCommentId: null, body: "oi" }, meta()))).toBe("NOT_FOUND");
    expect(await withTenant(ctxOf(other), (tx) => tx.select().from(posts).where(eq(posts.id, postId)))).toHaveLength(0);
  });

  it("feed pages with a cursor without repeating posts", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    // Posting is rate limited per person (10 per 10 min), so several members post.
    const authors = [a, await studentOf(t), await studentOf(t)];
    for (let i = 0; i < 23; i++) await post(authors[i % 3]!, `Post número ${i}`);
    const p1 = await listFeed(a, { scope: "all", cursor: null });
    expect(p1.posts).toHaveLength(20);
    const p2 = await listFeed(a, { scope: "all", cursor: p1.nextCursor });
    expect(p2.posts).toHaveLength(3);
    expect(new Set([...p1.posts, ...p2.posts].map((p) => p.id)).size).toBe(23);
    expect(p2.nextCursor).toBeNull();
  });

  it("the following feed shows only people I follow", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const c = await studentOf(t);
    const { postId: fromB } = await post(b, "Post do B");
    const { postId: fromC } = await post(c, "Post do C");
    await setFollow(a, b.membership!.memberId, true);
    const ids = (await listFeed(a, { scope: "following", cursor: null })).posts.map((p) => p.id);
    expect(ids).toContain(fromB);
    expect(ids).not.toContain(fromC);
  });
});

describe("safety and anti-manipulation", () => {
  it("blocking hides content both ways and removes follows", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const { postId: fromA } = await post(a, "Post da A");
    const { postId: fromB } = await post(b, "Post do B");
    await setFollow(b, a.membership!.memberId, true);
    await setBlock(a, b.membership!.memberId, true, meta());

    expect((await listFeed(a, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(fromB);
    expect((await listFeed(b, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(fromA);
    expect(await code(getPost(b, fromA))).toBe("NOT_FOUND");
    expect(await code(toggleLike(b, fromA))).toBe("NOT_FOUND");
    expect(await code(getProfile(b, a.membership!.memberId))).toBe("NOT_FOUND");
    expect((await getProfile(a, b.membership!.memberId)).blockedByMe).toBe(true);
    expect((await getProfile(a, a.membership!.memberId)).followers).toBe(0);
  });

  it("students cannot post announcements, pin, approve, or change what a post is", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    expect(await code(createPost(a, { body: "Aviso!", imageAssetId: null, announcement: true }, meta()))).toBe("FORBIDDEN");
    const { postId } = await post(a, "Texto original");
    const ctx = ctxOf(a);
    expect(await code(withTenant(ctx, (tx) => tx.update(posts).set({ pinned: true }).where(eq(posts.id, postId))))).toBe("42501");
    // The text is editable by its author (see "only the author edits a post"); the rest of the post is not.
    expect(await code(withTenant(ctx, (tx) => tx.update(posts).set({ kind: "announcement" }).where(eq(posts.id, postId))))).toBe("42501");
    expect(await code(withTenant(ctx, (tx) => tx.update(posts).set({ createdAt: new Date() }).where(eq(posts.id, postId))))).toBe("42501");
    // Counters only change through likes and comments (fake likes would feed rankings later).
    expect(await code(withTenant(ctx, (tx) => tx.update(posts).set({ likeCount: 999 }).where(eq(posts.id, postId))))).toBe("42501");
    expect(await code(withTenant(ctxOf(t), (tx) => tx.update(posts).set({ commentCount: 50 }).where(eq(posts.id, postId))))).toBe("42501");
  });

  it("students delete only their own posts; trainers can remove anyone's", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const { postId } = await post(a, "Meu post");
    expect(await code(removePost(b, postId, meta()))).toBe("FORBIDDEN");
    await removePost(t, postId, meta());
    expect(await code(getPost(b, postId))).toBe("NOT_FOUND");
    const { postId: own } = await post(b, "Vou apagar");
    await removePost(b, own, meta());
    expect((await listFeed(b, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(own);
  });

  it("a clean image is published; a flagged one waits for the trainer and stays invisible until approved", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const clean = await uploadCommunityImage(a);
    expect(clean.moderation).toBe("clear");
    const published = await createPost(a, { body: null, imageAssetId: clean.assetId, announcement: false }, meta());
    expect(published.status).toBe("published");
    expect((await playbackUrls(b, [clean.assetId])).size).toBe(1);

    const flagged = await uploadCommunityImage(a);
    // Simulate the classifier holding it for review (only the system context may write this).
    await withTenant({ ...ctxOf(a), isPlatformAdmin: false }, async (tx) => {
      await tx.execute(`select set_config('app.is_system','on',true)` as never);
      await tx.update(mediaAssets).set({ moderation: "review" }).where(eq(mediaAssets.id, flagged.assetId));
    });
    const held = await createPost(a, { body: "Foto nova", imageAssetId: flagged.assetId, announcement: false }, meta());
    expect(held.status).toBe("pending_review");
    expect((await listFeed(b, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(held.postId);
    expect((await playbackUrls(b, [flagged.assetId])).size).toBe(0);
    expect((await listFeed(a, { scope: "all", cursor: null })).posts.find((p) => p.id === held.postId)?.status).toBe("pending_review");

    const queue = await getModerationQueue(t);
    expect(queue.pending.find((p) => p.id === held.postId)?.reviewReason).toBe("image_flagged");
    await moderatePost(t, held.postId, "approve", meta());
    expect((await playbackUrls(b, [flagged.assetId])).size).toBe(1);
  });

  it("the database refuses to publish a flagged image directly, and students cannot clear their own image", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const img = await uploadCommunityImage(a);
    const ctx = ctxOf(a);
    await withTenant(ctx, async (tx) => {
      await tx.execute(`select set_config('app.is_system','on',true)` as never);
      await tx.update(mediaAssets).set({ moderation: "review" }).where(eq(mediaAssets.id, img.assetId));
    });
    // The student cannot overturn the classifier's verdict.
    expect(await code(withTenant(ctx, (tx) => tx.update(mediaAssets).set({ moderation: "clear" }).where(eq(mediaAssets.id, img.assetId))))).toBe("42501");
    const direct = await code(
      withTenant(ctx, (tx) => tx.insert(posts).values({ workspaceId: ctx.workspaceId, authorMemberId: a.membership!.memberId, mediaAssetId: img.assetId, status: "published" })),
    );
    expect(direct).toBe("42501");
    const { postId } = await createPost(a, { body: "x", imageAssetId: img.assetId, announcement: false }, meta());
    expect(await code(withTenant(ctx, (tx) => tx.update(posts).set({ status: "published" }).where(eq(posts.id, postId))))).toBe("42501");
  });

  it("when approval is required, student posts wait; trainer posts do not", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    await updateSettings(t, { communityEnabled: true, studentPostsRequireApproval: true, studentDirectMessages: true }, meta());
    expect((await post(a, "Preciso de aprovação")).status).toBe("pending_review");
    expect((await post(t, "Recado do treinador")).status).toBe("published");
    const direct = await code(
      withTenant(ctxOf(a), (tx) => tx.insert(posts).values({ workspaceId: ctxOf(a).workspaceId, authorMemberId: a.membership!.memberId, body: "furando a fila", status: "published" })),
    );
    expect(direct).toBe("42501");
  });

  it("when the community is off, students cannot read or post", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    await updateSettings(t, { communityEnabled: false, studentPostsRequireApproval: false, studentDirectMessages: true }, meta());
    expect(await code(listFeed(a, { scope: "all", cursor: null }))).toBe("FORBIDDEN");
    expect(await code(post(a, "oi"))).toBe("FORBIDDEN");
  });

  it("anti-spam: duplicate text and too many links are refused", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    await post(a, "Mesmo texto");
    expect(await code(post(a, "Mesmo texto"))).toBe("CONFLICT");
    expect(await code(post(a, "a.com b.com c.com d.com"))).toBe("VALIDATION");
  });

  it("reports are counted once per member; the trainer removes the content and closes all of them", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const c = await studentOf(t);
    const { postId } = await post(a, "Conteúdo ofensivo");
    await report(b, { targetType: "post", targetId: postId, reason: "harassment", details: null }, meta());
    await report(b, { targetType: "post", targetId: postId, reason: "harassment", details: "de novo" }, meta());
    await report(c, { targetType: "post", targetId: postId, reason: "hate", details: null }, meta());
    expect(await withTenant(ctxOf(c), (tx) => tx.select().from(reports))).toHaveLength(1); // only their own
    const queue = await getModerationQueue(t);
    expect(queue.openCount).toBe(2);
    await resolveReport(t, queue.reports[0]!.id, "remove_content", meta());
    expect((await getModerationQueue(t)).openCount).toBe(0);
    expect(await code(getPost(b, postId))).toBe("NOT_FOUND");
  });

  it("comments: authors remove their own; nobody else except the trainer", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const { postId } = await post(a, "Post");
    await addComment(b, { postId, parentCommentId: null, body: "Comentário do B" }, meta());
    const [cm] = (await getPost(a, postId)).comments;
    expect(await code(withTenant(ctxOf(a), (tx) => tx.update(comments).set({ status: "removed" }).where(eq(comments.id, cm!.id))))).toBe("ok");
    const [row] = await withTenant(ctxOf(t), (tx) => tx.select().from(comments).where(eq(comments.id, cm!.id)));
    expect(row!.status).toBe("published"); // RLS: A's update matched no row
  });
});

describe("sharing workouts", () => {
  it("shares only summary numbers and records, once, and only your own workout", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const supino = (await listExercises(t, { q: "Supino reto com barra" }))[0]!.id;
    const programId = await createProgram(t, { name: "Força", description: null, isTemplate: false }, meta());
    await saveDraft(t, programId, [{ name: "A", notes: null, exercises: [{ exerciseId: supino, variationExerciseId: null, sets: 1, reps: "8", load: null, restSeconds: 60, tempo: null, notes: null }] }], meta());
    await publishDraft(t, programId, meta());
    await assignProgram(t, { programId, memberIds: [a.membership!.memberId], startsOn: "2026-11-01", endsOn: null }, meta());
    const day = (await getProgram(t, programId)).published!.content.days[0]!;
    const r = (await startSession(a, day.id, meta())) as { sessionId: string };
    await logSet(a, { sessionId: r.sessionId, programExerciseId: day.exercises[0]!.id, exerciseId: supino, setNumber: 1, reps: 8, loadKg: 50 });
    await finishSession(a, { sessionId: r.sessionId, effort: 9, notes: "senti o ombro" }, meta());

    expect(await code(shareWorkout(b, { sessionId: r.sessionId, body: null }, meta()))).toBe("NOT_FOUND");
    const { postId } = await shareWorkout(a, { sessionId: r.sessionId, body: "Treino A feito!" }, meta());
    expect(await code(shareWorkout(a, { sessionId: r.sessionId, body: null }, meta()))).toBe("CONFLICT");

    const seen = (await getPost(b, postId)).post;
    expect(seen.workout).toMatchObject({ dayName: "A", programName: "Força", sets: 1, volumeKg: 400 });
    expect(JSON.stringify(seen)).not.toContain("ombro");
    expect(JSON.stringify(seen)).not.toContain('"effort"');
  });
});

describe("social layer: saves, edits, profiles and discovery", () => {
  it("bookmarks are private, idempotent and feed the saved list", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const { postId } = await post(a, "Dica de mobilidade");
    expect(await toggleSave(b, postId)).toEqual({ saved: true });
    expect((await listFeed(b, { scope: "saved", cursor: null })).posts.map((p) => p.id)).toEqual([postId]);
    expect((await listFeed(b, { scope: "all", cursor: null })).posts.find((p) => p.id === postId)!.savedByMe).toBe(true);
    // Nobody else sees the bookmark, not even the trainer.
    expect((await listFeed(a, { scope: "saved", cursor: null })).posts).toHaveLength(0);
    expect(await withTenant(ctxOf(t), (tx) => tx.select().from(postSaves).where(eq(postSaves.postId, postId)))).toHaveLength(0);
    expect(await toggleSave(b, postId)).toEqual({ saved: false });
    expect((await listFeed(b, { scope: "saved", cursor: null })).posts).toHaveLength(0);
    // A post from another community cannot be saved.
    const outsider = await studentOf(await trainer());
    expect(await code(toggleSave(outsider, postId))).toBe("NOT_FOUND");
  });

  it("popular lists the posts people reacted to, most engaged first", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const quiet = (await post(a, "Sem reação")).postId;
    const liked = (await post(a, "Uma curtida")).postId;
    const hot = (await post(b, "Curtida e comentário")).postId;
    await toggleLike(b, liked);
    await toggleLike(a, hot);
    await addComment(a, { postId: hot, parentCommentId: null, body: "Top" }, meta());
    const ids = (await listFeed(t, { scope: "popular", cursor: null })).posts.map((p) => p.id);
    expect(ids).toEqual([hot, liked]);
    expect(ids).not.toContain(quiet);
  });

  it("only the author edits a post, only its text, and the edit is marked", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const b = await studentOf(t);
    const { postId } = await post(a, "Texto com erro");
    expect(await code(editPost(b, { postId, body: "invadido" }, meta()))).toBe("NOT_FOUND");
    expect(await code(editPost(t, { postId, body: "moderado" }, meta()))).toBe("NOT_FOUND");
    // Straight to the database: the trainer cannot rewrite a student's words either.
    expect(await code(withTenant(ctxOf(t), (tx) => tx.update(posts).set({ body: "x" }).where(eq(posts.id, postId))))).toBe("42501");
    expect(await code(withTenant(ctxOf(a), (tx) => tx.update(posts).set({ editedAt: new Date(0) }).where(eq(posts.id, postId))))).toBe("42501");
    expect(await code(editPost(a, { postId, body: null }, meta()))).toBe("VALIDATION");

    const res = await editPost(a, { postId, body: "Texto corrigido" }, meta());
    expect(res.status).toBe("published");
    const seen = (await getPost(b, postId)).post;
    expect(seen.body).toBe("Texto corrigido");
    expect(seen.editedAt).not.toBeNull();
  });

  it("where posts need approval, an edited post goes back to review", async () => {
    const t = await trainer();
    const a = await studentOf(t);
    const { postId } = await post(a, "Aprovado antes da regra");
    await updateSettings(t, { communityEnabled: true, studentPostsRequireApproval: true, studentDirectMessages: true }, meta());
    expect(await code(withTenant(ctxOf(a), (tx) => tx.update(posts).set({ body: "furando a fila" }).where(eq(posts.id, postId))))).toBe("42501");
    expect((await editPost(a, { postId, body: "Agora mudou" }, meta())).status).toBe("pending_review");
    const b = await studentOf(t);
    expect((await listFeed(b, { scope: "all", cursor: null })).posts.map((p) => p.id)).not.toContain(postId);
  });

  it("profiles: own bio, goal and a cleared photo; nobody edits another member's", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    const { assetId, moderation } = await uploadCommunityImage(a);
    expect(moderation).toBe("clear");
    await updateMyProfile(a, { bio: "Corro aos domingos", goal: "conditioning", avatarAssetId: assetId }, meta());

    const seen = await getProfile(b, a.membership!.memberId);
    expect(seen).toMatchObject({ bio: "Corro aos domingos", goal: "conditioning", isMe: false });
    // The photo is visible to the community although it is in no post.
    expect(seen.avatarUrl).toMatch(/^http/);
    expect((await playbackUrls(b, [assetId])).size).toBe(1);
    const outsider = await studentOf(await trainer());
    expect((await playbackUrls(outsider, [assetId])).size).toBe(0);

    // Keeping the photo when it is not sent; removing it with null.
    await updateMyProfile(a, { bio: "Nova bio", goal: null }, meta());
    expect((await getProfile(a, a.membership!.memberId)).avatarUrl).toMatch(/^http/);
    await updateMyProfile(a, { bio: null, goal: null, avatarAssetId: null }, meta());
    expect((await getProfile(b, a.membership!.memberId)).avatarUrl).toBeNull();
    expect((await playbackUrls(b, [assetId])).size).toBe(0);

    // Another member's photo or profile row is out of reach.
    expect(await code(updateMyProfile(b, { bio: null, goal: null, avatarAssetId: assetId }, meta()))).toBe("NOT_FOUND");
    await updateMyProfile(a, { bio: "da Ana", goal: null }, meta());
    await withTenant(ctxOf(b), (tx) => tx.update(memberProfiles).set({ bio: "pichado" }).where(eq(memberProfiles.memberId, a.membership!.memberId)));
    expect((await getProfile(b, a.membership!.memberId)).bio).toBe("da Ana");
    expect(await code(updateMyProfile(a, { bio: "veja www.spam.com", goal: null }, meta()))).toBe("VALIDATION");
  });

  it("discover suggests people not followed yet, matches goals and searches by name", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana Lima");
    const b = await studentOf(t, "Beto Souza");
    const c = await studentOf(t, "Carla Dias");
    await updateMyProfile(a, { bio: null, goal: "strength" }, meta());
    await updateMyProfile(c, { bio: null, goal: "strength" }, meta());
    await setFollow(a, b.membership!.memberId, true);

    const d = await getDiscover(a);
    const suggested = d.suggestions.map((p) => p.name);
    expect(suggested).toContain("Carla Dias");
    expect(suggested).not.toContain("Beto Souza");
    expect(suggested).not.toContain("Ana Lima");
    expect(d.sameGoal.map((p) => p.name)).toEqual(["Carla Dias"]);
    expect(d.members).toBe(4);

    await setBlock(c, a.membership!.memberId, true, meta());
    expect((await getDiscover(a)).suggestions.map((p) => p.name)).not.toContain("Carla Dias");
    expect((await searchPeople(a, "carla")).map((p) => p.name)).toEqual([]);
    expect((await searchPeople(a, "bet")).map((p) => p.name)).toEqual(["Beto Souza"]);
    expect(await searchPeople(a, "%%")).toEqual([]);

    expect((await listConnections(a, b.membership!.memberId, "followers")).map((p) => p.name)).toEqual(["Ana Lima"]);
    expect((await listConnections(b, a.membership!.memberId, "following")).map((p) => p.name)).toEqual(["Beto Souza"]);
  });

  it("the trained-today row shows who checked in, except members who hid themselves", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const b = await studentOf(t, "Beto");
    await manualCheckin(a, "Corrida", meta());
    await manualCheckin(b, "Bike", meta());
    expect((await listTrainedToday(a)).map((p) => p.name)).toEqual(["Ana", "Beto"]);
    await setRankingHidden(b, true);
    expect((await listTrainedToday(a)).map((p) => p.name)).toEqual(["Ana"]);
    // Beto still sees himself; the activity itself is never exposed.
    expect((await listTrainedToday(b)).map((p) => p.name)).toEqual(["Beto", "Ana"]);
    expect(JSON.stringify(await listTrainedToday(a))).not.toContain("Corrida");
    expect((await getProfile(a, b.membership!.memberId)).constancy).toBeNull();
    expect((await getProfile(b, a.membership!.memberId)).constancy).toMatchObject({ checkins: 1 });
  });

  it("a new comment comes back ready to show", async () => {
    const t = await trainer();
    const a = await studentOf(t, "Ana");
    const { postId } = await post(t, "Bem-vindos");
    const c = await addComment(a, { postId, parentCommentId: null, body: "Cheguei!" }, meta());
    expect(c).toMatchObject({ body: "Cheguei!", parentCommentId: null, author: { name: "Ana", isMe: true } });
    expect((await getPost(t, postId)).comments.map((x) => x.id)).toEqual([c.id]);
  });
});
