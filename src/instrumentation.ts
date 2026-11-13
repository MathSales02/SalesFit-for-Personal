/**
 * Runs once when a server starts. Starts the daily jobs that live inside the web server
 * (see src/server/jobs/scheduler.ts). JOBS_IN_PROCESS=off turns them off on a server.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOBS_IN_PROCESS === "off") return;
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}
