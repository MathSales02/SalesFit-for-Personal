"use client";

import Link from "next/link";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { forgotPasswordAction, loginAction, mfaLoginAction, registerAction, resendVerificationAction, resetPasswordAction, verifyEmailAction } from "./actions";
import { useT } from "@/i18n/client";

const link = "font-semibold text-turf underline-offset-4 hover:underline";

export function LoginForm() {
  const t = useT();
  return (
    <ActionForm action={loginAction}>
      {(s) => (
        <>
          <Field label={t("E-mail")} name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <Field label={t("Senha")} name="password" type="password" autoComplete="current-password" errors={fieldErrors(s, "password")} />
          <div className="-mt-2 flex justify-end">
            <Link href="/esqueci-senha" className={`text-sm ${link}`}>
              {t("Esqueci minha senha")}
            </Link>
          </div>
          <SubmitButton full pendingLabel={t("Entrando…")}>
            {t("Entrar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RegisterForm() {
  const t = useT();
  return (
    <ActionForm action={registerAction}>
      {(s) => (
        <>
          <Field label={t("Seu nome")} name="displayName" autoComplete="name" maxLength={80} errors={fieldErrors(s, "displayName")} />
          <Field
            label={t("Nome da consultoria")}
            name="workspaceName"
            autoComplete="organization"
            maxLength={80}
            hint={t("É o nome que seus alunos vão ver.")}
            errors={fieldErrors(s, "workspaceName")}
          />
          <Field label={t("E-mail")} name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <Field
            label={t("Senha")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint={t("Pelo menos 10 caracteres. Uma frase longa é mais segura e fácil de lembrar.")}
            errors={fieldErrors(s, "password")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-turf" aria-invalid={!!fieldErrors(s, "acceptTerms")} />
              <span>
                {t("Li e aceito os")}{" "}
                <Link href="/termos" className={link} target="_blank">
                  {t("Termos de uso")}
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className={link} target="_blank">
                  {t("Política de privacidade")}
                </Link>
                {t(". Declaro ter 18 anos ou mais.")}
              </span>
            </label>
            {fieldErrors(s, "acceptTerms") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "acceptTerms")!.join(" ")}</p>}
          </div>
          <SubmitButton full pendingLabel={t("Criando conta…")}>
            {t("Criar conta grátis")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ForgotPasswordForm() {
  const t = useT();
  return (
    <ActionForm action={forgotPasswordAction}>
      {(s) => (
        <>
          <Field label={t("E-mail da conta")} name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <SubmitButton full pendingLabel={t("Enviando…")}>
            {t("Enviar link")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResendVerificationForm() {
  const t = useT();
  return (
    <ActionForm action={resendVerificationAction}>
      {(s) => (
        <>
          <Field label={t("E-mail da conta")} name="email" type="email" autoComplete="email" errors={fieldErrors(s, "email")} />
          <SubmitButton full pendingLabel={t("Enviando…")}>
            {t("Reenviar link")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  return (
    <ActionForm action={resetPasswordAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field
            label={t("Nova senha")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint={t("Pelo menos 10 caracteres.")}
            errors={fieldErrors(s, "password")}
          />
          <Field label={t("Repita a nova senha")} name="confirmPassword" type="password" autoComplete="new-password" errors={fieldErrors(s, "confirmPassword")} />
          {fieldErrors(s, "token") && <p className="text-sm font-medium text-danger">{t("Link inválido. Peça um novo.")}</p>}
          <SubmitButton full pendingLabel={t("Salvando…")}>
            {t("Salvar nova senha")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** The token is only consumed on an explicit click: link scanners that open URLs cannot burn it. */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useT();
  return (
    <ActionForm action={verifyEmailAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          {fieldErrors(s, "token") && <p className="text-sm font-medium text-danger">{t("Link inválido. Peça um novo.")}</p>}
          <SubmitButton full pendingLabel={t("Confirmando…")}>
            {t("Confirmar meu e-mail")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function MfaLoginForm() {
  const t = useT();
  return (
    <ActionForm action={mfaLoginAction}>
      {(s) => (
        <>
          <Field
            label={t("Código do aplicativo autenticador")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={20}
            hint={t("Perdeu o celular? Digite um dos códigos de recuperação.")}
            errors={fieldErrors(s, "code")}
          />
          <SubmitButton full pendingLabel={t("Verificando…")}>
            {t("Continuar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
