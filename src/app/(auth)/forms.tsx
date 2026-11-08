"use client";

import Link from "next/link";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { forgotPasswordAction, loginAction, mfaLoginAction, registerAction, resendVerificationAction, resetPasswordAction, verifyEmailAction } from "./actions";

const link = "font-semibold text-turf underline-offset-4 hover:underline";

export function LoginForm() {
  return (
    <ActionForm action={loginAction}>
      {(s) => (
        <>
          <Field label="E-mail" name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <Field label="Senha" name="password" type="password" autoComplete="current-password" errors={fieldErrors(s, "password")} />
          <div className="-mt-2 flex justify-end">
            <Link href="/esqueci-senha" className={`text-sm ${link}`}>
              Esqueci minha senha
            </Link>
          </div>
          <SubmitButton full pendingLabel="Entrando…">
            Entrar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RegisterForm() {
  return (
    <ActionForm action={registerAction}>
      {(s) => (
        <>
          <Field label="Seu nome" name="displayName" autoComplete="name" maxLength={80} errors={fieldErrors(s, "displayName")} />
          <Field
            label="Nome da consultoria"
            name="workspaceName"
            autoComplete="organization"
            maxLength={80}
            hint="É o nome que seus alunos vão ver."
            errors={fieldErrors(s, "workspaceName")}
          />
          <Field label="E-mail" name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint="Pelo menos 10 caracteres. Uma frase longa é mais segura e fácil de lembrar."
            errors={fieldErrors(s, "password")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-turf" aria-invalid={!!fieldErrors(s, "acceptTerms")} />
              <span>
                Li e aceito os{" "}
                <Link href="/termos" className={link} target="_blank">
                  Termos de uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className={link} target="_blank">
                  Política de privacidade
                </Link>
                . Declaro ter 18 anos ou mais.
              </span>
            </label>
            {fieldErrors(s, "acceptTerms") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "acceptTerms")!.join(" ")}</p>}
          </div>
          <SubmitButton full pendingLabel="Criando conta…">
            Criar conta grátis
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  return (
    <ActionForm action={forgotPasswordAction}>
      {(s) => (
        <>
          <Field label="E-mail da conta" name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <SubmitButton full pendingLabel="Enviando…">
            Enviar link
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResendVerificationForm() {
  return (
    <ActionForm action={resendVerificationAction}>
      {(s) => (
        <>
          <Field label="E-mail da conta" name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <SubmitButton full pendingLabel="Enviando…">
            Reenviar link
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPasswordAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field
            label="Nova senha"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint="Pelo menos 10 caracteres."
            errors={fieldErrors(s, "password")}
          />
          <Field label="Repita a nova senha" name="confirmPassword" type="password" autoComplete="new-password" errors={fieldErrors(s, "confirmPassword")} />
          {fieldErrors(s, "token") && <p className="text-sm font-medium text-danger">Link inválido. Peça um novo.</p>}
          <SubmitButton full pendingLabel="Salvando…">
            Salvar nova senha
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** The token is only consumed on an explicit click: link scanners that open URLs cannot burn it. */
export function VerifyEmailForm({ token }: { token: string }) {
  return (
    <ActionForm action={verifyEmailAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          {fieldErrors(s, "token") && <p className="text-sm font-medium text-danger">Link inválido. Peça um novo.</p>}
          <SubmitButton full pendingLabel="Confirmando…">
            Confirmar meu e-mail
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function MfaLoginForm() {
  return (
    <ActionForm action={mfaLoginAction}>
      {(s) => (
        <>
          <Field
            label="Código do aplicativo autenticador"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={20}
            hint="Perdeu o celular? Digite um dos códigos de recuperação."
            errors={fieldErrors(s, "code")}
          />
          <SubmitButton full pendingLabel="Verificando…">
            Continuar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
