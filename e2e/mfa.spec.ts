import { expect, test } from "@playwright/test";
import { PASSWORD, expectAccessible, signUpTrainer, totp } from "./helpers";

test("two-step verification: enroll, sign out, sign in with a code", async ({ page }) => {
  const email = await signUpTrainer(page);
  await page.goto("/conta/duas-etapas");
  await page.getByRole("button", { name: "Configurar" }).click();
  await expect(page.getByRole("img", { name: "QR code para o aplicativo autenticador" })).toBeVisible();
  await expectAccessible(page, "/conta/duas-etapas");
  const secret = (await page.locator("code").innerText()).replace(/\s/g, "");
  await page.getByLabel("Código de 6 dígitos do aplicativo").fill(totp(secret));
  await page.getByRole("button", { name: "Ativar" }).click();
  await expect(page.getByRole("list", { name: "Códigos de recuperação" }).locator("li")).toHaveCount(10);

  await page.goto("/conta");
  await page.getByRole("button", { name: "Sair desta conta" }).click();
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/entrar/verificacao");
  await expectAccessible(page, "/entrar/verificacao");
  await page.getByLabel("Código do aplicativo autenticador").fill("000000");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Código inválido.")).toBeVisible();
  await page.getByLabel("Código do aplicativo autenticador").fill(totp(secret, 1));
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL("**/treinador");
});
