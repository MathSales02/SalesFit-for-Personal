import Link from "next/link";
import { z } from "zod";

/** Small server-side building blocks shared by the admin pages. */

export const fmtDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
export const fmtDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });

export const pageParam = z.coerce.number().int().min(1).max(10_000).catch(1);
export const textParam = z.string().trim().max(100).optional().catch(undefined);
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const ACCESS_LABEL: Record<string, string> = { trial: "Teste grátis", active: "Ativa", grace: "Pagamento pendente", blocked: "Pausada" };
export const ACCESS_CLASS: Record<string, string> = { trial: "text-ink", active: "text-turf", grace: "text-ink", blocked: "text-danger" };
export const WS_STATUS_LABEL: Record<string, string> = { active: "Ativa", suspended: "Suspensa", archived: "Arquivada" };

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "px-4 py-3 align-top";

/** Previous / next links that keep the other query parameters. */
export function Pager({ basePath, params, page, hasNext }: { basePath: string; params: Record<string, string | undefined>; page: number; hasNext: boolean }) {
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, pagina: p > 1 ? String(p) : undefined }).filter((e): e is [string, string] => !!e[1]));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label="Paginação" className="mt-4 flex justify-between text-sm font-semibold">
      {page > 1 ? <Link href={href(page - 1)} className="text-turf hover:underline">← Anterior</Link> : <span />}
      {hasNext ? <Link href={href(page + 1)} className="text-turf hover:underline">Próxima →</Link> : <span />}
    </nav>
  );
}

export function SearchForm({ placeholder, defaultValue, children }: { placeholder: string; defaultValue?: string; children?: React.ReactNode }) {
  return (
    <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
      <label className="flex-1">
        <span className="sr-only">Buscar</span>
        <input name="q" defaultValue={defaultValue} maxLength={100} placeholder={placeholder} className="h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-3" />
      </label>
      {children}
      <button type="submit" className="h-11 rounded-[var(--radius-control)] bg-ink px-4 font-semibold text-paper">
        Buscar
      </button>
    </form>
  );
}
