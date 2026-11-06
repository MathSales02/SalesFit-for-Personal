import "server-only";
import { env } from "../env";
import type { Mail } from "./mailer";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#123f30;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#56635d">Se o botão não funcionar, copie este endereço no navegador:<br>${escapeHtml(action.url)}</p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#14201b;background:#f3f5f2;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;padding:32px;border-radius:8px">
  <h1 style="font-size:20px;margin:0 0 20px">${escapeHtml(title)}</h1>${body}${button}
  <p style="margin:24px 0 0;font-size:12px;color:#56635d">Cadência · Você recebeu este e-mail porque ele está associado a uma conta na plataforma.</p>
  </div></body></html>`;
}

function textLayout(paragraphs: string[], url?: string) {
  return [...paragraphs, ...(url ? ["", url] : [])].join("\n\n");
}

export function verificationEmail(to: string, name: string, token: string): Mail {
  const url = `${env().APP_URL}/verificar-email?token=${token}`;
  const p = [`Olá, ${name}.`, "Confirme seu e-mail para ativar sua conta. O link vale por 24 horas e só pode ser usado uma vez."];
  return { to, subject: "Confirme seu e-mail", text: textLayout(p, url), html: layout("Confirme seu e-mail", p, { label: "Confirmar e-mail", url }) };
}

export function existingAccountEmail(to: string): Mail {
  const url = `${env().APP_URL}/entrar`;
  const p = [
    "Alguém tentou criar uma conta com este e-mail, mas ele já está cadastrado.",
    "Se foi você, entre normalmente ou use \"Esqueci minha senha\". Se não foi, pode ignorar esta mensagem.",
  ];
  return { to, subject: "Tentativa de cadastro com seu e-mail", text: textLayout(p, url), html: layout("Seu e-mail já tem conta", p, { label: "Entrar", url }) };
}

export function passwordResetEmail(to: string, token: string): Mail {
  const url = `${env().APP_URL}/redefinir-senha?token=${token}`;
  const p = [
    "Recebemos um pedido para redefinir sua senha. O link vale por 30 minutos e só pode ser usado uma vez.",
    "Se você não pediu isso, ignore este e-mail. Sua senha continua a mesma.",
  ];
  return { to, subject: "Redefinição de senha", text: textLayout(p, url), html: layout("Redefinir senha", p, { label: "Criar nova senha", url }) };
}

export function passwordChangedEmail(to: string): Mail {
  const p = [
    "A senha da sua conta foi alterada e as outras sessões foram encerradas.",
    "Se não foi você, redefina sua senha imediatamente e fale com o suporte.",
  ];
  return { to, subject: "Sua senha foi alterada", text: textLayout(p), html: layout("Senha alterada", p) };
}
