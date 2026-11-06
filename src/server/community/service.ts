import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { countLinks } from "@/lib/validation/community";
import { setTenantContext, withTenant } from "../db/context";
import type { Tx } from "../db/client";
import {
  comments,
  follows,
  mediaAssets,
  memberBlocks,
  messages,
  postLikes,
  posts,
  reports,
  users,
  workspaceMembers,
  workspaceSettings,
  type WorkoutSnapshot,
} from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { playbackUrls } from "../media/service";
import { getSessionSummary } from "../workouts/service";
import { notify, type NotifyItem } from "../notifications/service";

export const FEED_PAGE = 20;
const MAX_LINKS_POST = 3;
const MAX_LINKS_COMMENT = 2;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export type CommunitySettings = { communityEnabled: boolean; studentPostsRequireApproval: boolean; studentDirectMessages: boolean };
const DEFAULT_SETTINGS: CommunitySettings = { communityEnabled: true, studentPostsRequireApproval: false, studentDirectMessages: true };

function scope(actor: Actor) {
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

export async function readSettings(tx: Tx, workspaceId: string): Promise<CommunitySettings> {
  const [s] = await tx
    .select({ communityEnabled: workspaceSettings.communityEnabled, studentPostsRequireApproval: workspaceSettings.studentPostsRequireApproval, studentDirectMessages: workspaceSettings.studentDirectMessages })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId));
  return s ?? DEFAULT_SETTINGS;
}

async function assertCommunityOpen(tx: Tx, actor: Actor, workspaceId: string) {
  const s = await readSettings(tx, workspaceId);
  if (!s.communityEnabled && actor.membership?.role !== "trainer") throw new AppError("FORBIDDEN", "A comunidade está desativada pelo seu treinador.");
  return s;
}

/** Members either of whom blocked the other, relative to the actor. */
const notBlocked = (memberId: string, authorColumn: typeof posts.authorMemberId | typeof comments.authorMemberId) =>
  sql`not app_block_between(${memberId}::uuid, ${authorColumn})`;

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

async function antiSpam(tx: Tx, memberId: string, body: string | null) {
  if (countLinks(body) > MAX_LINKS_POST) throw new AppError("VALIDATION", `Use no máximo ${MAX_LINKS_POST} links por post.`);
  if (!body) return;
  const [dup] = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.authorMemberId, memberId), eq(posts.body, body), gt(posts.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS))))
    .limit(1);
  if (dup) throw new AppError("CONFLICT", "Você acabou de publicar esse mesmo texto.");
}

export type CreatePostResult = { postId: string; status: "published" | "pending_review" };

export async function createPost(actor: Actor, input: { body: string | null; imageAssetId: string | null; announcement: boolean }, meta: RequestMeta): Promise<CreatePostResult> {
  assertCan(actor, input.announcement ? "community.announce" : "community.post");
  const { m, ctx } = scope(actor);
  await enforceRateLimit("post_create_user", actor.userId);
  if (!input.body && !input.imageAssetId) throw Errors.validation({ body: ["Escreva algo ou adicione uma foto."] });
  return withTenant(ctx, async (tx) => {
    const settings = await assertCommunityOpen(tx, actor, m.workspaceId);
    await antiSpam(tx, m.memberId, input.body);
    let reviewReason: string | null = null;
    if (input.imageAssetId) {
      const [a] = await tx
        .select({ moderation: mediaAssets.moderation })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.id, input.imageAssetId), eq(mediaAssets.ownerMemberId, m.memberId), eq(mediaAssets.status, "ready")));
      if (!a) throw Errors.notFound();
      if (a.moderation === "review") reviewReason = "image_flagged";
    }
    if (!reviewReason && settings.studentPostsRequireApproval && m.role === "student") reviewReason = "approval_required";
    const status = reviewReason ? "pending_review" : "published";
    const [p] = await tx
      .insert(posts)
      .values({
        workspaceId: m.workspaceId,
        authorMemberId: m.memberId,
        kind: input.announcement ? "announcement" : "text",
        body: input.body,
        mediaAssetId: input.imageAssetId,
        status,
        reviewReason,
        pinned: input.announcement,
      })
      .returning({ id: posts.id });
    await audit(tx, { action: "community.post_created", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "post", targetId: p!.id, metadata: { status }, ipHash: meta.ipHash });
    if (input.announcement && status === "published") {
      const students = await tx
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.role, "student"), eq(workspaceMembers.status, "active")));
      await notify(
        tx,
        ctx,
        students.map((s) => ({ recipientMemberId: s.id, type: "announcement" as const, actorMemberId: m.memberId, targetId: p!.id, dedupeKey: `announcement:${p!.id}` })),
      );
    }
    return { postId: p!.id, status };
  });
}

