import type { Pool } from "pg";

/**
 * Data retention (LGPD: keep personal data only as long as needed).
 * Runs as the schema owner role, because append-only tables cannot be
 * pruned by the app role. Audit logs are never pruned here.
 *
 * Schedule: once a day (cron, a scheduled container, etc.):
 *   npm run jobs:retention
 */

export const RETENTION_RULES = [
  { name: "sessions", days: 30, sql: "delete from sessions where (revoked_at is not null and revoked_at < $1) or expires_at < $1" },
  { name: "auth_tokens", days: 7, sql: "delete from auth_tokens where expires_at < $1 or (used_at is not null and used_at < $1)" },
  { name: "login_attempts", days: 90, sql: "delete from login_attempts where created_at < $1" },
  { name: "security_events", days: 365, sql: "delete from security_events where created_at < $1" },
  { name: "notifications_read", days: 90, sql: "delete from notifications where read_at is not null and read_at < $1" },
  { name: "notifications_all", days: 365, sql: "delete from notifications where created_at < $1" },
  { name: "invitations", days: 90, sql: "delete from invitations where accepted_at is null and (expires_at < $1 or (revoked_at is not null and revoked_at < $1))" },
  { name: "billing_events", days: 365, sql: "delete from billing_events where status in ('processed', 'ignored') and received_at < $1" },
] as const;

/** Uploads that were requested but never completed. */
const PENDING_UPLOAD_HOURS = 24;

export type RetentionReport = Record<string, number>;

export async function runRetention(pool: Pool, deleteFile: (key: string) => Promise<void>, now = new Date()): Promise<RetentionReport> {
  const report: RetentionReport = {};
  for (const rule of RETENTION_RULES) {
    const cutoff = new Date(now.getTime() - rule.days * 24 * 60 * 60 * 1000);
    const r = await pool.query(rule.sql, [cutoff]);
    report[rule.name] = r.rowCount ?? 0;
  }

  // Abandoned uploads: remove the row, then the file (if the browser uploaded it at all).
  const cutoff = new Date(now.getTime() - PENDING_UPLOAD_HOURS * 60 * 60 * 1000);
  const pending = await pool.query<{ id: string; storage_key: string }>("select id, storage_key from media_assets where status = 'pending' and created_at < $1 limit 1000", [cutoff]);
  let removed = 0;
  for (const row of pending.rows) {
    try {
      const del = await pool.query("delete from media_assets where id = $1 and status = 'pending'", [row.id]);
      if (del.rowCount) {
        removed++;
        await deleteFile(row.storage_key).catch(() => undefined);
      }
    } catch {
      // Still referenced somewhere: leave it for a person to look at.
    }
  }
  report.pending_uploads = removed;
  return report;
}
