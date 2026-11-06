import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running app (they do not start one):
 *  - CI: `next start` on :3000 (see .github/workflows/ci.yml).
 *  - Locally: an isolated dev server on :3100 (README, "Testes de navegador").
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // The dev server compiles routes on first use, which is slow on CI runners.
  timeout: process.env.CI ? 180_000 : 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
