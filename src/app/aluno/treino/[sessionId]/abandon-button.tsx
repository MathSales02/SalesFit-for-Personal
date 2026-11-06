"use client";

import { ActionForm } from "@/components/ui/action-form";
import { abandonSessionAction } from "../actions";

export function AbandonButton({ sessionId }: { sessionId: string }) {
  return (
    <ActionForm action={abandonSessionAction} className="flex flex-col items-center gap-2">
      {() => (
        <>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            className="text-sm font-semibold text-ink-soft underline-offset-4 hover:underline"
            onClick={(e) => {
              if (!window.confirm("Abandonar este treino? As séries registradas não contam no histórico.")) e.preventDefault();
            }}
          >
            Abandonar treino
          </button>
        </>
      )}
    </ActionForm>
  );
}
