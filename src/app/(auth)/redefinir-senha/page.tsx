import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { ResetPasswordForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Redefinir senha") };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <>
      <AuthHeading title={t("Criar nova senha")}>{t("Depois de salvar, todas as sessões abertas serão encerradas.")}</AuthHeading>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Notice tone="error">
          {t("Link inválido.")}{" "}
          <Link href="/esqueci-senha" className="font-semibold underline">
            {t("Peça um novo")}
          </Link>
          .
        </Notice>
      )}
    </>
  );
}
