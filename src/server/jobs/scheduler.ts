import "server-only";
import { errorFields, log } from "../lib/logger";
import { getRedis } from "../security/rate-limit-store";
import { runInactivityCheck } from "./inactivity";

/**
 * Daily work that runs inside the web server, so it needs no extra service: the check for
 * students who stopped training. It runs once a day from 10:00 (São Paulo time), a reasonable
 * hour for a phone notification. With several servers, a Redis key lets only one of them run it;
 * running twice anyway would not repeat any notification (see runInactivityCheck).
 */
const FROM_HOUR = 10;
const UNTIL_HOUR = 21;
const EVERY_MS = 15 * 60 * 1000;

const g = globalThis as unknown as { __salesfitScheduler?: { lastDay: string | null } };

const localNow = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

async function tick() {
  const state = g.__salesfitScheduler!;
  const { day, hour } = localNow();
  if (state.lastDay === day || hour < FROM_HOUR || hour >= UNTIL_HOUR) return;
  state.lastDay = day;
  try {
    const redis = getRedis();
    if (redis && (await redis.set(`jobs:inactivity:${day}`, "1", "EX", 2 * 24 * 60 * 60, "NX")) !== "OK") return;
    const sent = await runInactivityCheck();
    log.info("inactivity check", { day, ...sent });
  } catch (err) {
    state.lastDay = null; // try again at the next tick
    log.warn("inactivity check failed", errorFields(err));
  }
}

export function startScheduler() {
  if (g.__salesfitScheduler) return;
  g.__salesfitScheduler = { lastDay: null };
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), EVERY_MS).unref();
}
