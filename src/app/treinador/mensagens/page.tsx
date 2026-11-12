import type { Metadata } from "next";
import { MessagesPage } from "@/components/messaging/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Mensagens") };
}

export default async function Page() {
  const actor = await requirePageActor("messages.use");
  return <MessagesPage actor={actor} basePath="/treinador/mensagens" />;
}
