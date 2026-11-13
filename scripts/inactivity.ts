/**
 * Runs the check for students who stopped training right now (the web server already runs it
 * once a day; see src/server/jobs/scheduler.ts). Notifies only what was not notified yet.
 *   npm run jobs:inactivity
 */
try {
  process.loadEnvFile();
} catch {
  /* env may come from the environment */
}

// Loaded after the env so the database and push settings are seen.
const { runInactivityCheck } = await import("../src/server/jobs/inactivity");
const { pushIdle } = await import("../src/server/notifications/push");
const { closeDb } = await import("../src/server/db/client");
try {
  const sent = await runInactivityCheck();
  await pushIdle();
  console.log(JSON.stringify({ job: "inactivity", at: new Date().toISOString(), notified: sent }));
} finally {
  await closeDb();
}
process.exit(0);

export {};
