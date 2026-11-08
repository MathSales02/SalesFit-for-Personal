import { describe, expect, it } from "vitest";
import { parseFrom, sendViaBrevo } from "@/server/mail/mailer";

const mail = { to: "aluno@example.com", subject: "Confirme seu e-mail", text: "texto", html: "<p>html</p>" };

describe("mail over the Brevo API", () => {
  it("reads the sender from MAIL_FROM", () => {
    expect(parseFrom("SalesFit <time@example.com>")).toEqual({ name: "SalesFit", email: "time@example.com" });
    expect(parseFrom('"SalesFit" <a@b.com>')).toEqual({ name: "SalesFit", email: "a@b.com" });
    expect(parseFrom("a@b.com")).toEqual({ email: "a@b.com" });
  });

  it("posts the message with the key in a header", async () => {
    let call: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      call = { url, init };
      return new Response(JSON.stringify({ messageId: "x" }), { status: 201 });
    }) as unknown as typeof fetch;
    await sendViaBrevo("key-0123456789abcdefghij", "SalesFit <time@example.com>", mail, fake);
    expect(call!.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((call!.init.headers as Record<string, string>)["api-key"]).toBe("key-0123456789abcdefghij");
    const body = JSON.parse(call!.init.body as string);
    expect(body).toMatchObject({ sender: { name: "SalesFit", email: "time@example.com" }, to: [{ email: "aluno@example.com" }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text });
  });

  it("fails loudly when Brevo refuses", async () => {
    const fake = (async () => new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 })) as unknown as typeof fetch;
    await expect(sendViaBrevo("bad-key-0123456789abcdef", "a@b.com", mail, fake)).rejects.toThrow("brevo 401 unauthorized Key not found");
  });
});
