import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui/page-heading";
import { FITNESS_LEVEL_LABEL, studentListQuerySchema } from "@/lib/validation/students";
import { requirePageActor } from "@/server/http/next";
import { listOpenInvitations } from "@/server/students/invitations";
import { listStudents, STUDENTS_PAGE_SIZE } from "@/server/students/students";
import { InviteForm, RevokeInvitationButton } from "./forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Alunos") };
}

const TABS = [
  { status: "active", label: "Ativos" },
  { status: "suspended", label: "Suspensos" },
  { status: "archived", label: "Arquivados" },
] as const;

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT();
  const actor = await requirePageActor("students.read");
  const query = studentListQuerySchema.parse(await searchParams);
  const [{ rows, total }, invites] = await Promise.all([listStudents(actor, query), listOpenInvitations(actor)]);
  const pages = Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE));

  return (
    <>
      <PageHeading title={t("Alunos")} description={t("Convide alunos por e-mail. Cada convite ocupa uma vaga do plano até ser aceito ou cancelado.")} />

      <section aria-labelledby="invite-h" className="rounded-[var(--radius-panel)] border border-line bg-paper p-5">
        <h2 id="invite-h" className="mb-4 text-lg font-semibold">
          {t("Convidar aluno")}
        </h2>
        {actor.emailVerified ? <InviteForm /> : <p className="text-sm text-muted">{t("Confirme seu e-mail para convidar alunos.")}</p>}

        {invites.length > 0 && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-sm font-semibold text-muted">{t("Convites pendentes")}</h3>
            <ul className="mt-2 divide-y divide-line">
              {invites.map((i) => {
                return (
                  <li key={i.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.email}</p>
                      <p className="text-sm text-muted">{i.expired ? t("Expirado. Envie de novo para gerar um novo link.") : t("Enviado em {0}", { 0: fmt.format(i.createdAt) })}</p>
                    </div>
                    <RevokeInvitationButton invitationId={i.id} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="list-h" className="mt-10">
        <h2 id="list-h" className="sr-only">
          {t("Lista de alunos")}
        </h2>
        <nav aria-label={t("Filtrar por situação")} className="flex gap-1 border-b border-line">
          {TABS.map((tab) => {
            const active = tab.status === query.status;
            return (
              <Link
                key={tab.status}
                href={`/treinador/alunos?status=${tab.status}`}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${active ? "border-turf text-turf" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t(tab.label)}
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <p className="py-10 text-sm text-muted">
            {query.status === "active" ? t("Nenhum aluno ativo ainda. Quando alguém aceitar um convite, aparece aqui.") : t("Nenhum aluno nesta situação.")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.memberId}>
                <Link href={`/treinador/alunos/${r.memberId}`} className="flex items-center justify-between gap-4 py-3.5 hover:bg-paper/70">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-turf-tint font-display text-lg font-bold text-turf">
                      {r.displayName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.displayName}</p>
                      <p className="truncate text-sm text-muted">{r.email}</p>
                    </div>
                  </div>
                  <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
                    <p>{r.fitnessLevel ? t(FITNESS_LEVEL_LABEL[r.fitnessLevel]) : t("Nível não definido")}</p>
                    <p>{r.weeklyFrequency ? t("{0}x por semana", { 0: r.weeklyFrequency }) : ""}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label={t("Páginas")} className="mt-6 flex items-center gap-4 text-sm">
            {query.page > 1 && (
              <Link href={`/treinador/alunos?status=${query.status}&page=${query.page - 1}`} className="font-semibold text-turf">
                {t("Anterior")}
              </Link>
            )}
            <span className="text-muted">
              {t("Página")} {query.page} {t("de")} {pages}
            </span>
            {query.page < pages && (
              <Link href={`/treinador/alunos?status=${query.status}&page=${query.page + 1}`} className="font-semibold text-turf">
                {t("Próxima")}
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
