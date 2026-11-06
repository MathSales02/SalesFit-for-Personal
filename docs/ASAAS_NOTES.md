# Asaas API v3 — integration notes

Collected from https://docs.asaas.com (November 2026). Items marked UNCONFIRMED must be checked in the sandbox.

## Connection

- Sandbox base: `https://api-sandbox.asaas.com/v3`. Production base: `https://api.asaas.com/v3` (UNCONFIRMED; configured through `ASAAS_API_URL`).
- Auth header: `access_token: <API_KEY>` (no Bearer). Send a descriptive `User-Agent`.
- 401 body: `{"errors":[{"code":"invalid_access_token","description":"..."}]}`. GET requests must not carry a body (403).

## Customers

- `POST /customers` with required `name` and `cpfCnpj`; optional `email`, `externalReference`, `notificationDisabled`…
- Response `id` like `cus_000005401844`.
- Duplicates are allowed. Store the id; on a timeout, search before retrying.

## Subscriptions

- `POST /subscriptions` with `customer`, `billingType` (`UNDEFINED` | `BOLETO` | `CREDIT_CARD` | `PIX`), `value`, `nextDueDate` (`YYYY-MM-DD`), `cycle` (`MONTHLY`…).
  - Optional: `description` (≤500), `externalReference`, `callback.successUrl`.
- Response: `id` (`sub_…`), `status` (`ACTIVE` | `EXPIRED` | `INACTIVE`), `paymentLink`, `nextDueDate`. There is no `invoiceUrl`.
- Charge links: `GET /subscriptions/{id}/payments`.
  - Each `data[]` item has `invoiceUrl`, `status`, `dueDate`, `value`.
  - Only charges already generated are listed. Also arrives in the `PAYMENT_CREATED` webhook.
- Update: `PUT /subscriptions/{id}`.
  - Body fields: `billingType`, `status`, `nextDueDate`, `cycle`, `description`, `updatePendingPayments`, `externalReference`.
  - `value` is not in the schema (UNCONFIRMED). To change plan, cancel and recreate, or test in the sandbox.
- Cancel: `DELETE /subscriptions/{id}`.
  - Response: `{deleted, id}`. Pending and overdue charges are removed; paid ones stay. Emits `SUBSCRIPTION_DELETED`.

## Webhooks

- Authenticity: the token configured in the webhook is sent in header `asaas-access-token`. It must differ from the API key.
- Payload:
  - `id` (`evt_…`), `event`, `dateCreated` (`"2024-06-12 16:45:03"`), `account`.
  - Then `payment` or `subscription`.
  - `payment` has `id`, `customer`, `subscription`, `status`, `value`, `dueDate`, `invoiceUrl`, `externalReference`, `billingType`, `paymentDate`.
- Payment events:
  - Lifecycle: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`.
  - Refunds and chargebacks: `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`…
  - Card: `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`…
- Subscription events: `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`.
- Delivery is at-least-once, and resends keep the same `id`.
  - Store the event id under a UNIQUE constraint, commit, then answer 200.
  - Ignore unknown fields and events. Never throw on schema drift.
- Only HTTP 200 is success; 3xx is not followed.
  - 15 consecutive failures pause the queue (other webhooks keep working).
  - Events older than 14 days are dropped.
- Order is not guaranteed unless the webhook is set to sequential. Card payments: `CONFIRMED`, then `RECEIVED` about 32 days later.
- Production webhook source IPs: 52.67.12.206, 18.230.8.159, 54.94.136.112, 54.94.183.101. The sandbox may use others.
- Sandbox-only endpoints can confirm a payment or force a charge overdue.

## Confirmed in the sandbox (November 2026)

The end-to-end flow worked against `https://api-sandbox.asaas.com/v3`:
1. Create customer.
2. Create subscription (`billingType: UNDEFINED`, `MONTHLY`).
3. `GET /subscriptions/{id}/payments` returns the first charge right away, with an `invoiceUrl` on `sandbox.asaas.com`.
4. `POST /sandbox/payment/{id}/confirm` marks the charge `RECEIVED`. This is sandbox only.
5. Our webhook marks the subscription active until one month after the due date.
6. `DELETE /subscriptions/{id}` cancels it.

## How the app uses it

- Code:
  - `src/server/billing/asaas.ts`: HTTP client with a 15 s timeout, no redirects, and generic errors for users.
  - `src/server/billing/provider.ts`: checkout, cancel, webhook storage and processing, admin reprocess.
  - `src/app/api/webhooks/asaas/route.ts`: the endpoint.
- Checkout:
  - Replaces any previous Asaas subscription (deletes it first) and creates a new one.
  - When a paid period is still running, the first charge falls on its end date, so a plan change takes effect at renewal.
  - Access only changes when a verified `PAYMENT_CONFIRMED` or `PAYMENT_RECEIVED` webhook arrives.
- If saving the checkout fails after Asaas created the subscription, the subscription is deleted there too.
- Webhook events:
  - Every event is stored first (unique `provider + event id`), then processed.
  - Redeliveries are no-ops.
  - Processing errors still answer 200 (so the Asaas queue never pauses) and show up in Admin, Cobrança, where they can be reprocessed.
- How events are applied:
  - The workspace is found only through the subscription id we stored, never through `externalReference` alone.
  - Deleting a replaced subscription does not cancel the current one.
- The CPF/CNPJ is checked locally (check digits), sent to Asaas once, and never stored by us.

## Production checklist

1. Create the production API key in Asaas (Integrações → Chaves de API). Set `ASAAS_API_URL=https://api.asaas.com/v3` and `ASAAS_API_KEY` (escaped as `\$aact_...` in .env files) in the server environment only.
2. Generate a long random `ASAAS_WEBHOOK_TOKEN`.
3. In Asaas (Integrações → Webhooks), create a webhook:
   - URL: `https://<domain>/api/webhooks/asaas`
   - Authentication token: `ASAAS_WEBHOOK_TOKEN`
   - Send type: sequential
   - Events: all `PAYMENT_*` events plus `SUBSCRIPTION_DELETED` and `SUBSCRIPTION_INACTIVATED`
4. If a firewall or Cloudflare sits in front, allow the Asaas webhook IPs listed above.
5. Watch Admin, Cobrança for failed events after launch.
6. Never reuse a key that was pasted into chats or tickets: rotate it.
