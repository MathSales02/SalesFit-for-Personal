import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui/page-heading";
import { requirePageActor } from "@/server/http/next";
import { listPrograms } from "@/server/programs/service";
import { ProgramInfoForm } from "./forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Treinos") };
}

type Row = Awaited<ReturnType<typeof listPrograms>>[number];

export default async function ProgramsPage() {
  const t = await getT();
  const actor = await requirePageActor("training.manage");
  const rows = await listPrograms(actor);
  const templates = rows.filter((r) => r.isTemplate);
  const programs = rows.filter((r) => !r.isTemplate);

  return (
    <>
      <PageHeading title={t("Treinos")} description={t("Monte programas por dias, publique e atribua aos alunos. Cada publicação vira uma nova versão, sem apagar o histórico.")} />

      <details className="group mb-8 rounded-[var(--radius-panel)] border border-line bg-paper">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
          {t("Novo programa")}
          <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <ProgramInfoForm />
        </div>
      </details>

      <ProgramList title={t("Programas")} rows={programs} empty={t("Nenhum programa ainda. Crie o primeiro acima.")} />
      {templates.length > 0 && <ProgramList title={t("Modelos")} rows={templates} empty="" />}
    </>
  );
}

async function ProgramList({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  const t = await getT();
  return (
    <section className="mb-10">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/treinador/treinos/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-chalk">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-sm text-muted">
                    {r.publishedNumber ? t("Versão {0} publicada", { 0: r.publishedNumber }) : t("Ainda não publicado")}
                    {r.hasDraft && r.publishedNumber ? t(" · rascunho em edição") : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted">
                  {r.activeAssignments === 1 ? t("1 aluno") : t("{0} alunos", { 0: r.activeAssignments })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
