import type { Metadata } from "next";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { requirePageActor } from "@/server/http/next";
import { getTrainerOverview } from "@/server/workspace/overview";

export const metadata: Metadata = { title: "Visão geral" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Teste grátis",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
};

function daysUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

export default async function TrainerOverviewPage() {
  const actor = await requirePageActor("students.read");
  const o = await getTrainerOverview(actor);
  const firstName = actor.displayName.split(" ")[0];
  const used = o.students.active + o.students.invited;
  const max = o.plan?.maxStudents ?? 0;
  const trialDays = o.subscription?.status === "trialing" && o.subscription.trialEndsAt ? daysUntil(o.subscription.trialEndsAt) : null;

  return (
    <>
      <PageHeading title={`Olá, ${firstName}`} description={o.workspaceName} />

      {trialDays !== null && (
        <div className="mb-8">
          <Notice tone="warning">
            {trialDays > 0 ? `Seu teste grátis termina em ${trialDays} ${trialDays === 1 ? "dia" : "dias"}.` : "Seu teste grátis termina hoje."} A
            contratação de planos chega em breve.
          </Notice>
        </div>
      )}

      <section aria-labelledby="students-h" className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-3">
        <h2 id="students-h" className="sr-only">
          Alunos
        </h2>
        <Stat label="Alunos ativos" value={o.students.active} />
        <Stat label="Convites pendentes" value={o.students.invited} />
        <div className="bg-paper p-5">
          <p className="text-sm font-semibold text-muted">Vagas do plano</p>
          <p className="mt-1 font-display text-4xl font-bold">
            {used}
            <span className="text-2xl text-muted">/{max}</span>
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-turf-tint"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={used}
            aria-label="Vagas usadas"
          >
            <div className="h-full rounded-full bg-turf" style={{ width: `${max ? Math.min(100, (used / max) * 100) : 0}%` }} />
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="list-h">
          <h2 id="list-h" className="text-lg font-semibold">
            Seus alunos
          </h2>
          {o.students.active === 0 ? (
            <div className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line-strong px-6 py-10">
              <p className="font-semibold">Nenhum aluno ainda</p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                O convite de alunos por e-mail, as fichas de treino e a biblioteca de exercícios são a próxima etapa da plataforma.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{o.students.active} alunos ativos.</p>
          )}
        </section>

        <section aria-labelledby="plan-h">
          <h2 id="plan-h" className="text-lg font-semibold">
            Assinatura
          </h2>
          <dl className="mt-4 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper text-sm">
            <Row term="Plano" value={o.plan?.name ?? "—"} />
            <Row term="Situação" value={o.subscription ? (STATUS_LABEL[o.subscription.status] ?? o.subscription.status) : "—"} />
            <Row term="Armazenamento" value={o.plan ? `${Math.round(o.plan.storageQuotaMb / 1024)} GB` : "—"} />
          </dl>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold">{value}</p>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{term}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
