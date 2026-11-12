import Link from "next/link";
import { LanguagePicker } from "@/components/locale/language-picker";
import { Logo } from "@/components/ui/logo";
import { getT } from "@/i18n/server";

const WEEK = ["S", "T", "Q", "Q", "S", "S", "D"];
const DONE = [true, true, false, true, true, false, false];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-signal px-12 py-12 text-on-accent lg:flex">
        <Link href="/" aria-label={t("SalesFit, página inicial")}>
          <Logo tone="orange" height={36} />
        </Link>
        <div className="max-w-md">
          <p className="font-display text-[3.4rem] leading-[0.95] font-bold tracking-tight">
            {t("Evolução é constância.")}
          </p>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-on-accent/80">
            {t("Seus alunos treinam, registram e se motivam em comunidade. Você acompanha a evolução de cada um em um só lugar.")}
          </p>
        </div>
        <figure aria-label={t("Exemplo de semana de treinos: 4 de 7 dias cumpridos")} className="flex items-end gap-3">
          {WEEK.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <span className={`block h-14 w-9 rounded-full ${DONE[i] ? (i === 4 ? "bg-white" : "bg-on-accent") : "border-2 border-on-accent/25"}`} />
              <span className="text-xs font-semibold text-on-accent/80">{d}</span>
            </div>
          ))}
          <figcaption className="ml-3 pb-6 text-sm font-semibold text-on-accent/80">{t("4 de 7 nesta semana")}</figcaption>
        </figure>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
        <Link href="/" className="mb-10 lg:hidden" aria-label={t("SalesFit, página inicial")}>
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center">{children}</div>
        <div className="mx-auto mt-8 w-full max-w-[26rem]">
          <LanguagePicker compact />
        </div>
      </main>
    </div>
  );
}
