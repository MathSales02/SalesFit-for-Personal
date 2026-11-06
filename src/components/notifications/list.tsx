"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markNotificationsReadAction, notificationPrefsAction } from "@/app/_messaging/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Avatar } from "@/components/community/post-card";

export type NotificationItem = { id: string; read: boolean; text: string; href: string | null; actorName: string | null; createdAt: string };

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.read).length;
  const markAll = () =>
    startTransition(async () => {
      await markNotificationsReadAction({});
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 && (
        <button type="button" onClick={markAll} disabled={pending} className="self-end text-sm font-semibold text-turf">
          Marcar todas como lidas
        </button>
      )}
      {items.length === 0 ? (
        <p className="py-10 text-center text-muted">Nenhuma notificação ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {items.map((n) => {
            const content = (
              <div className="flex items-start gap-3 px-4 py-3">
                {n.actorName ? <Avatar name={n.actorName} size={36} /> : <span className="size-9 shrink-0 rounded-full bg-turf-tint" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className={n.read ? "text-ink-soft" : "font-semibold text-ink"}>{n.text}</p>
                  <p className="text-xs text-muted">{fmt.format(new Date(n.createdAt))}</p>
                </div>
                {!n.read && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-turf" aria-label="Não lida" />}
              </div>
            );
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link
                    href={n.href}
                    className="block hover:bg-chalk"
                    onClick={() => {
                      if (!n.read) void markNotificationsReadAction({ ids: [n.id] });
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PreferencesForm({ types, muted }: { types: readonly (readonly [string, string])[]; muted: string[] }) {
  return (
    <ActionForm action={notificationPrefsAction} className="flex flex-col gap-3">
      {() => (
        <>
          {types.map(([t, label]) => (
            <label key={t} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="wanted" value={t} defaultChecked={!muted.includes(t)} className="size-4 accent-turf" />
              {label}
            </label>
          ))}
          <div>
            <SubmitButton variant="secondary" pendingLabel="Salvando…">
              Salvar preferências
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
