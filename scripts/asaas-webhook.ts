/**
 * Creates (or updates) the Asaas webhook that points at this deployment:
 * URL APP_URL/api/webhooks/asaas, token ASAAS_WEBHOOK_TOKEN, sequential delivery.
 *
 *   railway run --service web -- npx tsx scripts/asaas-webhook.ts
 *
 * Uses ASAAS_API_URL, ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN and APP_URL. Prints no secrets.
 */
const e = process.env;
const apiUrl = e.ASAAS_API_URL;
const apiKey = e.ASAAS_API_KEY?.replace(/^\\\$/, "$");
const token = e.ASAAS_WEBHOOK_TOKEN;
if (!apiUrl || !apiKey || !token || !e.APP_URL) {
  console.error("Set ASAAS_API_URL, ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN and APP_URL.");
  process.exit(1);
}
const url = `${new URL(e.APP_URL).origin}/api/webhooks/asaas`;
const NAME = "CadênciaFit";

// Events the app processes (src/server/billing). Others would only be stored.
const EVENTS = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
];

async function asaas(path: string, init: RequestInit = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { access_token: apiKey!, "Content-Type": "application/json", "User-Agent": "cadenciafit-setup", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${JSON.stringify(body.errors ?? body)}`);
  return body;
}

async function main() {
  const list = (await asaas("/webhooks")) as { data?: { id: string; name: string; url: string }[] };
  const existing = (list.data ?? []).find((w) => w.name === NAME || w.url === url);
  const payload = {
    name: NAME,
    url,
    email: e.WEBHOOK_ALERT_EMAIL ?? "matheusssales0218@gmail.com",
    enabled: true,
    interrupted: false,
    authToken: token,
    sendType: "SEQUENTIALLY",
    events: EVENTS,
  };
  const saved = existing
    ? await asaas(`/webhooks/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await asaas("/webhooks", { method: "POST", body: JSON.stringify(payload) });
  console.log(`webhook ${existing ? "updated" : "created"}: ${saved.url} | enabled ${saved.enabled} | ${saved.sendType} | ${saved.events?.length} events`);
  console.log(`other webhooks on this account: ${(list.data ?? []).filter((w) => w !== existing).map((w) => w.url).join(", ") || "none"}`);
}

main().catch((err: unknown) => {
  console.error("asaas webhook setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
