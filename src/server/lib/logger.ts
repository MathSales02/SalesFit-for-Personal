
type Level = "debug" | "info" | "warn" | "error";

// Matches keys such as password, newPassword, passwordHash, token, sessionToken,
// secret, authorization, cookie, otp, and message/post bodies.
const SENSITIVE_SUFFIX = /(password|passwordhash|token|secret|authorization|cookie|otp)$/i;
const SENSITIVE_EXACT = new Set(["body", "content", "text", "html"]);

function isSensitiveKey(key: string) {
  return SENSITIVE_SUFFIX.test(key) || SENSITIVE_EXACT.has(key.toLowerCase());
}

/** Deep-copies a value with sensitive keys replaced, so secrets never reach log storage. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

/** Reduces an unknown error to fields that are safe to log (no stack in production). */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errName: err.name,
      errMessage: err.message,
      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    };
  }
  return { err: String(err) };
}
