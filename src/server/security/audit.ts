import "server-only";
import { db, type Executor } from "../db/client";
import { auditLogs, securityEvents } from "../db/schema";
import { errorFields, log, redact } from "../lib/logger";

export type AuditEntry = {
  action: string;
  actorUserId?: string | null;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
};

/**
 * Writes an audit entry. Pass the open transaction so the entry commits or
 * rolls back together with the change it describes.
 */
export async function audit(exec: Executor, entry: AuditEntry) {
  await exec.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    workspaceId: entry.workspaceId ?? null,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: redact(entry.metadata ?? {}) as Record<string, unknown>,
    ipHash: entry.ipHash ?? null,
  });
}

export type SecurityEvent = {
  type: string;
  severity: "info" | "warning" | "critical";
  userId?: string | null;
  workspaceId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
};

/** Best effort: a failure to record must never break the request that triggered it. */
export async function recordSecurityEvent(event: SecurityEvent) {
  try {
    await db()
      .insert(securityEvents)
      .values({ ...event, metadata: redact(event.metadata ?? {}) as Record<string, unknown> });
  } catch (err) {
    log.error("failed to record security event", { type: event.type, ...errorFields(err) });
  }
}
