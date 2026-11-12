"use client";

import { ActionForm } from "@/components/ui/action-form";
import { abandonSessionAction } from "../actions";
import { useT } from "@/i18n/client";

export function AbandonButton({ sessionId }: { sessionId: string }) {
  const t = useT();
  return (
    <ActionForm action={abandonSessionAction} className="flex flex-col items-center gap-2">
      {() => (
        <>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            className="text-sm font-semibold text-ink-soft underline-offset-4 hover:underline"
            onClick={(e) => {
              if (!window.confirm(t("Abandonar este treino? As séries registradas não contam no histórico."))) e.preventDefault();
            }}
          >
            {t("Abandonar treino")}
          </button>
        </>
      )}
    </ActionForm>
  );
}
