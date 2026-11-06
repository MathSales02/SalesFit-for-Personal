import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureBucket } from "../../scripts/storage-init";

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
    // The platform exercise library is seed data: keep it across resets.
    await pool.query("create temp table platform_exercises as select * from exercises where workspace_id is null");
    await pool.query(`
      truncate table audit_logs, security_events, login_attempts, consents, auth_tokens, sessions,
        subscriptions, workspace_members, workspaces, users restart identity cascade
    `);
    await pool.query("insert into exercises select * from platform_exercises");
  } finally {
    await pool.end();
  }

  await ensureBucket({
    endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKey: process.env.S3_ACCESS_KEY ?? "ci-access-key",
    secretKey: process.env.S3_SECRET_KEY ?? "ci-secret-key-0000",
    bucket: process.env.TEST_S3_BUCKET ?? "cadencia-media-test",
  });
}
