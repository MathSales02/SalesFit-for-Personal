import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Logo />
      <h1 className="mt-10 font-display text-4xl font-bold">{t("Página não encontrada")}</h1>
      <p className="mt-3 text-muted">{t("O endereço pode estar errado ou você não tem acesso a ele.")}</p>
      <Link href="/inicio" className="mt-8 font-semibold text-turf underline-offset-4 hover:underline">
        {t("Ir para o início")}
      </Link>
    </main>
  );
}
