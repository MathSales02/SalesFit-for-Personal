"use client";

import Link from "next/link";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { acceptAsCurrentUserAction, acceptWithNewAccountAction } from "./actions";
import { useT } from "@/i18n/client";

const link = "font-semibold text-turf underline-offset-4 hover:underline";

export function NewAccountForm({ token, email }: { token: string; email: string }) {
  const t = useT();
  return (
    <ActionForm action={acceptWithNewAccountAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t("E-mail")}</span>
            <span className="text-base text-ink-soft">{email}</span>
          </div>
          <Field label={t("Seu nome")} name="displayName" autoComplete="name" maxLength={80} errors={fieldErrors(s, "displayName")} />
          <Field
            label={t("Crie uma senha")}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint={t("Pelo menos 10 caracteres.")}
            errors={fieldErrors(s, "password")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-turf" />
              <span>
                {t("Li e aceito os")}{" "}
                <Link href="/termos" className={link} target="_blank">
                  {t("Termos de uso")}
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className={link} target="_blank">
                  {t("Política de privacidade")}
                </Link>
                {t(". Se tenho menos de 18 anos, meu responsável legal autorizou o uso.")}
              </span>
            </label>
            {fieldErrors(s, "acceptTerms") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "acceptTerms")!.join(" ")}</p>}
          </div>
          <SubmitButton full pendingLabel={t("Entrando…")}>
            {t("Aceitar e entrar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function AcceptAsCurrentUserForm({ token }: { token: string }) {
  const t = useT();
  return (
    <ActionForm action={acceptAsCurrentUserAction}>
      {() => (
        <>
          <input type="hidden" name="token" value={token} />
          <SubmitButton full pendingLabel={t("Aceitando…")}>
            {t("Aceitar convite")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
