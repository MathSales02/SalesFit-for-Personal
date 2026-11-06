import "server-only";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withTenant, setTenantContext, type DbContext } from "../db/context";
import type { Tx } from "../db/client";
import { notificationPreferences, notifications, users, workspaceMembers } from "../db/schema";
import { assertCan, requireMembership, type Actor } from "../authz/policy";
import { Errors } from "../lib/errors";

export const NOTIFICATION_TYPES = [
  ["post_liked", "Curtidas nas suas publicações"],
  ["post_commented", "Comentários nas suas publicações"],
  ["comment_replied", "Respostas aos seus comentários"],
  ["new_follower", "Novos seguidores"],
  ["message_received", "Mensagens"],
  ["program_assigned", "Treino atribuído"],
  ["program_updated", "Treino atualizado"],
  ["post_approved", "Publicação aprovada"],
  ["post_removed", "Publicação removida"],
  ["announcement", "Avisos do treinador"],
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number][0];

export type NotifyItem = {
  recipientMemberId: string;
  type: NotificationType;
  actorMemberId?: string | null;
  targetId?: string | null;
  data?: Record<string, string | number>;
  /** Same key for the same recipient collapses into one notification (bumped to unread). */
  dedupeKey: string;
};

/**
 * Creates notifications inside the caller's transaction, from the trusted
 * system context (recipients other than the actor cannot be written otherwise).
 * Skips: self-notifications, muted types, and pairs with a block between them.
 * Future channels (email/push) hook in here, reading delivered_channels.
 */
export async function notify(tx: Tx, ctx: DbContext, items: NotifyItem[]) {
  const wanted = items.filter((i) => i.recipientMemberId !== i.actorMemberId);
  if (wanted.length === 0 || !ctx.workspaceId) return;
  await setTenantContext(tx, { ...ctx, isSystem: true });
  try {
    const recipients = [...new Set(wanted.map((i) => i.recipientMemberId))];
    const prefs = await tx
      .select({ memberId: notificationPreferences.memberId, muted: notificationPreferences.mutedTypes })
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.memberId, recipients));
    const muted = new Map(prefs.map((p) => [p.memberId, new Set(p.muted)]));
    for (const i of wanted) {
      if (muted.get(i.recipientMemberId)?.has(i.type)) continue;
      if (i.actorMemberId) {
        const [b] = await tx.execute<{ blocked: boolean }>(sql`select app_block_between(${i.actorMemberId}::uuid, ${i.recipientMemberId}::uuid) as blocked`).then((r) => r.rows);
        if (b?.blocked) continue;
      }
      await tx
        .insert(notifications)
        .values({
          workspaceId: ctx.workspaceId,
          recipientMemberId: i.recipientMemberId,
          type: i.type,
          actorMemberId: i.actorMemberId ?? null,
          targetId: i.targetId ?? null,
          data: i.data ?? {},
          dedupeKey: i.dedupeKey,
        })
        .onConflictDoUpdate({
          target: [notifications.recipientMemberId, notifications.dedupeKey],
          set: { createdAt: new Date(), readAt: null, actorMemberId: i.actorMemberId ?? null, data: i.data ?? {} },
        });
    }
  } finally {
    await setTenantContext(tx, ctx);
  }
}

function scope(actor: Actor) {
  const m = requireMembership(actor);
  return { m, ctx: { userId: actor.userId, workspaceId: m.workspaceId } };
}

export type NotificationView = {
  id: string;
  type: NotificationType;
  actorName: string | null;
  targetId: string | null;
  data: Record<string, string | number>;
  createdAt: string;
  read: boolean;
};

export async function listNotifications(actor: Actor): Promise<NotificationView[]> {
  const { m, ctx } = scope(actor);
  const rows = await withTenant(ctx, (tx) =>
    tx
      .select({
        id: notifications.id,
        type: notifications.type,
        actorName: users.displayName,
        targetId: notifications.targetId,
        data: notifications.data,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .leftJoin(workspaceMembers, eq(workspaceMembers.id, notifications.actorMemberId))
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(notifications.recipientMemberId, m.memberId))
      .orderBy(desc(notifications.createdAt))
      .limit(60),
  );
  return rows.map((r) => ({ id: r.id, type: r.type, actorName: r.actorName, targetId: r.targetId, data: r.data, createdAt: r.createdAt.toISOString(), read: !!r.readAt }));
}

export async function unreadNotificationCount(actor: Actor): Promise<number> {
  if (!actor.membership) return 0;
  const { m, ctx } = scope(actor);
  const [r] = await withTenant(ctx, (tx) =>
    tx.select({ n: count() }).from(notifications).where(and(eq(notifications.recipientMemberId, m.memberId), isNull(notifications.readAt))),
  );
  return r?.n ?? 0;
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  const { m, ctx } = scope(actor);
  await withTenant(ctx, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientMemberId, m.memberId), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined)),
  );
}

export async function getMutedTypes(actor: Actor): Promise<string[]> {
  const { m, ctx } = scope(actor);
  const [p] = await withTenant(ctx, (tx) => tx.select({ muted: notificationPreferences.mutedTypes }).from(notificationPreferences).where(eq(notificationPreferences.memberId, m.memberId)));
  return p?.muted ?? [];
}

export async function setMutedTypes(actor: Actor, muted: string[]) {
  assertCan(actor, "community.read");
  const { m, ctx } = scope(actor);
  const valid = new Set<string>(NOTIFICATION_TYPES.map(([t]) => t));
  if (muted.some((t) => !valid.has(t))) throw Errors.validation({ _form: ["Tipo de notificação inválido."] });
  await withTenant(ctx, (tx) =>
    tx
      .insert(notificationPreferences)
      .values({ memberId: m.memberId, workspaceId: m.workspaceId, mutedTypes: muted })
      .onConflictDoUpdate({ target: notificationPreferences.memberId, set: { mutedTypes: muted, updatedAt: new Date() } }),
  );
}
