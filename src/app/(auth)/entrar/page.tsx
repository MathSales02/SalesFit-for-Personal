import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { Notice } from "@/components/ui/notice";
import { currentActor } from "@/server/http/next";
import { LoginForm } from "../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Entrar") };
}

const NOTICES: Record<string, string> = {
  "email-confirmado": "E-mail confirmado. Agora é só entrar.",
  "senha-redefinida": "Senha redefinida. Entre com a nova senha.",
  "conta-excluida": "Sua conta e seus dados foram excluídos.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const t = await getT();
  if (await currentActor()) redirect("/inicio");
  const { aviso } = await searchParams;
  const notice = aviso ? NOTICES[aviso] : undefined;
  return (
    <>
      <AuthHeading title={t("Entrar")}>{t("Bom te ver de novo.")}</AuthHeading>
      {notice && (
        <div className="mb-6">
          <Notice tone="success">{t(notice)}</Notice>
        </div>
      )}
      <LoginForm />
      <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-sm text-muted">
        <p>
          {t("É personal trainer e ainda não tem conta?")}{" "}
          <Link href="/cadastro" className="font-semibold text-turf underline-offset-4 hover:underline">
            {t("Crie a sua")}
          </Link>
        </p>
        <p>
          {t("Aluno? Use o convite enviado pelo seu treinador.")}{" "}
          <Link href="/reenviar-confirmacao" className="font-semibold text-turf underline-offset-4 hover:underline">
            {t("Não recebi o e-mail de confirmação")}
          </Link>
        </p>
      </div>
    </>
  );
}