/** Shares a completed workout. Only summary numbers and records are copied; effort and notes stay private. */
export async function shareWorkout(actor: Actor, input: { sessionId: string; body: string | null }, meta: RequestMeta): Promise<CreatePostResult> {
  assertCan(actor, "community.post");
  const { m, ctx } = scope(actor);
  await enforceRateLimit("post_create_user", actor.userId);
  const summary = await getSessionSummary(actor, input.sessionId);
  if (!summary.completedAt) throw new AppError("CONFLICT", "Conclua o treino antes de compartilhar.");
  const workout: WorkoutSnapshot = {
    dayName: summary.dayName,
    programName: summary.programName,
    durationMinutes: summary.durationSeconds == null ? null : Math.max(1, Math.round(summary.durationSeconds / 60)),
    sets: summary.totalSets,
    volumeKg: summary.volumeKg,
    records: summary.records.map((r) => ({ exerciseName: r.exerciseName, reps: r.reps, loadKg: r.loadKg })),
  };
  return withTenant(ctx, async (tx) => {
    const settings = await assertCommunityOpen(tx, actor, m.workspaceId);
    await antiSpam(tx, m.memberId, input.body);
    const [already] = await tx.select({ id: posts.id }).from(posts).where(eq(posts.sessionId, input.sessionId));
    if (already) throw new AppError("CONFLICT", "Este treino já foi compartilhado.");
    const status = settings.studentPostsRequireApproval ? "pending_review" : "published";
    const [p] = await tx
      .insert(posts)
      .values({ workspaceId: m.workspaceId, authorMemberId: m.memberId, kind: "workout", body: input.body, sessionId: input.sessionId, workout, status, reviewReason: status === "pending_review" ? "approval_required" : null })
      .returning({ id: posts.id });
    await audit(tx, { action: "community.workout_shared", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "post", targetId: p!.id, ipHash: meta.ipHash });
    return { postId: p!.id, status };
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type FeedPost = {
  id: string;
  kind: "text" | "workout" | "announcement";
  body: string | null;
  workout: WorkoutSnapshot | null;
  imageUrl: string | null;
  status: "published" | "pending_review" | "removed";
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
  author: { memberId: string; name: string; role: "trainer" | "student"; isMe: boolean };
};

const postColumns = (memberId: string) => ({
  id: posts.id,
  kind: posts.kind,
  body: posts.body,
  workout: posts.workout,
  mediaAssetId: posts.mediaAssetId,
  status: posts.status,
  pinned: posts.pinned,
  likeCount: posts.likeCount,
  commentCount: posts.commentCount,
  createdAt: posts.createdAt,
  authorMemberId: posts.authorMemberId,
  authorName: users.displayName,
  authorRole: workspaceMembers.role,
  likedByMe: sql<boolean>`exists (select 1 from post_likes l where l.post_id = ${posts.id} and l.member_id = ${memberId}::uuid)`,
});

type PostRow = { [K in keyof ReturnType<typeof postColumns>]: unknown } & {
  id: string;
  kind: FeedPost["kind"];
  body: string | null;
  workout: WorkoutSnapshot | null;
  mediaAssetId: string | null;
  status: FeedPost["status"];
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  authorMemberId: string;
  authorName: string;
  authorRole: "trainer" | "student";
  likedByMe: boolean;
};

async function hydrate(actor: Actor, memberId: string, rows: PostRow[]): Promise<FeedPost[]> {
  const urls = await playbackUrls(actor, rows.map((r) => r.mediaAssetId).filter((x): x is string => !!x));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    workout: r.workout,
    imageUrl: r.mediaAssetId ? (urls.get(r.mediaAssetId) ?? null) : null,
    status: r.status,
    pinned: r.pinned,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    likedByMe: r.likedByMe,
    createdAt: r.createdAt.toISOString(),
    author: { memberId: r.authorMemberId, name: r.authorName, role: r.authorRole, isMe: r.authorMemberId === memberId },
  }));
}

