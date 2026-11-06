import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { VerifyEmailForm } from "../forms";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <>
      <AuthHeading title="Confirmar e-mail">Falta só um clique para ativar sua conta.</AuthHeading>
      {valid ? (
        <VerifyEmailForm token={token} />
      ) : (
        <Notice tone="error">
          Link inválido.{" "}
          <Link href="/reenviar-confirmacao" className="font-semibold underline">
            Peça um novo
          </Link>
          .
        </Notice>
      )}
    </>
  );
}
