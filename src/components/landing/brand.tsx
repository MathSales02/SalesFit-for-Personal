import { Logo } from "@/components/ui/logo";

/** SalesFit logo on the landing's dark surfaces (navbar glass, footer). */
export function BrandLogo({ className = "" }: { className?: string }) {
  return <Logo tone="dark" className={className} />;
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