export type FeedCursor = { createdAt: string; id: string } | null;

/**
 * Chronological feed with keyset pagination on (created_at, id). Pinned
 * announcements lead the first page. Blocked members are hidden both ways;
 * the author's own pending posts are shown so they know they await review.
 */
export async function listFeed(actor: Actor, opts: { scope: "all" | "following"; cursor: FeedCursor; authorMemberId?: string }) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    const settings = await assertCommunityOpen(tx, actor, m.workspaceId);
    const base = and(
      eq(posts.workspaceId, m.workspaceId),
      or(eq(posts.status, "published"), and(eq(posts.status, "pending_review"), eq(posts.authorMemberId, m.memberId))),
      notBlocked(m.memberId, posts.authorMemberId),
      opts.authorMemberId ? eq(posts.authorMemberId, opts.authorMemberId) : undefined,
      opts.scope === "following"
        ? or(eq(posts.authorMemberId, m.memberId), sql`${posts.authorMemberId} in (select f.followed_member_id from follows f where f.follower_member_id = ${m.memberId}::uuid)`)
        : undefined,
    );
    const select = () =>
      tx
        .select(postColumns(m.memberId))
        .from(posts)
        .innerJoin(workspaceMembers, eq(workspaceMembers.id, posts.authorMemberId))
        .innerJoin(users, eq(users.id, workspaceMembers.userId));

    const pinned = !opts.cursor && !opts.authorMemberId ? await select().where(and(base, eq(posts.pinned, true))).orderBy(desc(posts.createdAt)).limit(3) : [];
    const cursorCond = opts.cursor
      ? or(lt(posts.createdAt, new Date(opts.cursor.createdAt)), and(eq(posts.createdAt, new Date(opts.cursor.createdAt)), lt(posts.id, opts.cursor.id)))
      : undefined;
    const rows = await select()
      .where(and(base, opts.authorMemberId ? undefined : eq(posts.pinned, false), cursorCond))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(FEED_PAGE + 1);
    const hasMore = rows.length > FEED_PAGE;
    const page = rows.slice(0, FEED_PAGE);
    const last = page[page.length - 1];
    return {
      settings,
      posts: await hydrate(actor, m.memberId, [...pinned, ...page] as PostRow[]),
      nextCursor: hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
    };
  });
}

export type CommentView = { id: string; body: string; createdAt: string; parentCommentId: string | null; status: string; author: { memberId: string; name: string; role: string; isMe: boolean } };

