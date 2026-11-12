import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { VerifyEmailForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Confirmar e-mail") };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getT();
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <>
      <AuthHeading title={t("Confirmar e-mail")}>{t("Falta só um clique para ativar sua conta.")}</AuthHeading>
      {valid ? (
        <VerifyEmailForm token={token} />
      ) : (
        <Notice tone="error">
          {t("Link inválido.")}{" "}
          <Link href="/reenviar-confirmacao" className="font-semibold underline">
            {t("Peça um novo")}
          </Link>
          .
        </Notice>
      )}
    </>
  );
}
