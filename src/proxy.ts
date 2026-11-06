import { NextResponse, type NextRequest } from "next/server";
import { hmacPii } from "./server/lib/crypto";
import { errorFields, log } from "./server/lib/logger";
import { clientIp } from "./server/http/request-meta";
import { RATE_LIMITS } from "./server/security/rate-limit";
import { rateLimitStore } from "./server/security/rate-limit-store";

/**
 * Runs before every non-static request:
 *  1. Coarse per-IP rate limit for the whole app (fine-grained per-user and
 *     per-action limits run inside the actions themselves).
 *  2. A per-request nonce for the Content-Security-Policy.
 */
export async function proxy(request: NextRequest) {
  const ipHash = hmacPii("ip", clientIp(request.headers));
  const rule = RATE_LIMITS.global_ip;
  try {
    const res = await rateLimitStore().hit(`global_ip:${ipHash}`, rule.limit, rule.windowSec * 1000);
    if (!res.allowed) {
      const retryAfter = String(Math.ceil(res.retryAfterMs / 1000));
      log.warn("global rate limit exceeded", { ipHash });
      return new NextResponse("Muitas requisições. Tente novamente em instantes.", {
        status: 429,
        headers: { "Retry-After": retryAfter, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } catch (err) {
    // Fail open for the coarse limit: auth and other sensitive actions have their own limits.
    log.error("global rate limit unavailable", errorFields(err));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are needed by React; scripts remain nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
