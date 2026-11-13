import "server-only";
import { sql } from "drizzle-orm";
import { withSystem } from "../db/context";
import { notify, type NotifyItem } from "../notifications/service";

/**
 * Students who stopped training: the trainers hear about it, and the student gets a nudge
 * (only when they have a workout to go back to). Each happens once per absence: the key is
 * the time of the last workout, so the next notification only comes after they train again
 * and stop again. Safe to run many times a day and on many servers at once.
 */
export const INACTIVE_DAYS = 7;

const SYSTEM_USER = "00000000-0000-0000-0000-000000000000";
const DAY_MS = 24 * 60 * 60 * 1000;

type Row = { workspace_id: string; member_id: string; since: Date | string; never_trained: boolean; has_program: boolean; trainer_ids: string[] };

export async function runInactivityCheck(opts: { now?: Date; workspaceId?: string } = {}): Promise<{ trainers: number; students: number }> {
  const now = opts.now ?? new Date();
  const rows = await withSystem({ userId: SYSTEM_USER }, (tx) =>
    tx.execute<Row>(sql`select * from app_inactive_students(${now.toISOString()}::timestamptz, ${INACTIVE_DAYS}, ${opts.workspaceId ?? null}::uuid)`),
  ).then((r) => r.rows);

  const byWorkspace = new Map<string, NotifyItem[]>();
  for (const s of rows) {
    const since = new Date(s.since);
    const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
    const absence = since.toISOString();
    const data: Record<string, number> = s.never_trained ? { days, never: 1 } : { days };
    const items = byWorkspace.get(s.workspace_id) ?? [];
    for (const trainer of parseIds(s.trainer_ids)) {
      items.push({ recipientMemberId: trainer, type: "student_inactive", actorMemberId: s.member_id, targetId: s.member_id, data, dedupeKey: `inactive:${s.member_id}:${absence}` });
    }
    if (s.has_program) items.push({ recipientMemberId: s.member_id, type: "workout_reminder", targetId: s.member_id, data, dedupeKey: `reminder:${absence}` });
    byWorkspace.set(s.workspace_id, items);
  }

  const sent = { trainers: 0, students: 0 };
  for (const [workspaceId, items] of byWorkspace) {
    const ctx = { userId: SYSTEM_USER, workspaceId };
    const created = await withSystem(ctx, (tx) => notify(tx, ctx, items, { once: true }));
    sent.trainers += created.filter((c) => c.type === "student_inactive").length;
    sent.students += created.filter((c) => c.type === "workout_reminder").length;
  }
  return sent;
}

/** node-postgres returns uuid[] as an array, or as "{a,b}" text for unknown array types. */
function parseIds(v: string[] | string | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v.replace(/^\{|\}$/g, "").split(",").filter(Boolean);
}
