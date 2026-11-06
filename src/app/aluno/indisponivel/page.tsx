import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Consultoria indisponível" };

export default async function UnavailablePage() {
  const actor = await requirePageActor("training.read_own", { allowInactive: true });
  if (actor.membership?.access?.state !== "blocked") redirect("/aluno");
  return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl font-bold">{actor.membership.workspaceName} está temporariamente indisponível</h1>
      <p className="mt-3 leading-relaxed text-muted">
        A assinatura da consultoria no Cadência está pausada. Seus treinos, histórico e fotos continuam guardados e voltam assim que seu treinador regularizar.
      </p>
      <Link href="/conta" className={`${buttonClass("secondary")} mt-6`}>
        Minha conta e meus dados
      </Link>
    </section>
  );
}
