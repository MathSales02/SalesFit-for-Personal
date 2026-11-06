import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, inviteStudent, signUpTrainer } from "./helpers";

test("an invited student joins on a phone, checks in and sees the ranking", async ({ page, browser }) => {
  await signUpTrainer(page);
  const { page: s } = await inviteStudent(page, browser, "Alice Prado");

  await expect(s.getByRole("heading", { name: "Bora, Alice." })).toBeVisible();
  await expectNoHorizontalScroll(s);
  await expectAccessible(s, "/aluno");

  await s.getByLabel("O que você fez? (opcional)").fill("Corrida");
  await s.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(s.getByText("Check-in de hoje feito")).toBeVisible();

  await s.getByRole("link", { name: "Ranking" }).last().click();
  await expect(s.getByRole("region", { name: "Classificação" })).toContainText("Alice Prado");
  await expectNoHorizontalScroll(s);
  await expectAccessible(s, "/aluno/ranking");

  for (const path of ["/aluno/comunidade", "/aluno/historico", "/aluno/progresso", "/aluno/mensagens", "/aluno/saude", "/conta"]) {
    await s.goto(path);
    await expectNoHorizontalScroll(s);
    await expectAccessible(s, path);
  }

  // The trainer sees the student.
  await page.goto("/treinador/alunos");
  await expect(page.getByText("Alice Prado")).toBeVisible();
});
