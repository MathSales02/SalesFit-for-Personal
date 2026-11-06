import "server-only";
import { and, asc, desc, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import { countLinks } from "@/lib/validation/community";
import { withTenant } from "../db/context";
import type { Tx } from "../db/client";
import { conversations, mediaAssets, messages, users, workspaceMembers } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { AppError, Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { deleteObject } from "../storage/s3";
import type { RequestMeta } from "../http/request-meta";
import { audit } from "../security/audit";
import { enforceRateLimit } from "../security/rate-limit";
import { playbackUrls } from "../media/service";
import { notify } from "../notifications/service";

export const MESSAGES_PAGE = 30;
const MAX_LINKS = 3;

function scope(actor: Actor) {
  assertCan(actor, "messages.use");
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

const notAllowed = () => new AppError("FORBIDDEN", "Não é possível conversar com esta pessoa.");

/** People the actor may message right now (rules enforced again by the database). */
export async function listContacts(actor: Actor) {
  const { m, ctx } = scope(actor);
  return withTenant(ctx, (tx) =>
    tx
      .select({ memberId: workspaceMembers.id, name: users.displayName, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, m.workspaceId), ne(workspaceMembers.id, m.memberId), sql`app_dm_allowed(${m.memberId}::uuid, ${workspaceMembers.id})`))
      .orderBy(desc(sql`${workspaceMembers.role} = 'trainer'`), asc(sql`lower(${users.displayName})`))
      .limit(500),
  );
}

export type ConversationSummary = {
  id: string;
  other: { memberId: string; name: string; role: "trainer" | "student" };
  lastMessageAt: string | null;
  preview: string | null;
  unread: number;
};

export async function listConversations(actor: Actor): Promise<ConversationSummary[]> {
  const { m, ctx } = scope(actor);
  const me = m.memberId;
  const rows = await withTenant(ctx, (tx) =>
    tx.execute<{
      id: string;
      other_id: string;
      other_name: string;
      other_role: "trainer" | "student";
      last_message_at: Date | null;
      preview_body: string | null;
      preview_media: string | null;
      preview_deleted: Date | null;
      preview_mine: boolean | null;
      unread: number;
    }>(sql`
      select c.id,
        o.id as other_id, u.display_name as other_name, o.role as other_role,
        c.last_message_at,
        lm.body as preview_body, lm.media_asset_id as preview_media, lm.deleted_at as preview_deleted, (lm.sender_member_id = ${me}::uuid) as preview_mine,
        (select count(*)::int from messages x
          where x.conversation_id = c.id and x.sender_member_id <> ${me}::uuid and x.deleted_at is null
            and x.created_at > coalesce(case when c.member_a_id = ${me}::uuid then c.a_last_read_at else c.b_last_read_at end, 'epoch'::timestamptz)) as unread
      from conversations c
      join workspace_members o on o.id = case when c.member_a_id = ${me}::uuid then c.member_b_id else c.member_a_id end
      join users u on u.id = o.user_id
      left join lateral (select body, media_asset_id, deleted_at, sender_member_id from messages where conversation_id = c.id order by created_at desc, id desc limit 1) lm on true
      where c.workspace_id = ${m.workspaceId}::uuid and (c.member_a_id = ${me}::uuid or c.member_b_id = ${me}::uuid) and c.last_message_at is not null
      order by c.last_message_at desc
      limit 100`),
  );
  return rows.rows.map((r) => ({
    id: r.id,
    other: { memberId: r.other_id, name: r.other_name, role: r.other_role },
    lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    preview: r.preview_deleted ? "Mensagem apagada" : `${r.preview_mine ? "Você: " : ""}${r.preview_body ? r.preview_body.slice(0, 80) : r.preview_media ? "Foto" : ""}`,
    unread: Number(r.unread),
  }));
}

/** Conversations with unread messages, for the navigation badge. */
export async function unreadConversationCount(actor: Actor): Promise<number> {
  if (!actor.membership) return 0;
  return (await listConversations(actor)).filter((c) => c.unread > 0).length;
}

/** Finds or creates the single conversation of a pair. */
export async function openConversation(actor: Actor, otherMemberId: string): Promise<string> {
  const { m, ctx } = scope(actor);
  await enforceRateLimit("message_send_user", actor.userId);
  if (otherMemberId === m.memberId) throw notAllowed();
  const [a, b] = m.memberId < otherMemberId ? [m.memberId, otherMemberId] : [otherMemberId, m.memberId];
  return withTenant(ctx, async (tx) => {
    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.workspaceId, m.workspaceId), eq(conversations.memberAId, a), eq(conversations.memberBId, b)));
    if (existing) return existing.id;
    const [allowed] = await tx.execute<{ ok: boolean }>(sql`select app_dm_allowed(${a}::uuid, ${b}::uuid) as ok`).then((r) => r.rows);
    if (!allowed?.ok) throw notAllowed();
    const [c] = await tx.insert(conversations).values({ workspaceId: m.workspaceId, memberAId: a, memberBId: b }).returning({ id: conversations.id });
    return c!.id;
  });
}

export type MessageView = { id: string; mine: boolean; body: string | null; imageUrl: string | null; deleted: boolean; createdAt: string };

async function loadConversation(tx: Tx, workspaceId: string, conversationId: string) {
  const [c] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)));
  if (!c) throw Errors.notFound();
  return c;
}

async function markRead(tx: Tx, memberId: string, c: typeof conversations.$inferSelect) {
  const now = new Date();
  await tx.update(conversations).set(c.memberAId === memberId ? { aLastReadAt: now } : { bLastReadAt: now }).where(eq(conversations.id, c.id));
}

