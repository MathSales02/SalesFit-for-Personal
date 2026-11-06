import type { ProgramContent } from "@/server/programs/service";

const restLabel = (s: number | null) => (s == null ? null : s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}` : `${s}s`);

/**
 * Read-only program content. Used by the trainer (published version) and the
 * student. Videos come as short-lived signed URLs resolved on the server.
 */
export function ProgramView({ content, videos, showInstructions = false }: { content: ProgramContent; videos?: Map<string, string>; showInstructions?: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      {content.days.map((d) => (
        <section key={d.id} aria-label={d.name}>
          <h3 className="font-display text-2xl font-bold">{d.name}</h3>
          {d.notes && <p className="mt-1 text-sm text-muted">{d.notes}</p>}
          <ol className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {d.exercises.map((e, i) => {
              const video = e.videoAssetId ? videos?.get(e.videoAssetId) : undefined;
              const meta = [
                `${e.sets} × ${e.reps}`,
                e.load,
                restLabel(e.restSeconds) && `descanso ${restLabel(e.restSeconds)}`,
                e.tempo && `cadência ${e.tempo}`,
              ].filter(Boolean);
              return (
                <li key={e.id} className="px-4 py-3.5">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-lg font-bold text-muted tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{e.exerciseName}</p>
                      <p className="text-sm text-ink-soft">{meta.join(" · ")}</p>
                      {e.notes && <p className="mt-1 text-sm text-muted">{e.notes}</p>}
                      {e.variationName && <p className="mt-1 text-sm text-muted">Variação: {e.variationName}</p>}
                      {(showInstructions && (e.instructions || video)) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-semibold text-turf">Como executar</summary>
                          {video && <video src={video} controls preload="none" playsInline className="mt-2 aspect-video w-full max-w-xl rounded-[var(--radius-control)] bg-ink" />}
                          {e.instructions && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{e.instructions}</p>}
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {d.exercises.length === 0 && <li className="px-4 py-3.5 text-sm text-muted">Sem exercícios.</li>}
          </ol>
        </section>
      ))}
    </div>
  );
}
