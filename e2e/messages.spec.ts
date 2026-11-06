import { expect, test } from "@playwright/test";
import { expectAccessible, inviteStudent, signUpTrainer } from "./helpers";

test("direct messages arrive live, without waiting for polling", async ({ page, browser }) => {
  await signUpTrainer(page);
  const { page: s } = await inviteStudent(page, browser, "Alice Prado");

  await s.goto("/aluno/mensagens");
  await s.locator("li", { hasText: "Rui Campos" }).getByRole("button", { name: "Conversar" }).click();
  await s.waitForURL(/\/aluno\/mensagens\/[0-9a-f-]{36}$/);
  await s.getByLabel("Mensagem", { exact: true }).fill("Oi, Rui!");
  await s.getByRole("button", { name: "Enviar" }).click();
  // The box clears only after the server saved the message.
  await expect(s.getByLabel("Mensagem", { exact: true })).toHaveValue("");
  await expect(s.getByRole("log").getByText("Oi, Rui!")).toBeVisible();

  await page.goto("/treinador/mensagens");
  await page.getByRole("link", { name: /Alice Prado/ }).click();
  await expect(page.getByText("Oi, Rui!")).toBeVisible();
  await expectAccessible(page, "conversa");
  // Give the live channel a moment to connect, then reply.
  await page.waitForTimeout(1500);

  await s.getByLabel("Mensagem", { exact: true }).fill("Chegou na hora?");
  const sent = Date.now();
  await s.getByRole("button", { name: "Enviar" }).click();
  // Polling while live runs every 30 s; seeing it this fast means the live signal delivered it.
  await expect(page.getByText("Chegou na hora?")).toBeVisible({ timeout: 3_000 });
  expect(Date.now() - sent).toBeLessThan(3_000);
});
