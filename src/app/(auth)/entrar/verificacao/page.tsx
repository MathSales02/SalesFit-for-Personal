import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/ui/page-heading";
import { currentActor, readMfaChallengeCookie } from "@/server/http/next";
import { MfaLoginForm } from "../../forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Verificação") };
}

export default async function MfaLoginPage() {
  const t = await getT();
  if (await currentActor()) redirect("/inicio");
  if (!(await readMfaChallengeCookie())) redirect("/entrar");
  return (
    <>
      <AuthHeading title={t("Verificação em duas etapas")}>{t("Abra o aplicativo autenticador e digite o código do SalesFit.")}</AuthHeading>
      <MfaLoginForm />
      <p className="mt-8 border-t border-line pt-6 text-sm text-muted">
        <Link href="/entrar" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("Voltar ao login")}
        </Link>
      </p>
    </>
  );
}
