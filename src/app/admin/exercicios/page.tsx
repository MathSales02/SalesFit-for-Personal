import type { Metadata } from "next";
import { ExerciseThumb } from "@/components/exercises/video";
import { PageHeading } from "@/components/ui/page-heading";
import { MUSCLE_GROUP_LABEL, MUSCLE_GROUPS } from "@/lib/validation/exercises";
import { getDemoOverview, listPlatformExercises } from "@/server/exercises/service";
import { requirePageActor } from "@/server/http/next";
import { ExerciseMediaForm, SyncDemosButton } from "../forms";

export const metadata: Metadata = { title: "Exercícios" };

const when = (d: Date) => d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const STATUS = { matched: "Automática", manual: "Escolhida por você", unmatched: "Para revisar" } as const;

export default async function AdminExercisesPage() {
  const actor = await requirePageActor("admin.exercises.manage");
  const [rows, overview] = await Promise.all([listPlatformExercises(actor), getDemoOverview(actor)]);
  const { platform, unmatchedNames, runs } = overview;
  const last = runs[0];
  const pending = rows.filter((r) => !r.demoUrl);
  const percent = platform.total ? Math.round((platform.withDemo / platform.total) * 100) : 0;

  return (
    <>
      <PageHeading
        title="Exercícios"
        description="Animações de demonstração da biblioteca SalesFit, vindas da ExerciseDB. Cada exercício dos treinadores recebe a animação do exercício equivalente, pelo nome, por um dos outros nomes ou pela origem da cópia."
      />

      <section aria-labelledby="sync-h" className="mb-10 rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 id="sync-h" className="font-display text-xl font-bold">
          Sincronização
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-semibold text-ink-soft">Biblioteca SalesFit</dt>
            <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
              {platform.withDemo} de {platform.total}
            </dd>
            <dd className="text-sm text-ink-soft">com animação ({percent}%)</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-soft">Exercícios dos treinadores</dt>
            <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{last && !last.error ? last.trainerMatched : "—"}</dd>
            <dd className="text-sm text-ink-soft">{last && !last.error ? `com animação; ${last.trainerUnmatched} para revisar` : "sincronize para contar"}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-ink-soft">Última sincronização</dt>
            <dd className="mt-1 font-display text-2xl font-bold">{last ? when(last.startedAt) : "Nunca"}</dd>
            <dd className="text-sm text-ink-soft">{last ? (last.error ?? `${last.available} de ${last.checked} animações no ar${last.broken ? `, ${last.broken} fora do ar` : ""}`) : "As animações atuais vieram da instalação."}</dd>
          </div>
        </dl>
        <div role="progressbar" aria-label="Exercícios da biblioteca com animação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-5 h-2.5 overflow-hidden rounded-full bg-surface-subtle">
          <div className="h-full rounded-full bg-signal" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-4 mb-4 max-w-2xl text-sm text-ink-soft">
          A sincronização confere se cada animação continua no ar, atualiza endereços que mudaram e repassa tudo para os exercícios dos treinadores. Pode ser repetida quantas vezes quiser: nada é duplicado.
        </p>
        <SyncDemosButton />
        {runs.length > 1 && (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-turf">Histórico</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
              {runs.map((r) => (
                <li key={r.id}>
                  {when(r.startedAt)}: {r.error ?? `${r.available} de ${r.checked} no ar, ${r.broken} fora do ar; treinadores: ${r.trainerMatched} com animação, ${r.trainerUnmatched} para revisar`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {(pending.length > 0 || unmatchedNames.length > 0) && (
        <section aria-labelledby="review-h" className="mb-10">
          <h2 id="review-h" className="mb-1 font-display text-xl font-bold">
            Para revisão manual
          </h2>
          <p className="mb-4 max-w-2xl text-sm text-ink-soft">Sem correspondência confiável, nenhuma animação é associada. Para resolver, informe o ID da ExerciseDB no exercício da biblioteca ou acrescente o nome usado pelo treinador em “Outros nomes” do exercício equivalente.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <h3 className="font-semibold">Biblioteca SalesFit sem animação ({pending.length})</h3>
              {pending.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">Todos os exercícios têm animação.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {pending.map((r) => (
                    <li key={r.id}>
                      <a href={`#e-${r.id}`} className="font-medium text-turf underline-offset-4 hover:underline">
                        {r.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
              <h3 className="font-semibold">Nomes de treinadores sem equivalente ({unmatchedNames.length})</h3>
              {unmatchedNames.length === 0 ? (
                <p className="mt-2 text-sm text-ink-soft">Nenhum exercício de treinador ficou sem animação.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {unmatchedNames.map((u) => (
                    <li key={u.name_key} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{u.sample}</span>
                      <span className="shrink-0 text-ink-soft tabular-nums">{u.uses}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-8">
        {MUSCLE_GROUPS.map(([g]) => {
          const list = rows.filter((r) => r.muscleGroup === g);
          if (list.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`g-${g}`}>
              <h2 id={`g-${g}`} className="mb-3 font-display text-xl font-bold">
                {MUSCLE_GROUP_LABEL[g]}
              </h2>
              <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
                {list.map((r) => (
                  <li key={r.id} id={`e-${r.id}`} className="scroll-mt-20">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3.5 px-4 py-3">
                        <ExerciseThumb externalUrl={r.videoUrl} demoUrl={r.demoUrl} hasVideo={false} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.name}</span>
                          <span className={`text-sm ${r.demoUrl ? "text-ink-soft" : "font-semibold text-danger"}`}>
                            {r.demoStatus ? STATUS[r.demoStatus] : "Sem animação"}
                            {r.demoExternalId ? ` · ${r.demoExternalId}` : ""}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <div className="border-t border-line px-4 py-4">
                        <ExerciseMediaForm exercise={r} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
