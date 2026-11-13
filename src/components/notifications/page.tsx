import type { Actor } from "@/server/authz/policy";
import { getMutedTypes, listNotifications, notificationTypesFor } from "@/server/notifications/service";
import { pushPublicKey } from "@/server/notifications/push";
import { NotificationList, PreferencesForm, type NotificationItem } from "./list";
import { PushSetup } from "./push-setup";
import { getT } from "@/i18n/server";
import { describeNotification } from "@/server/notifications/describe";

export async function NotificationsPage({ actor, base }: { actor: Actor; base: string }) {
  const t = await getT();
  const [list, muted] = await Promise.all([listNotifications(actor), getMutedTypes(actor)]);
  const items: NotificationItem[] = list.map((n) => ({ id: n.id, read: n.read, actorName: n.actorName, createdAt: n.createdAt, ...describeNotification(n, base, t) }));
  const relevant = notificationTypesFor(actor.membership?.role);
  const publicKey = pushPublicKey();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Notificações")}</h1>
      {publicKey && <PushSetup publicKey={publicKey} role={actor.membership?.role === "trainer" ? "trainer" : "student"} />}
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
