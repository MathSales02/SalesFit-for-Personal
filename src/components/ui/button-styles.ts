/** Shared by server and client components (links styled as buttons, submit buttons). */
export type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-turf text-white hover:bg-turf-hover disabled:bg-turf/60",
  secondary: "bg-paper text-ink border border-line-strong hover:border-ink-soft disabled:text-muted",
  ghost: "text-ink-soft hover:bg-turf-tint hover:text-ink",
  danger: "bg-paper text-danger border border-danger/40 hover:bg-danger-tint",
};

export function buttonClass(variant: Variant = "primary", full = false) {
  return `inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 h-11 text-[0.95rem] font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${full ? "w-full" : ""}`;
}
