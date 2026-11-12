import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { openConversationAction } from "@/app/_messaging/actions";
import { Avatar } from "@/components/community/post-card";
import type { Actor } from "@/server/authz/policy";
import { AppError } from "@/server/lib/errors";
import { getConversation, listContacts, listConversations } from "@/server/messaging/service";
import { Thread } from "./thread";
import { StartConversationButton } from "./start-button";
import { getT } from "@/i18n/server";

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export async function MessagesPage({ actor, basePath }: { actor: Actor; basePath: string }) {
  const t = await getT();
  const [list, contacts] = await Promise.all([listConversations(actor), listContacts(actor)]);
  const talkedTo = new Set(list.map((c) => c.other.memberId));
  const newContacts = contacts.filter((c) => !talkedTo.has(c.memberId));
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <h1 className="font-display text-[2.4rem] leading-none font-bold tracking-tight">{t("Mensagens")}</h1>
      <section aria-labelledby="conv-h">
        <h2 id="conv-h" className="sr-only">
          {t("Conversas")}
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted">{t("Nenhuma conversa ainda.")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`${basePath}/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-chalk">
                  <Avatar name={c.other.name} />
                  <div className="min-w-0 flex-1">
                    <p className={`flex min-w-0 items-baseline gap-2 ${c.unread ? "font-bold" : "font-semibold"}`}>
                      <span className="truncate">{c.other.name}</span>
                      {c.other.role === "trainer" && <span className="shrink-0 text-xs font-semibold text-turf">{t("Treinador")}</span>}
                    </p>
                    <p className={`truncate text-sm ${c.unread ? "text-ink" : "text-muted"}`}>{c.preview}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.lastMessageAt && <span className="text-xs text-muted">{fmt.format(new Date(c.lastMessageAt))}</span>}
                    {c.unread > 0 && (
                      <span className="grid min-w-5 place-items-center rounded-full bg-turf-solid px-1.5 text-xs font-bold text-white" aria-label={t("{0} não lidas", { 0: c.unread })}>
                        {c.unread}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {newContacts.length > 0 && (
        <section aria-labelledby="new-h">
          <h2 id="new-h" className="mb-3 text-lg font-semibold">
            {t("Nova conversa")}
          </h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {newContacts.map((c) => (
              <li key={c.memberId} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={c.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  {c.role === "trainer" && <span className="block text-xs font-semibold text-turf">{t("Treinador")}</span>}
                </span>
                <StartConversationButton memberId={c.memberId} action={openConversationAction} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export async function ConversationPage({ actor, basePath, conversationId }: { actor: Actor; basePath: string; conversationId: string }) {
  const t = await getT();
  if (!z.uuid().safeParse(conversationId).success) notFound();
  let data;
  try {
    data = await getConversation(actor, conversationId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <Link href={basePath} className="text-sm font-semibold text-turf" aria-label={t("Voltar para mensagens")}>
          ←
        </Link>
        <Avatar name={data.other.name} size={36} />
        <h1 className="font-semibold">{data.other.name}</h1>
      </div>
      <Thread conversationId={conversationId} otherName={data.other.name} canSend={data.canSend} initial={data.messages} initialOlderCursor={data.olderCursor} />
    </div>
  );
}
