import type { Metadata } from "next";
import { CommunityProfilePage, profileTabFromParam } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Perfil" };

export default async function Page({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ aba?: string }> }) {
  const actor = await requirePageActor("community.read");
  const [{ memberId }, { aba }] = await Promise.all([params, searchParams]);
  return <CommunityProfilePage actor={actor} basePath="/treinador/comunidade" memberId={memberId} tab={profileTabFromParam(aba)} />;
}