export async function getPost(actor: Actor, postId: string) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  const data = await withTenant(ctx, async (tx) => {
    await assertCommunityOpen(tx, actor, m.workspaceId);
    const [row] = await tx
      .select(postColumns(m.memberId))
      .from(posts)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, posts.authorMemberId))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(posts.id, postId), eq(posts.workspaceId, m.workspaceId), notBlocked(m.memberId, posts.authorMemberId)));
    if (!row || (row.status === "removed" && m.role !== "trainer")) throw Errors.notFound();
    const list = await tx
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, parentCommentId: comments.parentCommentId, status: comments.status, authorMemberId: comments.authorMemberId, authorName: users.displayName, authorRole: workspaceMembers.role })
      .from(comments)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, comments.authorMemberId))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(comments.postId, postId), eq(comments.status, "published"), notBlocked(m.memberId, comments.authorMemberId)))
      .orderBy(asc(comments.createdAt))
      .limit(500);
    return { row: row as PostRow, list };
  });
  const [post] = await hydrate(actor, m.memberId, [data.row]);
  const views: CommentView[] = data.list.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    parentCommentId: c.parentCommentId,
    status: c.status,
    author: { memberId: c.authorMemberId, name: c.authorName, role: c.authorRole, isMe: c.authorMemberId === m.memberId },
  }));
  return { post: post!, comments: views };
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

async function loadVisiblePost(tx: Tx, memberId: string, workspaceId: string, postId: string) {
  const [p] = await tx
    .select({ id: posts.id, authorMemberId: posts.authorMemberId, status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId), eq(posts.status, "published"), notBlocked(memberId, posts.authorMemberId)));
  if (!p) throw Errors.notFound();
  return p;
}

/** Likes or unlikes. Idempotent: the (post, member) primary key makes double likes impossible. */
export async function toggleLike(actor: Actor, postId: string): Promise<{ liked: boolean; likeCount: number }> {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  await enforceRateLimit("like_user", actor.userId);
  return withTenant(ctx, async (tx) => {
    await assertCommunityOpen(tx, actor, m.workspaceId);
    const target = await loadVisiblePost(tx, m.memberId, m.workspaceId, postId);
    const removed = await tx.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.memberId, m.memberId))).returning({ postId: postLikes.postId });
    if (removed.length === 0) {
      await tx.insert(postLikes).values({ postId, memberId: m.memberId, workspaceId: m.workspaceId }).onConflictDoNothing();
      // Like → unlike → like produces one notification (same dedupe key).
      await notify(tx, ctx, [{ recipientMemberId: target.authorMemberId, type: "post_liked", actorMemberId: m.memberId, targetId: postId, dedupeKey: `like:${postId}:${m.memberId}` }]);
    }
    const [p] = await tx.select({ likeCount: posts.likeCount }).from(posts).where(eq(posts.id, postId));
    return { liked: removed.length === 0, likeCount: p?.likeCount ?? 0 };
  });
}

export async function addComment(actor: Actor, input: { postId: string; parentCommentId: string | null; body: string }, meta: RequestMeta) {
  assertCan(actor, "community.post");
  const { m, ctx } = scope(actor);
  await enforceRateLimit("comment_create_user", actor.userId);
  if (countLinks(input.body) > MAX_LINKS_COMMENT) throw new AppError("VALIDATION", `Use no máximo ${MAX_LINKS_COMMENT} links por comentário.`);
  await withTenant(ctx, async (tx) => {
    await assertCommunityOpen(tx, actor, m.workspaceId);
    const target = await loadVisiblePost(tx, m.memberId, m.workspaceId, input.postId);
    let parentAuthor: string | null = null;
    if (input.parentCommentId) {
      const [parent] = await tx
        .select({ id: comments.id, authorMemberId: comments.authorMemberId })
        .from(comments)
        .where(and(eq(comments.id, input.parentCommentId), eq(comments.postId, input.postId), isNull(comments.parentCommentId), eq(comments.status, "published")));
      if (!parent) throw Errors.notFound();
      parentAuthor = parent.authorMemberId;
    }
    const [c] = await tx
      .insert(comments)
      .values({ workspaceId: m.workspaceId, postId: input.postId, authorMemberId: m.memberId, parentCommentId: input.parentCommentId, body: input.body })
      .returning({ id: comments.id });
    await audit(tx, { action: "community.comment_created", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "comment", targetId: c!.id, ipHash: meta.ipHash });
    const items: NotifyItem[] = [];
    if (parentAuthor) items.push({ recipientMemberId: parentAuthor, type: "comment_replied", actorMemberId: m.memberId, targetId: input.postId, dedupeKey: `reply:${c!.id}` });
    if (target.authorMemberId !== parentAuthor) {
      items.push({ recipientMemberId: target.authorMemberId, type: "post_commented", actorMemberId: m.memberId, targetId: input.postId, dedupeKey: `comment:${c!.id}` });
    }
    await notify(tx, ctx, items);
  });
}

