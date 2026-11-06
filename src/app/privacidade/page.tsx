import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" version={LEGAL_DOCUMENT_VERSION}>
      <p>
        Esta política explica como a Cadência trata dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
      </p>
      <h2>Quais dados tratamos</h2>
      <p>
        Dados de cadastro (nome, e-mail), dados de uso da plataforma e, quando você ou seu treinador registram, dados de treino. Medidas
        corporais, fotos de progresso, lesões e restrições podem ser dados pessoais sensíveis de saúde e só são tratados com seu consentimento
        específico.
      </p>
      <h2>Para que usamos</h2>
      <p>
        Para prestar o serviço contratado, manter a segurança da conta e cumprir obrigações legais. Endereços IP são guardados apenas em forma
        cifrada (hash) para prevenção de fraudes e abusos.
      </p>
      <h2>Quem acessa</h2>
      <p>
        Seus dados de treino são acessados por você e pelo seu treinador. Dados de saúde, fotos e mensagens privadas não são exibidos em perfis
        públicos nem no feed da comunidade sem sua autorização.
      </p>
      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados, além de revogar consentimentos a qualquer momento.
      </p>
      <h2>Retenção</h2>
      <p>Mantemos os dados enquanto a conta estiver ativa e pelo prazo exigido por lei. Registros de segurança são mantidos por tempo limitado.</p>
    </LegalPage>
  );
}
