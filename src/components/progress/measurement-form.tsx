"use client";

import { ActionForm, fieldErrors } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { MEASUREMENT_FIELDS } from "@/lib/validation/progress";

/** Shared by the student (own measurements) and the trainer (assessment). */
export function MeasurementForm({
  action,
  today,
  memberId,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  today: string;
  memberId?: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {(s) => (
        <>
          {memberId && <input type="hidden" name="memberId" value={memberId} />}
          <label className="flex max-w-xs flex-col gap-1.5 text-sm font-semibold">
            Data
            <input
              type="date"
              name="measuredOn"
              defaultValue={today}
              max={today}
              required
              className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 font-normal outline-none focus:border-turf"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MEASUREMENT_FIELDS.map(([k, label, unit]) => (
              <label key={k} className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted">
                {label} ({unit})
                <input
                  name={k}
                  inputMode="decimal"
                  maxLength={6}
                  aria-invalid={!!fieldErrors(s, k)}
                  className={`h-11 w-full min-w-0 rounded-[var(--radius-control)] border bg-paper px-3 text-base font-normal text-ink tabular-nums outline-none focus:border-turf ${fieldErrors(s, k) ? "border-danger" : "border-line-strong"}`}
                />
                {fieldErrors(s, k) && <span className="text-danger">{fieldErrors(s, k)!.join(" ")}</span>}
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Observação (opcional)
            <input name="notes" maxLength={300} className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 font-normal outline-none focus:border-turf" />
          </label>
          <div>
            <SubmitButton pendingLabel="Salvando…">Salvar medidas</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
