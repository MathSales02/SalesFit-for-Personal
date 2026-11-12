import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, inviteStudent, signUpTrainer } from "./helpers";

// Set E2E_SHOTS=1 to keep screenshots in test-results/folders.
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `test-results/folders/${name}.png`, fullPage: true });
};

test("home pages carry record folders: the trainer's students and workouts, the student's workout sheet", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signUpTrainer(page);
  const { page: s } = await inviteStudent(page, browser, "Alice Prado");

  // Empty at first, and saying so.
  await s.goto("/aluno");
  await expect(s.getByRole("heading", { name: "Ficha de treino" })).toBeVisible();
  await expect(s.getByRole("button", { name: "Abrir Ficha de treino, Vazia" })).toBeVisible();
  await expect(s.getByText("Sua ficha ainda está vazia.")).toBeVisible();

  // The trainer builds and assigns a workout.
  await page.goto("/treinador/treinos");
  await page.getByText("Novo programa").click();
  await page.getByLabel("Nome do programa").fill("Peito e costas");
  await page.getByRole("button", { name: "Criar programa" }).click();
  await page.getByLabel("Adicionar exercício").fill("supino reto com barra");
  await page.getByRole("button", { name: /Supino reto com barra/ }).click();
  await page.getByRole("button", { name: "Publicar" }).click();
  await page.getByRole("checkbox", { name: /Alice Prado/ }).check();
  await page.getByRole("button", { name: "Atribuir programa" }).click();
  await expect(page.getByText("Programa atribuído a 1 aluno.")).toBeVisible();

  // Trainer home: two folders with real contents.
  await page.goto("/treinador");
  await expect(page.getByRole("heading", { name: "Fichas", exact: true })).toBeVisible();
  const studentsFolder = page.getByRole("button", { name: "Abrir Fichas de alunos, 1 aluno" });
  const workoutsFolder = page.getByRole("button", { name: "Abrir Fichas de treino, 1 treino" });
  await expect(studentsFolder).toBeVisible();
  await expect(workoutsFolder).toBeVisible();
  await expectAccessible(page, "/treinador (pastas fechadas)");
  // Closed, the sheets are out of reach (inert); open, each one is a button that goes to the record.
  await expect(page.getByRole("list", { name: "Conteúdo de Fichas de alunos", includeHidden: true })).toHaveAttribute("inert", "");
  await studentsFolder.click();
  await expect(page.getByRole("button", { name: "Fechar Fichas de alunos, 1 aluno" })).toHaveAttribute("aria-expanded", "true");
  // The sheets finish rising out of the folder before anything is measured.
  await page.waitForTimeout(1200);
  await expectAccessible(page, "/treinador (pasta aberta)");
  await shot(page, "trainer-home");
  await page.getByRole("button", { name: /Alice Prado/ }).click();
  await page.waitForURL("**/treinador/alunos/**");
  await expect(page.getByRole("heading", { name: "Alice Prado" })).toBeVisible();

  await page.goto("/treinador");
  await page.getByRole("button", { name: "Abrir Fichas de treino, 1 treino" }).click();
  // The workout knows how many students follow it.
  await page.getByRole("button", { name: /^Peito e costas\s*1 aluno/ }).click();
  await page.waitForURL("**/treinador/treinos/**");

  // Student home on the phone: the sheet is in the folder and leads to the workout's exercises.
  await s.goto("/aluno");
  await s.getByRole("button", { name: "Abrir Ficha de treino, 1 treino" }).click();
  // The sheets finish rising out of the folder before anything is measured.
  await s.waitForTimeout(1200);
  await expectNoHorizontalScroll(s);
  await expectAccessible(s, "/aluno (pasta aberta)");
  await shot(s, "student-home");
  await s.getByRole("button", { name: /Treino A/ }).click();
  await expect(s).toHaveURL(/\/aluno#dia-/);
  await expect(s.getByRole("heading", { name: "Treino A" })).toBeInViewport();
  await s.context().close();
});
