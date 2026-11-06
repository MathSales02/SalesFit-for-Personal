import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { activeSupportGrant, getSupportOverview } from "@/server/admin/support";
import { requestMeta, requirePageActor } from "@/server/http/next";
import { CloseSupportForm } from "../../../forms";
import { fmtDate, fmtDateTime, Table, td } from "../../../ui";

export const metadata: Metadata = { title: "Suporte" };

const STATUS: Record<string, string> = { active: "Ativo", invited: "Convidado", suspended: "Suspenso", archived: "Arquivado" };

export default async function SupportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("admin.support_access");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const grant = await activeSupportGrant(actor, id.data);
  if (!grant) redirect(`/admin/consultorias/${id.data}`);
  const view = await getSupportOverview(actor, id.data, await requestMeta());

  return (
    <>
      <Link href={`/admin/consultorias/${id.data}`} className="text-sm font-semibold text-turf hover:underline">
        ← Consultoria
      </Link>
      <PageHeading title="Dados de suporte" description={`Somente leitura até ${fmtDateTime.format(grant.expiresAt)}. Esta consulta foi registrada na auditoria.`} />
      <p className="mb-6 max-w-2xl rounded-[var(--radius-panel)] border border-signal/60 bg-signal-tint px-4 py-3 text-sm">
        <span className="font-semibold">Motivo:</span> {grant.reason}
      </p>

      <h2 className="mb-3 font-display text-xl font-bold">Alunos ({view.students.length})</h2>
      {view.students.length === 0 ? (
        <p className="text-sm text-muted">Nenhum aluno.</p>
      ) : (
        <Table head={["Nome", "Situação", "Programa ativo", "Treinos (30 dias)", "Último treino", "Entrou em"]}>
          {view.students.map((s, i) => (
            <tr key={i}>
              <td className={`${td} font-semibold`}>{s.name}</td>
              <td className={td}>{STATUS[s.status] ?? s.status}</td>
              <td className={td}>{s.program ?? "—"}</td>
              <td className={`${td} tabular-nums`}>{s.workouts30d}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{s.lastWorkoutAt ? fmtDateTime.format(new Date(s.lastWorkoutAt)) : "—"}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{s.joinedAt ? fmtDate.format(new Date(s.joinedAt)) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="mt-10 mb-3 font-display text-xl font-bold">Programas ({view.programs.length})</h2>
      {view.programs.length === 0 ? (
        <p className="text-sm text-muted">Nenhum programa.</p>
      ) : (
        <Table head={["Nome", "Tipo", "Alunos com o programa"]}>
          {view.programs.map((p, i) => (
            <tr key={i}>
              <td className={`${td} font-semibold`}>{p.name}</td>
              <td className={td}>{p.isTemplate ? "Modelo" : p.archived ? "Arquivado" : "Programa"}</td>
              <td className={`${td} tabular-nums`}>{p.activeAssignments}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="mt-6 text-sm text-muted">Convites pendentes: {view.openInvitations}</p>

      <div className="mt-8">
        <CloseSupportForm workspaceId={id.data} />
      </div>
    </>
  );
}
