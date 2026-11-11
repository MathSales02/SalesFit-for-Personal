import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION, LEGAL_RESPONSIBLE as R } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" version={LEGAL_DOCUMENT_VERSION}>
      <p>
        Esta política explica quais dados pessoais o SalesFit trata, por que, com quem compartilha e como você exerce seus direitos, conforme a
        Lei Geral de Proteção de Dados (Lei 13.709/2018, &quot;LGPD&quot;).
      </p>

      <h2>1. Quem é o responsável</h2>
      <p>
        O SalesFit é operado por {R.name}, que é o controlador dos dados e também o encarregado pelo tratamento de dados pessoais. Contato
        para qualquer assunto de privacidade: <a href={`mailto:${R.email}`}>{R.email}</a> ou WhatsApp {R.whatsapp}.
      </p>
      <p>
        Quando um treinador cadastra e acompanha seus alunos, ele decide quais dados registra sobre eles (treinos, avaliações, observações). Nesses
        casos, o treinador também é responsável por esses dados perante seus alunos, e o SalesFit os trata para prestar o serviço a ele.
      </p>

      <h2>2. Quais dados tratamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, senha (guardada de forma irreversível, nunca em texto) e nome da consultoria.
        </li>
        <li>
          <strong>Treino:</strong> programas, exercícios, séries, cargas, repetições, check-ins, pontos de constância e recordes.
        </li>
        <li>
          <strong>Evolução:</strong> peso, medidas corporais e fotos de progresso. As fotos são privadas: o treinador só vê as que você escolher
          compartilhar.
        </li>
        <li>
          <strong>Saúde:</strong> lesões, restrições e condições que você informar. São dados sensíveis e só são tratados com o seu consentimento
          específico, que pode ser revogado a qualquer momento.
        </li>
        <li>
          <strong>Comunidade e mensagens:</strong> publicações, comentários, curtidas, publicações salvas, quem você segue, mensagens diretas e, se
          você quiser preencher, seu perfil na comunidade (foto, bio e objetivo de treino).
        </li>
        <li>
          <strong>Cobrança (treinadores):</strong> plano contratado e situação dos pagamentos. O CPF ou CNPJ informado no pagamento é enviado
          diretamente ao Asaas e não fica guardado no SalesFit. Dados de cartão são digitados no ambiente do Asaas; o SalesFit nunca os recebe.
        </li>
        <li>
          <strong>Segurança:</strong> registros de acesso e de tentativas de login. O endereço IP e o e-mail nesses registros são guardados apenas em
          forma cifrada (hash).
        </li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          <strong>Prestar o serviço contratado</strong> (contas, treinos, evolução, comunidade, mensagens e cobrança): execução de contrato (art. 7º,
          V, da LGPD).
        </li>
        <li>
          <strong>Dados de saúde:</strong> consentimento específico e destacado (art. 11, I).
        </li>
        <li>
          <strong>Segurança, prevenção de fraudes e abusos:</strong> legítimo interesse (art. 7º, IX) e proteção do titular (art. 11, II, g).
        </li>
        <li>
          <strong>Obrigações legais e fiscais:</strong> cumprimento de obrigação legal (art. 7º, II).
        </li>
      </ul>
      <p>Não vendemos dados, não exibimos anúncios e não usamos ferramentas de análise ou rastreamento de terceiros.</p>

      <h2>4. Quem acessa seus dados</h2>
      <ul>
        <li>
          <strong>Seu treinador:</strong> seus treinos, check-ins e evolução. Fotos de progresso, só as que você compartilhar. Dados de saúde, só com
          o seu consentimento.
        </li>
        <li>
          <strong>Outros membros da sua consultoria:</strong> o que você publicar na comunidade, seu perfil (foto, bio e objetivo), quem você segue,
          sua posição no ranking e o fato de você ter feito check-in no dia. Você pode sair do ranking quando quiser; com isso, seus check-ins e
          pontos também deixam de aparecer para os outros alunos. As publicações que você salva são visíveis só para você.
        </li>
        <li>
          <strong>Prestadores de serviço</strong>, só para fazer o SalesFit funcionar:
          <ul>
            <li>Railway (hospedagem do sistema, do banco de dados e dos arquivos), nos Estados Unidos;</li>
            <li>Google (envio de e-mails do sistema, pelo Gmail), nos Estados Unidos;</li>
            <li>Asaas (processamento de pagamentos dos treinadores), no Brasil.</li>
          </ul>
        </li>
        <li>
          <strong>Autoridades</strong>, quando houver obrigação legal ou ordem judicial.
        </li>
      </ul>

      <h2>5. Transferência internacional</h2>
      <p>
        Como o sistema e o envio de e-mails ficam em servidores nos Estados Unidos, seus dados são transferidos para fora do Brasil (art. 33 da LGPD).
        Escolhemos provedores que se comprometem contratualmente a proteger os dados, a usá-los só para prestar o serviço e a manter medidas de
        segurança adequadas.
      </p>

      <h2>6. Como protegemos</h2>
      <ul>
        <li>Conexão sempre criptografada (HTTPS) e senhas guardadas com algoritmo próprio para senhas (Argon2).</li>
        <li>Verificação em duas etapas disponível para todos e obrigatória para administradores.</li>
        <li>Separação entre consultorias no próprio banco de dados: uma consultoria não enxerga os dados de outra.</li>
        <li>Fotos e vídeos em armazenamento privado, abertos apenas por links temporários.</li>
        <li>
          Acesso de suporte só em emergência, com motivo registrado, prazo curto e aviso por e-mail ao treinador. Esse acesso nunca inclui dados de
          saúde, fotos, medidas, mensagens ou publicações.
        </li>
      </ul>

      <h2>7. Análise automática de imagens</h2>
      <p>
        Imagens enviadas para a comunidade passam por uma verificação automática, feita no próprio servidor do SalesFit, para bloquear nudez.
        Nenhuma imagem é enviada a terceiros para isso. Se uma imagem sua for bloqueada por engano, você pode pedir revisão humana pelo contato acima
        (art. 20 da LGPD).
      </p>

      <h2>8. Por quanto tempo guardamos</h2>
      <p>
        Os dados da conta ficam guardados enquanto ela estiver ativa. Ao excluir a conta, seus dados são apagados, exceto o que a lei obriga a manter.
        Alguns registros são apagados automaticamente antes:
      </p>
      <ul>
        <li>sessões de login: 30 dias depois de encerradas ou expiradas;</li>
        <li>links enviados por e-mail (confirmação, nova senha): 7 dias depois de usados ou expirados;</li>
        <li>tentativas de login: 90 dias;</li>
        <li>registros de segurança: 1 ano;</li>
        <li>notificações: 90 dias depois de lidas, e 1 ano no máximo;</li>
        <li>convites não aceitos: 90 dias depois de expirados ou cancelados;</li>
        <li>avisos de pagamento já processados: 1 ano;</li>
        <li>arquivos cujo envio não foi concluído: 24 horas.</li>
      </ul>
      <p>Registros de ações administrativas (auditoria) são mantidos para a segurança do serviço e para o cumprimento de obrigações legais.</p>

      <h2>9. Seus direitos</h2>
      <p>
        Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade e exclusão dos seus dados, informações sobre
        compartilhamento e a revogação de consentimentos (art. 18 da LGPD).
      </p>
      <ul>
        <li>
          <strong>Exportar seus dados:</strong> em Conta, no botão &quot;Baixar meus dados&quot;, a qualquer momento.
        </li>
        <li>
          <strong>Excluir sua conta:</strong> alunos, em Conta. Treinadores donos de consultoria pedem pelo contato acima, porque a exclusão afeta os
          dados dos alunos.
        </li>
        <li>
          <strong>Revogar o consentimento de saúde:</strong> na área de saúde do aluno.
        </li>
        <li>
          <strong>Demais pedidos:</strong> pelo e-mail <a href={`mailto:${R.email}`}>{R.email}</a>. Respondemos em até 15 dias.
        </li>
      </ul>
      <p>
        Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em{" "}
        <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">
          gov.br/anpd
        </a>
        .
      </p>

      <h2>10. Cookies</h2>
      <p>Usamos apenas cookies necessários ao funcionamento:</p>
      <ul>
        <li>
          <code>cadencia_session</code>: mantém você conectado;
        </li>
        <li>
          <code>cadencia_mfa</code>: guarda a etapa de verificação em duas etapas durante o login;
        </li>
        <li>
          <code>cadencia_theme</code>: lembra se você prefere o tema claro ou escuro.
        </li>
      </ul>
      <p>Não usamos cookies de publicidade nem de análise.</p>

      <h2>11. Crianças e adolescentes</h2>
      <p>
        Treinadores precisam ter 18 anos ou mais. Alunos com menos de 18 anos só podem usar o SalesFit com a autorização do responsável legal,
        obtida pelo treinador antes do convite. O tratamento de dados de menores segue o melhor interesse deles (art. 14 da LGPD).
      </p>

      <h2>12. Mudanças nesta política</h2>
      <p>
        Quando esta política mudar, a data da versão acima será atualizada. Mudanças relevantes serão avisadas por e-mail ou dentro do app. Veja também
        os <Link href="/termos">Termos de uso</Link>.
      </p>
    </LegalPage>
  );
}
