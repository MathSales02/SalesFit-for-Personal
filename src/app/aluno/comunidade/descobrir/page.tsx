import type { Metadata } from "next";
import { CommunityDiscoverPage } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Descobrir") };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor("community.read", { feature: "community" });
  const { q } = await searchParams;
  return <CommunityDiscoverPage actor={actor} basePath="/aluno/comunidade" query={typeof q === "string" ? q : ""} />;
}
