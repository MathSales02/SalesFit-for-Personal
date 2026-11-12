import { ExerciseVideo } from "@/components/exercises/video";
import type { ProgramContent } from "@/server/programs/service";
import { getT } from "@/i18n/server";

const restLabel = (s: number | null) => (s == null ? null : s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ""}` : `${s}s`);

/**
 * Read-only program content. Used by the trainer (published version) and the
 * student. Videos come as short-lived signed URLs resolved on the server.
 */
export async function ProgramView({
  content,
  videos,
  showInstructions = false,
  dayAction,
}: {
  content: ProgramContent;
  videos?: Map<string, string>;
  showInstructions?: boolean;
  /** Optional control rendered beside each day title (e.g. the student's Start button). */
  dayAction?: (dayId: string) => React.ReactNode;
}) {
  const t = await getT();
  return (
    <div className="flex flex-col gap-8">
      {content.days.map((d) => (
        <section key={d.id} id={`dia-${d.id}`} aria-label={d.name} className="scroll-mt-20">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-2xl font-bold">{d.name}</h3>
            {dayAction?.(d.id)}
          </div>
          {d.notes && <p className="mt-1 text-sm text-muted">{d.notes}</p>}
          <ol className="mt-3 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {d.exercises.map((e, i) => {
              const video = e.videoAssetId ? videos?.get(e.videoAssetId) : undefined;
              const meta = [
                `${e.sets} × ${e.reps}`,
                e.load,
                restLabel(e.restSeconds) && `descanso ${restLabel(e.restSeconds)}`,
                e.tempo && t("cadência {0}", { 0: e.tempo }),
              ].filter(Boolean);
              return (
                <li key={e.id} className="px-4 py-3.5">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-lg font-bold text-muted tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{t(e.exerciseName)}</p>
                      <p className="text-sm text-ink-soft">{meta.join(" · ")}</p>
                      {e.notes && <p className="mt-1 text-sm text-muted">{e.notes}</p>}
                      {e.variationName && <p className="mt-1 text-sm text-muted">{t("Variação:")} {t(e.variationName)}</p>}
                      {(showInstructions && (e.instructions || video || e.videoUrl || e.demoUrl)) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-semibold text-turf">{t("Como executar")}</summary>
                          <ExerciseVideo src={video} externalUrl={e.videoUrl} demoUrl={e.demoUrl} title={t(e.exerciseName)} preload="none" className="mt-2 max-w-md" />
                          {e.instructions && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{e.instructions}</p>}
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {d.exercises.length === 0 && <li className="px-4 py-3.5 text-sm text-muted">{t("Sem exercícios.")}</li>}
          </ol>
        </section>
      ))}
    </div>
  );
}