/** Authors remove their own content; trainers remove anything in their community. */
export async function removePost(actor: Actor, postId: string, meta: RequestMeta) {
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    const [p] = await tx.select({ authorMemberId: posts.authorMemberId, status: posts.status }).from(posts).where(and(eq(posts.id, postId), eq(posts.workspaceId, m.workspaceId)));
    if (!p) throw Errors.notFound();
    const isAuthor = p.authorMemberId === m.memberId;
    if (!isAuthor) assertCan(actor, "community.moderate");
    if (p.status === "removed") return;
    await tx.update(posts).set({ status: "removed", removedAt: new Date(), removedByUserId: actor.userId, pinned: isAuthor ? undefined : false }).where(eq(posts.id, postId));
    await audit(tx, { action: isAuthor ? "community.post_deleted" : "community.post_removed_by_trainer", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "post", targetId: postId, ipHash: meta.ipHash });
    if (!isAuthor) await notify(tx, ctx, [{ recipientMemberId: p.authorMemberId, type: "post_removed", actorMemberId: m.memberId, targetId: postId, dedupeKey: `removed:${postId}` }]);
  });
}

export async function removeComment(actor: Actor, commentId: string, meta: RequestMeta) {
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    const [c] = await tx.select({ authorMemberId: comments.authorMemberId, status: comments.status }).from(comments).where(and(eq(comments.id, commentId), eq(comments.workspaceId, m.workspaceId)));
    if (!c) throw Errors.notFound();
    const isAuthor = c.authorMemberId === m.memberId;
    if (!isAuthor) assertCan(actor, "community.moderate");
    if (c.status === "removed") return;
    await tx.update(comments).set({ status: "removed", removedAt: new Date(), removedByUserId: actor.userId }).where(eq(comments.id, commentId));
    await audit(tx, { action: isAuthor ? "community.comment_deleted" : "community.comment_removed_by_trainer", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "comment", targetId: commentId, ipHash: meta.ipHash });
  });
}

async function assertMemberOfWorkspace(tx: Tx, workspaceId: string, memberId: string) {
  const [x] = await tx
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.status, "active")));
  if (!x) throw Errors.notFound();
}

export async function setFollow(actor: Actor, memberId: string, follow: boolean) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  if (memberId === m.memberId) throw new AppError("VALIDATION", "Você não pode seguir a si mesmo.");
  await enforceRateLimit("like_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    await assertMemberOfWorkspace(tx, m.workspaceId, memberId);
    if (follow) {
      const [blocked] = await tx.select({ b: sql<boolean>`app_block_between(${m.memberId}::uuid, ${memberId}::uuid)` }).from(sql`(select 1) x`);
      if (blocked?.b) throw Errors.notFound();
      await tx.insert(follows).values({ followerMemberId: m.memberId, followedMemberId: memberId, workspaceId: m.workspaceId }).onConflictDoNothing();
      await notify(tx, ctx, [{ recipientMemberId: memberId, type: "new_follower", actorMemberId: m.memberId, targetId: m.memberId, dedupeKey: `follow:${m.memberId}` }]);
    } else {
      await tx.delete(follows).where(and(eq(follows.followerMemberId, m.memberId), eq(follows.followedMemberId, memberId)));
    }
  });
}

