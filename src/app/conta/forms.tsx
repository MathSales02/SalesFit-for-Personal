"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { changePasswordAction, deleteAccountAction, revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { useT } from "@/i18n/client";

export function ChangePasswordForm() {
  const t = useT();
  return (
    <ActionForm action={changePasswordAction} className="flex max-w-md flex-col gap-5" resetOnSuccess>
      {(s) => (
        <>
          <Field label={t("Senha atual")} name="currentPassword" type="password" autoComplete="current-password" errors={fieldErrors(s, "currentPassword")} />
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
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{t("Alterar senha")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const t = useT();
  return (
    <ActionForm action={revokeSessionAction} className="flex flex-col items-end gap-2" successNotice={false}>
      {() => (
        <>
          <input type="hidden" name="sessionId" value={sessionId} />
          <SubmitButton variant="ghost" pendingLabel={t("Encerrando…")}>
            {t("Encerrar")}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RevokeOthersButton() {
  const t = useT();
  return (
    <ActionForm action={revokeOtherSessionsAction} className="flex flex-col gap-3">
      {() => (
        <div>
          <SubmitButton variant="danger" pendingLabel={t("Encerrando…")}>
            {t("Sair de todos os outros dispositivos")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  const t = useT();
  return (
    <ActionForm action={deleteAccountAction}>
      {(s) => (
        <>
          <Field label={t("Sua senha")} name="password" type="password" autoComplete="current-password" errors={fieldErrors(s, "password")} />
          <Field label={t("Digite \"EXCLUIR\" para confirmar")} name="confirm" maxLength={10} errors={fieldErrors(s, "confirm")} />
          <div>
            <SubmitButton variant="danger" pendingLabel={t("Excluindo…")}>
              {t("Excluir minha conta para sempre")}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
