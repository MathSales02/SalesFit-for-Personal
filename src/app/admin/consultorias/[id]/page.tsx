import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { getWorkspaceAdmin, listPlansAdmin } from "@/server/admin/service";
import { activeSupportGrant } from "@/server/admin/support";
import { can } from "@/server/authz/policy";
import { requirePageActor } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";
import { CloseSupportForm, OpenSupportForm, SubscriptionOverrideForm, WorkspaceStatusForm } from "../../forms";
import { ACCESS_CLASS, ACCESS_LABEL, fmtDate, fmtDateTime, WS_STATUS_LABEL } from "../../ui";

export const metadata: Metadata = { title: "Consultoria" };

const ACTION_LABEL: Record<string, string> = {
  "admin.workspace_suspended": "Consultoria suspensa",
  "admin.workspace_reactivated": "Consultoria reativada",
  "admin.subscription_extend_trial": "Teste estendido",
  "admin.subscription_grant": "Plano liberado manualmente",
  "admin.subscription_change_plan": "Plano trocado",
  "admin.subscription_expire": "Assinatura encerrada",
  "admin.support_access_opened": "Acesso de suporte aberto",
  "admin.support_access_closed": "Acesso de suporte encerrado",
  "admin.support_viewed": "Dados de suporte consultados",
};

const panel = "rounded-[var(--radius-panel)] border border-line bg-paper p-5";

export default async function WorkspaceAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("admin.workspaces.read");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getWorkspaceAdmin(actor, id.data).catch((err: unknown) => {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  });
  const plans = can(actor, "admin.billing.manage") ? (await listPlansAdmin(actor).catch(() => [])).filter((p) => p.code !== "trial") : [];
  const { workspace: w, subscription: s, access, students } = data;
  const grant = can(actor, "admin.support_access") ? await activeSupportGrant(actor, w.id) : null;

  return (
    <>
      <Link href="/admin/consultorias" className="text-sm font-semibold text-turf hover:underline">
        ← Consultorias
      </Link>
      <PageHeading title={w.name} description={`${WS_STATUS_LABEL[w.status]} · criada em ${fmtDate.format(w.createdAt)}`} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Resumo" className={panel}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Dono</dt>
              <dd className="font-semibold">{w.ownerName}</dd>
              <dd className="text-muted break-all">{w.ownerEmail}</dd>
            </div>
            <div>
              <dt className="text-muted">Alunos</dt>
              <dd className="font-semibold">
                {students.active ?? 0} ativos · {students.invited ?? 0} convidados · {students.suspended ?? 0} suspensos
              </dd>
            </div>
            <div>
              <dt className="text-muted">Plano</dt>
              <dd className="font-semibold">{s ? `${s.planName} (até ${s.maxStudents} alunos)` : "Sem assinatura"}</dd>
              {s?.provider && <dd className="text-muted">Cobrança: {s.provider === "manual" ? "manual" : s.provider}</dd>}
            </div>
            <div>
              <dt className="text-muted">Assinatura</dt>
              <dd className={`font-semibold ${ACCESS_CLASS[access.state]}`}>{ACCESS_LABEL[access.state]}</dd>
              {access.until && <dd className="text-muted">até {fmtDate.format(access.until)}</dd>}
            </div>
          </dl>
          <p className="mt-5 text-xs text-muted">Dados de alunos, saúde, treinos e conversas não aparecem no painel administrativo.</p>
        </section>

        {can(actor, "admin.workspaces.suspend") && w.status !== "archived" && (
          <section aria-label="Situação da consultoria" className={panel}>
            <h2 className="mb-1 font-display text-lg font-bold">{w.status === "suspended" ? "Reativar" : "Suspender"}</h2>
            <p className="mb-4 text-sm text-muted">
              {w.status === "suspended" ? "O treinador e os alunos voltam a ter acesso." : "Bloqueia o acesso do treinador e dos alunos imediatamente. Nada é apagado."}
            </p>
            <WorkspaceStatusForm workspaceId={w.id} suspended={w.status === "suspended"} />
          </section>
        )}

        {s && plans.length > 0 && (
          <section aria-label="Ajustar assinatura" className={panel}>
            <h2 className="mb-4 font-display text-lg font-bold">Ajustar assinatura</h2>
            <SubscriptionOverrideForm workspaceId={w.id} plans={plans} trialing={s.status === "trialing"} />
          </section>
        )}

        {can(actor, "admin.support_access") && (
          <section aria-label="Acesso de suporte" className={panel}>
            <h2 className="mb-1 font-display text-lg font-bold">Acesso de suporte (emergencial)</h2>
            {grant ? (
              <>
                <p className="mb-4 text-sm text-muted">Aberto até {fmtDateTime.format(grant.expiresAt)}. Cada consulta fica registrada.</p>
                <div className="flex flex-wrap items-start gap-3">
                  <Link href={`/admin/consultorias/${w.id}/suporte`} className="inline-flex h-11 items-center rounded-[var(--radius-control)] bg-ink px-4 font-semibold text-white">
                    Ver dados de suporte
                  </Link>
                  <CloseSupportForm workspaceId={w.id} />
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  Somente leitura e por tempo limitado: lista de alunos, programas e frequência. Nunca saúde, fotos, medidas, mensagens ou publicações. O dono da
                  consultoria recebe um e-mail e vê o acesso na visão geral.
                </p>
                <OpenSupportForm workspaceId={w.id} />
              </>
            )}
          </section>
        )}

        <section aria-label="Histórico administrativo" className={panel}>
          <h2 className="mb-3 font-display text-lg font-bold">Histórico administrativo</h2>
          {data.adminHistory.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma ação administrativa ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {data.adminHistory.map((h) => (
                <li key={h.id}>
                  <span className="font-semibold">{ACTION_LABEL[h.action] ?? h.action}</span>
                  <span className="text-muted"> · {fmtDateTime.format(h.createdAt)}</span>
                  {typeof h.metadata.reason === "string" && <span className="block text-muted break-words">{h.metadata.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
