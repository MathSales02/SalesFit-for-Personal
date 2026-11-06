import { expect, test } from "@playwright/test";
import { expectAccessible, signUpTrainer } from "./helpers";

test("public pages are accessible", async ({ page }) => {
  for (const path of ["/", "/entrar", "/cadastro", "/esqueci-senha", "/privacidade", "/termos"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});

test("a trainer signs up, confirms the email and reaches the dashboard", async ({ page }) => {
  await signUpTrainer(page);
  await expect(page.getByRole("heading", { name: /Olá, Rui/ })).toBeVisible();
  await expectAccessible(page, "/treinador");
  for (const path of ["/treinador/alunos", "/treinador/treinos", "/treinador/exercicios", "/treinador/comunidade", "/treinador/ranking", "/treinador/assinatura", "/conta"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});

test("pages that need a session send visitors to the login", async ({ page }) => {
  for (const path of ["/treinador", "/aluno", "/admin", "/conta"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar/);
  }
});
