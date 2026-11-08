/** Appearance preference. "system" follows the device (prefers-color-scheme). */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "cadencia_theme";

export const parseTheme = (v: string | undefined | null): Theme => (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "system";

/** Class for <html>: none for "system", so the CSS media query decides. */
export const themeClass = (t: Theme) => (t === "system" ? undefined : t);

export const THEME_LABEL: Record<Theme, string> = { system: "Seguir o sistema", light: "Claro", dark: "Escuro" };
