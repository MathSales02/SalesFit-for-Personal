import type { Metadata } from "next";
import { ConversationPage } from "@/components/messaging/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Conversa") };
}

export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await requirePageActor("messages.use");
  const { conversationId } = await params;
  return <ConversationPage actor={actor} basePath="/aluno/mensagens" conversationId={conversationId} />;
}
