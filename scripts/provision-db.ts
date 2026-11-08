/**
 * Sets up a hosted Postgres (Railway, Neon…) the same way docker/postgres/init.sh does locally:
 * the "cadencia" database, owned by cadencia_owner (migrations only), and the runtime role
 * cadencia_app (data only, no DDL, no BYPASSRLS, so row-level security always applies).
 *
 *   SUPERUSER_URL=postgres://postgres:...@host:port/railway \
 *   CADENCIA_OWNER_PASSWORD=... CADENCIA_APP_PASSWORD=... \
 *   npx tsx scripts/provision-db.ts
 *
 * Safe to run again: existing roles get the given passwords, existing grants are re-applied.
 * Prints no secrets.
 */
import { Client } from "pg";

const superUrl = process.env.SUPERUSER_URL;
const ownerPw = process.env.CADENCIA_OWNER_PASSWORD;
const appPw = process.env.CADENCIA_APP_PASSWORD;
if (!superUrl || !ownerPw || !appPw || ownerPw.length < 24 || appPw.length < 24) {
  console.error("Set SUPERUSER_URL, CADENCIA_OWNER_PASSWORD and CADENCIA_APP_PASSWORD (24+ characters each).");
  process.exit(1);
}
const DB = "cadencia";

async function run() {
  const admin = new Client({ connectionString: superUrl });
  await admin.connect();
  try {
    const role = async (name: string, pw: string, attrs: string) => {
      const exists = await admin.query("select 1 from pg_roles where rolname = $1", [name]);
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      await admin.query(`${verb} ROLE ${name} LOGIN PASSWORD ${admin.escapeLiteral(pw)} ${attrs}`);
      console.log(`role ${name}: ${exists.rowCount ? "updated" : "created"}`);
    };
    await role("cadencia_owner", ownerPw!, "NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
    await role("cadencia_app", appPw!, "NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS");
    const db = await admin.query("select 1 from pg_database where datname = $1", [DB]);
    if (!db.rowCount) await admin.query(`CREATE DATABASE ${DB} OWNER cadencia_owner`);
    console.log(`database ${DB}: ${db.rowCount ? "exists" : "created"}`);
  } finally {
    await admin.end();
  }

  const url = new URL(superUrl!);
  url.pathname = `/${DB}`;
  const target = new Client({ connectionString: url.toString() });
  await target.connect();
  try {
    await target.query(`
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      ALTER SCHEMA public OWNER TO cadencia_owner;
      GRANT USAGE ON SCHEMA public TO cadencia_app;
      REVOKE CONNECT ON DATABASE ${DB} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${DB} TO cadencia_owner, cadencia_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE cadencia_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cadencia_app;
      ALTER DEFAULT PRIVILEGES FOR ROLE cadencia_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO cadencia_app;
    `);
    console.log("schema permissions: applied");
  } finally {
    await target.end();
  }
}

run().catch((err: unknown) => {
  console.error("provision failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
