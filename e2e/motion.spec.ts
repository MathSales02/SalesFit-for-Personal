import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mobilePage, signUpTrainer } from "./helpers";

/** Counts the browser View Transitions React starts, with their navigation types. */
async function recordViewTransitions(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const w = window as unknown as { __vt: string[][] };
    w.__vt = [];
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg: unknown) => {
      const types = arg && typeof arg === "object" && "types" in arg ? [...((arg as { types?: string[] }).types ?? [])] : [];
      w.__vt.push(types);
      return start(arg as never);
    }) as typeof document.startViewTransition;
  });
}

const transitions = (page: Page) => page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt.length);

/** Entrance and page animations (motion.css) still playing. Hover colour changes and the endless loading shimmer do not count. */
const running = (page: Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running" && (a instanceof CSSAnimation ? a.animationName.startsWith("motion-") : a.effect?.getComputedTiming().endTime !== Infinity && !(a instanceof CSSTransition))).length,
  );

async function expectSettled(page: Page) {
  await expect.poll(() => running(page), { timeout: 5_000 }).toBe(0);
  // Nothing is left half-faded: the page and its title end fully visible, in place.
  for (const selector of [".motion-page", ".motion-page h1"]) {
    const el = page.locator(selector).first();
    await expect(el).toHaveCSS("opacity", "1");
    await expect(el).toHaveCSS("transform", "none");
  }
}

test("moving between the trainer's screens animates each page change, and every page ends fully visible", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ locale: "pt-BR" });
  await recordViewTransitions(ctx);
  const page = await ctx.newPage();
  await signUpTrainer(page, "Ana Motion", "Ana Treinos");
  await page.waitForURL("**/treinador");
  await expectSettled(page);

  const rail = page.getByRole("navigation", { name: "Principal" });
  const stops: [string, string, RegExp][] = [
    ["Alunos", "/treinador/alunos", /^Alunos$/],
    ["Treinos", "/treinador/treinos", /Treinos/],
    ["Exercícios", "/treinador/exercicios", /Exercícios/],
    ["Comunidade", "/treinador/comunidade", /Comunidade/],
    ["Visão geral", "/treinador", /Olá, Ana/],
  ];
  for (const [label, href, title] of stops) {
    const before = await transitions(page);
    await rail.getByRole("link", { name: label }).click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect.poll(() => transitions(page), { message: `page transition into ${href}` }).toBeGreaterThan(before);
    await expectSettled(page);
  }

  // Changing only the query string is the same page: it does not animate.
  await page.goto("/treinador/exercicios");
  await expectSettled(page);
  const before = await transitions(page);
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("q", "agachamento");
    history.replaceState(null, "", url);
  });
  await page.waitForTimeout(400);
  expect(await transitions(page)).toBe(before);
  await ctx.close();
});

test("on a phone the 'Mais' menu opens and closes smoothly and leaves the page once closed", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await mobilePage(browser);
  await signUpTrainer(page, "Bia Menu", "Bia Treinos");
  await page.waitForURL("**/treinador");
  const more = page.getByRole("button", { name: /^Mais/ });
  await more.tap();
  const menu = page.locator("#more-menu");
  await expect(menu).toHaveAttribute("data-state", "open");
  await expect(menu.getByRole("link", { name: "Exercícios" })).toBeVisible();
  await more.tap();
  await expect(menu).toHaveCount(0);
  // And it still works after closing: opens again and takes you somewhere.
  await more.tap();
  await menu.getByRole("link", { name: "Exercícios" }).tap();
  await page.waitForURL("**/treinador/exercicios");
  await expect(menu).toHaveCount(0);
  await page.context().close();
});

test("with reduced motion nothing moves: pages and menus appear at once", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ locale: "pt-BR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await signUpTrainer(page, "Caio Calmo", "Caio Treinos");
  await page.waitForURL("**/treinador");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Alunos" }).click();
  await page.waitForURL("**/treinador/alunos");
  await expect(page.getByRole("heading", { level: 1, name: "Alunos" })).toBeVisible();
  expect(await running(page)).toBe(0);
  await expect(page.locator(".motion-page h1")).toHaveCSS("opacity", "1");
  await ctx.close();
});
