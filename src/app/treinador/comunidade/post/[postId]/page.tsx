import type { Metadata } from "next";
import { CommunityPostPage } from "@/components/community/pages";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Publicação") };
}

export default async function Page({ params }: { params: Promise<{ postId: string }> }) {
  const actor = await requirePageActor("community.read", { feature: "community" });
  const { postId } = await params;
  return <CommunityPostPage actor={actor} basePath="/treinador/comunidade" postId={postId} />;
}
