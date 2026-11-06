import type { Metadata } from "next";
import { ConversationPage } from "@/components/messaging/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Conversa" };

export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const actor = await requirePageActor("messages.use");
  const { conversationId } = await params;
  return <ConversationPage actor={actor} basePath="/aluno/mensagens" conversationId={conversationId} />;
}
