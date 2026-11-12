"use client";

import { setLocaleAction } from "@/app/_locale/actions";
import { ActionForm } from "@/components/ui/action-form";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_LABEL, LOCALES } from "@/i18n/config";

/**
 * Language choice: Português, English, Español. Each one is written in its own language, so it
 * can be found by someone who cannot read the current one. `compact` is the small version for
 * the sign-in screens.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const current = useLocale();
  const t = useT();
  return (
    <ActionForm action={setLocaleAction} successNotice={false} className="flex flex-col gap-3">
      {() => (
        <fieldset>
          <legend className="sr-only">{t("Idioma")}</legend>
          <div className={`inline-flex flex-wrap gap-1 rounded-full border border-line bg-paper p-1 ${compact ? "text-xs" : "gap-2 text-sm"}`}>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="submit"
                name="locale"
                value={l}
                lang={l}
                aria-pressed={current === l}
                className={`rounded-full font-semibold transition-colors ${compact ? "h-8 px-3" : "h-10 px-4"} ${current === l ? "bg-ink text-paper" : "text-ink-soft hover:bg-turf-tint hover:text-turf"}`}
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </ActionForm>
  );
}
