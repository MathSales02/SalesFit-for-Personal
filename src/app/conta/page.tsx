import type { Metadata } from "next";
import { logoutAction } from "@/app/(auth)/actions";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button-styles";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { listActiveSessions } from "@/server/auth/service";
import { requirePageActor } from "@/server/http/next";
import { ChangePasswordForm, RevokeOthersButton, RevokeSessionButton } from "./forms";

export const metadata: Metadata = { title: "Conta e segurança" };

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Rough, privacy-friendly device label from the stored user agent. */
function deviceLabel(ua: string | null) {
  if (!ua) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} no ${os}` : browser;
}

export default async function AccountPage() {
  const actor = await requirePageActor();
  const sessions = await listActiveSessions(actor.userId);

  return (
    <AppShell actor={actor}>
      <PageHeading title="Conta e segurança" />

      <section aria-labelledby="profile-h" className="border-b border-line pb-10">
        <h2 id="profile-h" className="text-lg font-semibold">
          Perfil
        </h2>
        <dl className="mt-4 grid max-w-md gap-3 text-sm">
          <div>
            <dt className="text-muted">Nome</dt>
            <dd className="font-semibold">{actor.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted">E-mail</dt>
            <dd className="font-semibold">{actor.email}</dd>
          </div>
        </dl>
        {!actor.emailVerified && (
          <div className="mt-4 max-w-md">
            <Notice tone="warning">Seu e-mail ainda não foi confirmado.</Notice>
          </div>
        )}
      </section>

      <section aria-labelledby="password-h" className="border-b border-line py-10">
        <h2 id="password-h" className="text-lg font-semibold">
          Alterar senha
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">Ao alterar, as sessões em outros dispositivos são encerradas.</p>
        <ChangePasswordForm />
      </section>

      <section aria-labelledby="sessions-h" className="py-10">
        <h2 id="sessions-h" className="text-lg font-semibold">
          Sessões ativas
        </h2>
        <p className="mt-1 text-sm text-muted">Encerre qualquer sessão que você não reconheça.</p>
        <ul className="mt-5 max-w-2xl divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {deviceLabel(s.userAgent)}
                  {s.id === actor.sessionId && <span className="ml-2 rounded bg-turf-tint px-1.5 py-0.5 text-xs font-semibold text-turf">Este dispositivo</span>}
                </p>
                <p className="text-sm text-muted">Último acesso em {fmt.format(s.lastSeenAt)}</p>
              </div>
              {s.id !== actor.sessionId && <RevokeSessionButton sessionId={s.id} />}
            </li>
          ))}
        </ul>
        {sessions.length > 1 && (
          <div className="mt-5">
            <RevokeOthersButton />
          </div>
        )}
        <form action={logoutAction} className="mt-8">
          <button type="submit" className={buttonClass("secondary")}>
            Sair desta conta
          </button>
        </form>
      </section>
    </AppShell>
  );
}
