/** Shared by server and client components (links styled as buttons, submit buttons). */
export type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  // Black pill, like the reference: strong contrast in any theme accent.
  primary:
    "bg-ink text-paper hover:bg-ink/85 shadow-sm active:scale-[0.98] disabled:bg-ink/50 disabled:active:scale-100",
  secondary:
    "bg-paper text-ink border border-line-strong hover:border-turf/60 hover:text-turf active:scale-[0.98] disabled:text-muted disabled:active:scale-100",
  ghost:
    "text-ink-soft hover:bg-turf-tint hover:text-turf active:scale-[0.98] disabled:active:scale-100",
  danger:
    "bg-paper text-danger border border-danger/40 hover:bg-danger-tint active:scale-[0.98] disabled:active:scale-100",
};

export function buttonClass(variant: Variant = "primary", full = false) {
  return `inline-flex items-center justify-center gap-2 rounded-full px-5 h-11 text-[0.95rem] font-semibold transition-all duration-150 disabled:cursor-not-allowed ${styles[variant]} ${full ? "w-full" : ""}`;
}
