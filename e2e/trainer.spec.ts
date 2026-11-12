import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, mobilePage, signUpTrainer } from "./helpers";

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

test("on a phone the trainer navigates from a bottom tab bar", async ({ browser }) => {
  const page = await mobilePage(browser);
  await signUpTrainer(page);
  const bar = page.getByRole("navigation", { name: "Principal" });
  await expect(bar).toBeVisible();
  for (const name of ["Início", "Alunos", "Treinos", "Comunidade", "Mais"]) await expect(bar.getByText(name, { exact: true })).toBeVisible();

  // The lamp hangs over the current tab.
  await expect(bar.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "test-results/navbar/trainer-home.png" });
  await bar.getByRole("link", { name: "Alunos" }).click();
  await page.waitForURL("**/treinador/alunos");
  await expect(bar.getByRole("link", { name: "Alunos" })).toHaveAttribute("aria-current", "page");
  await expectAccessible(page, "/treinador/alunos (barra flutuante)");

  await bar.getByRole("button", { name: "Mais" }).click();
  await expect(bar.getByRole("button", { name: "Mais" })).toHaveAttribute("aria-expanded", "true");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "test-results/navbar/trainer-more.png" });
  await expectAccessible(page, "/treinador (menu Mais aberto)");
  await bar.getByRole("link", { name: "Ranking" }).click();
  await page.waitForURL("**/treinador/ranking");
  // The sheet closes after navigating, and "Mais" marks where the trainer is.
  await expect(bar.getByRole("link", { name: "Ranking" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Mais" })).toHaveAttribute("aria-expanded", "false");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: "test-results/navbar/trainer-ranking.png" });
  await expectNoHorizontalScroll(page);
  await page.context().close();
});

test("on a computer the trainer keeps the side rail, without the tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUpTrainer(page);
  await expect(page.getByRole("button", { name: "Mais" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Ranking", exact: true })).toBeVisible();
});

test("pages that need a session send visitors to the login", async ({ page }) => {
  for (const path of ["/treinador", "/aluno", "/admin", "/conta"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar/);
  }
});
