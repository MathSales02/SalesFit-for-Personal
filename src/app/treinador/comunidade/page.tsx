import type { Metadata } from "next";
import { CommunityFeedPage, scopeFromParam } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Comunidade" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await requirePageActor("community.read");
  const { ver } = await searchParams;
  return <CommunityFeedPage actor={actor} basePath="/treinador/comunidade" scope={scopeFromParam(ver)} />;
}