/** Blocking hides both members' posts and comments from each other and removes follows between them. */
export async function setBlock(actor: Actor, memberId: string, block: boolean, meta: RequestMeta) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  if (memberId === m.memberId) throw new AppError("VALIDATION", "Você não pode bloquear a si mesmo.");
  await withTenant(ctx, async (tx) => {
    await assertMemberOfWorkspace(tx, m.workspaceId, memberId);
    if (block) {
      await tx.insert(memberBlocks).values({ blockerMemberId: m.memberId, blockedMemberId: memberId, workspaceId: m.workspaceId }).onConflictDoNothing();
      await tx.delete(follows).where(and(eq(follows.followerMemberId, m.memberId), eq(follows.followedMemberId, memberId)));
      // The other side's follow is removed in the system context, since it is not the actor's row.
      await setTenantContext(tx, { ...ctx, isSystem: true });
      await tx.delete(follows).where(and(eq(follows.followerMemberId, memberId), eq(follows.followedMemberId, m.memberId)));
      await setTenantContext(tx, ctx);
    } else {
      await tx.delete(memberBlocks).where(and(eq(memberBlocks.blockerMemberId, m.memberId), eq(memberBlocks.blockedMemberId, memberId)));
    }
    await audit(tx, { action: block ? "community.member_blocked" : "community.member_unblocked", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "member", targetId: memberId, ipHash: meta.ipHash });
  });
}

/** One report per member and target. The trainer reviews reports in the moderation queue. */
export async function report(
  actor: Actor,
  input: { targetType: "post" | "comment" | "member" | "message"; targetId: string; reason: "spam" | "harassment" | "nudity" | "hate" | "unsafe_training" | "other"; details: string | null },
  meta: RequestMeta,
) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  await enforceRateLimit("comment_create_user", actor.userId);
  await withTenant(ctx, async (tx) => {
    // A message can be reported only by someone who can read it (a participant, via RLS),
    // and only messages sent by the other person.
    const table = input.targetType === "post" ? posts : input.targetType === "comment" ? comments : input.targetType === "message" ? messages : workspaceMembers;
    const [target] = await tx.select({ id: table.id }).from(table).where(and(eq(table.id, input.targetId), eq(table.workspaceId, m.workspaceId)));
    if (!target) throw Errors.notFound();
    if (input.targetType === "message") {
      const [own] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.id, input.targetId), eq(messages.senderMemberId, m.memberId)));
      if (own) throw new AppError("VALIDATION", "Você não pode denunciar a própria mensagem.");
    }
    const inserted = await tx
      .insert(reports)
      .values({ workspaceId: m.workspaceId, reporterMemberId: m.memberId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details })
      .onConflictDoNothing()
      .returning({ id: reports.id });
    if (inserted.length) {
      await audit(tx, { action: "community.reported", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: input.targetType, targetId: input.targetId, metadata: { reason: input.reason }, ipHash: meta.ipHash });
    }
  });
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function getProfile(actor: Actor, memberId: string) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, async (tx) => {
    await assertCommunityOpen(tx, actor, m.workspaceId);
    const [p] = await tx
      .select({
        memberId: workspaceMembers.id,
        name: users.displayName,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        followers: sql<number>`(select count(*)::int from follows f where f.followed_member_id = ${workspaceMembers.id})`,
        following: sql<number>`(select count(*)::int from follows f where f.follower_member_id = ${workspaceMembers.id})`,
        posts: sql<number>`(select count(*)::int from posts x where x.author_member_id = ${workspaceMembers.id} and x.status = 'published')`,
        isFollowing: sql<boolean>`exists (select 1 from follows f where f.follower_member_id = ${m.memberId}::uuid and f.followed_member_id = ${workspaceMembers.id})`,
        blockedByMe: sql<boolean>`exists (select 1 from member_blocks b where b.blocker_member_id = ${m.memberId}::uuid and b.blocked_member_id = ${workspaceMembers.id})`,
        hidden: sql<boolean>`app_block_between(${m.memberId}::uuid, ${workspaceMembers.id})`,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, m.workspaceId), eq(workspaceMembers.status, "active")));
    // Someone who blocked the actor simply does not exist for them.
    if (!p || (p.hidden && !p.blockedByMe)) throw Errors.notFound();
    return { ...p, isMe: p.memberId === m.memberId };
  });
}

