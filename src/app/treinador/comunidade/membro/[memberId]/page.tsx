import type { Metadata } from "next";
import { CommunityProfilePage } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Perfil" };

export default async function Page({ params }: { params: Promise<{ memberId: string }> }) {
  const actor = await requirePageActor("community.read");
  const { memberId } = await params;
  return <CommunityProfilePage actor={actor} basePath="/treinador/comunidade" memberId={memberId} />;
}
