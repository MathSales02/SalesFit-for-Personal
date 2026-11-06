import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { ForgotPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Nova senha">Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.</AuthHeading>
      <ForgotPasswordForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </>
  );
}
