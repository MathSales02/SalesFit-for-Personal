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
