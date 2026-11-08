import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { AppShell } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button-styles";
import { Notice } from "@/components/ui/notice";
import { PageHeading } from "@/components/ui/page-heading";
import { listActiveSessions } from "@/server/auth/service";
import { requirePageActor } from "@/server/http/next";
import { cookies } from "next/headers";
import { ThemePicker } from "@/components/theme/theme-picker";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { ChangePasswordForm, DeleteAccountForm, RevokeOthersButton, RevokeSessionButton } from "./forms";

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
  const actor = await requirePageActor(undefined, { allowInactive: true });
  const sessions = await listActiveSessions(actor.userId);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

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
        {actor.membership?.role === "student" && (
          <nav aria-label="Seus dados" className="mt-6 flex max-w-md flex-col divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper">
            {[
              ["/aluno/comunidade/membro/" + actor.membership.memberId, "Meu perfil na comunidade", "Suas publicações, seguidores e quem você segue."],
              ["/aluno/saude", "Saúde e privacidade", "Lesões, restrições e o que seu treinador pode ver."],
              ["/aluno/progresso", "Progresso", "Medidas e fotos, privadas por padrão."],
            ].map(([href, label, hint]) => (
              <Link key={href} href={href!} className="px-4 py-3 hover:bg-chalk">
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted">{hint}</span>
              </Link>
            ))}
          </nav>
        )}
      </section>

      <section aria-labelledby="look-h" className="border-b border-line py-10">
        <h2 id="look-h" className="text-lg font-semibold">
          Aparência
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">&quot;Seguir o sistema&quot; usa o tema claro ou escuro do seu aparelho.</p>
        <ThemePicker current={theme} />
      </section>

      <section aria-labelledby="password-h" className="border-b border-line py-10">
        <h2 id="password-h" className="text-lg font-semibold">
          Alterar senha
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted">Ao alterar, as sessões em outros dispositivos são encerradas.</p>
        <ChangePasswordForm />
        <Link href="/conta/duas-etapas" className="mt-8 flex max-w-md items-center justify-between rounded-[var(--radius-panel)] border border-line bg-paper px-4 py-3 hover:bg-chalk">
          <span>
            <span className="block font-semibold">Verificação em duas etapas</span>
            <span className="block text-sm text-muted">{actor.mfaEnabled ? "Ativa" : "Desativada. Recomendado para proteger sua conta."}</span>
          </span>
          <span aria-hidden className="text-muted">→</span>
        </Link>
      </section>

      <section aria-labelledby="sessions-h" className="border-b border-line py-10">
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

      <section aria-labelledby="privacy-h" className="py-10">
        <h2 id="privacy-h" className="text-lg font-semibold">
          Seus dados (LGPD)
        </h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Baixe uma cópia de tudo o que o SalesFit guarda sobre você, em um arquivo que outros sistemas conseguem ler.</p>
        <a href="/conta/meus-dados" download className={`${buttonClass("secondary")} mt-5`}>
          Baixar meus dados
        </a>

        <details className="mt-10 max-w-md rounded-[var(--radius-panel)] border border-danger/40 bg-paper p-5">
          <summary className="cursor-pointer font-semibold text-danger">Excluir minha conta</summary>
          {actor.membership?.role === "trainer" || actor.isPlatformAdmin ? (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Como dono de uma consultoria, a exclusão precisa ser combinada: a consultoria é encerrada e seus alunos são avisados antes. Fale com o suporte pelo
              e-mail de contato da página de privacidade.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-muted">
                Apaga para sempre sua conta, treinos, histórico, saúde, medidas, fotos, publicações, comentários, mensagens e pontos. Não dá para desfazer. Se quiser
                guardar algo, baixe seus dados antes.
              </p>
              <DeleteAccountForm />
            </div>
          )}
        </details>
      </section>
    </AppShell>
  );
}
