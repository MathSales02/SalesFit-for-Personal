import type { Metadata } from "next";
import { logoutAction } from "@/app/(auth)/actions";
import { buttonClass } from "@/components/ui/button-styles";
import { Logo } from "@/components/ui/logo";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Sem acesso" };

export default async function NoAccessPage() {
  await requirePageActor(undefined, { allowInactive: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Logo />
      <h1 className="mt-10 font-display text-4xl font-bold">Sua conta não está ligada a nenhuma consultoria</h1>
      <p className="mt-3 text-muted">Se você é aluno, peça ao seu treinador um novo convite. Se sua consultoria foi suspensa, fale com o suporte.</p>
      <form action={logoutAction} className="mt-8">
        <button type="submit" className={buttonClass("secondary")}>
          Sair
        </button>
      </form>
    </main>
  );
}
