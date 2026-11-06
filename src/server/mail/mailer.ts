import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { errorFields, log } from "../lib/logger";

export type Mail = { to: string; subject: string; text: string; html: string };

/** Captured mail in tests, so they can assert on links without a mail server. */
export const testOutbox: Mail[] = [];

let transport: Transporter | undefined;

export async function sendMail(mail: Mail): Promise<void> {
  if (env().NODE_ENV === "test") {
    testOutbox.push(mail);
    return;
  }
  transport ??= nodemailer.createTransport(env().SMTP_URL);
  try {
    await transport.sendMail({ from: env().MAIL_FROM, ...mail });
  } catch (err) {
    // Recipient and content are not logged.
    log.error("mail delivery failed", { subject: mail.subject, ...errorFields(err) });
    throw err;
  }
}
