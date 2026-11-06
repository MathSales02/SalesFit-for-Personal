import { defineConfig } from "drizzle-kit";

try { process.loadEnvFile(); } catch { /* .env is optional */ }

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_MIGRATION_URL ?? "" },
  strict: true,
  verbose: true,
});
