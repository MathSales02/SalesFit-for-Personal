import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root client or an open transaction. */
export type Executor = Database | Tx;

const globalForDb = globalThis as unknown as { __cadenciaPool?: Pool; __cadenciaDb?: Database };

function createPool() {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Stops runaway queries from holding connections.
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: "cadencia-app",
  });
  pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", msg: "pg pool error", code: (err as { code?: string }).code }));
  });
  return pool;
}

/** Shared pool, reused across hot reloads in development. */
export function db(): Database {
  if (!globalForDb.__cadenciaDb) {
    globalForDb.__cadenciaPool = createPool();
    globalForDb.__cadenciaDb = drizzle(globalForDb.__cadenciaPool, { schema, casing: "snake_case" });
  }
  return globalForDb.__cadenciaDb;
}

export async function closeDb() {
  await globalForDb.__cadenciaPool?.end();
  globalForDb.__cadenciaPool = undefined;
  globalForDb.__cadenciaDb = undefined;
}
