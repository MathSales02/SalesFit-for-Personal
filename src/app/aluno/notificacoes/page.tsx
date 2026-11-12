import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/page";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Notificações") };
}

export default async function Page() {
  const actor = await requirePageActor("community.read");
  return <NotificationsPage actor={actor} base="/aluno" />;
}
