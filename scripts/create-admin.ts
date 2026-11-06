/**
 * Creates (or promotes) a platform administrator. Admins cannot sign up through
 * the website; this script needs direct database access.
 *   npm run admin:create -- admin@example.com "Nome do Admin"
 * The password is read from the ADMIN_PASSWORD environment variable so it never
 * lands in shell history as an argument.
 */
import { hash } from "@node-rs/argon2";
import { Pool } from "pg";

try {
  process.loadEnvFile();
} catch {
  /* optional */
}

const [email, name] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !name || !password || password.length < 14) {
  console.error('usage: ADMIN_PASSWORD=<at least 14 chars> npm run admin:create -- <email> "<name>"');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
const passwordHash = await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 });
try {
  const res = await pool.query(
    `insert into users (email, password_hash, display_name, is_platform_admin, email_verified_at)
     values ($1, $2, $3, true, now())
     on conflict (lower(email)) do update set is_platform_admin = true
     returning id`,
    [email.toLowerCase(), passwordHash, name],
  );
  await pool.query(
    `insert into audit_logs (actor_user_id, action, target_type, target_id, metadata)
     values (null, 'admin.created_via_cli', 'user', $1, '{}'::jsonb)`,
    [res.rows[0].id],
  );
  console.log("platform admin ready. Existing accounts keep their current password.");
} finally {
  await pool.end();
}
