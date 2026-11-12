import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CompetitionDetail } from "@/components/gamification/competition-detail";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Competição" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("challenges.manage", { feature: "competitions" });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  return <CompetitionDetail actor={actor} competitionId={id.data} backHref="/treinador/ranking" />;
}
