import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, mobilePage, signUpTrainer } from "./helpers";

// Set E2E_SHOTS=1 to keep screenshots of the main screens in test-results/exercises.
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `test-results/exercises/${name}.png`, fullPage: true });
};

test("the exercise library: instant search, muscle group chips, details, video and a single copy", async ({ page }) => {
  test.setTimeout(120_000);
  await signUpTrainer(page);
  await page.goto("/treinador/exercicios");
  const search = page.getByLabel("Buscar exercícios");
  const chips = page.getByRole("group", { name: "Filtrar por grupo muscular" });
  const card = (name: string) => page.getByRole("link", { name: new RegExp(`^${name}`) });

  // Typing is enough: no button, synonyms and missing accents understood.
  await search.fill("peitoral");
  await expect(card("Supino reto com barra")).toBeVisible();
  await expect(card("Peck deck")).toBeVisible();
  await expect(card("Puxada frontal")).toHaveCount(0);
  await search.fill("triceps frances");
  await expect(card("Tríceps francês com halter")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Supino/ })).toHaveCount(0);

  // Nothing found: a clear empty state, and one tap to start over.
  await search.fill("xyzabc");
  await expect(page.getByText("Nenhum exercício encontrado")).toBeVisible();
  await expectAccessible(page, "/treinador/exercicios (vazio)");
  await page.getByRole("button", { name: "Limpar busca e filtros" }).click();
  await expect(search).toHaveValue("");
  await expect(card("Agachamento livre")).toBeVisible();

  // Chips filter by main group and combine with the search; counters follow the search.
  await chips.getByRole("button", { name: /^Costas/ }).click();
  await expect(card("Puxada frontal")).toBeVisible();
  await expect(card("Supino reto com barra")).toHaveCount(0);
  await search.fill("remada");
  await expect(card("Remada curvada com barra")).toBeVisible();
  await expect(card("Puxada frontal")).toHaveCount(0);
  await expect(chips.getByRole("button", { name: /^Costas/ })).toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByRole("button", { name: /^Peito/ })).toContainText("0");
  await expect(page).toHaveURL(/q=remada&group=back/);
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await chips.getByRole("button", { name: /^Tudo/ }).click();
  await expectAccessible(page, "/treinador/exercicios");
  await shot(page, "library-desktop");

  // The detail page: no video yet, but the whole guidance is there.
  await card("Supino reto com barra").click();
  await expect(page.getByRole("heading", { name: "Supino reto com barra" })).toBeVisible();
  await expect(page.getByText("Demonstração em breve")).toBeVisible();
  for (const h of ["Sobre o movimento", "Passo a passo", "Dicas de execução", "Erros comuns"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText("Também trabalha")).toBeVisible();
  await expectAccessible(page, "exercício da biblioteca SalesFit");
  const platformUrl = page.url();

  // Copy it, then personalize: a YouTube link becomes a player with a thumbnail.
  await page.getByRole("button", { name: "Copiar para minha biblioteca" }).click();
  await expect(page.getByRole("heading", { name: "Editar exercício" })).toBeVisible();
  const copyUrl = page.url();
  expect(copyUrl).not.toBe(platformUrl);
  await page.getByLabel("Link de vídeo (YouTube)").fill("https://vimeo.com/123");
  await page.getByRole("button", { name: "Salvar exercício" }).click();
  await expect(page.getByText("Use o link de um vídeo do YouTube.")).toBeVisible();
  await page.getByLabel("Link de vídeo (YouTube)").fill("https://youtu.be/aaaaaaaaaaa");
  await page.getByLabel("Nível de dificuldade").selectOption("advanced");
  await page.getByRole("button", { name: "Salvar exercício" }).click();
  await expect(page.getByText("Exercício salvo.")).toBeVisible();
  const play = page.getByRole("button", { name: "Reproduzir vídeo: Supino reto com barra" });
  await expect(play).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0); // nothing loads or plays by itself
  await expectAccessible(page, "exercício da minha biblioteca");
  await shot(page, "detail-desktop");
  await play.click();
  await expect(page.locator('iframe[src^="https://www.youtube-nocookie.com/embed/aaaaaaaaaaa"]')).toBeVisible();

  // The platform exercise now points to the copy instead of offering a second one.
  await page.goto(platformUrl);
  await expect(page.getByRole("button", { name: "Copiar para minha biblioteca" })).toHaveCount(0);
  await page.getByRole("link", { name: "Abrir minha cópia" }).click();
  await expect(page).toHaveURL(copyUrl);

  // Both appear in the list: mine, and the original marked as already copied.
  await page.goto("/treinador/exercicios?q=supino+reto+barra");
  await expect(page.getByRole("link", { name: /^Supino reto com barra/ })).toHaveCount(2);
  await expect(page.getByText("Na sua biblioteca", { exact: true })).toBeVisible();
});

test("on a phone the library fits the screen and the chips scroll sideways", async ({ browser }) => {
  const page = await mobilePage(browser);
  await signUpTrainer(page);
  await page.goto("/treinador/exercicios");
  await page.getByLabel("Buscar exercícios").fill("gluteo");
  await expect(page.getByRole("link", { name: /^Elevação pélvica/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, "/treinador/exercicios (celular)");
  await shot(page, "library-mobile");
  await page.getByRole("link", { name: /^Elevação pélvica/ }).click();
  await expect(page.getByRole("heading", { name: "Passo a passo" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "detail-mobile");
  await page.context().close();
});
