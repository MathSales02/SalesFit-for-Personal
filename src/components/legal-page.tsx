import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Notice } from "@/components/ui/notice";

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" aria-label="Página inicial">
        <Logo />
      </Link>
      <h1 className="mt-10 font-display text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Versão {version}</p>
      <div className="mt-6">
        <Notice tone="warning">Rascunho. Este texto precisa ser revisado por um profissional jurídico antes do lançamento comercial.</Notice>
      </div>
      <div className="mt-8 flex flex-col gap-5 leading-relaxed text-ink-soft [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink">
        {children}
      </div>
    </div>
  );
}
