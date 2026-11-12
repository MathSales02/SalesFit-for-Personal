import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeatureLocked } from "@/components/shell/feature-locked";
import { FEATURES, type Feature } from "@/lib/plan-features";
import { actorHasFeature } from "@/server/authz/policy";
import { requirePageActor } from "@/server/http/next";

export const metadata: Metadata = { title: "Recurso do plano" };

export default async function LockedFeaturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageActor("students.read");
  const f = (await searchParams).f;
  const feature = FEATURES.find((x) => x === f) as Feature | undefined;
  // Unknown feature, or one the plan already includes (it was just upgraded): nothing to explain.
  if (!feature || actorHasFeature(actor, feature)) redirect("/treinador");
  return <FeatureLocked feature={feature} role="trainer" />;
}
