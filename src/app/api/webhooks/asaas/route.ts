import { receiveAsaasWebhook, WEBHOOK_MAX_BYTES } from "@/server/billing/provider";
import { requestMetaFrom } from "@/server/http/request-meta";
import { log } from "@/server/lib/logger";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * Asaas webhook. Authenticated by the shared token in the asaas-access-token
 * header (compared in constant time). Only HTTP 200 counts as delivered.
 */
export async function POST(request: Request) {
  const meta = requestMetaFrom(request.headers);
  const limited = await checkRateLimit("billing_webhook_ip", meta.ipHash ?? "unknown");
  if (!limited.allowed) return new Response(null, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > WEBHOOK_MAX_BYTES) return new Response(null, { status: 413 });
  const body = await request.text();

  const { status } = await receiveAsaasWebhook(request.headers.get("asaas-access-token"), body, meta).catch((err) => {
    log.error("webhook storage failed", { error: err instanceof Error ? err.name : "unknown" });
    // Not stored: let Asaas retry.
    return { status: 500 as const };
  });
  return Response.json(status === 200 ? { received: true } : { error: true }, { status, headers: { "Cache-Control": "no-store" } });
}
