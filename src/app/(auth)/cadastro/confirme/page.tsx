import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Confirme seu e-mail") };
}

export default async function ConfirmEmailPage() {
  const t = await getT();
  return (
    <>
      <AuthHeading title={t("Confira seu e-mail")}>
        {t("Enviamos um link para confirmar seu endereço. Ele vale por 24 horas. Depois de confirmar, é só entrar.")}
      </AuthHeading>
      <p className="text-sm text-muted">
        {t("Não chegou? Veja a caixa de spam ou")}{" "}
        <Link href="/reenviar-confirmacao" className="font-semibold text-turf underline-offset-4 hover:underline">
          {t("peça um novo link")}
        </Link>
        .
      </p>
    </>
  );
}
