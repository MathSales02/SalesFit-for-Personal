import type { Metadata } from "next";
import { CommunityDiscoverPage } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Descobrir" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor("community.read");
  const { q } = await searchParams;
  return <CommunityDiscoverPage actor={actor} basePath="/aluno/comunidade" query={typeof q === "string" ? q : ""} />;
}