// ---------------------------------------------------------------------------
// Trainer moderation
// ---------------------------------------------------------------------------

export async function getModerationQueue(actor: Actor) {
  assertCan(actor, "community.moderate");
  const { m, ctx } = scope(actor);
  const data = await withTenant(ctx, async (tx) => {
    const pending = await tx
      .select(postColumns(m.memberId))
      .from(posts)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, posts.authorMemberId))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(posts.workspaceId, m.workspaceId), eq(posts.status, "pending_review")))
      .orderBy(asc(posts.createdAt))
      .limit(50);
    const reasons = pending.length
      ? await tx.select({ id: posts.id, reviewReason: posts.reviewReason }).from(posts).where(inArray(posts.id, pending.map((p) => p.id)))
      : [];
    const open = await tx
      .select({ id: reports.id, targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason, details: reports.details, createdAt: reports.createdAt, reporterName: users.displayName })
      .from(reports)
      .innerJoin(workspaceMembers, eq(workspaceMembers.id, reports.reporterMemberId))
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(reports.workspaceId, m.workspaceId), eq(reports.status, "open")))
      .orderBy(asc(reports.createdAt))
      .limit(100);
    // Previews of reported content so the trainer can decide without leaving the queue.
    const postIds = open.filter((r) => r.targetType === "post").map((r) => r.targetId);
    const commentIds = open.filter((r) => r.targetType === "comment").map((r) => r.targetId);
    const memberIds = open.filter((r) => r.targetType === "member").map((r) => r.targetId);
    const postPreviews = postIds.length ? await tx.select({ id: posts.id, text: posts.body, status: posts.status }).from(posts).where(inArray(posts.id, postIds)) : [];
    const commentPreviews = commentIds.length ? await tx.select({ id: comments.id, text: comments.body, status: comments.status, postId: comments.postId }).from(comments).where(inArray(comments.id, commentIds)) : [];
    const memberPreviews = memberIds.length
      ? await tx.select({ id: workspaceMembers.id, text: users.displayName }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(inArray(workspaceMembers.id, memberIds))
      : [];
    // Reported messages: the trainer cannot read conversations, so only the reported
    // message itself is read, from the system context (the reporter disclosed it).
    const messageIds = open.filter((r) => r.targetType === "message").map((r) => r.targetId);
    let messagePreviews: { id: string; text: string | null; status?: string }[] = [];
    if (messageIds.length) {
      await setTenantContext(tx, { ...ctx, isSystem: true });
      messagePreviews = (
        await tx.select({ id: messages.id, body: messages.body, deletedAt: messages.deletedAt }).from(messages).where(and(inArray(messages.id, messageIds), eq(messages.workspaceId, m.workspaceId)))
      ).map((x) => ({ id: x.id, text: x.deletedAt ? "(mensagem apagada pelo autor)" : x.body ?? "(foto)" }));
      await setTenantContext(tx, ctx);
    }
    const preview = new Map<string, { text: string | null; status?: string; postId?: string }>(
      [...postPreviews, ...commentPreviews, ...memberPreviews, ...messagePreviews].map((x) => [x.id, x]),
    );
    const [{ n: openCount } = { n: 0 }] = await tx.select({ n: count() }).from(reports).where(and(eq(reports.workspaceId, m.workspaceId), eq(reports.status, "open")));
    return { pending: pending as PostRow[], reasons: new Map(reasons.map((r) => [r.id, r.reviewReason])), reports: open.map((r) => ({ ...r, preview: preview.get(r.targetId) ?? null })), openCount };
  });
  const pendingPosts = await hydrate(actor, m.memberId, data.pending);
  return { pending: pendingPosts.map((p) => ({ ...p, reviewReason: data.reasons.get(p.id) ?? null })), reports: data.reports, openCount: data.openCount };
}

