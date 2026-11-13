import type { Metadata } from "next";
import { CommunityFeedPage, scopeFromParam } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Comunidade") };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await requirePageActor("community.read", { feature: "community" });
  const { ver } = await searchParams;
  return <CommunityFeedPage actor={actor} basePath="/treinador/comunidade" scope={scopeFromParam(ver)} />;
}
