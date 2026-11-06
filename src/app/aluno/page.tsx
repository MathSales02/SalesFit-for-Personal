import type { Metadata } from "next";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Início" };

export default async function StudentHomePage() {
  const actor = await requirePageActor("training.read_own");
  const firstName = actor.displayName.split(" ")[0];
  return (
    <>
      <p className="text-sm font-semibold text-muted">{actor.membership?.workspaceName}</p>
      <h1 className="mt-1 font-display text-[2.4rem] leading-none font-bold tracking-tight">Bora, {firstName}.</h1>
      <section className="mt-8 rounded-[var(--radius-panel)] bg-turf p-6 text-white">
        <p className="text-sm font-semibold text-white/70">Treino de hoje</p>
        <p className="mt-2 font-display text-3xl font-bold">Nenhum treino atribuído</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
          Quando seu treinador montar sua ficha, ela aparece aqui com vídeos, séries e cronômetro de descanso.
        </p>
      </section>
    </>
  );
}
