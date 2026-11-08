import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { listAuditLogs, LOG_PAGE_SIZE } from "@/server/admin/service";
import { requirePageActor } from "@/server/http/next";
import { first, fmtDateTime, Pager, pageParam, Table, td } from "../ui";

export const metadata: Metadata = { title: "Auditoria" };

const workspaceParam = z.uuid().optional().catch(undefined);
const actionParam = z.string().trim().regex(/^[a-z_.]{1,60}$/).optional().catch(undefined);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("admin.audit.read");
  const sp = await searchParams;
  const workspaceId = workspaceParam.parse(first(sp.consultoria));
  const action = actionParam.parse(first(sp.acao));
  const page = pageParam.parse(first(sp.pagina));
  const rows = await listAuditLogs(actor, { workspaceId, actionPrefix: action, page });

  return (
    <>
      <PageHeading title="Auditoria" description="Quem fez o quê e quando. O registro não pode ser alterado nem apagado pelo app." />
      <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label className="flex-1">
          <span className="sr-only">Ação</span>
          <input name="acao" defaultValue={action} placeholder="Ação (ex.: admin. ou auth.login)" maxLength={60} className="h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-3" />
        </label>
        {workspaceId && <input type="hidden" name="consultoria" value={workspaceId} />}
        <button type="submit" className="h-11 rounded-[var(--radius-control)] bg-ink px-4 font-semibold text-paper">
          Filtrar
        </button>
      </form>
      {workspaceId && (
        <p className="mb-4 text-sm">
          Filtrando por uma consultoria.{" "}
          <Link href="/admin/auditoria" className="font-semibold text-turf hover:underline">
            Limpar
          </Link>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum registro.</p>
      ) : (
        <Table head={["Quando", "Ação", "Quem", "Alvo", "Consultoria"]}>
          {rows.slice(0, LOG_PAGE_SIZE).map((r) => (
            <tr key={r.id}>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDateTime.format(r.createdAt)}</td>
              <td className={`${td} font-medium`}>{r.action}</td>
              <td className={`${td} break-all`}>{r.actorEmail ?? "sistema"}</td>
              <td className={`${td} text-muted`}>{r.targetType ?? "—"}</td>
              <td className={td}>
                {r.workspaceId ? (
                  <Link href={`/admin/consultorias/${r.workspaceId}`} className="text-turf hover:underline">
                    abrir
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Pager basePath="/admin/auditoria" params={{ acao: action, consultoria: workspaceId }} page={page} hasNext={rows.length > LOG_PAGE_SIZE} />
    </>
  );
}
