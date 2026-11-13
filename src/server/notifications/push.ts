import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, translator, type Locale } from "@/i18n/config";
import { catalogFor } from "@/i18n/server";
import type { Actor } from "../authz/policy";
import { withSystem, withTenant } from "../db/context";
import { pushSubscriptions } from "../db/schema";
import { env } from "../env";
import { Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { describeNotification } from "./describe";
import type { NotificationType } from "./service";

/**
 * Notifications on phones and computers (Web Push, the browser's own push service: no third
 * party account and no cost). The payload is encrypted for the device and carries only the
 * same short text the notifications screen shows: never message content or health data.
 */

const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

export type PushMessage = { title: string; body: string; url: string; tag: string };

/** Pushes captured in tests instead of being sent. An endpoint containing "/gone/" acts as an expired device. */
export const testPushOutbox: { endpoint: string; message: PushMessage }[] = [];

/** Public key the browser needs to subscribe, or null when push is off on this server. */
export const pushPublicKey = (): string | null => env().VAPID_PUBLIC_KEY ?? null;

const enabled = () => env().NODE_ENV === "test" || !!env().VAPID_PRIVATE_KEY;

const translate = (locale: string) => {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return translator(l, catalogFor(l));
};
const area = (role: string) => (role === "trainer" ? "/treinador" : "/aluno");

// --- Devices -------------------------------------------------------------------------------------

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
  }),
});

/** Turns notifications on for this device, in the language the person is using now. */
export async function savePushSubscription(actor: Actor, subscription: unknown, locale: string) {
  const parsed = subscriptionSchema.safeParse(subscription);
  if (!parsed.success) throw Errors.validation({ _form: ["Este aparelho não aceitou as notificações. Tente de novo."] });
  const { endpoint, keys } = parsed.data;
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  await withTenant({ userId: actor.userId }, (tx) =>
    tx.execute(sql`select app_save_push_subscription(${endpoint}, ${keys.p256dh}, ${keys.auth}, ${l}, ${actor.sessionId}::uuid)`),
  );
}

/** Whether this device (by its endpoint) shows this person's notifications. */
export async function isPushDeviceActive(actor: Actor, endpoint: string): Promise<boolean> {
  const rows = await withTenant({ userId: actor.userId }, (tx) =>
    tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, actor.userId), eq(pushSubscriptions.endpoint, endpoint))),
  );
  return rows.length > 0;
}

export async function removePushSubscription(actor: Actor, endpoint: string) {
  await withTenant({ userId: actor.userId }, (tx) =>
    tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, actor.userId), eq(pushSubscriptions.endpoint, endpoint))),
  );
}

/** Signing out stops the notifications on the device where that session subscribed. */
export async function removeSessionPushSubscriptions(userId: string, sessionId: string) {
  await withTenant({ userId }, (tx) =>
    tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.sessionId, sessionId))),
  );
}

/** After a language change, every device of the person writes in the new language. */
export async function setPushLocale(userId: string, locale: Locale) {
  await withSystem({ userId }, (tx) => tx.update(pushSubscriptions).set({ locale }).where(eq(pushSubscriptions.userId, userId)));
}

/** A notification right now on every device of the person, to check that it works. Returns how many devices got it. */
export async function sendTestPush(actor: Actor): Promise<number> {
  const subs = await withTenant({ userId: actor.userId }, (tx) => tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, actor.userId)));
  const base = area(actor.membership?.role ?? "student");
  const results = await Promise.all(
    subs.map((s) => {
      const t = translate(s.locale);
      return sendOne(s, { title: "SalesFit", body: t("Pronto! As notificações estão chegando neste aparelho."), url: `${base}/notificacoes`, tag: "test" });
    }),
  );
  await record(subs.map((s, i) => ({ id: s.id, result: results[i]! })));
  return results.filter((r) => r === "ok").length;
}

// --- Delivery ------------------------------------------------------------------------------------

const pending = new Set<Promise<void>>();

/** Sends the notifications in the background; called once their transaction is committed. */
export function queuePush(workspaceId: string, notificationIds: string[]) {
  if (!enabled() || notificationIds.length === 0) return;
  const job: Promise<void> = deliverPush(workspaceId, notificationIds)
    .catch((err: unknown) => log.warn("push delivery failed", errorFields(err)))
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Waits for background deliveries (tests, and jobs before they exit). */
export async function pushIdle() {
  while (pending.size > 0) await Promise.all([...pending]);
}

type Target = {
  notification_id: string;
  type: NotificationType;
  data: Record<string, string | number>;
  target_id: string | null;
  recipient_role: string;
  actor_name: string | null;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: string;
};

export async function deliverPush(workspaceId: string, notificationIds: string[]) {
  const ids = sql.join(
    notificationIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const targets = await withSystem({ userId: SYSTEM_USER, workspaceId }, (tx) => tx.execute<Target>(sql`select * from app_push_targets(array[${ids}])`)).then(
    (r) => r.rows,
  );
  if (targets.length === 0) return;
  const results = await Promise.all(
    targets.map((n) => {
      const base = area(n.recipient_role);
      const { text, href } = describeNotification({ type: n.type, actorName: n.actor_name, targetId: n.target_id, data: n.data }, base, translate(n.locale));
      // Same tag: a newer notification about the same thing replaces the older one on the phone.
      const message = { title: "SalesFit", body: text, url: href ?? `${base}/notificacoes`, tag: `${n.type}:${n.target_id ?? n.notification_id}` };
      return sendOne({ endpoint: n.endpoint, p256dh: n.p256dh, auth: n.auth }, message);
    }),
  );
  await record(targets.map((n, i) => ({ id: n.subscription_id, result: results[i]! })));
}

type Result = "ok" | "gone" | "failed";

async function sendOne(sub: { endpoint: string; p256dh: string; auth: string }, message: PushMessage): Promise<Result> {
  const e = env();
  if (e.NODE_ENV === "test") {
    testPushOutbox.push({ endpoint: sub.endpoint, message });
    return sub.endpoint.includes("/gone/") ? "gone" : "ok";
  }
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return "failed";
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), {
      vapidDetails: {
        // Push services require an https or mailto contact; local servers run on plain http.
        subject: e.VAPID_SUBJECT ?? (e.APP_URL.startsWith("https://") ? e.APP_URL : "mailto:dev@localhost.localdomain"),
        publicKey: e.VAPID_PUBLIC_KEY,
        privateKey: e.VAPID_PRIVATE_KEY,
      },
      TTL: 24 * 60 * 60,
      timeout: 10_000,
    });
    return "ok";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the person turned notifications off, uninstalled the app or the browser renewed it.
    if (status === 404 || status === 410) return "gone";
    log.warn("push send failed", { status, ...errorFields(err) });
    return "failed";
  }
}

/** Keeps the device list clean: devices the push service no longer knows are removed. */
async function record(results: { id: string; result: Result }[]) {
  const gone = results.filter((r) => r.result === "gone").map((r) => r.id);
  const ok = results.filter((r) => r.result === "ok").map((r) => r.id);
  if (gone.length === 0 && ok.length === 0) return;
  await withSystem({ userId: SYSTEM_USER }, async (tx) => {
    if (gone.length > 0) await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
    if (ok.length > 0) await tx.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(inArray(pushSubscriptions.id, [...new Set(ok)]));
  });
}
