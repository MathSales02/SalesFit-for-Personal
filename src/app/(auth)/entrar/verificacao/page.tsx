import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { currentActor, readMfaChallengeCookie } from "@/server/http/next";
import { MfaLoginForm } from "../../forms";

export const metadata: Metadata = { title: "Verificação" };

export default async function MfaLoginPage() {
  if (await currentActor()) redirect("/inicio");
  if (!(await readMfaChallengeCookie())) redirect("/entrar");
  return (
    <>
      <AuthHeading title="Verificação em duas etapas">Abra o aplicativo autenticador e digite o código do SalesFit.</AuthHeading>
      <MfaLoginForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </>
  );
}
