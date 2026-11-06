import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <>
      <AuthHeading title="Criar nova senha">Depois de salvar, todas as sessões abertas serão encerradas.</AuthHeading>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Notice tone="error">
          Link inválido.{" "}
          <Link href="/esqueci-senha" className="font-semibold underline">
            Peça um novo
          </Link>
          .
        </Notice>
      )}
    </>
  );
}
