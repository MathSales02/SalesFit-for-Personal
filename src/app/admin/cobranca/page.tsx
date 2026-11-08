import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeading } from "@/components/ui/page-heading";
import { listBillingEvents } from "@/server/billing/provider";
import { requirePageActor } from "@/server/http/next";
import { ReprocessButton } from "../forms";
import { first, fmtDateTime, Pager, pageParam, Table, td } from "../ui";

export const metadata: Metadata = { title: "Cobrança" };

const statusParam = z.enum(["received", "processed", "ignored", "failed"]).optional().catch(undefined);
const STATUS_LABEL: Record<string, string> = { received: "Recebido", processed: "Processado", ignored: "Ignorado", failed: "Falhou" };

export default async function BillingEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("admin.billing.manage");
  const sp = await searchParams;
  const status = statusParam.parse(first(sp.situacao));
  const page = pageParam.parse(first(sp.pagina));
  const rows = await listBillingEvents(actor, { status, page });

  return (
    <>
      <PageHeading title="Eventos de cobrança" description="Notificações recebidas do Asaas. Repetições do mesmo evento são ignoradas automaticamente." />
      <nav aria-label="Situação" className="mb-4 flex flex-wrap gap-2 text-sm font-semibold">
        {[undefined, "failed", "processed", "ignored"].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/cobranca?situacao=${s}` : "/admin/cobranca"}
            aria-current={s === status ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${s === status ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}
          >
            {s ? STATUS_LABEL[s] : "Todos"}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum evento.</p>
      ) : (
        <Table head={["Recebido", "Evento", "Situação", "Consultoria", ""]}>
          {rows.slice(0, 50).map((e) => (
            <tr key={e.id}>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDateTime.format(e.receivedAt)}</td>
              <td className={`${td} font-medium`}>{e.eventType}</td>
              <td className={`${td} font-semibold ${e.status === "failed" ? "text-danger" : ""}`}>
                {STATUS_LABEL[e.status]}
                {e.error && <span className="block text-xs font-normal break-words text-muted">{e.error}</span>}
              </td>
              <td className={td}>
                {e.workspaceId ? (
                  <Link href={`/admin/consultorias/${e.workspaceId}`} className="text-turf hover:underline">
                    abrir
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className={td}>{(e.status === "failed" || e.status === "received") && <ReprocessButton eventId={e.id} />}</td>
            </tr>
          ))}
        </Table>
      )}
      <Pager basePath="/admin/cobranca" params={{ situacao: status }} page={page} hasNext={rows.length > 50} />
    </>
  );
}
