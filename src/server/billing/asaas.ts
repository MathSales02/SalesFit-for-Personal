import "server-only";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { log } from "../lib/logger";

/**
 * Minimal Asaas API v3 client (see docs/ASAAS_NOTES.md).
 * Only the calls the app needs; responses are validated loosely (Asaas adds
 * fields over time) and errors never expose provider details to users.
 */

export type AsaasPayment = {
  id: string;
  subscription?: string | null;
  customer?: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  externalReference?: string | null;
};

type Transport = (url: string, init: RequestInit) => Promise<Response>;
let transport: Transport = (url, init) => fetch(url, init);

/** Tests replace the network with a fake. */
export function setAsaasTransport(t: Transport | null) {
  transport = t ?? ((url, init) => fetch(url, init));
}

export function asaasEnabled() {
  return !!env().ASAAS_API_KEY;
}

const unavailable = () => new AppError("UNAVAILABLE", "O serviço de pagamento não respondeu. Tente novamente em alguns minutos.");

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const key = env().ASAAS_API_KEY;
  if (!key) throw new AppError("UNAVAILABLE", "O pagamento online ainda não está disponível.");
  let res: Response;
  try {
    res = await transport(`${env().ASAAS_API_URL}${path}`, {
      method,
      headers: {
        access_token: key,
        "User-Agent": "Cadencia/1.0",
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch (err) {
    log.error("asaas request failed", { method, path: path.split("?")[0], error: err instanceof Error ? err.name : "unknown" });
    throw unavailable();
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const codes = Array.isArray((json as { errors?: unknown })?.errors) ? (json as { errors: { code?: string; description?: string }[] }).errors : [];
    log.warn("asaas error response", { method, path: path.split("/").slice(0, 2).join("/"), status: res.status, codes: codes.map((e) => e.code).join(",") });
    // 400s carry user-fixable problems (e.g. an invalid CPF/CNPJ): pass the provider's description through.
    if (res.status === 400 && codes[0]?.description) throw new AppError("VALIDATION", codes[0].description.slice(0, 200));
    throw unavailable();
  }
  return json as T;
}

export function createCustomer(input: { name: string; cpfCnpj: string; email: string; externalReference: string }) {
  return call<{ id: string }>("POST", "/customers", { ...input, notificationDisabled: false });
}

export function createSubscription(input: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) {
  return call<{ id: string; status: string; nextDueDate: string }>("POST", "/subscriptions", { ...input, billingType: "UNDEFINED", cycle: "MONTHLY" });
}

export function deleteSubscription(id: string) {
  return call<{ deleted: boolean; id: string }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function listSubscriptionPayments(id: string) {
  const r = await call<{ data?: AsaasPayment[] }>("GET", `/subscriptions/${encodeURIComponent(id)}/payments?limit=10`);
  return r.data ?? [];
}
