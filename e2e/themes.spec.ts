import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, inviteStudent, signUpTrainer } from "./helpers";

const TRAINER_PAGES = [
  "/treinador",
  "/treinador/alunos",
  "/treinador/treinos",
  "/treinador/exercicios",
  "/treinador/comunidade",
  "/treinador/comunidade/descobrir",
  "/treinador/ranking",
  "/treinador/mensagens",
  "/treinador/notificacoes",
  "/treinador/assinatura",
  "/conta",
  "/conta/duas-etapas",
];
const STUDENT_PAGES = ["/aluno", "/aluno/comunidade", "/aluno/comunidade/descobrir", "/aluno/ranking", "/aluno/historico", "/aluno/progresso", "/aluno/mensagens", "/aluno/notificacoes", "/aluno/saude", "/conta"];

test("dark theme (following the device): every main screen keeps WCAG 2.2 AA contrast", async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/entrar", "/cadastro"]) {
    await page.goto(path);
    await expectAccessible(page, `${path} (escuro)`);
  }
  await signUpTrainer(page);
  for (const path of TRAINER_PAGES) {
    await page.goto(path);
    await expectAccessible(page, `${path} (escuro)`);
  }

  const { page: s } = await inviteStudent(page, browser, "Alice Prado");
  await s.emulateMedia({ colorScheme: "dark" });
  await s.getByRole("button", { name: /hoje: sem check-in\. Fazer check-in/ }).click();
  await s.getByLabel(/Treinou por fora/).fill("Corrida");
  await s.getByRole("button", { name: "Fazer check-in", exact: true }).click();
  await expect(s.getByRole("img", { name: /hoje: check-in$/ })).toBeVisible();
  for (const path of STUDENT_PAGES) {
    await s.goto(path);
    await expectNoHorizontalScroll(s);
    await expectAccessible(s, `${path} (escuro, celular)`);
  }
});

test("light pages pass too, and the theme switch is remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signUpTrainer(page);
  for (const path of ["/treinador/mensagens", "/treinador/notificacoes", "/treinador/assinatura", "/conta/duas-etapas"]) {
    await page.goto(path);
    await expectAccessible(page, `${path} (claro)`);
  }

  await page.goto("/treinador");
  const html = page.locator("html");
  await page.getByRole("button", { name: "Usar tema escuro" }).first().click();
  await expect(html).toHaveClass(/\bdark\b/);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(html).toHaveClass(/\bdark\b/); // saved, applied by the server
  await expectAccessible(page, "/treinador (escuro escolhido)");

  await page.goto("/conta");
  await page.getByRole("button", { name: "Seguir o sistema" }).click();
  await expect(page.getByRole("button", { name: "Seguir o sistema" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(html).not.toHaveClass(/\bdark\b|\blight\b/);
});
