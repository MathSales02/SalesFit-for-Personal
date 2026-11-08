/** CadênciaFit wordmark: the app's four rhythm bars, with "fit" in orange. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-end gap-2 text-white ${className}`}>
      <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true" className="shrink-0">
        <rect x="0" y="10" width="4" height="10" rx="1" fill="currentColor" />
        <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
        <rect x="12" y="0" width="4" height="20" rx="1" fill="currentColor" />
        <rect x="18" y="7" width="4" height="13" rx="1" fill="#f97316" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none font-semibold tracking-[-0.04em]">
        cadência<span className="text-[var(--lp-orange-on-dark)]">fit</span>
      </span>
    </span>
  );
}

/**
 * The brand motif: seven beats, Monday to Sunday, like the app's weekly constancy.
 * Decorative (aria-hidden); `on` marks the beats that are lit.
 */
export function Beats({ on = [0, 1, 3, 4], className = "", heights = [40, 70, 55, 100, 80, 45, 60] }: { on?: number[]; className?: string; heights?: number[] }) {
  return (
    <span aria-hidden="true" className={`lp-beats items-end ${className}`}>
      {heights.map((h, i) => (
        <span key={i} data-on={on.includes(i) ? "" : undefined} style={{ height: `${h}%` }} />
      ))}
    </span>
  );
}