export async function moderatePost(actor: Actor, postId: string, decision: "approve" | "remove", meta: RequestMeta) {
  assertCan(actor, "community.moderate");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    const res = await tx
      .update(posts)
      .set(decision === "approve" ? { status: "published", reviewReason: null } : { status: "removed", removedAt: new Date(), removedByUserId: actor.userId })
      .where(and(eq(posts.id, postId), eq(posts.workspaceId, m.workspaceId), eq(posts.status, "pending_review")))
      .returning({ id: posts.id, authorMemberId: posts.authorMemberId });
    if (res.length === 0) throw Errors.notFound();
    await audit(tx, { action: decision === "approve" ? "community.post_approved" : "community.post_rejected", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "post", targetId: postId, ipHash: meta.ipHash });
    await notify(tx, ctx, [
      {
        recipientMemberId: res[0]!.authorMemberId,
        type: decision === "approve" ? "post_approved" : "post_removed",
        actorMemberId: m.memberId,
        targetId: postId,
        dedupeKey: `${decision === "approve" ? "approved" : "removed"}:${postId}`,
      },
    ]);
  });
}

/** Closes a report; "remove_content" also removes the reported post or comment. Duplicate reports on the same target close together. */
export async function resolveReport(actor: Actor, reportId: string, decision: "remove_content" | "dismiss", meta: RequestMeta) {
  assertCan(actor, "community.moderate");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    const [r] = await tx.select().from(reports).where(and(eq(reports.id, reportId), eq(reports.workspaceId, m.workspaceId), eq(reports.status, "open")));
    if (!r) throw Errors.notFound();
    if (decision === "remove_content") {
      if (r.targetType === "post") {
        const [removed] = await tx
          .update(posts)
          .set({ status: "removed", removedAt: new Date(), removedByUserId: actor.userId, pinned: false })
          .where(and(eq(posts.id, r.targetId), eq(posts.workspaceId, m.workspaceId)))
          .returning({ authorMemberId: posts.authorMemberId });
        if (removed) await notify(tx, ctx, [{ recipientMemberId: removed.authorMemberId, type: "post_removed", actorMemberId: m.memberId, targetId: r.targetId, dedupeKey: `removed:${r.targetId}` }]);
      } else if (r.targetType === "comment") {
        await tx.update(comments).set({ status: "removed", removedAt: new Date(), removedByUserId: actor.userId }).where(and(eq(comments.id, r.targetId), eq(comments.workspaceId, m.workspaceId)));
      }
    }
    await tx
      .update(reports)
      .set({ status: decision === "dismiss" ? "dismissed" : "resolved", resolvedByUserId: actor.userId, resolvedAt: new Date() })
      .where(and(eq(reports.workspaceId, m.workspaceId), eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")));
    await audit(tx, { action: `community.report_${decision}`, actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: r.targetType, targetId: r.targetId, ipHash: meta.ipHash });
  });
}

export async function updateSettings(actor: Actor, input: CommunitySettings, meta: RequestMeta) {
  assertCan(actor, "community.moderate");
  const { m, ctx } = scope(actor);
  await withTenant(ctx, async (tx) => {
    await tx
      .insert(workspaceSettings)
      .values({ workspaceId: m.workspaceId, ...input })
      .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { ...input, updatedAt: new Date() } });
    await audit(tx, { action: "community.settings_updated", actorUserId: actor.userId, workspaceId: m.workspaceId, metadata: { ...input }, ipHash: meta.ipHash });
  });
}

export async function getSettings(actor: Actor) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  return withTenant(ctx, (tx) => readSettings(tx, m.workspaceId));
}
