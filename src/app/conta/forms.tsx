"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { changePasswordAction, deleteAccountAction, revokeOtherSessionsAction, revokeSessionAction } from "./actions";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} className="flex max-w-md flex-col gap-5" resetOnSuccess>
      {(s) => (
        <>
          <Field label="Senha atual" name="currentPassword" type="password" autoComplete="current-password" errors={fieldErrors(s, "currentPassword")} />
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
          <div>
            <SubmitButton pendingLabel="Salvando…">Alterar senha</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  return (
    <ActionForm action={revokeSessionAction} className="flex flex-col items-end gap-2" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="sessionId" value={sessionId} />
          <SubmitButton variant="ghost" pendingLabel="Encerrando…">
            Encerrar
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RevokeOthersButton() {
  return (
    <ActionForm action={revokeOtherSessionsAction} className="flex flex-col gap-3">
      {() => (
        <div>
          <SubmitButton variant="danger" pendingLabel="Encerrando…">
            Sair de todos os outros dispositivos
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  return (
    <ActionForm action={deleteAccountAction}>
      {(s) => (
        <>
          <Field label="Sua senha" name="password" type="password" autoComplete="current-password" errors={fieldErrors(s, "password")} />
          <Field label='Digite "EXCLUIR" para confirmar' name="confirm" maxLength={10} errors={fieldErrors(s, "confirm")} />
          <div>
            <SubmitButton variant="danger" pendingLabel="Excluindo…">
              Excluir minha conta para sempre
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
