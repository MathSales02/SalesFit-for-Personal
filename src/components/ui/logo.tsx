/** Wordmark: four bars of rising and falling height, a training rhythm. */
export function Logo({ tone = "ink", className = "", compact = false }: { tone?: "ink" | "light" | "dark"; className?: string; compact?: boolean }) {
  // ink: orange wordmark on light surfaces; light: white on dark; dark: near-black on bright orange.
  const color = tone === "light" ? "text-white" : tone === "dark" ? "text-on-accent" : "text-turf";
  return (
    <span className={`inline-flex items-end gap-2 ${color} ${className}`}>
      <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true" className="shrink-0">
        <rect x="0" y="10" width="4" height="10" rx="1" fill="currentColor" />
        <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
        <rect x="12" y="0" width="4" height="20" rx="1" fill="currentColor" />
        <rect x="18" y="7" width="4" height="13" rx="1" fill={tone === "dark" ? "#ffffff" : "var(--color-signal)"} />
      </svg>
      <span className={compact ? "sr-only" : "font-display text-[1.45rem] leading-none font-bold tracking-tight"}>cadência</span>
    </span>
  );
}
