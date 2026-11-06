import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { ADMIN_PAGE_SIZE, listWorkspaces } from "@/server/admin/service";
import { requirePageActor } from "@/server/http/next";
import { ACCESS_CLASS, ACCESS_LABEL, first, fmtDate, Pager, pageParam, SearchForm, Table, td, textParam, WS_STATUS_LABEL } from "../ui";

export const metadata: Metadata = { title: "Consultorias" };

const statusParam = z.enum(["active", "suspended", "archived"]).optional().catch(undefined);

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("admin.workspaces.read");
  const sp = await searchParams;
  const q = textParam.parse(first(sp.q)) || undefined;
  const status = statusParam.parse(first(sp.situacao));
  const page = pageParam.parse(first(sp.pagina));
  const { rows, total } = await listWorkspaces(actor, { q, status, page });

  return (
    <>
      <PageHeading title="Consultorias" description={`${total} no total.`} />
      <SearchForm placeholder="Nome da consultoria ou e-mail do dono" defaultValue={q}>
        <label>
          <span className="sr-only">Situação</span>
          <select name="situacao" defaultValue={status ?? ""} className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3">
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="suspended">Suspensas</option>
            <option value="archived">Arquivadas</option>
          </select>
        </label>
      </SearchForm>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma consultoria encontrada.</p>
      ) : (
        <Table head={["Consultoria", "Dono", "Plano", "Assinatura", "Alunos", "Criada"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>
                <Link href={`/admin/consultorias/${r.id}`} className="font-semibold text-turf hover:underline">
                  {r.name}
                </Link>
                {r.status !== "active" && <span className="ml-2 text-xs font-semibold text-danger">{WS_STATUS_LABEL[r.status]}</span>}
              </td>
              <td className={td}>
                <span className="block">{r.ownerName}</span>
                <span className="block text-muted">{r.ownerEmail}</span>
              </td>
              <td className={td}>{r.planName ?? "—"}</td>
              <td className={`${td} font-semibold ${ACCESS_CLASS[r.access.state]}`}>{ACCESS_LABEL[r.access.state]}</td>
              <td className={`${td} tabular-nums`}>{r.students}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate.format(r.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager basePath="/admin/consultorias" params={{ q, situacao: status }} page={page} hasNext={page * ADMIN_PAGE_SIZE < total} />
    </>
  );
}
