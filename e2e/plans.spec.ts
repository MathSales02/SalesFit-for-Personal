import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, inviteStudent, setPlan, signUpTrainer } from "./helpers";

// Set E2E_SHOTS=1 to keep screenshots in test-results/plans.
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `test-results/plans/${name}.png`, fullPage: true });
};

test("the pricing section shows Start, Pro and Elite with the yearly price, and Academy as coming soon", async ({ page }) => {
  await page.goto("/");
  const pricing = page.locator("#precos");
  for (const text of ["SalesFit Start", "R$ 29,90", "R$ 304,98", "SalesFit Pro", "R$ 49,90", "R$ 508,98", "SalesFit Elite", "R$ 79,90", "R$ 814,98", "SalesFit Academy", "Em breve"]) {
    await expect(pricing.getByText(text, { exact: true }).first()).toBeAttached();
  }
  // Only the plans that can be bought have a button.
  await expect(pricing.getByRole("link", { name: /^Começar com / })).toHaveCount(3);
});

test("plans limit what a consultancy can use: trial shows everything, Start the essentials, Pro all but competitions", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = await signUpTrainer(page);
  const { page: s } = await inviteStudent(page, browser, "Alice Prado");
  const studentNav = s.getByRole("navigation", { name: "Principal" });

  // Trial: the whole product.
  await page.goto("/treinador/comunidade");
  await expect(page).toHaveURL(/\/treinador\/comunidade$/);
  await s.goto("/aluno");
  await expect(studentNav.getByRole("link", { name: "Comunidade" })).toBeVisible();

  // The subscription page: monthly or yearly, and installments for the year.
  await page.goto("/treinador/assinatura");
  await expect(page.getByText(/Teste grátis: \d dias? restantes?/)).toBeVisible();
  const pro = page.getByRole("radio", { name: /SalesFit Pro/ });
  // The card shows the price of one month; switching to yearly only runs the number to the
  // discounted value. The words around it stay as they are.
  const proCard = page.locator("label").filter({ hasText: "SalesFit Pro" });
  const texts = async () => (await proCard.innerText()).replace(/R\$\s[\d.,]+/g, "R$ #");
  await expect(proCard.getByText("R$ 49,90", { exact: true }).first()).toBeAttached();
  await expect(proCard.getByText("No anual, R$ 508,98 por ano")).toBeVisible();
  const before = await texts();
  await page.getByText("Anual, 15% de desconto").click();
  await expect(proCard.getByText("R$ 42,42", { exact: true }).first()).toBeAttached();
  await expect(proCard.locator("[aria-hidden=true]").first()).toHaveText("R$ 42,42");
  expect(await texts()).toBe(before);
  await pro.check();
  const installments = page.getByLabel("Parcelas");
  await installments.selectOption("6");
  await expect(installments.locator("option:checked")).toHaveText("6x no cartão de crédito de R$ 84,83");
  await expect(page.getByText(/não renova sozinho/)).toBeVisible();
  await expect(page.getByText(/a primeira cobrança vence em 3 dias/)).toBeVisible();
  await expectAccessible(page, "/treinador/assinatura (anual)");
  await shot(page, "subscription-yearly");
  await page.getByText("Mensal", { exact: true }).click();
  await expect(installments).toHaveCount(0);
  await expect(proCard.locator("[aria-hidden=true]").first()).toHaveText("R$ 49,90");

  // Start: community and ranking are locked for the trainer, with the way to get them.
  await setPlan(email, "sf_start");
  await page.goto("/treinador/comunidade");
  await expect(page).toHaveURL(/\/treinador\/recurso\?f=community$/);
  await expect(page.getByRole("heading", { name: "Comunidade" })).toBeVisible();
  await expect(page.getByText("Plano SalesFit Pro")).toBeVisible();
  await expectAccessible(page, "/treinador/recurso (comunidade)");
  await shot(page, "locked-trainer");
  await page.getByRole("link", { name: "Ver planos" }).click();
  await page.waitForURL("**/treinador/assinatura");
  await expect(page.getByText("Assinatura ativa")).toBeVisible();
  await page.goto("/treinador/ranking");
  await expect(page).toHaveURL(/\/treinador\/recurso\?f=ranking$/);
  // The essentials keep working.
  for (const path of ["/treinador", "/treinador/alunos", "/treinador/treinos", "/treinador/exercicios", "/treinador/mensagens"]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }

  // The student is not offered what the plan leaves out, and is not asked to buy anything.
  await s.goto("/aluno");
  await expect(s.getByRole("heading", { name: /Bora, Alice/ })).toBeVisible();
  await expect(studentNav.getByRole("link", { name: "Histórico" })).toBeVisible();
  await expect(studentNav.getByRole("link", { name: "Comunidade" })).toHaveCount(0);
  await expect(studentNav.getByRole("link", { name: "Ranking" })).toHaveCount(0);
  await s.goto("/aluno/comunidade");
  await expect(s).toHaveURL(/\/aluno\/recurso\?f=community$/);
  await expect(s.getByText("Este recurso não faz parte do plano da sua consultoria.", { exact: false })).toBeVisible();
  await expect(s.getByRole("link", { name: "Ver planos" })).toHaveCount(0);
  await expectNoHorizontalScroll(s);
  await expectAccessible(s, "/aluno/recurso (comunidade)");
  await s.goto("/aluno/progresso");
  await expect(s.getByText("Evolução física não faz parte do plano da sua consultoria.")).toBeVisible();

  // Pro: community and ranking are back; competitions belong to Elite.
  await setPlan(email, "sf_pro");
  await page.goto("/treinador/comunidade");
  await expect(page).toHaveURL(/\/treinador\/comunidade$/);
  await page.goto("/treinador/ranking");
  await expect(page.getByRole("heading", { name: "Ranking e competições" })).toBeVisible();
  await expect(page.getByText(/Competições faz parte do plano SalesFit Elite/)).toBeVisible();
  await expect(page.getByText("Nova competição")).toHaveCount(0);
  await expectAccessible(page, "/treinador/ranking (Pro)");
  await s.goto("/aluno");
  await expect(studentNav.getByRole("link", { name: "Comunidade" })).toBeVisible();

  // Elite: everything.
  await setPlan(email, "sf_elite");
  await page.goto("/treinador/ranking");
  await expect(page.getByText("Nova competição")).toBeVisible();
  await s.context().close();
});
