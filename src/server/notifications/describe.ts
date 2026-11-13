import type { Translate } from "@/i18n/config";
import type { NotificationType } from "./service";

export type Describable = {
  type: NotificationType;
  actorName: string | null;
  targetId: string | null;
  data: Record<string, string | number>;
};

/**
 * Text and destination of a notification, shared by the notifications screen and the phone
 * notification. Private content (message text, health data) is never part of it.
 * base is the area of the recipient: "/treinador" or "/aluno".
 */
export function describeNotification(n: Describable, base: string, t: Translate): { text: string; href: string | null } {
  const who = n.actorName ?? t("Alguém");
  const program = String(n.data.programName ?? "");
  const days = Number(n.data.days ?? 0);
  switch (n.type) {
    case "post_liked":
      return { text: t("{who} curtiu sua publicação", { who }), href: `${base}/comunidade/post/${n.targetId}` };
    case "post_commented":
      return { text: t("{who} comentou na sua publicação", { who }), href: `${base}/comunidade/post/${n.targetId}` };
    case "comment_replied":
      return { text: t("{who} respondeu seu comentário", { who }), href: `${base}/comunidade/post/${n.targetId}` };
    case "new_follower":
      return { text: t("{who} começou a seguir você", { who }), href: `${base}/comunidade/membro/${n.targetId}` };
    case "message_received":
      return { text: t("Nova mensagem de {who}", { who }), href: `${base}/mensagens/${n.targetId}` };
    case "program_assigned":
      return { text: program ? t("Você recebeu um novo treino: {program}", { program }) : t("Você recebeu um novo treino"), href: "/aluno" };
    case "program_updated":
      return { text: program ? t("Seu treino {program} foi atualizado", { program }) : t("Seu treino foi atualizado"), href: "/aluno" };
    case "post_approved":
      return { text: t("Sua publicação foi aprovada e já aparece na comunidade"), href: `${base}/comunidade/post/${n.targetId}` };
    case "post_removed":
      return { text: t("Uma publicação sua foi removida pelo treinador"), href: null };
    case "announcement":
      return { text: t("{who} publicou um aviso", { who }), href: `${base}/comunidade/post/${n.targetId}` };
    case "student_inactive":
      return {
        text: n.data.never ? t("{who} ainda não fez nenhum treino desde que entrou", { who }) : t("{who} está há {days} dias sem treinar", { who, days }),
        href: `/treinador/alunos/${n.targetId}`,
      };
    case "workout_reminder":
      return {
        text: n.data.never ? t("Seu treino está esperando por você. Que tal começar hoje?") : t("Faz {days} dias desde o seu último treino. Bora voltar hoje?", { days }),
        href: "/aluno",
      };
  }
}
