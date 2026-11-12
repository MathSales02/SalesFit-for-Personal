import { expect, test, type Page } from "@playwright/test";
import { mobilePage, signUpTrainer } from "./helpers";

type Point = { x: number; y: number };

/** A real one-finger drag (trusted touch events), finished well inside the swipe time limit. */
async function drag(page: Page, from: Point, to: Point) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    });
    await page.waitForTimeout(15);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

const Y = 420;
const toNext = (page: Page, y = Y) => drag(page, { x: 320, y }, { x: 90, y });
const toPrevious = (page: Page, y = Y) => drag(page, { x: 90, y }, { x: 320, y });
const path = (page: Page) => new URL(page.url()).pathname;

/** Gives a navigation the chance to happen, then checks that it did not. */
async function expectStill(page: Page, pathname: string) {
  await page.waitForTimeout(500);
  expect(path(page)).toBe(pathname);
}

test("on a phone, horizontal swipes walk the trainer's menu in order and stop at both ends", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await mobilePage(browser);
  await signUpTrainer(page);
  await page.waitForURL("**/treinador");
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();

  // First screen: nothing before it.
  await toPrevious(page);
  await expectStill(page, "/treinador");

  // Gestures that are not a swipe between screens.
  await drag(page, { x: 200, y: 600 }, { x: 190, y: 250 }); // vertical scroll
  await expectStill(page, "/treinador");
  await drag(page, { x: 380, y: Y }, { x: 120, y: Y }); // starts on the edge: system back gesture
  await expectStill(page, "/treinador");
  await drag(page, { x: 320, y: Y }, { x: 290, y: Y }); // too short
  await expectStill(page, "/treinador");
  await drag(page, { x: 320, y: 300 }, { x: 200, y: 460 }); // diagonal
  await expectStill(page, "/treinador");
  await page.getByRole("heading", { name: /Olá, Rui/ }).tap(); // a plain tap on the page
  await expectStill(page, "/treinador");

  // The whole menu forwards, in the order the phone shows it: tabs, then "Mais".
  const order = ["/treinador", "/treinador/alunos", "/treinador/treinos", "/treinador/comunidade", "/treinador/exercicios", "/treinador/ranking", "/treinador/assinatura", "/conta"];
  for (const next of order.slice(1)) {
    // On the exercise library the middle of the screen is a form; swipe below it.
    await toNext(page, path(page) === "/treinador/exercicios" ? 620 : Y);
    await page.waitForURL(`**${next}`);
    await expect(page.locator("main")).toBeVisible();
    // The entrance animation ends before the next swipe is accepted.
    await page.waitForTimeout(400);
  }

  // Last screen: nothing after it.
  await toNext(page, 120);
  await expectStill(page, "/conta");

  // A touch that starts on a field belongs to the field.
  // The account page got longer: the field has to be on screen for the touch to land on it.
  await page.locator("main input:visible").first().scrollIntoViewIfNeeded();
  const field = await page.locator("main input:visible").first().boundingBox();
  if (!field) throw new Error("no field on /conta");
  const fy = field.y + field.height / 2;
  await drag(page, { x: field.x + 40, y: fy }, { x: field.x + 260, y: fy });
  await expectStill(page, "/conta");

  // And back.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await toPrevious(page, 120);
  await page.waitForURL("**/treinador/assinatura");
  await page.waitForTimeout(400);

  // With the "Mais" sheet open the gesture is off.
  const bar = page.getByRole("navigation", { name: "Principal" });
  await bar.getByRole("button", { name: "Mais" }).click();
  await expect(bar.getByRole("link", { name: "Ranking" })).toBeVisible();
  await toPrevious(page, 200);
  await expectStill(page, "/treinador/assinatura");

  // The buttons still navigate as before.
  await bar.getByRole("link", { name: "Treinos" }).click();
  await page.waitForURL("**/treinador/treinos");
  await page.context().close();
});

test("on a wide touch screen the desktop layout has no swipe navigation", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, locale: "pt-BR" });
  const page = await ctx.newPage();
  await signUpTrainer(page);
  await page.waitForURL("**/treinador");
  await drag(page, { x: 900, y: 400 }, { x: 500, y: 400 });
  await expectStill(page, "/treinador");
  await ctx.close();
});
