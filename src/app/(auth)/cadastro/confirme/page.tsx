import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/ui/page-heading";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

export default function ConfirmEmailPage() {
  return (
    <>
      <AuthHeading title="Confira seu e-mail">
        Enviamos um link para confirmar seu endereço. Ele vale por 24 horas. Depois de confirmar, é só entrar.
      </AuthHeading>
      <p className="text-sm text-muted">
        Não chegou? Veja a caixa de spam ou{" "}
        <Link href="/reenviar-confirmacao" className="font-semibold text-turf underline-offset-4 hover:underline">
          peça um novo link
        </Link>
        .
      </p>
    </>
  );
}
