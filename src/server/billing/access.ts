/**
 * Whether a workspace may be used, derived from its subscription at read time.
 * Nothing depends on a job flipping statuses: an expired trial or an unpaid
 * period blocks access as soon as the date passes.
 */

export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export type BillingAccess = {
  /** trial: free trial running; active: paid; grace: payment late but still usable; blocked: read-only screens only. */
  state: "trial" | "active" | "grace" | "blocked";
  /** When the current state ends (null when open-ended or unknown). */
  until: Date | null;
  status: SubscriptionStatus | null;
};

export function billingAccess(
  sub: { status: SubscriptionStatus; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null | undefined,
  now: Date = new Date(),
): BillingAccess {
  if (!sub) return { state: "blocked", until: null, status: null };
  const t = now.getTime();
  const end = sub.currentPeriodEnd?.getTime() ?? null;
  const graceEnd = end === null ? null : end + GRACE_DAYS * DAY_MS;

  switch (sub.status) {
    case "trialing": {
      const trialEnd = sub.trialEndsAt?.getTime() ?? 0;
      return trialEnd > t ? { state: "trial", until: sub.trialEndsAt, status: sub.status } : { state: "blocked", until: null, status: sub.status };
    }
    case "active":
      if (end === null || end > t) return { state: "active", until: sub.currentPeriodEnd, status: sub.status };
      return graceEnd! > t ? { state: "grace", until: new Date(graceEnd!), status: sub.status } : { state: "blocked", until: null, status: sub.status };
    case "past_due":
      return graceEnd !== null && graceEnd > t ? { state: "grace", until: new Date(graceEnd), status: sub.status } : { state: "blocked", until: null, status: sub.status };
    case "canceled":
      // Already paid until the end of the period.
      return end !== null && end > t ? { state: "active", until: sub.currentPeriodEnd, status: sub.status } : { state: "blocked", until: null, status: sub.status };
    default:
      return { state: "blocked", until: null, status: sub.status };
  }
}

export function daysLeft(until: Date | null, now: Date = new Date()) {
  return until ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS)) : null;
}
