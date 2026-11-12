import type { Actor } from "@/server/authz/policy";
import { getMutedTypes, listNotifications, NOTIFICATION_TYPES, type NotificationView } from "@/server/notifications/service";
import { NotificationList, PreferencesForm, type NotificationItem } from "./list";
import { getT } from "@/i18n/server";
import type { Translate } from "@/i18n/config";

/** Text and destination of each notification; private content is never part of it. */
function describe(n: NotificationView, base: string, t: Translate): { text: string; href: string | null } {
  const who = n.actorName ?? t("Alguém");
  const program = String(n.data.programName ?? "");
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
  }
}

export async function NotificationsPage({ actor, base }: { actor: Actor; base: string }) {
  const t = await getT();
  const [list, muted] = await Promise.all([listNotifications(actor), getMutedTypes(actor)]);
  const items: NotificationItem[] = list.map((n) => ({ id: n.id, read: n.read, actorName: n.actorName, createdAt: n.createdAt, ...describe(n, base, t) }));
  const relevant = NOTIFICATION_TYPES.filter(([t]) => (actor.membership?.role === "trainer" ? !t.startsWith("program_") && t !== "announcement" : true));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Notificações")}</h1>
      <NotificationList items={items} />
      <details className="rounded-[var(--radius-panel)] border border-line bg-paper">
        <summary className="cursor-pointer px-4 py-3.5 font-semibold">{t("O que você quer receber")}</summary>
        <div className="border-t border-line p-4">
          <PreferencesForm types={relevant} muted={muted} />
        </div>
      </details>
    </div>
  );
}
