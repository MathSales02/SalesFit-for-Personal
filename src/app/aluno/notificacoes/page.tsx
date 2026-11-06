import type { Metadata } from "next";
import { NotificationsPage } from "@/components/notifications/page";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Notificações" };

export default async function Page() {
  const actor = await requirePageActor("community.read");
  return <NotificationsPage actor={actor} base="/aluno" />;
}
