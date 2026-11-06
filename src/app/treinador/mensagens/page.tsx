import type { Metadata } from "next";
import { MessagesPage } from "@/components/messaging/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Mensagens" };

export default async function Page() {
  const actor = await requirePageActor("messages.use");
  return <MessagesPage actor={actor} basePath="/treinador/mensagens" />;
}
