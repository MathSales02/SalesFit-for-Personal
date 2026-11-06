import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/page-heading";
import { ADMIN_PAGE_SIZE, listUsers } from "@/server/admin/service";
import { can } from "@/server/authz/policy";
import { requirePageActor } from "@/server/http/next";
import { UserStatusForm } from "../forms";
import { first, fmtDate, fmtDateTime, Pager, pageParam, SearchForm, Table, td, textParam } from "../ui";

export const metadata: Metadata = { title: "Usuários" };

const ROLE_LABEL: Record<string, string> = { trainer: "Treinador", student: "Aluno" };
const STATUS_LABEL: Record<string, string> = { active: "Ativa", suspended: "Suspensa", deactivated: "Desativada pelo titular" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("admin.users.read");
  const sp = await searchParams;
  const q = textParam.parse(first(sp.q)) || undefined;
  const page = pageParam.parse(first(sp.pagina));
  const { rows, total } = await listUsers(actor, { q, page });
  const canSuspend = can(actor, "admin.users.suspend");

  return (
    <>
      <PageHeading title="Usuários" description={`${total} contas.`} />
      <SearchForm placeholder="Nome ou e-mail" defaultValue={q} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma conta encontrada.</p>
      ) : (
        <Table head={["Conta", "Papel", "Situação", "Último acesso", "Criada", ...(canSuspend ? ["Ação"] : [])]}>
          {rows.map((u) => (
            <tr key={u.id}>
              <td className={td}>
                <span className="block font-semibold">{u.displayName}</span>
                <span className="block text-muted break-all">{u.email}</span>
                {!u.emailVerifiedAt && <span className="block text-xs text-muted">e-mail não confirmado</span>}
              </td>
              <td className={td}>{u.isPlatformAdmin ? "Administrador" : u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</td>
              <td className={`${td} font-semibold ${u.status === "active" ? "" : "text-danger"}`}>{STATUS_LABEL[u.status] ?? u.status}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{u.lastSeenAt ? fmtDateTime.format(u.lastSeenAt) : "—"}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate.format(u.createdAt)}</td>
              {canSuspend && (
                <td className={`${td} min-w-64`}>
                  {u.isPlatformAdmin || u.id === actor.userId || u.status === "deactivated" ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <UserStatusForm userId={u.id} suspended={u.status === "suspended"} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
      <Pager basePath="/admin/usuarios" params={{ q }} page={page} hasNext={page * ADMIN_PAGE_SIZE < total} />
    </>
  );
}
