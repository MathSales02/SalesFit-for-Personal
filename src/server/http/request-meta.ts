import { env } from "../env";
import { hmacPii } from "../lib/crypto";

export type RequestMeta = { ip: string; ipHash: string; userAgent: string };

type HeaderSource = { get(name: string): string | null };

/**
 * Extracts the client IP from X-Forwarded-For, counting TRUSTED_PROXY_HOPS
 * entries from the right. The Next.js server appends the socket address as the
 * last entry, so with 0 hops we use that one. Entries further left can be forged
 * by the client and are ignored.
 */
export function clientIp(headers: HeaderSource): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = env().TRUSTED_PROXY_HOPS;
  const ip = chain[chain.length - 1 - hops] ?? chain[0];
  return ip && ip.length <= 64 ? ip : "unknown";
}

export function requestMetaFrom(headers: HeaderSource): RequestMeta {
  const ip = clientIp(headers);
  return { ip, ipHash: hmacPii("ip", ip), userAgent: (headers.get("user-agent") ?? "").slice(0, 255) };
}
