import "server-only";
import { sql } from "drizzle-orm";
import { db, type Tx } from "./client";

/**
 * Database request context consumed by the RLS policies in drizzle/0001_security.sql.
 * Values are set with set_config(..., is_local = true), so they only live for
 * the current transaction and can never leak to another request through the pool.
 */
export type DbContext = {
  userId: string;
  workspaceId?: string | null;
  /** Only pass true after checking users.is_platform_admin on the server. */
  isPlatformAdmin?: boolean;
};

async function applyContext(tx: Tx, ctx: DbContext & { isSystem?: boolean }) {
  await tx.execute(sql`
    select
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.workspace_id', ${ctx.workspaceId ?? ""}, true),
      set_config('app.is_platform_admin', ${ctx.isPlatformAdmin ? "on" : "off"}, true),
      set_config('app.is_system', ${ctx.isSystem ? "on" : "off"}, true)
  `);
}

/** Runs fn in a transaction scoped to a user and (optionally) a workspace. */
export function withTenant<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(async (tx) => {
    await applyContext(tx, ctx);
    return fn(tx);
  });
}

/**
 * Trusted internal context for jobs such as trial creation or verified payment
 * webhooks. Never call this with values that came straight from a request.
 */
export function withSystem<T>(ctx: Omit<DbContext, "isPlatformAdmin">, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(async (tx) => {
    await applyContext(tx, { ...ctx, isSystem: true });
    return fn(tx);
  });
}

// Work that must wait for the transaction to be committed (e.g. sending a push notification
// about a row that a rollback would erase).
const commitHooks = new WeakMap<Tx, (() => void)[]>();

async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const hooks: (() => void)[] = [];
  const result = await db().transaction(async (tx) => {
    commitHooks.set(tx, hooks);
    return fn(tx);
  });
  for (const hook of hooks) hook();
  return result;
}

/**
 * Runs fn once tx has been committed; never when it rolls back. fn must not throw (it runs
 * after the caller's work is done). Returns false when tx was not opened by withTenant/withSystem.
 */
export function onCommit(tx: Tx, fn: () => void): boolean {
  const hooks = commitHooks.get(tx);
  if (!hooks) return false;
  hooks.push(fn);
  return true;
}

/** Sets the context inside a transaction that is already open. */
export function setTenantContext(tx: Tx, ctx: DbContext & { isSystem?: boolean }) {
  return applyContext(tx, ctx);
}
