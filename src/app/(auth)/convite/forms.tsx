"use client";

import Link from "next/link";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { acceptAsCurrentUserAction, acceptWithNewAccountAction } from "./actions";

const link = "font-semibold text-turf underline-offset-4 hover:underline";

export function NewAccountForm({ token, email }: { token: string; email: string }) {
  return (
    <ActionForm action={acceptWithNewAccountAction}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">E-mail</span>
            <span className="text-base text-ink-soft">{email}</span>
          </div>
          <Field label="Seu nome" name="displayName" autoComplete="name" maxLength={80} errors={fieldErrors(s, "displayName")} />
          <Field
            label="Crie uma senha"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            hint="Pelo menos 10 caracteres."
            errors={fieldErrors(s, "password")}
          />
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-turf" />
              <span>
                Li e aceito os{" "}
                <Link href="/termos" className={link} target="_blank">
                  Termos de uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className={link} target="_blank">
                  Política de privacidade
                </Link>
                .
              </span>
            </label>
            {fieldErrors(s, "acceptTerms") && <p className="text-sm font-medium text-danger">{fieldErrors(s, "acceptTerms")!.join(" ")}</p>}
          </div>
          <SubmitButton full pendingLabel="Entrando…">
            Aceitar e entrar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function AcceptAsCurrentUserForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptAsCurrentUserAction}>
      {() => (
        <>
          <input type="hidden" name="token" value={token} />
          <SubmitButton full pendingLabel="Aceitando…">
            Aceitar convite
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
