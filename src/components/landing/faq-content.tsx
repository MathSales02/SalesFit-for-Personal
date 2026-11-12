import { CONTACT } from "./landing-content";
import type { FaqItem } from "./faq";

/**
 * FAQ answers state only what the code (or the terms) confirms. Sources:
 *  - trial: auth/service TRIAL_DAYS, "trial" plan (no card at signup)
 *  - payment, cancel, plan change: billing/provider (Asaas, UNDEFINED billing type)
 *  - late payment: billing/access (7-day grace, data kept)
 *  - students free: only workspaces have subscriptions
 *  - security: auth (Argon2, TOTP), students (health consent), privacy (export/delete)
 */
export function faqItems({ trialDays, trialStudents }: { trialDays: number; trialStudents: number | null }): FaqItem[] {
  return [
    {
      q: "Como funciona o teste grátis?",
      a: `Você cria a conta de treinador e usa todos os recursos por ${trialDays} dias${trialStudents ? `, com até ${trialStudents} alunos` : ""}, sem cadastrar cartão. Quando quiser, escolhe um plano em Assinatura; escolhendo durante o teste, a primeira cobrança vence só 3 dias depois. Se o teste acabar sem plano, o acesso fica pausado e nenhum dado é apagado.`,
    },
    {
      q: "Quais são as formas de pagamento?",
      a: "Pix, boleto ou cartão, processado pelo Asaas. Você escolhe entre o plano mensal e o anual, que sai 15% mais barato e pode ser parcelado em até 12 vezes no cartão. A página de pagamento abre logo depois que você escolhe o plano.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim, na página Assinatura. As renovações param, e você e seus alunos continuam usando até o fim do período já pago.",
    },
    {
      q: "Posso trocar de plano?",
      a: "Sim. A troca vale a partir da próxima renovação. Para ir a um plano menor, seus alunos ativos e convites pendentes precisam caber no limite dele. Recursos que o plano menor não inclui ficam bloqueados, mas nada é apagado: voltam quando você subir de plano.",
    },
    {
      q: "E se um pagamento atrasar?",
      a: "O acesso continua por 7 dias. Depois disso fica pausado até a regularização, sem apagar nada.",
    },
    {
      q: "Meus alunos pagam alguma coisa?",
      a: "Não. Eles entram pelo convite que você envia e usam o SalesFit sem custo. O plano é da sua consultoria.",
    },
    {
      q: "Funciona no celular?",
      a: "Sim, direto no navegador do celular, sem instalar nada. O mesmo acesso funciona no computador.",
    },
    {
      q: "Como os dados ficam protegidos?",
      a: "Senhas guardadas com hash forte (Argon2), verificação em duas etapas, dados de saúde visíveis para você só com consentimento do aluno, e cada pessoa pode baixar ou excluir os próprios dados (LGPD).",
    },
    {
      q: "Como falo com vocês?",
      a: (
        <>
          Pelo e-mail{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-white underline underline-offset-4">
            {CONTACT.email}
          </a>{" "}
          ou pelo{" "}
          <a href={CONTACT.whatsapp.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-4">
            WhatsApp {CONTACT.whatsapp.display}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          .
        </>
      ),
    },
  ];
}
