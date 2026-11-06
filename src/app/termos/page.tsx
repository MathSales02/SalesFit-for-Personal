import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" version={LEGAL_DOCUMENT_VERSION}>
      <p>Estes termos regem o uso da Cadência por treinadores, alunos e visitantes.</p>
      <h2>Contas</h2>
      <p>
        Treinadores criam sua própria conta e consultoria. Alunos entram por convite do treinador. Cada pessoa é responsável por manter sua
        senha em sigilo.
      </p>
      <h2>Comunidade</h2>
      <p>
        É proibido publicar conteúdo ofensivo, discriminatório, enganoso ou que incentive práticas de treino inseguras. Conteúdos podem ser
        denunciados, removidos e contas podem ser suspensas.
      </p>
      <h2>Saúde</h2>
      <p>A plataforma não substitui avaliação médica. Siga as orientações do seu treinador e respeite seus limites.</p>
      <h2>Planos</h2>
      <p>Treinadores podem testar a plataforma gratuitamente por 14 dias. Condições dos planos pagos serão informadas antes da contratação.</p>
    </LegalPage>
  );
}
