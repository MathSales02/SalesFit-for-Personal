"use client";
import { useT } from "@/i18n/client";

/** Generic error screen. Details stay in the server logs; only a reference code is shown. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <h1 className="font-display text-4xl font-bold">{t("Algo deu errado")}</h1>
      <p className="mt-3 text-muted">
        {t("Tente de novo. Se continuar, fale com o suporte")}{error.digest ? t(" informando o código {0}", { 0: error.digest }) : ""}.
      </p>
      <button type="button" onClick={reset} className="mt-8 self-start font-semibold text-turf underline-offset-4 hover:underline">
        {t("Tentar novamente")}
      </button>
    </main>
  );
}
