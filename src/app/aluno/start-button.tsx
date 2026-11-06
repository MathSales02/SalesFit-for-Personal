"use client";

import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { startSessionAction } from "./treino/actions";

export function StartWorkoutButton({ dayId, replace = false, label = "Começar" }: { dayId: string; replace?: boolean; label?: string }) {
  return (
    <ActionForm action={startSessionAction} className="flex flex-col items-end gap-2">
      {() => (
        <>
          <input type="hidden" name="dayId" value={dayId} />
          {replace && <input type="hidden" name="replace" value="1" />}
          <SubmitButton pendingLabel="Abrindo…">{label}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
