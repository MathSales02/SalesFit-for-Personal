import path from "node:path";
import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile();
} catch {
  /* CI provides variables directly */
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve("src"),
      // The real package throws outside React Server Components.
      "server-only": path.resolve("tests/support/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      // Tests use the in-memory rate limit store.
      REDIS_URL: "",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      SMTP_URL: process.env.SMTP_URL ?? "smtp://127.0.0.1:1025",
      MAIL_FROM: "SalesFit <test@cadencia.local>",
      PII_HASH_SECRET: "test-secret-test-secret-test-secret-1234",
      MFA_ENCRYPTION_KEY: "test-mfa-key-test-mfa-key-test-mfa-key-1234",
      TRUSTED_PROXY_HOPS: "0",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333",
      S3_PUBLIC_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333",
      S3_REGION: process.env.S3_REGION ?? "us-east-1",
      S3_BUCKET: process.env.TEST_S3_BUCKET ?? "cadencia-media-test",
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "ci-access-key",
      S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "ci-secret-key-0000",
      // Tests never call the real payment provider: they swap in a fake transport.
      ASAAS_API_URL: "https://asaas.test/v3",
      ASAAS_API_KEY: "test-asaas-key-not-real-0000",
      ASAAS_WEBHOOK_TOKEN: "test-webhook-token-test-webhook-token-0000",
    },
  },
});
