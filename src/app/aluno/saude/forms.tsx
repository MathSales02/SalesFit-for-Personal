"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, TextAreaField } from "@/components/ui/field";
import { consentAction, deleteOwnHealthAction, saveOwnHealthAction } from "./actions";
import { useT } from "@/i18n/client";

export function ConsentForm({ granted }: { granted: boolean }) {
  const t = useT();
  return (
    <ActionForm action={consentAction} className="flex flex-col gap-3">
      {() => (
        <div>
          <SubmitButton name="decision" value={granted ? "withdraw" : "grant"} variant={granted ? "secondary" : "primary"}>
            {granted ? t("Retirar autorização") : t("Autorizar meu treinador")}
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

type Health = { restrictions: string | null; injuries: string | null; medicalNotes: string | null };

export function OwnHealthForm({ health }: { health: Health | null }) {
  const t = useT();
  return (
    <ActionForm action={saveOwnHealthAction}>
      {(s) => (
        <>
          <TextAreaField
            label={t("Restrições de exercício")}
            name="restrictions"
            maxLength={2000}
            hint={t("Movimentos que você não pode ou não deve fazer.")}
            defaultValue={health?.restrictions ?? ""}
            errors={fieldErrors(s, "restrictions")}
          />
          <TextAreaField label={t("Lesões")} name="injuries" maxLength={2000} defaultValue={health?.injuries ?? ""} errors={fieldErrors(s, "injuries")} />
          <TextAreaField label={t("Observações médicas")} name="medicalNotes" maxLength={2000} defaultValue={health?.medicalNotes ?? ""} errors={fieldErrors(s, "medicalNotes")} />
          <div>
            <SubmitButton pendingLabel={t("Salvando…")}>{t("Salvar")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteHealthForm() {
  const t = useT();
  return (
    <ActionForm action={deleteOwnHealthAction} resetOnSuccess>
      {(s) => (
        <>
          <Field label={t("Para apagar tudo, digite \"apagar\"")} name="confirm" autoComplete="off" errors={fieldErrors(s, "confirm")} />
          <div>
            <SubmitButton variant="danger" pendingLabel={t("Apagando…")}>
              {t("Apagar meus dados de saúde")}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
