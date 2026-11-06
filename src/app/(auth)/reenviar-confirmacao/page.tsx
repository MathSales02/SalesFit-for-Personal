import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { ResendVerificationForm } from "../forms";

export const metadata: Metadata = { title: "Reenviar confirmação" };

export default function ResendPage() {
  return (
    <>
      <AuthHeading title="Reenviar confirmação">Enviaremos um novo link de confirmação para o seu e-mail.</AuthHeading>
      <ResendVerificationForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  );
}
