import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { ResendVerificationForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Reenviar confirmação") };
}

export default async function ResendPage() {
  const t = await getT();
  return (
    <>
      <AuthHeading title={t("Reenviar confirmação")}>{t("Enviaremos um novo link de confirmação para o seu e-mail.")}</AuthHeading>
      <ResendVerificationForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("Voltar para o login")}
        </Link>
      </p>
    </>
  );
}
