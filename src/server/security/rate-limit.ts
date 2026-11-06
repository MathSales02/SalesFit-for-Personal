import "server-only";
import { z } from "zod";
import { env } from "../env";
import { Errors } from "../lib/errors";
import { errorFields, log } from "../lib/logger";
import { rateLimitStore } from "./rate-limit-store";
import { recordSecurityEvent } from "./audit";

type Rule = { limit: number; windowSec: number; /** Deny when the store is unreachable. */ failClosed?: boolean };

/**
 * Central rate limit table. Keys combine a rule with a subject such as an IP
 * hash, user id, workspace id or email hash, so limits never rely on IP alone.
 * Values can be overridden per deployment with RATE_LIMIT_OVERRIDES.
 */
export const RATE_LIMITS = {
  // Coarse limits applied to every request in src/proxy.ts
  global_ip: { limit: 600, windowSec: 60 },
  // Authentication
  login_ip: { limit: 30, windowSec: 15 * 60 },
  login_account: { limit: 10, windowSec: 15 * 60 },
  register_ip: { limit: 5, windowSec: 60 * 60, failClosed: true },
  password_reset_ip: { limit: 5, windowSec: 60 * 60, failClosed: true },
  password_reset_account: { limit: 3, windowSec: 60 * 60, failClosed: true },
  email_verification_user: { limit: 5, windowSec: 60 * 60, failClosed: true },
  token_redeem_ip: { limit: 20, windowSec: 15 * 60 },
  otp_verify_user: { limit: 5, windowSec: 15 * 60, failClosed: true },
  // Authenticated activity (per user unless noted)
  user_default: { limit: 120, windowSec: 60 },
  workout_log_user: { limit: 240, windowSec: 60 },
  workspace_default: { limit: 2000, windowSec: 60 },
  account_change_user: { limit: 10, windowSec: 60 * 60 },
  invite_create_user: { limit: 30, windowSec: 60 * 60, failClosed: true },
  health_access_user: { limit: 120, windowSec: 60 * 60 },
  // Reserved for upcoming phases so every sensitive action has a limit from day one
  message_send_user: { limit: 30, windowSec: 60 },
  comment_create_user: { limit: 20, windowSec: 60 },
  like_user: { limit: 120, windowSec: 60 },
  post_create_user: { limit: 10, windowSec: 10 * 60 },
  upload_user: { limit: 20, windowSec: 10 * 60 },
  search_user: { limit: 60, windowSec: 60 },
  reward_redeem_user: { limit: 5, windowSec: 60 * 60, failClosed: true },
  challenge_join_user: { limit: 20, windowSec: 60 * 60 },
  checkout_user: { limit: 10, windowSec: 60 * 60, failClosed: true },
  billing_webhook_ip: { limit: 300, windowSec: 60 },
} as const satisfies Record<string, Rule>;

export type RateLimitRule = keyof typeof RATE_LIMITS;

const overridesSchema = z.record(z.string(), z.object({ limit: z.number().int().positive(), windowSec: z.number().int().positive() }));
let overrides: Partial<Record<string, Rule>> | undefined;

export function ruleConfig(rule: RateLimitRule): Rule {
  if (overrides === undefined) {
    const raw = env().RATE_LIMIT_OVERRIDES;
    const parsed = raw ? overridesSchema.safeParse(JSON.parse(raw)) : undefined;
    overrides = parsed?.success ? parsed.data : {};
  }
  return { ...RATE_LIMITS[rule], ...overrides[rule] };
}

export type RateLimitOutcome = { allowed: boolean; retryAfterSec: number; remaining: number; unavailable?: boolean };

/** Checks a rule without throwing. Use enforceRateLimit in most places. */
export async function checkRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitOutcome> {
  const cfg = ruleConfig(rule);
  const key = `${rule}:${subject}`;
  try {
    const res = await rateLimitStore().hit(key, cfg.limit, cfg.windowSec * 1000);
    if (!res.allowed) await noteViolation(rule, subject);
    return { allowed: res.allowed, remaining: res.remaining, retryAfterSec: Math.ceil(res.retryAfterMs / 1000) };
  } catch (err) {
    log.error("rate limit store unavailable", { rule, failClosed: !!cfg.failClosed, ...errorFields(err) });
    return cfg.failClosed
      ? { allowed: false, remaining: 0, retryAfterSec: 60, unavailable: true }
      : { allowed: true, remaining: 0, retryAfterSec: 0 };
  }
}

/**
 * Throws RATE_LIMITED (HTTP 429 with Retry-After) when the limit is exceeded,
 * or UNAVAILABLE (503) when a fail-closed rule cannot reach the store. The two
 * are kept apart so users are never told they tried too often when they did not.
 */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const res = await checkRateLimit(rule, subject);
  if (res.unavailable) throw Errors.unavailable();
  if (!res.allowed) throw Errors.rateLimited(res.retryAfterSec);
}

export async function resetRateLimit(rule: RateLimitRule, subject: string) {
  await rateLimitStore().reset(`${rule}:${subject}`).catch(() => undefined);
}

/** Records at most one security event per rule and subject per window, so floods do not flood the log. */
async function noteViolation(rule: RateLimitRule, subject: string) {
  const cfg = ruleConfig(rule);
  const first = await rateLimitStore().hit(`violation:${rule}:${subject}`, 1, cfg.windowSec * 1000);
  if (first.allowed) {
    await recordSecurityEvent({ type: "rate_limit.exceeded", severity: "warning", metadata: { rule, subject } });
  }
}
