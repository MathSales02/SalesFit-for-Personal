"use client";

import { setThemeAction } from "@/app/_theme/actions";
import { ActionForm } from "@/components/ui/action-form";
import { THEME_LABEL, THEMES, type Theme } from "@/lib/theme";
import { useT } from "@/i18n/client";

/** Full appearance choice for the account page: system, light or dark. */
export function ThemePicker({ current }: { current: Theme }) {
  const t = useT();
  return (
    <ActionForm action={setThemeAction} successNotice={false} className="flex flex-col gap-3">
      {() => (
        <fieldset>
          <legend className="sr-only">{t("Tema")}</legend>
          <div className="inline-flex flex-wrap gap-2 rounded-full border border-line bg-paper p-1">
            {THEMES.map((theme) => (
              <button
                key={theme}
                type="submit"
                name="theme"
                value={theme}
                aria-pressed={current === theme}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition-colors ${current === theme ? "bg-ink text-paper" : "text-ink-soft hover:bg-turf-tint hover:text-turf"}`}
              >
                {t(THEME_LABEL[theme])}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </ActionForm>
  );
}
