import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { currentActor } from "@/server/http/next";
import { RegisterForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Criar conta") };
}

export default async function RegisterPage() {
  const t = await getT();
  if (await currentActor()) redirect("/inicio");
  return (
    <>
      <AuthHeading title={t("Crie sua consultoria")}>{t("7 dias grátis, sem cartão. Seus alunos entram por convite.")}</AuthHeading>
      <RegisterForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        {t("Já tem conta?")}{" "}
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("Entrar")}
        </Link>
      </p>
    </>
  );
}
