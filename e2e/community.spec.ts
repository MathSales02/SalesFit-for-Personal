import { expect, test, type Page } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, inviteStudent, signUpTrainer } from "./helpers";

// Set E2E_SHOTS=1 to keep screenshots of the main screens in test-results/community.
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `test-results/community/${name}.png`, fullPage: true });
};

test("the community works as a social network: post, react, comment, save, follow, profile, discover", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signUpTrainer(page);
  const { page: s } = await inviteStudent(page, browser, "Alice Prado");

  // The student posts from the phone, through the composer sheet.
  await s.goto("/aluno/comunidade");
  await expect(s.getByText("O feed começa com você")).toBeVisible();
  await expectAccessible(s, "/aluno/comunidade (vazio)");
  await s.getByRole("button", { name: "Como foi o treino hoje?" }).click();
  const sheet = s.getByRole("dialog", { name: "Nova publicação" });
  await sheet.getByLabel("Texto da publicação").fill("Primeiro treino de pernas da semana feito!");
  await expectAccessible(s, "/aluno/comunidade (nova publicação)");
  await sheet.getByRole("button", { name: "Publicar" }).click();
  await expect(sheet).toBeHidden();
  const mine = s.getByRole("article").filter({ hasText: "Primeiro treino de pernas" });
  await expect(mine).toBeVisible();

  // The trainer reacts on a computer: like, comment, save, follow.
  await page.goto("/treinador/comunidade");
  const post = page.getByRole("article").filter({ hasText: "Primeiro treino de pernas" });
  await post.getByRole("button", { name: /^Curtir/ }).click();
  await expect(post.getByRole("button", { name: /^Descurtir: 1 curtida/ })).toHaveAttribute("aria-pressed", "true");
  await post.getByRole("button", { name: /comentários?$/ }).click();
  await post.getByLabel("Escreva um comentário").fill("Boa, Alice! Como ficou a carga?");
  await post.getByRole("button", { name: "Enviar comentário" }).click();
  await expect(post.getByText("Boa, Alice! Como ficou a carga?")).toBeVisible();
  await expect(post.getByRole("button", { name: "1 comentário" })).toBeVisible();
  await post.getByRole("button", { name: "Salvar publicação" }).click();
  await expect(post.getByRole("button", { name: "Remover dos salvos" })).toBeVisible();
  await post.getByRole("button", { name: "Seguir Alice Prado" }).click();
  await expect(post.getByRole("button", { name: "Seguindo Alice Prado" })).toBeVisible();
  await expectAccessible(page, "/treinador/comunidade (com comentários)");
  await shot(page, "feed-desktop");

  // Saved and popular feeds show the post; following too.
  for (const ver of ["salvos", "alta", "seguindo"]) {
    await page.goto(`/treinador/comunidade?ver=${ver}`);
    await expect(page.getByRole("article").filter({ hasText: "Primeiro treino de pernas" })).toBeVisible();
  }

  // The student sees the reactions, replies and edits the text.
  await s.reload();
  await expect(mine.getByRole("button", { name: /^Curtir: 1 curtida/ })).toBeVisible();
  await mine.getByRole("button", { name: "1 comentário" }).click();
  await mine.getByRole("button", { name: "Responder" }).click();
  await mine.getByLabel("Responder a Rui Campos").fill("Subi 5 kg no agachamento.");
  await mine.getByRole("button", { name: "Enviar comentário" }).click();
  await expect(mine.getByText("Subi 5 kg no agachamento.")).toBeVisible();
  await mine.getByRole("button", { name: "Mais opções da publicação de Alice Prado" }).click();
  await s.getByRole("menuitem", { name: "Editar texto" }).click();
  await mine.getByLabel("Texto da publicação").fill("Primeiro treino de pernas da semana feito! Subi a carga.");
  await mine.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(mine.getByText("· editado")).toBeVisible();
  await expectNoHorizontalScroll(s);
  await shot(s, "feed-mobile");

  // Her profile: bio and goal, and the trainer among her followers.
  await s.getByRole("link", { name: "Meu perfil" }).click();
  await s.getByRole("button", { name: "Editar perfil" }).click();
  const edit = s.getByRole("dialog", { name: "Editar perfil" });
  await edit.getByLabel(/^Bio/).fill("Treino para correr minha primeira meia maratona.");
  await edit.getByText("Condicionamento").click();
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(edit).toBeHidden();
  const card = s.locator("main header").filter({ hasText: "Alice Prado" });
  await expect(card.getByRole("paragraph").filter({ hasText: "Treino para correr minha primeira meia maratona." })).toBeVisible();
  await expect(card.getByRole("paragraph").filter({ hasText: "Condicionamento" })).toBeVisible();
  await expectAccessible(s, "perfil (meu)");
  await shot(s, "profile-mobile");
  await s.getByRole("link", { name: /Seguidores/ }).click();
  await expect(s.getByRole("link", { name: "Rui Campos" })).toBeVisible();

  // Discover: suggestions, what is hot and the name search.
  await s.getByRole("link", { name: "Descobrir" }).click();
  await expect(s.getByRole("heading", { name: "Sugestões para você" })).toBeVisible();
  await expect(s.getByRole("heading", { name: "Em alta" })).toBeVisible();
  await expectAccessible(s, "/aluno/comunidade/descobrir");
  await shot(s, "discover-mobile");
  await s.getByLabel("Buscar pessoas pelo nome").fill("rui");
  await s.getByRole("button", { name: "Buscar" }).click();
  await expect(s.getByRole("heading", { name: /Resultados para/ })).toBeVisible();
  await s.getByRole("button", { name: "Seguir Rui Campos" }).first().click();
  await expect(s.getByRole("button", { name: "Seguindo Rui Campos" }).first()).toBeVisible();

  // The trainer sees the profile with the follow-back mark, on the post's own page too.
  await page.goto("/treinador/comunidade");
  await page.getByRole("article").filter({ hasText: "Primeiro treino de pernas" }).getByRole("link", { name: "Alice Prado" }).click();
  await expect(page.getByText("Segue você")).toBeVisible();
  await expectAccessible(page, "perfil (de outra pessoa)");
  await shot(page, "profile-desktop");
  await s.context().close();
});
