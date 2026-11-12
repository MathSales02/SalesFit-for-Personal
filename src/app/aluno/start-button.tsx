"use client";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { startSessionAction } from "./treino/actions";
import { useT } from "@/i18n/client";

export function StartWorkoutButton({ dayId, replace = false, label }: { dayId: string; replace?: boolean; label?: string }) {
  const t = useT();
  return (
    <ActionForm action={startSessionAction} className="flex flex-col items-end gap-2">
      {() => (
        <>
          <input type="hidden" name="dayId" value={dayId} />
          {replace && <input type="hidden" name="replace" value="1" />}
          <SubmitButton pendingLabel={t("Abrindo…")}>{label ?? t("Começar")}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
