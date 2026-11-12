import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { getMfaState } from "@/server/auth/mfa";
import { requirePageActor } from "@/server/http/next";
import { ConfirmForm, DisableForm, RegenerateForm, StartForm } from "./forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Verificação em duas etapas") };
}

const panel = "max-w-xl rounded-[var(--radius-panel)] border border-line bg-paper p-5";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ obrigatorio?: string }> }) {
  const t = await getT();
  const actor = await requirePageActor(undefined, { allowInactive: true });
  const { obrigatorio } = await searchParams;
  const state = await getMfaState(actor);

  return (
    <AppShell actor={actor}>
      <Link href="/conta" className="text-sm font-semibold text-turf hover:underline">
        {t("← Conta")}
      </Link>
      <PageHeading
        title={t("Verificação em duas etapas")}
        description={t("Além da senha, o login pede um código que muda a cada 30 segundos no seu celular (Google Authenticator, Microsoft Authenticator, Authy ou similar).")}
      />
      {obrigatorio && state.status !== "on" && (
        <div className="mb-6 max-w-xl">
          <Notice tone="warning">{t("A administração da plataforma só abre com a verificação em duas etapas ativa.")}</Notice>
        </div>
      )}

      {state.status === "off" && (
        <section className={panel}>
          <p className="mb-4 text-sm text-muted">{t("Protege sua conta mesmo que alguém descubra sua senha.")}</p>
          <StartForm label={t("Configurar")} />
        </section>
      )}

      {state.status === "pending" && (
        <section className={`${panel} flex flex-col gap-5`}>
          <div>
            <p className="font-semibold">{t("1. Escaneie o QR code no aplicativo autenticador")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
            <img src={state.qr} alt={t("QR code para o aplicativo autenticador")} width={220} height={220} className="mt-3 rounded border border-line" />
            <p className="mt-3 text-sm text-muted">
              {t("Não consegue escanear? Digite a chave:")} <code className="font-mono break-all text-ink">{state.secret.match(/.{1,4}/g)!.join(" ")}</code>
            </p>
          </div>
          <div>
            <p className="mb-3 font-semibold">{t("2. Digite o código que aparece no aplicativo")}</p>
            <ConfirmForm />
          </div>
          <div className="border-t border-line pt-4">
            <StartForm label={t("Gerar outro QR code")} secondary />
          </div>
        </section>
      )}

      {state.status === "on" && (
        <div className="flex flex-col gap-6">
          <section className={panel}>
            <p className="font-semibold text-turf">{t("Ativa")}</p>
            <p className="mt-1 text-sm text-muted">
              {state.remaining} {state.remaining === 1 ? t("código de recuperação disponível") : t("códigos de recuperação disponíveis")}.
            </p>
          </section>
          <section className={panel}>
            <h2 className="mb-1 font-semibold">{t("Novos códigos de recuperação")}</h2>
            <p className="mb-4 text-sm text-muted">{t("Use se perdeu os códigos ou já gastou alguns. Os anteriores deixam de valer.")}</p>
            <RegenerateForm />
          </section>
          {!actor.isPlatformAdmin && (
            <details className={panel}>
              <summary className="cursor-pointer font-semibold text-danger">{t("Desativar")}</summary>
              <div className="mt-4">
                <DisableForm />
              </div>
            </details>
          )}
        </div>
      )}
    </AppShell>
  );
}
