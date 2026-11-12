import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { ForgotPasswordForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Esqueci minha senha") };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <>
      <AuthHeading title={t("Nova senha")}>{t("Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.")}</AuthHeading>
      <ForgotPasswordForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("Voltar para o login")}
        </Link>
      </p>
    </>
  );
}
