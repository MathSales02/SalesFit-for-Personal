import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { requirePageActor } from "@/server/http/next";
import { getAdminOverview } from "@/server/workspace/overview";

export const metadata: Metadata = { title: "Administração" };

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const SEVERITY_CLASS: Record<string, string> = { info: "text-muted", warning: "text-ink", critical: "text-danger" };
const SEVERITY_LABEL: Record<string, string> = { info: "Informativo", warning: "Atenção", critical: "Crítico" };

export default async function AdminPage() {
  const actor = await requirePageActor("admin.dashboard");
  const o = await getAdminOverview(actor);
  const stats: [string, number][] = [
    ["Consultorias ativas", o.workspaces.active],
    ["Consultorias suspensas", o.workspaces.suspended],
    ["Contas", o.users],
    ["Em teste grátis", o.subscriptions.trialing ?? 0],
  ];
  return (
    <>
      <PageHeading title="Plataforma" description="Dados agregados. Informações de saúde e conversas privadas não aparecem aqui." />
      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-paper p-5">
            <dt className="text-sm font-semibold text-muted">{label}</dt>
            <dd className="mt-1 font-display text-4xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="sec-h" className="mt-10">
        <h2 id="sec-h" className="text-lg font-semibold">
          Eventos de segurança recentes
        </h2>
        {o.recentSecurityEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum evento registrado.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Quando
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Evento
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Gravidade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {o.recentSecurityEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{fmt.format(e.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{e.type}</td>
                    <td className={`px-4 py-3 font-semibold ${SEVERITY_CLASS[e.severity] ?? ""}`}>{SEVERITY_LABEL[e.severity] ?? e.severity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
