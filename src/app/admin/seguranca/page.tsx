import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { listSecurityEvents, LOG_PAGE_SIZE } from "@/server/admin/service";
import { requirePageActor } from "@/server/http/next";
import { first, fmtDateTime, Pager, pageParam, Table, td } from "../ui";

export const metadata: Metadata = { title: "Segurança" };

const severityParam = z.enum(["info", "warning", "critical"]).optional().catch(undefined);
const SEVERITY_LABEL: Record<string, string> = { info: "Informativo", warning: "Atenção", critical: "Crítico" };
const SEVERITY_CLASS: Record<string, string> = { info: "text-muted", warning: "text-ink", critical: "text-danger" };

export default async function SecurityEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("admin.security_events.read");
  const sp = await searchParams;
  const severity = severityParam.parse(first(sp.gravidade));
  const page = pageParam.parse(first(sp.pagina));
  const rows = await listSecurityEvents(actor, { severity, page });
  const hasNext = rows.length > LOG_PAGE_SIZE;

  return (
    <>
      <PageHeading title="Eventos de segurança" description="Logins com falha, bloqueios, limites atingidos e ações sensíveis. IPs são guardados só como hash." />
      <nav aria-label="Gravidade" className="mb-4 flex flex-wrap gap-2 text-sm font-semibold">
        {[undefined, "critical", "warning", "info"].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/seguranca?gravidade=${s}` : "/admin/seguranca"}
            aria-current={s === severity ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${s === severity ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}
          >
            {s ? SEVERITY_LABEL[s] : "Todos"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum evento.</p>
      ) : (
        <Table head={["Quando", "Evento", "Gravidade", "Detalhes"]}>
          {rows.slice(0, LOG_PAGE_SIZE).map((e) => (
            <tr key={e.id}>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDateTime.format(e.createdAt)}</td>
              <td className={`${td} font-medium`}>{e.type}</td>
              <td className={`${td} font-semibold ${SEVERITY_CLASS[e.severity]}`}>{SEVERITY_LABEL[e.severity]}</td>
              <td className={`${td} max-w-md text-xs break-all text-muted`}>{Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager basePath="/admin/seguranca" params={{ gravidade: severity }} page={page} hasNext={hasNext} />
    </>
  );
}