async function toViews(actor: Actor, memberId: string, rows: (typeof messages.$inferSelect)[]): Promise<MessageView[]> {
  const urls = await playbackUrls(actor, rows.map((r) => r.mediaAssetId).filter((x): x is string => !!x));
  return rows.map((r) => ({
    id: r.id,
    mine: r.senderMemberId === memberId,
    body: r.deletedAt ? null : r.body,
    imageUrl: !r.deletedAt && r.mediaAssetId ? (urls.get(r.mediaAssetId) ?? null) : null,
    deleted: !!r.deletedAt,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** A page of messages (newest page first, returned oldest→newest), and marks the conversation read. */
export async function getConversation(actor: Actor, conversationId: string, before?: { createdAt: string; id: string }) {
  const { m, ctx } = scope(actor);
  const data = await withTenant(ctx, async (tx) => {
    const c = await loadConversation(tx, m.workspaceId, conversationId);
    const otherId = c.memberAId === m.memberId ? c.memberBId : c.memberAId;
    const [other] = await tx
      .select({ memberId: workspaceMembers.id, name: users.displayName, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.id, otherId));
    const rows = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          before ? or(lt(messages.createdAt, new Date(before.createdAt)), and(eq(messages.createdAt, new Date(before.createdAt)), lt(messages.id, before.id))) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(MESSAGES_PAGE + 1);
    const [allowed] = await tx.execute<{ ok: boolean }>(sql`select app_dm_allowed(${c.memberAId}::uuid, ${c.memberBId}::uuid) as ok`).then((r) => r.rows);
    if (!before) await markRead(tx, m.memberId, c);
    return { other: other!, rows, canSend: !!allowed?.ok };
  });
  const hasMore = data.rows.length > MESSAGES_PAGE;
  const page = data.rows.slice(0, MESSAGES_PAGE).reverse();
  const first = page[0];
  return {
    other: data.other,
    canSend: data.canSend,
    messages: await toViews(actor, m.memberId, page),
    olderCursor: hasMore && first ? { createdAt: first.createdAt.toISOString(), id: first.id } : null,
  };
}

/** Messages newer than the given one (polling), marking the conversation read. */
export async function pollConversation(actor: Actor, conversationId: string, after: { createdAt: string; id: string } | null) {
  const { m, ctx } = scope(actor);
  const rows = await withTenant(ctx, async (tx) => {
    const c = await loadConversation(tx, m.workspaceId, conversationId);
    const found = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          after ? or(gt(messages.createdAt, new Date(after.createdAt)), and(eq(messages.createdAt, new Date(after.createdAt)), gt(messages.id, after.id))) : undefined,
        ),
      )
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(100);
    if (found.length) await markRead(tx, m.memberId, c);
    return found;
  });
  return toViews(actor, m.memberId, rows);
}

export async function sendMessage(actor: Actor, input: { conversationId: string; body: string | null; imageAssetId: string | null }, meta: RequestMeta): Promise<MessageView> {
  const { m, ctx } = scope(actor);
  await enforceRateLimit("message_send_user", actor.userId);
  if (!input.body && !input.imageAssetId) throw Errors.validation({ body: ["Escreva uma mensagem."] });
  if (countLinks(input.body) > MAX_LINKS) throw new AppError("VALIDATION", `Use no máximo ${MAX_LINKS} links por mensagem.`);
  const row = await withTenant(ctx, async (tx) => {
    const c = await loadConversation(tx, m.workspaceId, input.conversationId);
    const [allowed] = await tx.execute<{ ok: boolean }>(sql`select app_dm_allowed(${c.memberAId}::uuid, ${c.memberBId}::uuid) as ok`).then((r) => r.rows);
    if (!allowed?.ok) throw notAllowed();
    const [msg] = await tx
      .insert(messages)
      .values({ workspaceId: m.workspaceId, conversationId: c.id, senderMemberId: m.memberId, body: input.body, mediaAssetId: input.imageAssetId })
      .returning();
    await markRead(tx, m.memberId, c);
    const recipient = c.memberAId === m.memberId ? c.memberBId : c.memberAId;
    // One notification per conversation, bumped on each new message; never the message text.
    await notify(tx, ctx, [{ recipientMemberId: recipient, type: "message_received", actorMemberId: m.memberId, targetId: c.id, dedupeKey: `message:${c.id}` }]);
    return msg!;
  });
  // Message content is private: only the fact that a message was sent is audited.
  await withTenant(ctx, (tx) => audit(tx, { action: "messages.sent", actorUserId: actor.userId, workspaceId: m.workspaceId, targetType: "conversation", targetId: input.conversationId, ipHash: meta.ipHash }));
  const [view] = await toViews(actor, m.memberId, [row]);
  return view!;
}

/** The sender deletes a message: its text and image are wiped for both people. */
export async function deleteMessage(actor: Actor, messageId: string) {
  const { m, ctx } = scope(actor);
  const key = await withTenant(ctx, async (tx) => {
    const [msg] = await tx
      .select({ mediaAssetId: messages.mediaAssetId })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.senderMemberId, m.memberId), sql`${messages.deletedAt} is null`));
    if (!msg) throw Errors.notFound();
    await tx.update(messages).set({ deletedAt: new Date(), body: null, mediaAssetId: null }).where(eq(messages.id, messageId));
    if (!msg.mediaAssetId) return null;
    const [asset] = await tx
      .update(mediaAssets)
      .set({ status: "deleted" })
      .where(and(eq(mediaAssets.id, msg.mediaAssetId), eq(mediaAssets.ownerMemberId, m.memberId)))
      .returning({ key: mediaAssets.storageKey });
    return asset?.key ?? null;
  });
  if (key) await deleteObject(key).catch((err: unknown) => log.error("could not delete message image", errorFields(err)));
}
