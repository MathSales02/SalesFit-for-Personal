import type { Translate } from "@/i18n/config";
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
export function faqItems({ trialDays, trialStudents, t }: { trialDays: number; trialStudents: number | null; t: Translate }): FaqItem[] {
  return [
    {
      q: t("Como funciona o teste grátis?"),
      a: trialStudents
        ? t("Você cria a conta de treinador e usa todos os recursos por {days} dias, com até {students} alunos, sem cadastrar cartão. Quando quiser, escolhe um plano em Assinatura; escolhendo durante o teste, a primeira cobrança vence só 3 dias depois. Se o teste acabar sem plano, o acesso fica pausado e nenhum dado é apagado.", { days: trialDays, students: trialStudents })
        : t("Você cria a conta de treinador e usa todos os recursos por {days} dias, sem cadastrar cartão. Quando quiser, escolhe um plano em Assinatura; escolhendo durante o teste, a primeira cobrança vence só 3 dias depois. Se o teste acabar sem plano, o acesso fica pausado e nenhum dado é apagado.", { days: trialDays }),
    },
    {
      q: t("Quais são as formas de pagamento?"),
      a: t("Pix, boleto ou cartão, processado pelo Asaas. Você escolhe entre o plano mensal e o anual, que sai 15% mais barato e pode ser parcelado em até 12 vezes no cartão. A página de pagamento abre logo depois que você escolhe o plano."),
    },
    {
      q: t("Posso cancelar quando quiser?"),
      a: t("Sim, na página Assinatura. As renovações param, e você e seus alunos continuam usando até o fim do período já pago."),
    },
    {
      q: t("Posso trocar de plano?"),
      a: t("Sim. A troca vale a partir da próxima renovação. Para ir a um plano menor, seus alunos ativos e convites pendentes precisam caber no limite dele. Recursos que o plano menor não inclui ficam bloqueados, mas nada é apagado: voltam quando você subir de plano."),
    },
    {
      q: t("E se um pagamento atrasar?"),
      a: t("O acesso continua por 7 dias. Depois disso fica pausado até a regularização, sem apagar nada."),
    },
    {
      q: t("Meus alunos pagam alguma coisa?"),
      a: t("Não. Eles entram pelo convite que você envia e usam o SalesFit sem custo. O plano é da sua consultoria."),
    },
    {
      q: t("Funciona no celular?"),
      a: t("Sim, direto no navegador do celular, sem instalar nada. O mesmo acesso funciona no computador."),
    },
    {
      q: t("Como os dados ficam protegidos?"),
      a: t("Senhas guardadas com hash forte (Argon2), verificação em duas etapas, dados de saúde visíveis para você só com consentimento do aluno, e cada pessoa pode baixar ou excluir os próprios dados (LGPD)."),
    },
    {
      q: t("Como falo com vocês?"),
      a: (
        <>
          {t("Pelo e-mail")}{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-white underline underline-offset-4">
            {CONTACT.email}
          </a>{" "}
          {t("ou pelo")}{" "}
          <a href={CONTACT.whatsapp.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-4">
            WhatsApp {CONTACT.whatsapp.display}
            <span className="sr-only">{t(" (abre em nova aba)")}</span>
          </a>
          .
        </>
      ),
    },
  ];
}
