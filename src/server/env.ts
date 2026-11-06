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
    /** Optional JSON object overriding entries of RATE_LIMITS, e.g. {"login_ip":{"limit":50,"windowSec":600}} */
    RATE_LIMIT_OVERRIDES: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
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
