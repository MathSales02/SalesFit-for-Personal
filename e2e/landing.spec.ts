import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./helpers";

const WIDTHS = [360, 390, 768, 1024, 1280, 1440, 1920];

/** The page is interactive once every landing component has mounted (CI's dev server compiles on first visit). */
async function ready(page: Page) {
  await page.waitForLoadState("load");
  await page.locator(".lp[data-motion]").waitFor({ state: "attached", timeout: 60000 });
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("landing page", () => {
  test("no sideways scroll at any width, accessible, no console errors", async ({ browser }) => {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, isMobile: width < 768, hasTouch: width < 768 });
      const page = await ctx.newPage();
      const errors = trackErrors(page);
      await page.goto("/");
      await ready(page);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seus alunos no ritmo. Sua consultoria em ordem.");
      // Walk the page so every scroll-triggered part runs.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 700) await page.evaluate((v) => window.scrollTo(0, v), y);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
      expect(await page.locator("h1").count()).toBe(1);
      if (width === 390 || width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(1500); // let entrance animations finish (axe reads opacity)
        await expectAccessible(page, `/ (${width}px)`);
      }
      expect(errors, `console errors at ${width}px`).toEqual([]);
      await ctx.close();
    }
  });

  test("calls to action go to real places", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    const hrefs = async (name: string | RegExp) => page.getByRole("link", { name }).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const all = (list: (string | null)[], n: number) => {
      expect(list).toHaveLength(n);
      for (const h of list) expect(h).toBe("/cadastro");
    };
    all(await hrefs(/^Começar \d+ dias grátis$/), 1);
    all(await hrefs("Começar grátis"), 1);
    all(await hrefs(/^Começar com /), 3);
    expect(await hrefs("Criar minha conta grátis")).toEqual(["/cadastro"]);
    expect(await hrefs("Termos de uso")).toEqual(["/termos"]);
    expect(await hrefs("Política de privacidade")).toEqual(["/privacidade"]);
    expect((await hrefs(/WhatsApp/))[0]).toBe("https://wa.me/5513981969513");
    expect((await hrefs(/@gmail\.com/))[0]).toBe("mailto:matheusssales0218@gmail.com");
    for (const path of ["/cadastro", "/entrar", "/termos", "/privacidade"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
    }
    // Prices come from the database.
    const pricing = page.locator("#precos");
    await pricing.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    for (const price of ["R$ 29,90", "R$ 49,90", "R$ 79,90"]) await expect(pricing.getByText(price).first()).toBeVisible();
    await expect(pricing.getByText("Até 30 alunos").first()).toBeVisible();
    // Secondary hero action scrolls to the demo.
    await page.getByRole("link", { name: "Ver o sistema funcionando" }).click();
    await expect(page).toHaveURL(/#demonstracao$/);
    await expect(page.locator("#demonstracao")).toBeInViewport();
  });

  test("navbar: anchors, active section, compact state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await ready(page);
    const nav = page.getByRole("navigation", { name: "Seções", exact: true });
    await nav.getByRole("link", { name: "Preços" }).click();
    await expect(page.locator("#precos")).toBeInViewport();
    await expect(nav.getByRole("link", { name: "Preços" })).toHaveAttribute("aria-current", "location");
    await expect(page.locator("header.lp-glass")).toHaveAttribute("data-compact", "");
    await nav.getByRole("link", { name: "Dúvidas" }).click();
    await expect(nav.getByRole("link", { name: "Dúvidas" })).toHaveAttribute("aria-current", "location");
  });

  test("mobile menu: opens, traps focus, Esc closes, link closes", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/");
    await ready(page);
    const button = page.getByRole("button", { name: "Abrir menu" });
    await button.click();
    await expect(page.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(menu.getByRole("link").first()).toBeFocused();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => !!document.activeElement?.closest("#lp-menu") || document.activeElement?.getAttribute("aria-controls") === "lp-menu");
    expect(inside).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Preços" }).click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    await expect(page.locator("#precos")).toBeInViewport();
    await ctx.close();
  });

  test("tabs and accordion work with the keyboard only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#demonstracao");
    await ready(page);
    const demoTabs = page.getByRole("tablist", { name: "Capítulos da demonstração" });
    await demoTabs.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(demoTabs.getByRole("tab", { name: /^02/ })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("demo-tab-alunos");
    await page.keyboard.press("End");
    await expect(demoTabs.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");

    const featTabs = page.getByRole("tablist", { name: "Funcionalidades" });
    await featTabs.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(featTabs.getByRole("tab", { name: /Treino no celular/ })).toHaveAttribute("aria-selected", "true");

    const q = page.getByRole("button", { name: "Posso cancelar quando quiser?" });
    await q.focus();
    await page.keyboard.press("Enter");
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Posso cancelar quando quiser?" })).toContainText("fim do período já pago");
    await page.keyboard.press("Space");
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("region", { name: "Posso cancelar quando quiser?" })).toBeHidden();
  });

  test("demo video: lazy, plays when visible, pauses off screen, keyboard play/pause", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await ready(page);
    const video = page.locator("#demonstracao video");
    await expect(video).toHaveAttribute("poster", /\.webp$/);
    expect(await video.locator("source").count()).toBe(0); // nothing loaded before it is seen
    await page.locator("#demonstracao").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector("#demo-panel")?.scrollIntoView({ block: "center" }));
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused), { timeout: 15000 }).toBe(true);
    const toggle = page.getByRole("button", { name: /Pausar vídeo/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.keyboard.press("Enter");
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });

  test("reduced motion: everything visible at once, no autoplay", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await ready(page);
    await expect(page.locator("header.lp-glass")).toHaveCSS("opacity", "1");
    await page.evaluate(() => document.querySelector("#demo-panel")?.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1500);
    expect(await page.locator("#demonstracao video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await ctx.close();
  });

  test("without JavaScript the page is still readable", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Começar \d+ dias grátis/ })).toBeVisible();
    // Hero extras fade in through the CSS fallback.
    await expect(page.locator("header.lp-glass")).toHaveCSS("opacity", "1", { timeout: 4000 });
    await expect(page.locator("#precos").getByText("R$ 49,90").first()).toBeVisible();
    await expect(page.locator("#beneficios").getByText("Quem some, aparece no seu painel.")).toBeVisible();
    await ctx.close();
  });
});
