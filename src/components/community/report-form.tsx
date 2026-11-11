"use client";

import { useState, useTransition } from "react";
import { reportAction } from "@/app/_community/actions";
import { REPORT_REASONS } from "@/lib/validation/community";

export function ReportForm({ targetType, targetId, onDone }: { targetType: "post" | "comment" | "member" | "message"; targetId: string; onDone: (message: string) => void }) {
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number][0]>("spam");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="px-4 py-3.5">
      <fieldset>
        <legend className="text-sm font-semibold">Por que você está denunciando?</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {REPORT_REASONS.map(([v, l]) => (
            <label
              key={v}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-turf ${
                reason === v ? "border-ink bg-ink font-semibold text-paper" : "border-line-strong text-ink-soft hover:border-ink-soft"
              }`}
            >
              <input type="radio" name={`reason-${targetId}`} checked={reason === v} onChange={() => setReason(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Detalhes (opcional)"
        aria-label="Detalhes da denúncia"
        className="mt-3 w-full rounded-2xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-turf"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="h-10 rounded-full px-4 text-sm font-semibold text-ink-soft hover:bg-chalk" onClick={() => onDone("")}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending}
          className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-60"
          onClick={() =>
            startTransition(async () => {
              const res = await reportAction({ targetType, targetId, reason, details });
              onDone(res.ok ? (res.message ?? "Denúncia enviada.") : res.message);
            })
          }
        >
          {pending ? "Enviando…" : "Enviar denúncia"}
        </button>
      </div>
    </div>
  );
}
