/**
 * Daily data retention job. Uses the owner role (DATABASE_MIGRATION_URL).
 *   npm run jobs:retention
 */
import { Pool } from "pg";
import { runRetention } from "../src/server/jobs/retention";

try {
  process.loadEnvFile();
} catch {
  /* env may come from the environment */
}

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set");
  process.exit(1);
}

// Loaded after the env so the storage client sees its settings.
const { deleteObject } = await import("../src/server/storage/s3");
const pool = new Pool({ connectionString: url, max: 1 });
try {
  const report = await runRetention(pool, deleteObject);
  console.log(JSON.stringify({ job: "retention", at: new Date().toISOString(), removed: report }));
} finally {
  await pool.end();
}
