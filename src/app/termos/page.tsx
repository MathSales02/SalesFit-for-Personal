import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_DOCUMENT_VERSION, LEGAL_RESPONSIBLE as R } from "@/lib/legal";
import { TRIAL_DAYS } from "@/server/auth/service";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" version={LEGAL_DOCUMENT_VERSION}>
      <p>
        Estes termos regem o uso do SalesFit, plataforma online para personal trainers acompanharem treinos, evolução e constância dos seus alunos.
        O SalesFit é operado por {R.name} (contato: <a href={`mailto:${R.email}`}>{R.email}</a>, WhatsApp {R.whatsapp}). Ao criar uma conta ou
        aceitar um convite, você concorda com estes termos e com a <Link href="/privacidade">Política de privacidade</Link>.
      </p>

      <h2>1. Quem usa</h2>
      <ul>
        <li>
          <strong>Treinador:</strong> quem cria a conta, monta a consultoria e convida alunos. Precisa ter 18 anos ou mais.
        </li>
        <li>
          <strong>Aluno:</strong> quem entra por convite de um treinador. Alunos com menos de 18 anos só podem usar com a autorização do responsável
          legal, que o treinador deve obter antes de enviar o convite.
        </li>
      </ul>

      <h2>2. Sua conta</h2>
      <p>
        Use dados verdadeiros e mantenha sua senha em sigilo. Recomendamos ativar a verificação em duas etapas, em Conta. Você é responsável pelo que
        for feito na sua conta. Se suspeitar de acesso indevido, troque a senha e encerre as outras sessões em Conta, e nos avise.
      </p>

      <h2>3. Responsabilidades do treinador</h2>
      <ul>
        <li>
          Prescrever treinos é atividade do profissional de educação física. O treinador é o responsável técnico pelos treinos, orientações e
          avaliações que registra, e deve estar habilitado para exercer a profissão.
        </li>
        <li>O treinador deve informar seus alunos sobre o uso do SalesFit e só registrar dados de que realmente precisa para o acompanhamento.</li>
        <li>Vídeos, imagens e textos que o treinador enviar devem ser dele ou ter autorização de uso.</li>
        <li>O treinador modera a comunidade da sua consultoria e responde pelo uso que faz das ferramentas de moderação.</li>
      </ul>

      <h2>4. Saúde e segurança</h2>
      <p>
        O SalesFit é uma ferramenta de organização e acompanhamento. Ele não faz diagnóstico, não prescreve tratamentos e não substitui
        avaliação médica. Antes de iniciar ou intensificar treinos, procure liberação médica quando necessário. Siga as orientações do seu treinador,
        respeite seus limites e interrompa o exercício se sentir dor, tontura ou mal-estar.
      </p>

      <h2>5. Comunidade e conduta</h2>
      <p>É proibido publicar ou enviar:</p>
      <ul>
        <li>conteúdo ofensivo, discriminatório, ameaçador, de assédio ou de ódio;</li>
        <li>nudez, conteúdo sexual ou violento;</li>
        <li>informações falsas ou que incentivem práticas de treino, dieta ou uso de substâncias inseguras;</li>
        <li>dados pessoais de outras pessoas sem autorização;</li>
        <li>propaganda não autorizada, spam ou golpes.</li>
      </ul>
      <p>
        Imagens publicadas passam por verificação automática para bloquear nudez. Conteúdos podem ser denunciados e removidos, e contas podem ser
        suspensas ou encerradas em caso de violação. Também é proibido tentar acessar dados de outras consultorias, burlar limites do sistema ou
        prejudicar seu funcionamento.
      </p>

      <h2>6. Seu conteúdo</h2>
      <p>
        O que você envia continua sendo seu. Você autoriza o SalesFit a guardar, processar e exibir esse conteúdo apenas para prestar o serviço,
        dentro da sua consultoria e conforme as permissões que você escolher. Não usamos seu conteúdo para publicidade.
      </p>

      <h2>7. Planos e pagamentos</h2>
      <ul>
        <li>
          <strong>Teste grátis:</strong> {TRIAL_DAYS} dias, sem cartão, com todos os recursos e limite de alunos menor que o dos planos pagos.
        </li>
        <li>
          <strong>Planos pagos:</strong> cobrança mensal ou anual, por Pix, boleto ou cartão, processada pelo Asaas. O plano mensal e o anual pago à vista renovam sozinhos; o anual parcelado no cartão vale por 12 meses e não renova. Cada plano inclui um conjunto de recursos. Preços, recursos e limites de alunos e
          de espaço estão na <Link href="/#precos">página de preços</Link> e são confirmados antes da contratação.
        </li>
        <li>
          <strong>Troca de plano:</strong> vale a partir da próxima renovação.
        </li>
        <li>
          <strong>Atraso:</strong> se um pagamento não for identificado, o acesso continua por 7 dias de tolerância. Depois disso, ou ao fim do teste
          sem contratação, a consultoria fica pausada: os dados são mantidos, mas o uso fica limitado até a regularização.
        </li>
        <li>
          <strong>Cancelamento:</strong> a qualquer momento, em Assinatura. O acesso continua até o fim do período já pago, sem novas cobranças. Não
          há reembolso proporcional de períodos já iniciados.
        </li>
        <li>
          <strong>Direito de arrependimento:</strong> você pode desistir da primeira contratação em até 7 dias após o pagamento e receber o valor de
          volta integralmente (art. 49 do Código de Defesa do Consumidor). Basta pedir pelo contato acima.
        </li>
        <li>
          <strong>Mudança de preço:</strong> avisamos com pelo menos 30 dias de antecedência, e o novo valor só vale a partir da renovação seguinte ao
          aviso.
        </li>
      </ul>

      <h2>8. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o SalesFit disponível e seguro, mas podem ocorrer interrupções para manutenção, atualizações ou por falhas de
        terceiros (hospedagem, internet, provedores de pagamento). Manutenções programadas serão avisadas sempre que possível. Recomendamos baixar
        seus dados periodicamente em Conta.
      </p>

      <h2>9. Responsabilidade</h2>
      <p>
        O SalesFit responde pelos danos que causar na prestação do serviço, nos termos da lei. Não responde por treinos, orientações e conteúdos
        criados por treinadores e alunos, nem por danos causados por uso em desacordo com estes termos. Nada aqui afasta os direitos garantidos pelo
        Código de Defesa do Consumidor.
      </p>

      <h2>10. Encerramento</h2>
      <p>
        Você pode encerrar sua conta quando quiser: alunos, em Conta; treinadores donos de consultoria, pelo contato acima. Podemos suspender ou
        encerrar contas que violem estes termos, avisando o motivo, exceto quando o aviso prejudicar uma investigação ou a segurança de outras pessoas.
        Antes do encerramento, você pode baixar seus dados.
      </p>

      <h2>11. Mudanças nestes termos</h2>
      <p>
        Quando estes termos mudarem, a data da versão acima será atualizada. Mudanças relevantes serão avisadas por e-mail ou dentro do app com
        antecedência razoável. Continuar usando o SalesFit depois disso significa concordar com a nova versão.
      </p>

      <h2>12. Lei aplicável e foro</h2>
      <p>
        Estes termos seguem as leis do Brasil. Eventuais disputas serão resolvidas no foro do domicílio do consumidor. Antes disso, fale com a gente:
        a maioria dos problemas se resolve por <a href={`mailto:${R.email}`}>{R.email}</a>.
      </p>
    </LegalPage>
  );
}
