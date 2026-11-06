import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Migrates the test database as the owner role and clears data from earlier runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_MIGRATION_URL;
  if (!url || !process.env.TEST_DATABASE_URL) {
    throw new Error("Set TEST_DATABASE_URL (app role) and TEST_DATABASE_MIGRATION_URL (owner role) to run tests.");
  }
  if (!/_test\b|\/cadencia_test/.test(url)) throw new Error("Refusing to reset a database whose name does not end in _test.");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await pool.query(`
      truncate table audit_logs, security_events, login_attempts, consents, auth_tokens, sessions,
        subscriptions, workspace_members, workspaces, users restart identity cascade
    `);
  } finally {
    await pool.end();
  }
}
