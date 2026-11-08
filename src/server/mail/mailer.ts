import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { errorFields, log } from "../lib/logger";

export type Mail = { to: string; subject: string; text: string; html: string };

/** Captured mail in tests, so they can assert on links without a mail server. */
export const testOutbox: Mail[] = [];

let transport: Transporter | undefined;

/**
 * Sends through the Brevo HTTP API when BREVO_API_KEY is set (hosts such as Railway's
 * Hobby plan block outbound SMTP), otherwise through SMTP_URL (local Mailpit, or any SMTP host).
 */
export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (e.NODE_ENV === "test") {
    testOutbox.push(mail);
    return;
  }
  try {
    if (e.BREVO_API_KEY) {
      await sendViaBrevo(e.BREVO_API_KEY, e.MAIL_FROM, mail);
    } else {
      transport ??= nodemailer.createTransport(e.SMTP_URL!);
      await transport.sendMail({ from: e.MAIL_FROM, ...mail });
    }
  } catch (err) {
    // Recipient and content are not logged.
    log.error("mail delivery failed", { subject: mail.subject, ...errorFields(err) });
    throw err;
  }
}

/** "Name <email@x>" or "email@x" -> { name, email }. */
export function parseFrom(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return m[1] ? { name: m[1].trim(), email: m[2]!.trim() } : { email: m[2]!.trim() };
  return { email: from.trim() };
}

export async function sendViaBrevo(apiKey: string, from: string, mail: Mail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: parseFrom(from),
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Brevo error bodies carry a code and message, never the API key.
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new Error(`brevo ${res.status} ${body.code ?? ""} ${body.message ?? ""}`.trim());
  }
}
