import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { Logo } from "@/components/ui/logo";

const POINTS = [
  { title: "Para o treinador", text: "Alunos, fichas, vídeos de execução e evolução de cada um, numa rotina de gestão que cabe no seu dia." },
  { title: "Para o aluno", text: "O treino do dia no celular, com séries, descanso cronometrado e o histórico do que já foi feito." },
  { title: "Em comunidade", text: "Desafios, conquistas e um feed só da sua consultoria, que premia frequência, não exagero." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav aria-label="Conta" className="flex items-center gap-2">
          <Link href="/entrar" className={buttonClass("ghost")}>
            Entrar
          </Link>
          <Link href="/cadastro" className={`${buttonClass("primary")} hidden sm:inline-flex`}>
            Criar conta
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24">
          <h1 className="max-w-4xl font-display text-[3.2rem] leading-[0.92] font-bold tracking-tight sm:text-[5.5rem]">
            Seus alunos treinam mais quando treinam juntos.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Cadência é a plataforma do personal trainer para montar treinos, acompanhar a evolução e manter os alunos em ritmo, com uma
            comunidade só sua.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/cadastro" className={buttonClass("primary")}>
              Começar 14 dias grátis
            </Link>
            <Link href="/entrar" className={buttonClass("secondary")}>
              Já tenho conta
            </Link>
          </div>
        </section>

        <section aria-label="O que a plataforma oferece" className="border-t border-line bg-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:grid-cols-3 sm:px-8">
            {POINTS.map((p) => (
              <div key={p.title}>
                <h2 className="font-display text-2xl font-bold">{p.title}</h2>
                <p className="mt-2 leading-relaxed text-ink-soft">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-6 px-5 py-8 text-sm text-muted sm:px-8">
        <Link href="/termos" className="hover:text-ink">
          Termos de uso
        </Link>
        <Link href="/privacidade" className="hover:text-ink">
          Política de privacidade
        </Link>
      </footer>
    </div>
  );
}
