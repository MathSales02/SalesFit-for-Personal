import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, mobilePage, signUpTrainer } from "./helpers";

// Set E2E_SHOTS=1 to keep screenshots in test-results/i18n.
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `test-results/i18n/${name}.png`, fullPage: true });
};

test("the sign-in screen follows the browser's language until the person chooses one", async ({ browser }) => {
  for (const [locale, lang, heading, button] of [
    ["en-US", "en", "Sign in", "Sign in"],
    ["es-AR", "es", "Iniciar sesión", "Iniciar sesión"],
    ["pt-PT", "pt-BR", "Entrar", "Entrar"],
    // A language the app does not have falls back to English.
    ["de-DE", "en", "Sign in", "Sign in"],
  ] as const) {
    const ctx = await browser.newContext({ locale });
    const page = await ctx.newPage();
    await page.goto("/entrar");
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: button, exact: true })).toBeVisible();
    await ctx.close();
  }

  // A choice made on the screen wins over the browser, and is remembered.
  const ctx = await browser.newContext({ locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.goto("/cadastro");
  await expect(page.getByRole("heading", { name: "Crea tu consultoría" })).toBeVisible();
  await expectAccessible(page, "/cadastro (español)");
  await ctx.close();
});

test("a trainer switches the app to English and to Spanish: menus, screens and server messages follow", async ({ page }) => {
  test.setTimeout(180_000);
  await signUpTrainer(page);
  await page.goto("/conta");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page).toHaveTitle(/Account and security/);

  // Menu and home.
  await page.goto("/treinador");
  const rail = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Overview", "Students", "Workouts", "Exercises", "Community", "Subscription"]) await expect(rail.getByRole("link", { name, exact: true })).toBeAttached();
  await expect(page.getByRole("heading", { name: /Hello,\s*Rui/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
  await expectAccessible(page, "/treinador (English)");
  await shot(page, "trainer-home-en");

  // The other everyday screens.
  await page.goto("/treinador/alunos");
  await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send invitation" })).toBeVisible();
  await page.goto("/treinador/treinos");
  await expect(page.getByRole("heading", { name: "Workouts", exact: true })).toBeVisible();
  await page.goto("/treinador/assinatura");
  await expect(page.getByText(/Free trial: \d days?/)).toBeVisible();
  await expect(page.getByText("Choose your plan")).toBeVisible();
  await expect(page.getByText("Yearly, 15% off")).toBeVisible();
  await expectAccessible(page, "/treinador/assinatura (English)");

  // Exercises: interface, muscle groups and a message that comes from the server.
  await page.goto("/treinador/exercicios");
  await expect(page.getByLabel("Search exercises")).toBeVisible();
  const chips = page.getByRole("group", { name: "Filter by muscle group" });
  await expect(chips.getByRole("button", { name: /^Chest/ })).toBeVisible();
  await expect(chips.getByRole("button", { name: /^Hamstrings/ })).toBeVisible();
  await page.getByText("New exercise").click();
  await page.getByLabel("Name", { exact: true }).fill("X");
  await page.getByLabel("Muscle group", { exact: true }).selectOption({ label: "Chest" });
  await page.getByRole("button", { name: "Create exercise" }).click();
  await expect(page.getByText("Enter the exercise name.")).toBeVisible();
  await expectAccessible(page, "/treinador/exercicios (English)");
  await shot(page, "exercises-en");

  // A library exercise: name, equipment and the whole guidance in English.
  await page.getByLabel("Search exercises").fill("barbell bench press");
  await page.getByRole("link", { name: /^Barbell bench press/ }).click();
  // The first visit compiles this page on the test server.
  await expect(page.getByRole("heading", { name: "Barbell bench press" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Step by step" })).toBeVisible();
  await expect(page.getByText("Lie on the bench with your eyes under the bar, feet firm on the floor and shoulder blades together.")).toBeVisible();
  await expect(page.getByText("Bouncing the bar off your chest.")).toBeVisible();
  await expect(page.getByText("Barbell and bench")).toBeVisible();
  await expectAccessible(page, "exercício da biblioteca (English)");

  // Community and ranking.
  await page.goto("/treinador/comunidade");
  const tabs = page.getByRole("navigation", { name: "Filter posts" });
  for (const name of ["For you", "Following", "Trending", "Saved"]) await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByText("The feed starts with you")).toBeVisible();
  await expectAccessible(page, "/treinador/comunidade (English)");
  await page.goto("/treinador/ranking");
  await expect(page.getByRole("heading", { name: "Ranking and competitions" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Week" })).toBeVisible();
  await expect(page.getByText("Scoring rules")).toBeVisible();

  // Spanish.
  await page.goto("/conta");
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Idioma" })).toBeVisible();
  await page.goto("/treinador");
  await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Alumnos", exact: true })).toBeAttached();
  await expect(page.getByRole("heading", { name: /Hola,\s*Rui/ })).toBeVisible();
  await expectAccessible(page, "/treinador (español)");
  await shot(page, "trainer-home-es");

  // And back to Portuguese.
  await page.goto("/conta");
  await page.getByRole("button", { name: "Português" }).click();
  await expect(page.getByRole("heading", { name: "Aparência" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("on a phone in English the tab bar and the home fit the screen", async ({ browser }) => {
  const page = await mobilePage(browser);
  await signUpTrainer(page);
  await page.goto("/conta");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/treinador");
  const bar = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Home", "Students", "Workouts", "Community", "More"]) await expect(bar.getByText(name, { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, "trainer-home-en-mobile");
  await page.context().close();
});
