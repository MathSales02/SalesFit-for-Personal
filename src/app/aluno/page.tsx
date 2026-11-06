import type { Metadata } from "next";
import Link from "next/link";
import { ProgramView } from "@/components/program-view";
import { buttonClass } from "@/components/ui/button-styles";
import { requirePageActor } from "@/server/http/next";
import { playbackUrls } from "@/server/media/service";
import { getMyProgram } from "@/server/programs/service";
import { getOpenSession } from "@/server/workouts/service";
import { StartWorkoutButton } from "./start-button";
import { AbandonButton } from "./treino/[sessionId]/abandon-button";

export const metadata: Metadata = { title: "Início" };

const fmtDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export default async function StudentHomePage() {
  const actor = await requirePageActor("training.read_own");
  const firstName = actor.displayName.split(" ")[0];
  const [program, open] = await Promise.all([getMyProgram(actor), getOpenSession(actor)]);
  const videos = program
    ? await playbackUrls(
        actor,
        program.content.days.flatMap((d) => d.exercises.map((e) => e.videoAssetId).filter((x): x is string => !!x)),
      )
    : undefined;

  return (
    <>
      <p className="text-sm font-semibold text-muted">{actor.membership?.workspaceName}</p>
      <h1 className="mt-1 font-display text-[2.4rem] leading-none font-bold tracking-tight">Bora, {firstName}.</h1>

      {open && (
        <section aria-label="Treino em andamento" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-signal/60 bg-signal-tint p-4">
          <p>
            <span className="font-semibold">{open.dayName}</span> em andamento.
          </p>
          <div className="flex items-center gap-4">
            <AbandonButton sessionId={open.id} />
            <Link href={`/aluno/treino/${open.id}`} className={buttonClass("primary")}>
              Continuar
            </Link>
          </div>
        </section>
      )}

      {!program ? (
        <section className="mt-8 rounded-[var(--radius-panel)] bg-turf p-6 text-white">
          <p className="text-sm font-semibold text-white/70">Seu programa</p>
          <p className="mt-2 font-display text-3xl font-bold">Nenhum treino atribuído</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
            Quando seu treinador atribuir um programa, ele aparece aqui com vídeos, séries e orientações.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-8 rounded-[var(--radius-panel)] bg-turf p-6 text-white">
            <p className="text-sm font-semibold text-white/70">Seu programa</p>
            <p className="mt-2 font-display text-3xl leading-tight font-bold">{program.name}</p>
            <p className="mt-2 text-sm text-white/75">
              {program.content.days.length} {program.content.days.length === 1 ? "dia" : "dias"} · desde {fmtDate(program.startsOn)}
              {program.endsOn ? ` até ${fmtDate(program.endsOn)}` : ""}
            </p>
            {program.description && <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85">{program.description}</p>}
          </section>
          <div className="mt-8">
            <ProgramView content={program.content} videos={videos} showInstructions dayAction={open ? undefined : (dayId) => <StartWorkoutButton dayId={dayId} />} />
          </div>
        </>
      )}
    </>
  );
}
