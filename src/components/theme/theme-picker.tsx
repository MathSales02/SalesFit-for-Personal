"use client";

import { setThemeAction } from "@/app/_theme/actions";
import { ActionForm } from "@/components/ui/action-form";
import { THEME_LABEL, THEMES, type Theme } from "@/lib/theme";

/** Full appearance choice for the account page: system, light or dark. */
export function ThemePicker({ current }: { current: Theme }) {
  return (
    <ActionForm action={setThemeAction} successNotice={false} className="flex flex-col gap-3">
      {() => (
        <fieldset>
          <legend className="sr-only">Tema</legend>
          <div className="inline-flex flex-wrap gap-2 rounded-full border border-line bg-paper p-1">
            {THEMES.map((t) => (
              <button
                key={t}
                type="submit"
                name="theme"
                value={t}
                aria-pressed={current === t}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition-colors ${current === t ? "bg-ink text-paper" : "text-ink-soft hover:bg-turf-tint hover:text-turf"}`}
              >
                {THEME_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </ActionForm>
  );
}
