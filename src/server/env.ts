import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().startsWith("postgres"),
    REDIS_URL: z.string().startsWith("redis").optional(),
    SMTP_URL: z.string().startsWith("smtp"),
    MAIL_FROM: z.string().min(3),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    PII_HASH_SECRET: z.string().min(32),
    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
    S3_ACCESS_KEY: z.string().min(8),
    S3_SECRET_KEY: z.string().min(16),
    /** Optional JSON object overriding entries of RATE_LIMITS, e.g. {"login_ip":{"limit":50,"windowSec":600}} */
    RATE_LIMIT_OVERRIDES: z.string().optional(),
    /** Asaas payment provider. Without a key, online payment is off and admins manage subscriptions by hand. */
    ASAAS_API_URL: z.url().default("https://api-sandbox.asaas.com/v3"),
    // Asaas keys start with "$"; .env files escape it as "\$" so Next.js does not expand it as a variable.
    ASAAS_API_KEY: z
      .string()
      .min(20)
      .transform((v) => (v.startsWith("\\$") ? v.slice(1) : v))
      .optional(),
    ASAAS_WEBHOOK_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.ASAAS_API_KEY && !env.ASAAS_WEBHOOK_TOKEN) {
      ctx.addIssue({ code: "custom", path: ["ASAAS_WEBHOOK_TOKEN"], message: "required when ASAAS_API_KEY is set" });
    }
    if (env.NODE_ENV !== "production") return;
    if (env.ASAAS_API_KEY?.startsWith("$aact_hmlg") && !env.ASAAS_API_URL.includes("sandbox")) {
      ctx.addIssue({ code: "custom", path: ["ASAAS_API_URL"], message: "sandbox key used with a production URL" });
    }
    if (!env.REDIS_URL) {
      ctx.addIssue({ code: "custom", path: ["REDIS_URL"], message: "Redis is required in production for distributed rate limiting" });
    }
    if (!env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production" });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Fails fast at first use when something is missing. */
export function env(): Env {
  if (cached) return cached;
  // Treat empty variables as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Only variable names are printed, never values.
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
