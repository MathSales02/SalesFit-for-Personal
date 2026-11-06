/**
 * Applies pending migrations using the schema owner role. The runtime app role
 * cannot run DDL, so this must use DATABASE_MIGRATION_URL.
 *   npm run db:migrate            -> main database
 *   npm run db:migrate -- --test  -> test database
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

try {
  process.loadEnvFile();
} catch {
  /* env may come from the environment */
}

const useTest = process.argv.includes("--test");
const url = useTest ? process.env.TEST_DATABASE_MIGRATION_URL : process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error(`${useTest ? "TEST_DATABASE_MIGRATION_URL" : "DATABASE_MIGRATION_URL"} is not set`);
  process.exit(1);
}

export async function runMigrations(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

runMigrations(url)
  .then(() => console.log(`migrations applied${useTest ? " (test database)" : ""}`))
  .catch((err: unknown) => {
    console.error("migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
