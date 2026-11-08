import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" aria-label="SalesFit, página inicial">
        <Logo />
      </Link>
      <h1 className="mt-10 font-display text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Versão de {formatVersion(version)}</p>
      <div className="mt-8 flex flex-col gap-5 leading-relaxed text-ink-soft [&_a]:font-medium [&_a]:text-turf [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_code]:text-sm [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul_ul]:mt-1.5">
        {children}
      </div>
    </div>
  );
}

/** "2026-11-08" -> "8 de novembro de 2026". */
function formatVersion(v: string) {
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
