"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  forgotPasswordSchema,
  loginSchema,
  registerTrainerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/action-result";
import { completeMfaLogin, login, logout, registerTrainer, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from "@/server/auth/service";
import { parseForm, runAction } from "@/server/http/action";
import { clearMfaChallengeCookie, clearSessionCookie, currentActor, readMfaChallengeCookie, requestMeta, setMfaChallengeCookie, setSessionCookie } from "@/server/http/next";
import { AppError } from "@/server/lib/errors";

// Every action re-validates its input on the server; nothing from the client is trusted.

export async function loginAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("login", async () => {
    const input = parseForm(loginSchema, form);
    const result = await login(input, await requestMeta());
    if ("mfaRequired" in result) {
      await setMfaChallengeCookie(result.challenge);
      redirect("/entrar/verificacao");
    }
    await setSessionCookie(result.token, result.expiresAt);
    redirect("/inicio");
  });
}

export async function registerAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("register", async () => {
    const input = parseForm(registerTrainerSchema, form);
    await registerTrainer(input, await requestMeta());
    redirect("/cadastro/confirme");
  });
}

export async function forgotPasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("forgot_password", async () => {
    const { email } = parseForm(forgotPasswordSchema, form);
    await requestPasswordReset(email, await requestMeta());
    return { ok: true, message: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 30 minutos." };
  });
}

export async function resendVerificationAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("resend_verification", async () => {
    const { email } = parseForm(forgotPasswordSchema, form);
    await resendVerification(email, await requestMeta());
    return { ok: true, message: "Se esse e-mail estiver aguardando confirmação, enviamos um novo link." };
  });
}

export async function resetPasswordAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("reset_password", async () => {
    const input = parseForm(resetPasswordSchema, form);
    const ok = await resetPassword(input.token, input.password, await requestMeta());
    if (!ok) throw new AppError("NOT_FOUND", "Este link é inválido ou expirou. Peça um novo.");
    redirect("/entrar?aviso=senha-redefinida");
  });
}

export async function verifyEmailAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("verify_email", async () => {
    const { token } = parseForm(verifyEmailSchema, form);
    const ok = await verifyEmail(token, await requestMeta());
    if (!ok) throw new AppError("NOT_FOUND", "Este link é inválido, expirou ou já foi usado.");
    redirect("/entrar?aviso=email-confirmado");
  });
}

export async function logoutAction(): Promise<void> {
  const actor = await currentActor();
  if (actor) await logout(actor.sessionId, actor.userId, await requestMeta());
  await clearSessionCookie();
  redirect("/entrar");
}

export async function mfaLoginAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction("mfa_login", async () => {
    const { code } = parseForm(z.strictObject({ code: z.string().trim().min(6, "Digite o código.").max(20) }), form);
    const challenge = await readMfaChallengeCookie();
    if (!challenge) throw new AppError("UNAUTHENTICATED", "O tempo para digitar o código acabou. Entre de novo com e-mail e senha.");
    const session = await completeMfaLogin({ challenge, code }, await requestMeta());
    await clearMfaChallengeCookie();
    await setSessionCookie(session.token, session.expiresAt);
    redirect("/inicio");
  });
}
