"use client";

import { shareWorkoutAction } from "@/app/_community/actions";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Shares the workout summary (time, sets, volume, records) — effort and notes stay private. */
export function ShareWorkoutForm({ sessionId }: { sessionId: string }) {
  const t = useT();
  return (
    <ActionForm action={shareWorkoutAction} className="flex flex-col gap-3">
      {(s) =>
        s.ok && s.message ? null : (
          <>
            <input type="hidden" name="sessionId" value={sessionId} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              {t("Legenda (opcional)")}
              <textarea
                name="body"
                maxLength={2000}
                rows={2}
                placeholder={t("Ex.: semana fechada!")}
                className="rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 py-2 font-normal outline-none focus:border-turf"
              />
            </label>
            <p className="text-xs text-muted">{t("Aparecem tempo, séries, volume e recordes. Seu esforço e suas observações continuam privados.")}</p>
            <div>
              <SubmitButton pendingLabel={t("Compartilhando…")}>{t("Compartilhar na comunidade")}</SubmitButton>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}
