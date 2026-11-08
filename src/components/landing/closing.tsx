import Link from "next/link";
import { Beats, BrandLogo } from "./brand";
import { SectionLink } from "./hero-motion";
import { BRAND, CONTACT, NAV, SOCIAL } from "./landing-content";

/** Final call to action: the bright orange band (black text, 6.3:1) that hands over to the footer. */
export function FinalCta({ trialDays }: { trialDays: number }) {
  return (
    <section aria-labelledby="cta-h" className="relative overflow-hidden bg-[var(--lp-orange)] text-black">
      <Beats className="pointer-events-none absolute -right-10 bottom-0 h-[85%] w-[55%] text-black/10" on={[0, 1, 2, 3, 4, 5, 6]} heights={[40, 70, 55, 100, 80, 45, 60]} />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <h2 id="cta-h" className="lp-display max-w-4xl text-[2.9rem] sm:text-[5rem]">
          A próxima semana dos seus alunos começa aqui.
        </h2>
        <p className="mt-6 max-w-xl text-lg font-medium text-black/80">
          {trialDays} dias com todos os recursos, sem cartão. Monte o primeiro programa hoje e convide seus alunos.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/cadastro" className="inline-flex h-13 items-center rounded-full bg-black px-7 text-base font-semibold text-white transition-colors hover:bg-white hover:text-black">
            Criar minha conta grátis
          </Link>
          <Link href="/entrar" className="inline-flex h-13 items-center rounded-full border border-black/40 px-6 text-base font-semibold text-black transition-colors hover:bg-black/10">
            Já tenho conta
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-dark border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.1fr_0.9fr_0.9fr_1.4fr]">
        <div>
          <BrandLogo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--lp-text-2)]">Treinos, evolução e constância para personal trainers e seus alunos.</p>
        </div>
        <nav aria-label="Seções do site">
          <h2 className="text-sm font-semibold text-white">Página</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {NAV.map((n) => (
              <li key={n.id}>
                <SectionLink id={n.id} className="text-[var(--lp-text-2)] hover:text-white">
                  {n.label}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Conta e documentos">
          <h2 className="text-sm font-semibold text-white">Conta</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/cadastro" className="text-[var(--lp-text-2)] hover:text-white">
                Criar conta
              </Link>
            </li>
            <li>
              <Link href="/entrar" className="text-[var(--lp-text-2)] hover:text-white">
                Entrar
              </Link>
            </li>
            <li>
              <Link href="/termos" className="text-[var(--lp-text-2)] hover:text-white">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="text-[var(--lp-text-2)] hover:text-white">
                Política de privacidade
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold text-white">Contato</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <a href={`mailto:${CONTACT.email}`} className="break-words text-[var(--lp-text-2)] hover:text-white">
                {CONTACT.email}
              </a>
            </li>
            <li>
              <a href={CONTACT.whatsapp.href} target="_blank" rel="noopener noreferrer" className="text-[var(--lp-text-2)] hover:text-white">
                WhatsApp {CONTACT.whatsapp.display}
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
            {SOCIAL.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[var(--lp-text-2)] hover:text-white">
                  {s.label}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mx-auto max-w-6xl border-t border-white/10 px-5 py-6 text-xs text-[var(--lp-text-2)] sm:px-8">
        © {year} {BRAND}. Todos os direitos reservados.
      </p>
    </footer>
  );
}
