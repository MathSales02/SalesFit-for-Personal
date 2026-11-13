import type { Metadata } from "next";
import { CommunityProfilePage, profileTabFromParam } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Perfil") };
}

export default async function Page({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ aba?: string }> }) {
  const actor = await requirePageActor("community.read", { feature: "community" });
  const [{ memberId }, { aba }] = await Promise.all([params, searchParams]);
  return <CommunityProfilePage actor={actor} basePath="/aluno/comunidade" memberId={memberId} tab={profileTabFromParam(aba)} />;
}
