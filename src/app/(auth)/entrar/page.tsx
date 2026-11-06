import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { currentActor } from "@/server/http/next";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  "email-confirmado": "E-mail confirmado. Agora é só entrar.",
  "senha-redefinida": "Senha redefinida. Entre com a nova senha.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  if (await currentActor()) redirect("/inicio");
  const { aviso } = await searchParams;
  const notice = aviso ? NOTICES[aviso] : undefined;
  return (
    <>
      <AuthHeading title="Entrar">Bom te ver de novo.</AuthHeading>
      {notice && (
        <div className="mb-6">
          <Notice tone="success">{notice}</Notice>
        </div>
      )}
      <LoginForm />
      <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          É personal trainer e ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-turf underline-offset-4 hover:underline">
            Crie a sua
          </Link>
        </p>
        <p>
          Aluno? Use o convite enviado pelo seu treinador.{" "}
          <Link href="/reenviar-confirmacao" className="font-semibold text-turf underline-offset-4 hover:underline">
            Não recebi o e-mail de confirmação
          </Link>
        </p>
      </div>
    </>
  );
}
