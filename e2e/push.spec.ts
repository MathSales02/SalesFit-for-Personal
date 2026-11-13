import { expect, test, type BrowserContext } from "@playwright/test";
import { expectAccessible, signUpTrainer } from "./helpers";

/**
 * The test browser has no push service (and always answers "denied"), so the permission and the
 * browser's subscription are stood in for here. Everything after that is real: the screens, the
 * server actions and the database. Both survive reloads, like the real ones.
 */
async function fakePushService(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const SUB = "e2e-fake-subscription";
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => localStorage.getItem("e2e-permission") ?? "default" });
    Notification.requestPermission = async () => {
      localStorage.setItem("e2e-permission", "granted");
      return "granted";
    };
    type Saved = { endpoint: string; key: number[] };
    const make = (s: Saved) => ({
      endpoint: s.endpoint,
      options: { applicationServerKey: Uint8Array.from(s.key).buffer, userVisibleOnly: true },
      toJSON: () => ({ endpoint: s.endpoint, keys: { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) } }),
      unsubscribe: async () => {
        localStorage.removeItem(SUB);
        return true;
      },
    });
    PushManager.prototype.getSubscription = async function () {
      const s = localStorage.getItem(SUB);
      return (s ? make(JSON.parse(s) as Saved) : null) as unknown as PushSubscription;
    };
    PushManager.prototype.subscribe = async function (opts?: PushSubscriptionOptionsInit) {
      const s: Saved = { endpoint: `https://push.example.test/e2e/${crypto.randomUUID()}`, key: Array.from(new Uint8Array(opts!.applicationServerKey as ArrayBuffer)) };
      localStorage.setItem(SUB, JSON.stringify(s));
      return make(s) as unknown as PushSubscription;
    };
  });
}

test("the trainer is invited to turn on phone notifications and turns them on and off", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "pt-BR" });
  await fakePushService(ctx);
  const page = await ctx.newPage();
  await signUpTrainer(page, "Lia Prado", "Lia Treinos");

  // The home screen invites once; "Agora não" is remembered on this device.
  const prompt = page.getByRole("complementary", { name: "Notificações no celular" });
  await expect(prompt).toContainText("Ative as notificações");
  await prompt.getByRole("button", { name: "Agora não" }).click();
  await expect(prompt).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(prompt).toBeHidden();

  // The notifications screen has the full control.
  await page.goto("/treinador/notificacoes");
  const card = page.getByRole("region", { name: "Notificações no celular" });
  await expect(card).toContainText("quando um aluno ficar muitos dias sem treinar");
  await expectAccessible(page, "/treinador/notificacoes (notificações no celular)");
  await card.getByRole("button", { name: "Ativar neste aparelho" }).click();
  await expect(card.getByText("Ativadas neste aparelho")).toBeVisible({ timeout: 20_000 });
  // The server knows this device: after a reload it is still on.
  await page.reload();
  await expect(card.getByText("Ativadas neste aparelho")).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Enviar teste" }).click();
  await expect(card.getByRole("status")).toContainText("Enviamos uma notificação de teste");
  await card.getByRole("button", { name: "Desativar" }).click();
  await expect(card.getByRole("button", { name: "Ativar neste aparelho" })).toBeVisible();

  // Each preference has a translated label, including the new one for trainers.
  await page.getByText("O que você quer receber").click();
  await expect(page.getByLabel("Aluno há muito tempo sem treinar")).toBeChecked();
  await expect(page.getByLabel("Lembrete para voltar a treinar")).toHaveCount(0);
  await ctx.close();
});

test("when the browser blocks notifications, the app explains how to allow them and does not insist", async ({ page }) => {
  // The test browser itself answers "denied", like a phone where the person blocked them.
  await signUpTrainer(page, "Davi Melo", "Davi Treinos");
  await page.waitForTimeout(500);
  await expect(page.getByRole("complementary", { name: "Notificações no celular" })).toHaveCount(0);
  await page.goto("/treinador/notificacoes");
  await expect(page.getByRole("region", { name: "Notificações no celular" })).toContainText("As notificações estão bloqueadas");
});
