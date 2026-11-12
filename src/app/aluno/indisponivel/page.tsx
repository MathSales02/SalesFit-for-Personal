import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button-styles";
import { requirePageActor } from "@/server/http/next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Consultoria indisponível") };
}

export default async function UnavailablePage() {
  const t = await getT();
  const actor = await requirePageActor("training.read_own", { allowInactive: true });
  if (actor.membership?.access?.state !== "blocked") redirect("/aluno");
  return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl font-bold">{actor.membership.workspaceName} {t("está temporariamente indisponível")}</h1>
      <p className="mt-3 leading-relaxed text-muted">
        {t("A assinatura da consultoria no SalesFit está pausada. Seus treinos, histórico e fotos continuam guardados e voltam assim que seu treinador regularizar.")}
      </p>
      <Link href="/conta" className={`${buttonClass("secondary")} mt-6`}>
        {t("Minha conta e meus dados")}
      </Link>
    </section>
  );
}
