import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";

export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025";
export const PASSWORD = "uma frase longa e segura";
export const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** Latest link of the given kind sent to `to`, read from Mailpit. */
export async function mailLink(to: string, part: string, subject?: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const q = `to:"${to}"${subject ? ` subject:"${subject}"` : ""}`;
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}`)).json();
    for (const m of list.messages ?? []) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const match = (full.Text as string).match(new RegExp(`(http\\S*${part}\\?token=[A-Za-z0-9_-]{43})`));
      if (match) return match[1]!;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no ${part} mail for ${to}`);
}

/** Fails on serious or critical accessibility violations (WCAG 2.1 A/AA rules). */
export async function expectAccessible(page: Page, label: string) {
  // Local escape hatch while a visual redesign is in progress; never set in CI.
  if (process.env.E2E_SKIP_A11Y && !process.env.CI) return;
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `accessibility on ${label}`).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function mobilePage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR" });
  return ctx.newPage();
}

/** Signs up a trainer, confirms the email and signs in. */
export async function signUpTrainer(page: Page, name = "Rui Campos", workspace = "Rui Treinos") {
  const email = `coach-${stamp()}@example.com`;
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("Nome da consultoria").fill(workspace);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta grátis" }).click();
  await page.waitForURL("**/cadastro/confirme");
  await page.goto(await mailLink(email, "verificar-email"));
  await page.getByRole("button", { name: "Confirmar meu e-mail" }).click();
  await page.waitForURL("**/entrar?aviso=email-confirmado");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/treinador");
  return email;
}

/** The trainer invites a student, who accepts on a phone-sized page. */
export async function inviteStudent(trainer: Page, browser: Browser, name: string) {
  const email = `${name.toLowerCase().replace(/\W/g, "")}-${stamp()}@example.com`;
  await trainer.goto("/treinador/alunos");
  await trainer.getByLabel("E-mail do aluno").fill(email);
  await trainer.getByRole("button", { name: "Enviar convite" }).click();
  await trainer.getByText(`Convite enviado para ${email}.`).waitFor();
  const p = await mobilePage(browser);
  await p.goto(await mailLink(email, "convite"));
  await p.getByLabel("Seu nome").fill(name);
  await p.getByLabel("Crie uma senha").fill(PASSWORD);
  await p.getByRole("checkbox").check();
  await p.getByRole("button", { name: "Aceitar e entrar" }).click();
  await p.waitForURL("**/aluno");
  return { page: p, email };
}

/** RFC 6238 code for a base32 secret (offset in 30 s steps). */
export function totp(secret: string, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of secret.replace(/\s/g, "")) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const o = mac[mac.length - 1]! & 15;
  const bin = ((mac[o]! & 127) << 24) | (mac[o + 1]! << 16) | (mac[o + 2]! << 8) | mac[o + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}
