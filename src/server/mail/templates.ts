import "server-only";
import type { Translate } from "@/i18n/config";
import { getLocale, getT } from "@/i18n/server";
import { env } from "../env";
import type { Mail } from "./mailer";

/**
 * Emails are written in the language of the request that sends them: the person signing up or
 * asking for a new password, or the trainer sending an invitation (who most likely shares the
 * student's language). Outside a request (jobs, tests) they are in Portuguese.
 */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function compose(subject: string, title: string, paragraphs: string[], action?: { label: string; url: string }): Promise<Omit<Mail, "to">> {
  const [t, lang] = await Promise.all([getT(), getLocale()]);
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#f2690f;color:#0e0f11;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6b6f76">${escapeHtml(t("Se o botão não funcionar, copie este endereço no navegador:"))}<br>${escapeHtml(action.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:Arial,sans-serif;color:#0e0f11;background:#f7f5f2;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;padding:32px;border-radius:16px">
  <h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(title)}</h1>${body}${button}
  <p style="margin:24px 0 0;font-size:12px;color:#6b6f76">${escapeHtml(t("SalesFit · Você recebeu este e-mail porque ele está associado a uma conta na plataforma."))}</p>
  </div></body></html>`;
  const text = [...paragraphs, ...(action ? ["", action.url] : [])].join("\n\n");
  return { subject, text, html };
}

const tr = (): Promise<Translate> => getT();

export async function verificationEmail(to: string, name: string, token: string): Promise<Mail> {
  const t = await tr();
  const url = `${env().APP_URL}/verificar-email?token=${token}`;
  const p = [t("Olá, {name}.", { name }), t("Confirme seu e-mail para ativar sua conta. O link vale por 24 horas e só pode ser usado uma vez.")];
  return { to, ...(await compose(t("Confirme seu e-mail"), t("Confirme seu e-mail"), p, { label: t("Confirmar e-mail"), url })) };
}

export async function existingAccountEmail(to: string): Promise<Mail> {
  const t = await tr();
  const url = `${env().APP_URL}/entrar`;
  const p = [
    t("Alguém tentou criar uma conta com este e-mail, mas ele já está cadastrado."),
    t("Se foi você, entre normalmente ou use \"Esqueci minha senha\". Se não foi, pode ignorar esta mensagem."),
  ];
  return { to, ...(await compose(t("Tentativa de cadastro com seu e-mail"), t("Seu e-mail já tem conta"), p, { label: t("Entrar"), url })) };
}

export async function passwordResetEmail(to: string, token: string): Promise<Mail> {
  const t = await tr();
  const url = `${env().APP_URL}/redefinir-senha?token=${token}`;
  const p = [
    t("Recebemos um pedido para redefinir sua senha. O link vale por 30 minutos e só pode ser usado uma vez."),
    t("Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma."),
  ];
  return { to, ...(await compose(t("Redefinição de senha"), t("Redefinir senha"), p, { label: t("Criar nova senha"), url })) };
}

export async function invitationEmail(to: string, trainerName: string, workspaceName: string, token: string): Promise<Mail> {
  const t = await tr();
  const url = `${env().APP_URL}/convite?token=${token}`;
  const p = [
    t("{trainer} convidou você para treinar com {workspace} no SalesFit.", { trainer: trainerName, workspace: workspaceName }),
    t("Lá você encontra seus treinos, registra sua evolução e participa da comunidade da consultoria. O convite vale por 7 dias."),
  ];
  return { to, ...(await compose(t("Convite de {workspace}", { workspace: workspaceName }), t("Você foi convidado"), p, { label: t("Aceitar convite"), url })) };
}

export async function passwordChangedEmail(to: string): Promise<Mail> {
  const t = await tr();
  const p = [t("A senha da sua conta foi alterada e as outras sessões foram encerradas."), t("Se não foi você, redefina sua senha imediatamente e fale com o suporte.")];
  return { to, ...(await compose(t("Sua senha foi alterada"), t("Senha alterada"), p)) };
}

export async function supportAccessEmail(to: string, workspaceName: string, reason: string, minutes: number): Promise<Mail> {
  const t = await tr();
  const url = `${env().APP_URL}/treinador`;
  const p = [
    t("A equipe do SalesFit abriu um acesso de suporte temporário à consultoria {workspace}, válido por {minutes} minutos.", { workspace: workspaceName, minutes }),
    t("Motivo informado: {reason}", { reason }),
    t("O acesso é somente leitura e não inclui dados de saúde, fotos, mensagens nem publicações. Tudo fica registrado e aparece na sua visão geral."),
    t("Se você não reconhece este pedido, responda a este e-mail."),
  ];
  return { to, ...(await compose(t("Acesso de suporte à sua consultoria"), t("Acesso de suporte aberto"), p, { label: t("Ver na visão geral"), url })) };
}

export async function mfaChangedEmail(to: string, enabled: boolean): Promise<Mail> {
  const t = await tr();
  const p = enabled
    ? [t("A verificação em duas etapas foi ativada na sua conta. A partir de agora, o login pede um código do aplicativo autenticador."), t("Guarde os códigos de recuperação em lugar seguro.")]
    : [t("A verificação em duas etapas foi desativada na sua conta."), t("Se não foi você, redefina sua senha imediatamente e fale com o suporte.")];
  const title = enabled ? t("Verificação em duas etapas ativada") : t("Verificação em duas etapas desativada");
  return { to, ...(await compose(title, title, p)) };
}
