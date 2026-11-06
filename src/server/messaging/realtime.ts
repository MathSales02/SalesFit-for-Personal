import "server-only";
import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { errorFields, log } from "../lib/logger";
import { getRedis } from "../security/rate-limit-store";

/**
 * "Something changed in conversation X" signals for open chat screens.
 * Only the conversation id travels: never message text. Clients react by
 * fetching through the normal, authorized poll. Redis pub/sub spreads the
 * signal across app instances; without Redis (dev/tests) it stays in-process.
 */

type Listener = () => void;
const g = globalThis as unknown as { __cadenciaRt?: { local: EventEmitter; sub?: Redis; listeners: Map<string, Set<Listener>> } };

function state() {
  if (!g.__cadenciaRt) {
    const local = new EventEmitter();
    local.setMaxListeners(0);
    g.__cadenciaRt = { local, listeners: new Map() };
    const redis = getRedis();
    if (redis) {
      const sub = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null });
      sub.on("error", (err) => log.warn("realtime redis error", { errMessage: err.message }));
      sub.on("message", (channel: string) => {
        for (const fn of g.__cadenciaRt!.listeners.get(channel) ?? []) fn();
      });
      g.__cadenciaRt.sub = sub;
    }
  }
  return g.__cadenciaRt;
}

const channel = (conversationId: string) => `rt:conv:${conversationId}`;

/** Fire and forget: a lost signal only delays the update until the fallback poll. */
export async function publishConversationChange(conversationId: string) {
  const s = state();
  const ch = channel(conversationId);
  const redis = getRedis();
  if (!redis || !s.sub) {
    s.local.emit(ch);
    return;
  }
  await redis.publish(ch, "1").catch((err: unknown) => log.warn("realtime publish failed", errorFields(err)));
}

/** Returns an unsubscribe function. */
export function subscribeConversation(conversationId: string, fn: Listener): () => void {
  const s = state();
  const ch = channel(conversationId);
  if (!s.sub) {
    s.local.on(ch, fn);
    return () => s.local.off(ch, fn);
  }
  let set = s.listeners.get(ch);
  if (!set) {
    set = new Set();
    s.listeners.set(ch, set);
    void s.sub.subscribe(ch).catch((err: unknown) => log.warn("realtime subscribe failed", errorFields(err)));
  }
  set.add(fn);
  return () => {
    const cur = s.listeners.get(ch);
    if (!cur) return;
    cur.delete(fn);
    if (cur.size === 0) {
      s.listeners.delete(ch);
      void s.sub?.unsubscribe(ch).catch(() => undefined);
    }
  };
}
