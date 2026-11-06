"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { buttonClass } from "@/components/ui/button-styles";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { confirmMfaAction, disableMfaAction, regenerateCodesAction, startMfaAction } from "./actions";

export function StartForm({ label, secondary = false }: { label: string; secondary?: boolean }) {
  return (
    <ActionForm action={startMfaAction} className="flex flex-col gap-3">
      {() => (
        <div>
          <SubmitButton variant={secondary ? "secondary" : "primary"} pendingLabel="Preparando…">
            {label}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

/** Code form whose success shows the one-time recovery codes. */
function CodesForm({
  action,
  submit,
  done,
}: {
  action: (prev: ActionResult<string[]>, form: FormData) => Promise<ActionResult<string[]>>;
  submit: string;
  done?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as ActionResult<string[]>);
  if (state.ok && state.data) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">{state.message}</Notice>
        <p className="text-sm">Guarde estes códigos de recuperação em lugar seguro. Cada um entra uma vez se você perder o celular. Eles não serão mostrados de novo.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-[var(--radius-panel)] border border-line bg-chalk p-4 font-mono text-sm" aria-label="Códigos de recuperação">
          {state.data.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {done}
      </div>
    );
  }
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {!state.ok && !state.fieldErrors && <Notice tone="error">{state.message}</Notice>}
      <div className="max-w-xs">
        <Field label="Código de 6 dígitos do aplicativo" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} errors={state.ok ? undefined : state.fieldErrors?.code} />
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Verificando…" : submit}
        </button>
      </div>
    </form>
  );
}

export function ConfirmForm() {
  return (
    <CodesForm
      action={confirmMfaAction}
      submit="Ativar"
      done={
        <Link href="/conta/duas-etapas" className={buttonClass("secondary")}>
          Já guardei os códigos
        </Link>
      }
    />
  );
}

export function RegenerateForm() {
  return <CodesForm action={regenerateCodesAction} submit="Gerar novos códigos" />;
}

export function DisableForm() {
  return (
    <ActionForm action={disableMfaAction}>
      {(s) => (
        <>
          <Field label="Sua senha" name="password" type="password" autoComplete="current-password" errors={fieldErrors(s, "password")} />
          <Field label="Código do aplicativo ou de recuperação" name="code" autoComplete="one-time-code" maxLength={20} errors={fieldErrors(s, "code")} />
          <div>
            <SubmitButton variant="danger" pendingLabel="Desativando…">
              Desativar
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
